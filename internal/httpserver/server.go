package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/go-chi/chi/v5"
	"github.com/larsgraubner/planning-poker/internal/room"
)

type server struct {
	store    *room.Store
	files    fs.FS
	ctx      context.Context
	ipHeader string
	mu       sync.Mutex
	creation bucket
	creators *limiter
	guesses  *limiter
	meta     []byte
}

type Links struct{ LegalNotice, PrivacyPolicy string }

// New serves the API and SPA. ipHeader names a header set by a trusted proxy
// (e.g. X-Forwarded-For); when empty, the TCP peer address identifies clients.
func New(ctx context.Context, store *room.Store, files fs.FS, ipHeader string, links Links) http.Handler {
	s := &server{store: store, files: files, ctx: ctx, ipHeader: ipHeader, creators: newLimiter(1.0/60, 5), guesses: newLimiter(5, 60)}
	// The page reads them from its head, so they show from the first paint.
	for _, link := range [][2]string{{"legal-notice", links.LegalNotice}, {"privacy-policy", links.PrivacyPolicy}} {
		if link[1] != "" {
			s.meta = fmt.Appendf(s.meta, `<meta name="%s" content="%s">`, link[0], html.EscapeString(link[1]))
		}
	}

	if s.meta != nil {
		s.meta = append(s.meta, "</head>"...)
	}

	r := chi.NewRouter()
	r.Use(headers)
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		reply(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Post("/api/rooms", s.create)
	r.Get("/api/rooms/{code}", s.info)
	r.Get("/api/rooms/{code}/ws", s.socket)
	r.HandleFunc("/api/*", func(w http.ResponseWriter, r *http.Request) { fail(w, http.StatusNotFound, "Not found.") })
	r.Get("/*", s.spa)

	return r
}

func headers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
		w.Header().Set("Cache-Control", "no-cache")

		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			// TLS may terminate at the proxy; compare the preserved public Host.
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") || !strings.EqualFold(u.Host, r.Host) || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
				fail(w, http.StatusForbidden, "Cross-origin requests are not allowed.")
				return
			}
		}

		if r.Header.Get("Sec-Fetch-Site") == "cross-site" && strings.HasPrefix(r.URL.Path, "/api/") {
			fail(w, http.StatusForbidden, "Cross-origin requests are not allowed.")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func reply(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Debug("response write failed", "status", status)
	}
}
func fail(w http.ResponseWriter, status int, message string) {
	reply(w, status, map[string]string{"error": message})
}

// clientIP groups IPv6 clients by /64, since one host usually controls a whole prefix.
func (s *server) clientIP(r *http.Request) netip.Addr {
	value := r.RemoteAddr

	if values := r.Header.Values(s.ipHeader); s.ipHeader != "" && len(values) > 0 {
		// The trusted proxy appends the peer it saw, so only the last entry is reliable.
		last := values[len(values)-1]
		value = last[strings.LastIndex(last, ",")+1:]
	}

	value = strings.TrimSpace(value)
	addr, err := netip.ParseAddr(value)
	if err != nil {
		port, _ := netip.ParseAddrPort(value)
		addr = port.Addr()
	}

	if addr = addr.Unmap(); addr.Is6() {
		addr = netip.PrefixFrom(addr, 64).Masked().Addr()
	}

	return addr
}

func (s *server) create(w http.ResponseWriter, r *http.Request) {
	allowed := s.creators.allow(s.clientIP(r))
	if allowed {
		s.mu.Lock()
		allowed = s.creation.allow(10, 20)
		s.mu.Unlock()
	}

	if !allowed {
		fail(w, http.StatusTooManyRequests, "Too many rooms created. Try again shortly.")
		return
	}

	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		fail(w, http.StatusUnsupportedMediaType, "Use application/json.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var body struct {
		Title string `json:"title"`
		Deck  string `json:"deck"`
	}
	if err := decoder.Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid room title or request body.")
		return
	}

	if decoder.Decode(new(any)) != io.EOF {
		fail(w, http.StatusBadRequest, "Send one JSON object.")
		return
	}

	// Clients from before decks send only a title.
	if body.Deck == "" {
		body.Deck = "fibonacci"
	}

	code, err := s.store.Create(body.Title, body.Deck)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}

	reply(w, http.StatusCreated, map[string]string{"code": code})
}

// Room codes are the only access control, so a client that keeps asking for rooms that
// do not exist is stopped from looking up any, which makes guessing codes impractical.
// Finding a room costs nothing, so a team behind one address can reconnect at once.
func (s *server) visit(w http.ResponseWriter, r *http.Request) bool {
	if s.guesses.ready(s.clientIP(r)) {
		return true
	}

	fail(w, http.StatusTooManyRequests, "Too many requests. Try again shortly.")
	return false
}

