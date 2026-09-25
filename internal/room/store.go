package room

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"math/big"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	MaxParticipants = 30
	maxRooms        = 1000
	maxSockets      = 60 // per room, including sockets that have not joined yet
	maxTabs         = 5  // connections per participant
)

const alphabet = "23456789abcdefghjkmnpqrstuvwxyz"

var Deck = []string{"0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"}
var ErrNotFound = errors.New("Room not found.")
var ErrFull = errors.New("This room is full.")

type Participant struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Connected bool   `json:"connected"`
	Selected  bool   `json:"selected"`
	Estimate  string `json:"estimate,omitempty"`
}

type Snapshot struct {
	Type         string        `json:"type"`
	Title        string        `json:"title"`
	Round        uint64        `json:"round"`
	Revealed     bool          `json:"revealed"`
	Self         string        `json:"self"`
	Participants []Participant `json:"participants"`
}

type member struct {
	id, secret, name, estimate string
	connections                map[*Subscription]bool
	disconnected               time.Time
	departed                   bool
}

type session struct {
	title        string
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
	// ponytail: one lock for up to 1,000 rooms; use per-room locks if contention becomes measurable.
	mu    sync.Mutex
	rooms map[string]*session
	now   func() time.Time
}

func New() *Store { return &Store{rooms: make(map[string]*session), now: time.Now} }

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

func (s *Store) Create(title string) (string, error) {
	title, err := ValidateLabel(title, 100)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.rooms) >= maxRooms {
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
		s.rooms[string(code)] = &session{title: title, round: 1, emptySince: s.now()}
		return string(code), nil
	}
}

func (s *Store) Info(code, secret string) (string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.rooms[code]
	if r == nil {
		return "", false, ErrNotFound
	}
	available := len(r.participants) < MaxParticipants
	for _, p := range r.participants {
		if p.secret == secret {
			available = len(p.connections) < maxTabs
			break
		}
	}
	return r.title, available && r.sockets < maxSockets, nil
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
		return ErrFull
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

func (s *Store) Join(code, secret, name string) (*Subscription, error) {
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
		p = &member{id: rand.Text(), secret: secret, name: name, connections: make(map[*Subscription]bool)}
		r.participants = append(r.participants, p)
	}
	if len(p.connections) >= maxTabs {
		return nil, errors.New("Too many tabs for this participant.")
	}
	// Existing tabs share the first joined name as well as the estimate.
	sub := &Subscription{Updates: make(chan Snapshot, 1), code: code, member: p}
	p.connections[sub] = true
	p.disconnected = time.Time{}
	p.departed = false
	r.emptySince = time.Time{}
	r.joined = true
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
	// Renaming does not depend on the round, so a reset must not reject it.
	if command == "rename" {
		title, err := ValidateLabel(value, 100)
		if err != nil {
			return err
		}
		r.title = title
		s.publish(r)
		return nil
	}
	if round != r.round {
		return errors.New("The round changed. Try again.")
	}
	switch command {
	case "select":
		if r.revealed {
			return errors.New("Wait for reset before selecting.")
		}
		if !slices.Contains(Deck, value) {
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
		snapshot := Snapshot{Type: "snapshot", Title: r.title, Round: r.round, Revealed: r.revealed, Self: viewer.id, Participants: make([]Participant, 0, len(r.participants))}
		for _, p := range r.participants {
			if p.departed {
				continue
			}
			card := Participant{ID: p.id, Name: p.name, Connected: len(p.connections) > 0, Selected: p.estimate != ""}
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
		ttl := time.Hour
		if !r.joined {
			ttl = 10 * time.Minute
		}
		if expireRooms && !r.emptySince.IsZero() && now.Sub(r.emptySince) >= ttl {
			delete(s.rooms, code)
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
