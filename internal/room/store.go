package room

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"log/slog"
	"math/big"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

const (
	MaxParticipants = 30
	maxSockets      = 4 * MaxParticipants // per room, including sockets that have not joined yet
	maxTabs         = 5                   // connections per participant
)

const alphabet = "23456789abcdefghjkmnpqrstuvwxyz"

// Decks are the estimation decks a room can use, by name. The first card values
// rise in order; "?" and "☕" end every deck.
var Decks = map[string][]string{
	"fibonacci": {"0", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕"},
	"tshirt":    {"XS", "S", "M", "L", "XL", "XXL", "?", "☕"},
}

var ErrNotFound = errors.New("Room not found.")
var ErrFull = errors.New("This room is full.")
var ErrTooManyTabs = errors.New("You have this room open in too many tabs. Close one and try again.")
var ErrBusy = errors.New("This room has too many connections right now. Try again shortly.")

type Participant struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Connected bool   `json:"connected"`
	Selected  bool   `json:"selected"`
	Spectator bool   `json:"spectator"`
	Estimate  string `json:"estimate,omitempty"`
}

type Snapshot struct {
	Type         string        `json:"type"`
	Title        string        `json:"title"`
	Round        uint64        `json:"round"`
	Deck         []string      `json:"deck"`
	Revealed     bool          `json:"revealed"`
	Self         string        `json:"self"`
	Participants []Participant `json:"participants"`
}

type member struct {
	id, secret, name, estimate string
	connections                map[*Subscription]bool
	disconnected               time.Time
	departed, spectator        bool
}

type session struct {
	title        string
	deck         string
	round        uint64
	revealed     bool
	participants []*member
	emptySince   time.Time
	sockets      int
	joined       bool
}

type Subscription struct {
	Updates chan Snapshot
	code    string
	member  *member
}

type Store struct {
	// ponytail: one lock for up to 100,000 rooms; use per-room locks if contention becomes measurable.
	mu    sync.Mutex
	rooms map[string]*session
	now   func() time.Time
	db    *sql.DB       // nil keeps rooms in memory only
	ttl   time.Duration // how long a joined room survives without connections
	// Bounds memory, since every room stays loaded, and the chance of guessing a code.
	maxRooms int
}

func New() *Store {
	return &Store{rooms: make(map[string]*session), now: time.Now, ttl: time.Hour, maxRooms: 1000}
}

// Open keeps rooms in the SQLite database at path, creating it if needed, so
// they survive restarts. Participants and estimates stay in memory.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS rooms (
		code TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		deck TEXT NOT NULL DEFAULT 'fibonacci',
		round INTEGER NOT NULL,
		revealed INTEGER NOT NULL,
		joined INTEGER NOT NULL,
		empty_since INTEGER NOT NULL -- Unix seconds; 0 while participants are connected
	)`); err != nil {
		db.Close()
		return nil, err
	}

	// Databases from before decks lack the column, and SQLite cannot add one only if missing.
	if _, err := db.Exec(`SELECT deck FROM rooms LIMIT 0`); err != nil {
		if _, err := db.Exec(`ALTER TABLE rooms ADD COLUMN deck TEXT NOT NULL DEFAULT 'fibonacci'`); err != nil {
			db.Close()
			return nil, err
		}
	}

	s := New()
	// Rooms held for 30 days need more room slots, or a full store would remove idle rooms long before then.
	s.db, s.ttl, s.maxRooms = db, 30*24*time.Hour, 100_000
	rows, err := db.Query(`SELECT code, title, deck, round, revealed, joined, empty_since FROM rooms`)
	if err != nil {
		db.Close()
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var code string
		var emptySince int64
		r := &session{}
		if err := rows.Scan(&code, &r.title, &r.deck, &r.round, &r.revealed, &r.joined, &emptySince); err != nil {
			db.Close()
			return nil, err
		}

		// The votes of a revealed round were in memory, so the room comes back ready for the next.
		if r.revealed {
			r.revealed = false
			r.round++
		}

		// Rooms occupied at shutdown start their idle clock now.
		r.emptySince = s.now()
		if emptySince != 0 {
			r.emptySince = time.Unix(emptySince, 0)
		}

		s.rooms[code] = r
	}

	if err := rows.Err(); err != nil {
		db.Close()
		return nil, err
	}

	return s, nil
}

// save writes the persisted fields of a room; nil deletes it.
// ponytail: synchronous write under the store lock, fine for a handful of writes per round; batch if it shows in latency.
func (s *Store) save(code string, r *session) error {
	if s.db == nil {
		return nil
	}

	var err error
	if r == nil {
		_, err = s.db.Exec(`DELETE FROM rooms WHERE code = ?`, code)
	} else {
		var emptySince int64
		if !r.emptySince.IsZero() {
			emptySince = r.emptySince.Unix()
		}

		_, err = s.db.Exec(`INSERT OR REPLACE INTO rooms (code, title, deck, round, revealed, joined, empty_since) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			code, r.title, r.deck, r.round, r.revealed, r.joined, emptySince)
	}

	if err != nil {
		slog.Error("saving room failed", "error", err)
	}

	return err
}