func (s *server) missed(r *http.Request) { s.guesses.allow(s.clientIP(r)) }

func (s *server) info(w http.ResponseWriter, r *http.Request) {
	if !s.visit(w, r) {
		return
	}

	title, err := s.store.Info(chi.URLParam(r, "code"), r.Header.Get("X-Participant-ID"))
	if errors.Is(err, room.ErrNotFound) {
		s.missed(r)
		fail(w, http.StatusNotFound, err.Error())
		return
	}

	// A room nobody can join right now still says why.
	var reason string
	if err != nil {
		reason = err.Error()
	}

	reply(w, http.StatusOK, struct {
		Title     string `json:"title"`
		Available bool   `json:"available"`
		Reason    string `json:"reason,omitempty"`
	}{title, err == nil, reason})
}

type command struct {
	Type      string `json:"type"`
	ID        string `json:"id,omitempty"`
	Name      string `json:"name,omitempty"`
	Value     string `json:"value,omitempty"`
	Round     uint64 `json:"round,omitempty"`
	Spectator bool   `json:"spectator,omitempty"`
}

type socketError struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Fatal   bool   `json:"fatal"`
}

func write(ctx context.Context, conn *websocket.Conn, message any) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return wsjson.Write(ctx, conn, message)
}

func (s *server) socket(w http.ResponseWriter, r *http.Request) {
	if !s.visit(w, r) {
		return
	}

	code := chi.URLParam(r, "code")
	if err := s.store.Reserve(code); err != nil {
		status := http.StatusConflict
		if errors.Is(err, room.ErrNotFound) {
			s.missed(r)
			status = http.StatusNotFound
		}

		fail(w, status, err.Error())
		return
	}
	defer s.store.Release(code)

	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer conn.CloseNow()

	conn.SetReadLimit(1024)
	ctx, cancel := context.WithCancel(s.ctx)
	defer cancel()

	stop := context.AfterFunc(ctx, func() { conn.CloseNow() })
	defer stop()

	joinCtx, joinCancel := context.WithTimeout(ctx, 10*time.Second)
	var join command
	err = wsjson.Read(joinCtx, conn, &join)
	joinCancel()
	if err != nil {
		return
	}

	if join.Type != "join" {
		_ = write(ctx, conn, socketError{"error", "Join before sending commands.", true})
		return
	}

	sub, err := s.store.Join(code, join.ID, join.Name, join.Spectator)
	if err != nil {
		_ = write(ctx, conn, socketError{"error", err.Error(), true})
		return
	}
	defer s.store.Leave(sub)

	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		defer cancel()

		tick := time.NewTicker(20 * time.Second)
		defer tick.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case snapshot := <-sub.Updates:
				if write(ctx, conn, snapshot) != nil {
					return
				}
			case <-tick.C:
				pingCtx, pingCancel := context.WithTimeout(ctx, 10*time.Second)
				err := conn.Ping(pingCtx)
				pingCancel()
				if err != nil {
					return
				}
			}
		}
	}()
	defer func() { cancel(); <-writerDone }()

	var commands bucket

	for {
		var cmd command
		if wsjson.Read(ctx, conn, &cmd) != nil {
			return
		}

		if !commands.allow(20, 20) {
			_ = write(ctx, conn, socketError{"error", "Too many commands. Rejoin to continue.", true})
			return
		}

		if cmd.Type == "leave" {
			s.store.Depart(sub)
			return
		}

		if err := s.store.Command(sub, cmd.Type, cmd.Value, cmd.Round); err != nil {
			if write(ctx, conn, socketError{"error", err.Error(), false}) != nil {
				return
			}
		}
	}
}

func (s *server) spa(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	if strings.HasPrefix(path, "assets/") {
		if _, err := fs.Stat(s.files, path); err != nil {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.FileServerFS(s.files).ServeHTTP(w, r)
		return
	}

	status := http.StatusOK
	// Any other page still gets the app, which says it is not found, under a 404.
	if path != "" && (len(path) != 8 || strings.Contains(path, "/")) {
		status = http.StatusNotFound
	}

	index, err := fs.ReadFile(s.files, "index.html")
	if err != nil {
		fail(w, http.StatusServiceUnavailable, "Frontend build is missing.")
		return
	}

	if s.meta != nil {
		index = bytes.Replace(index, []byte("</head>"), s.meta, 1)
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(index)
}
