package httpserver

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/larsgraubner/planning-poker/internal/room"
)

func TestHTTPAndWebSocketFlow(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	store := room.New()
	server := httptest.NewServer(New(ctx, store, fstest.MapFS{"index.html": {Data: []byte("<html>poker</html>")}, "assets/main-a1.js": {Data: []byte("export {}")}}, ""))
	defer server.Close()
	response, err := http.Post(server.URL+"/api/rooms", "application/json", strings.NewReader(`{"title":"Sprint"}`))
	if err != nil {
		t.Fatal(err)
	}
	var created struct {
		Code string `json:"code"`
	}
	err = json.NewDecoder(response.Body).Decode(&created)
	response.Body.Close()
	if err != nil || response.StatusCode != 201 {
		t.Fatalf("create: %v %d", err, response.StatusCode)
	}
	for _, path := range []string{"/", "/" + created.Code, "/healthz", "/api/rooms/" + created.Code, "/assets/main-a1.js"} {
		resp, err := http.Get(server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 200 {
			t.Fatalf("%s: %d", path, resp.StatusCode)
		}
		if resp.Header.Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal("security headers missing")
		}
		if strings.HasPrefix(path, "/assets/") && !strings.Contains(resp.Header.Get("Cache-Control"), "immutable") {
			t.Fatal("asset caching missing")
		}
	}
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/rooms/" + created.Code + "/ws"
	dial := func(id string) *websocket.Conn {
		t.Helper()
		conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{server.URL}}})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { conn.CloseNow() })
		if err := wsjson.Write(ctx, conn, command{Type: "join", ID: id, Name: "Alex"}); err != nil {
			t.Fatal(err)
		}
		return conn
	}
	read := func(conn *websocket.Conn, match func(room.Snapshot) bool) room.Snapshot {
		t.Helper()
		for {
			var snapshot room.Snapshot
			if err := wsjson.Read(ctx, conn, &snapshot); err != nil {
				t.Fatal(err)
			}
			if match(snapshot) {
				return snapshot
			}
		}
	}
	a := dial("00000000-0000-4000-8000-000000000001")
	b := dial("00000000-0000-4000-8000-000000000002")
	read(a, func(s room.Snapshot) bool { return len(s.Participants) == 2 })
	read(b, func(s room.Snapshot) bool { return len(s.Participants) == 2 })
	if err := wsjson.Write(ctx, a, command{Type: "select", Value: "13", Round: 1}); err != nil {
		t.Fatal(err)
	}
	hidden := read(b, func(s room.Snapshot) bool { return s.Participants[0].Selected })
	if hidden.Participants[0].Estimate != "" {
		t.Fatal("wire leaked concealed estimate")
	}
	if err := wsjson.Write(ctx, b, command{Type: "reveal", Round: 1}); err != nil {
		t.Fatal(err)
	}
	revealed := read(b, func(s room.Snapshot) bool { return s.Revealed })
	if revealed.Participants[0].Estimate != "13" {
		t.Fatal("reveal not broadcast")
	}
	if err := wsjson.Write(ctx, a, command{Type: "reset", Round: 1}); err != nil {
		t.Fatal(err)
	}
	reset := read(b, func(s room.Snapshot) bool { return s.Round == 2 })
	if reset.Revealed || reset.Participants[0].Selected {
		t.Fatal("reset not broadcast")
	}
	if err := wsjson.Write(ctx, a, command{Type: "leave"}); err != nil {
		t.Fatal(err)
	}
	read(b, func(s room.Snapshot) bool { return len(s.Participants) == 1 })
	if conn, response, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://evil.example"}}}); err == nil {
		conn.CloseNow()
		t.Fatal("cross-origin socket accepted")
	} else if response == nil || response.StatusCode != 403 {
		t.Fatal("unexpected origin rejection")
	}
	request, _ := http.NewRequest("POST", server.URL+"/api/rooms", strings.NewReader(`{"title":"x"}`))
	request.Header.Set("Origin", "https://evil.example")
	resp, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 403 {
		t.Fatal("cross-origin create accepted")
	}
}

func TestInvalidHTTPAndPreJoinCommands(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	store := room.New()
	code, _ := store.Create("Test")
	server := httptest.NewServer(New(ctx, store, fstest.MapFS{}, ""))
	defer server.Close()
	for _, body := range []string{`{"title":""}`, `{"title":"x","extra":1}`, `{"title":"x"} {}`, `{"title":"` + strings.Repeat("x", 4096) + `"}`} {
		resp, err := http.Post(server.URL+"/api/rooms", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 400 {
			t.Fatalf("invalid body status: %d", resp.StatusCode)
		}
	}
	for _, path := range []string{"/api/rooms/missing", "/assets/missing.js", "/api/missing", "/rooms/abcdefgh"} {
		resp, err := http.Get(server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if resp.StatusCode != 404 {
			t.Fatalf("missing resource: %d", resp.StatusCode)
		}
	}
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/rooms/"+code+"/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	if err := wsjson.Write(ctx, conn, command{Type: "reveal", Round: 1}); err != nil {
		t.Fatal(err)
	}
	var result socketError
	if err := wsjson.Read(ctx, conn, &result); err != nil {
		t.Fatal(err)
	}
	if !result.Fatal {
		t.Fatal("command before join accepted")
	}
}

func TestPerClientRateLimits(t *testing.T) {
	store := room.New()
	handler := New(context.Background(), store, fstest.MapFS{}, "X-Forwarded-For")
	request := func(method, path, forwarded string) int {
		r := httptest.NewRequest(method, path, strings.NewReader(`{"title":"Sprint"}`))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Forwarded-For", forwarded)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w.Code
	}
	for i := 0; i < 5; i++ {
		if status := request("POST", "/api/rooms", "198.51.100.1, 203.0.113.1"); status != 201 {
			t.Fatalf("create %d: %d", i, status)
		}
	}
	if request("POST", "/api/rooms", "198.51.100.2, 203.0.113.1") != 429 {
		t.Fatal("per-client creation limit missing or spoofable via the first forwarded entry")
	}
	if request("POST", "/api/rooms", "203.0.113.2") != 201 {
		t.Fatal("another client was limited")
	}
	for i := 0; i < 60; i++ {
		if status := request("GET", "/api/rooms/missing1", "2001:db8::1"); status != 404 {
			t.Fatalf("lookup %d: %d", i, status)
		}
	}
	if request("GET", "/api/rooms/missing1", "2001:db8::2") != 429 {
		t.Fatal("lookup limit missing or not grouped by IPv6 /64")
	}
	if request("GET", "/api/rooms/missing1/ws", "2001:db8::3") != 429 {
		t.Fatal("socket limit missing")
	}
	if request("GET", "/api/rooms/missing1", "2001:db8:0:1::1") != 404 {
		t.Fatal("another IPv6 prefix was limited")
	}
}