func ValidateLabel(value string, max int) (string, error) {
	if !utf8.ValidString(value) || strings.ContainsFunc(value, unicode.IsControl) {
		return "", errors.New("Use text without control characters.")
	}

	value = strings.TrimSpace(value)
	if n := utf8.RuneCountInString(value); n == 0 || n > max {
		return "", errors.New("Text is empty or too long.")
	}

	return value, nil
}

func validSecret(secret string) bool {
	if len(secret) != 36 || secret[8] != '-' || secret[13] != '-' || secret[18] != '-' || secret[23] != '-' {
		return false
	}

	_, err := hex.DecodeString(strings.ReplaceAll(secret, "-", ""))
	return err == nil
}

func (s *Store) Create(title, deck string) (string, error) {
	title, err := ValidateLabel(title, 100)
	if err != nil {
		return "", err
	}

	if Decks[deck] == nil {
		return "", errors.New("Unknown deck.")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.rooms) >= s.maxRooms && !s.removeLongestEmpty() {
		return "", errors.New("Room limit reached. Try again later.")
	}

	for {
		code := make([]byte, 8)
		for i := range code {
			n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
			if err != nil {
				return "", errors.New("Could not create room.")
			}

			code[i] = alphabet[n.Int64()]
		}

		if _, exists := s.rooms[string(code)]; exists {
			continue
		}

		r := &session{title: title, deck: deck, round: 1, emptySince: s.now()}
		if s.save(string(code), r) != nil {
			return "", errors.New("Could not create room.")
		}

		s.rooms[string(code)] = r
		return string(code), nil
	}
}

// removeLongestEmpty makes space in a full store, so a flood of rooms cannot lock out
// creation until they expire. Rooms in use, or with someone joining, are kept.
// ponytail: O(rooms) scan, only while full; keep rooms ordered by idle time if creation then slows.
func (s *Store) removeLongestEmpty() bool {
	var oldest string

	for code, r := range s.rooms {
		if r.emptySince.IsZero() || r.sockets > 0 {
			continue
		}

		if oldest == "" || r.emptySince.Before(s.rooms[oldest].emptySince) {
			oldest = code
		}
	}

	if oldest == "" {
		return false
	}

	delete(s.rooms, oldest)
	s.save(oldest, nil)

	return true
}

// Info returns the room's title, and the error a join would meet right now.
func (s *Store) Info(code, secret string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	r := s.rooms[code]
	if r == nil {
		return "", ErrNotFound
	}

	if r.sockets >= maxSockets {
		return r.title, ErrBusy
	}

	for _, p := range r.participants {
		if p.secret == secret {
			if len(p.connections) >= maxTabs {
				return r.title, ErrTooManyTabs
			}

			return r.title, nil
		}
	}

	if len(r.participants) >= MaxParticipants {
		return r.title, ErrFull
	}

	return r.title, nil
}

// Reserve bounds sockets even before the client has sent its join message.
func (s *Store) Reserve(code string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	r := s.rooms[code]
	if r == nil {
		return ErrNotFound
	}

	if r.sockets >= maxSockets {
		return ErrBusy
	}

	r.sockets++
	return nil
}

func (s *Store) Release(code string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if r := s.rooms[code]; r != nil {
		r.sockets--
	}
}

// Join seats a new participant as a spectator or voter; a returning one keeps their role.
func (s *Store) Join(code, secret, name string, spectator bool) (*Subscription, error) {
	name, err := ValidateLabel(name, 40)
	if err != nil {
		return nil, err
	}

	if !validSecret(secret) {
		return nil, errors.New("Invalid participant identity.")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	r := s.rooms[code]
	if r == nil {
		return nil, ErrNotFound
	}

	var p *member
	for _, existing := range r.participants {
		if existing.secret == secret {
			p = existing
			break
		}
	}

	if p == nil {
		if len(r.participants) >= MaxParticipants {
			return nil, ErrFull
		}

		p = &member{id: rand.Text(), secret: secret, name: name, spectator: spectator, connections: make(map[*Subscription]bool)}
		r.participants = append(r.participants, p)
	}

	if len(p.connections) >= maxTabs {
		return nil, ErrTooManyTabs
	}

	// Existing tabs share the first joined name as well as the estimate.
	sub := &Subscription{Updates: make(chan Snapshot, 1), code: code, member: p}
	p.connections[sub] = true
	p.disconnected = time.Time{}
	p.departed = false

	if !r.joined || !r.emptySince.IsZero() {
		r.emptySince = time.Time{}
		r.joined = true
		s.save(code, r)
	}

	s.publish(r)
	return sub, nil
}

func (s *Store) Leave(sub *Subscription)  { s.disconnect(sub, false) }
func (s *Store) Depart(sub *Subscription) { s.disconnect(sub, true) }

func (s *Store) disconnect(sub *Subscription, departed bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	r := s.rooms[sub.code]
	if r == nil || !sub.member.connections[sub] {
		return
	}

	delete(sub.member.connections, sub)
	if len(sub.member.connections) == 0 {
		sub.member.disconnected = s.now()
		sub.member.departed = departed
	}

	if !hasConnections(r) {
		r.emptySince = s.now()
		s.save(sub.code, r)
	}

	s.publish(r)
}

func hasConnections(r *session) bool {
	for _, p := range r.participants {
		if len(p.connections) > 0 {
			return true
		}
	}

	return false
}

func (s *Store) Command(sub *Subscription, command, value string, round uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	r := s.rooms[sub.code]
	if r == nil || !sub.member.connections[sub] {
		return ErrNotFound
	}

	// Only estimating belongs to a round: renaming or changing role must survive a reset.
	if round != r.round && (command == "select" || command == "reveal" || command == "reset") {
		return errors.New("The round changed. Try again.")
	}

	switch command {
	case "rename":
		title, err := ValidateLabel(value, 100)
		if err != nil {
			return err
		}

		r.title = title
	case "name":
		name, err := ValidateLabel(value, 40)
		if err != nil {
			return err
		}

		sub.member.name = name
	case "role":
		if value != "spectator" && value != "voter" {
			return errors.New("Unknown role.")
		}

		sub.member.spectator = value == "spectator"
		// A revealed vote stays until reset, so the cards under discussion do not change.
		if !r.revealed {
			sub.member.estimate = ""
		}
	case "select":
		if sub.member.spectator {
			return errors.New("Spectators do not estimate.")
		}

		if r.revealed {
			return errors.New("Wait for reset before selecting.")
		}

		if !slices.Contains(Decks[r.deck], value) {
			return errors.New("Invalid estimate.")
		}

		if sub.member.estimate == value {
			sub.member.estimate = ""
		} else {
			sub.member.estimate = value
		}
	case "reveal":
		r.revealed = true
	case "reset":
		if !r.revealed {
			return errors.New("Reveal before resetting.")
		}

		r.revealed = false
		r.round++
		for _, p := range r.participants {
			p.estimate = ""
		}
	default:
		return errors.New("Unknown command.")
	}

	// Names, roles and estimates live only in memory, so only the room's own fields are saved.
	if command == "rename" || command == "reveal" || command == "reset" {
		s.save(sub.code, r)
	}

	s.publish(r)
	return nil
}

// Queue only the latest snapshot while holding the store lock, preserving mutation
// order. Socket writers consume outside the lock; slow clients cannot block rooms.
func (s *Store) publish(r *session) {
	for _, viewer := range r.participants {
		if len(viewer.connections) == 0 {
			continue
		}

		snapshot := Snapshot{Type: "snapshot", Title: r.title, Round: r.round, Deck: Decks[r.deck], Revealed: r.revealed, Self: viewer.id, Participants: make([]Participant, 0, len(r.participants))}

		for _, p := range r.participants {
			if p.departed {
				continue
			}

			card := Participant{ID: p.id, Name: p.name, Connected: len(p.connections) > 0, Selected: p.estimate != "", Spectator: p.spectator}
			if r.revealed || p == viewer {
				card.Estimate = p.estimate
			}

			snapshot.Participants = append(snapshot.Participants, card)
		}

		for sub := range viewer.connections {
			select {
			case <-sub.Updates:
			default:
			}

			sub.Updates <- snapshot
		}
	}
}

// Sweep removes disconnected participants after their grace period. The caller
// runs it once per second for presence, checking room expiry once per minute.
// Rooms nobody joined expire sooner so unused rooms cannot hold the room limit.
func (s *Store) Sweep(expireRooms bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := s.now()

	for code, r := range s.rooms {
		ttl := s.ttl
		if !r.joined {
			ttl = 10 * time.Minute
		}

		if expireRooms && !r.emptySince.IsZero() && now.Sub(r.emptySince) >= ttl {
			delete(s.rooms, code)
			s.save(code, nil)
			continue
		}

		before := len(r.participants)
		r.participants = slices.DeleteFunc(r.participants, func(p *member) bool {
			return len(p.connections) == 0 && now.Sub(p.disconnected) >= 30*time.Second
		})
		if before != len(r.participants) {
			s.publish(r)
		}
	}
}
