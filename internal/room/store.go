package room

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"math/big"
	"slices"
	"sync"
	"time"
)

const (
	MaxParticipants       = 30
	maxSockets            = 4 * MaxParticipants
	maxTabsPerParticipant = 5
)

const (
	CodeLength = 8
	alphabet   = "23456789abcdefghjkmnpqrstuvwxyz"
)

var (
	ErrNotFound    = errors.New("Room not found")
	ErrFull        = errors.New("This room is full")
	ErrTooManyTabs = errors.New("You have this room open in too many tabs. Close one and try again")
	ErrBusy        = errors.New("This room has too many connections right now. Try again shortly")
)

type Card struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Connected bool   `json:"connected"`
	Selected  bool   `json:"selected"`
	Spectator bool   `json:"spectator"`
	Estimate  string `json:"estimate,omitempty"`
}

type Snapshot struct {
	Type         string   `json:"type"`
	Title        string   `json:"title"`
	Round        uint64   `json:"round"`
	Deck         []string `json:"deck"`
	Revealed     bool     `json:"revealed"`
	Self         string   `json:"self"`
	Participants []Card   `json:"participants"`
}

type participant struct {
	id, secret, name, estimate string
	connections                map[*Subscription]bool
	disconnected               time.Time
	departed, spectator        bool
}

type room struct {
	title        string
	deck         string
	round        uint64
	revealed     bool
	participants []*participant
	emptySince   time.Time
	sockets      int
	joined       bool
}

type Subscription struct {
	Updates     chan Snapshot
	code        string
	participant *participant
}

type Store struct {
	mu       sync.Mutex
	rooms    map[string]*room
	now      func() time.Time
	db       *sql.DB
	idleTTL  time.Duration
	maxRooms int
}

func New() *Store {
	return &Store{rooms: make(map[string]*room), now: time.Now, idleTTL: time.Hour, maxRooms: 1000}
}

func (s *Store) Create(title, deck string) (string, error) {
	title, err := ValidateLabel(title, maxTitleLength)
	if err != nil {
		return "", err
	}

	if Decks[deck] == nil {
		return "", errors.New("Unknown deck")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.rooms) >= s.maxRooms && !s.removeLongestEmpty() {
		return "", errors.New("Room limit reached. Try again later")
	}

	for {
		code := make([]byte, CodeLength)
		for i := range code {
			n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
			if err != nil {
				return "", errors.New("Could not create room")
			}

			code[i] = alphabet[n.Int64()]
		}

		if _, exists := s.rooms[string(code)]; exists {
			continue
		}

		r := &room{title: title, deck: deck, round: 1, emptySince: s.now()}
		if s.save(string(code), r) != nil {
			return "", errors.New("Could not create room")
		}

		s.rooms[string(code)] = r
		return string(code), nil
	}
}

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
			if len(p.connections) >= maxTabsPerParticipant {
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

func (s *Store) ReserveSocket(code string) error {
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

func (s *Store) ReleaseSocket(code string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if r := s.rooms[code]; r != nil {
		r.sockets--
	}
}

func (s *Store) Join(code, secret, name string, spectator bool) (*Subscription, error) {
	name, err := ValidateLabel(name, maxNameLength)
	if err != nil {
		return nil, err
	}

	if !validSecret(secret) {
		return nil, errors.New("Invalid participant identity")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	r := s.rooms[code]
	if r == nil {
		return nil, ErrNotFound
	}

	var p *participant
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

		p = &participant{id: rand.Text(), secret: secret, name: name, spectator: spectator, connections: make(map[*Subscription]bool)}
		r.participants = append(r.participants, p)
	}

	if len(p.connections) >= maxTabsPerParticipant {
		return nil, ErrTooManyTabs
	}

	sub := &Subscription{Updates: make(chan Snapshot, 1), code: code, participant: p}
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
	if r == nil || !sub.participant.connections[sub] {
		return
	}

	delete(sub.participant.connections, sub)
	if len(sub.participant.connections) == 0 {
		sub.participant.disconnected = s.now()
		sub.participant.departed = departed
	}

	if !hasConnections(r) {
		r.emptySince = s.now()
		s.save(sub.code, r)
	}

	s.publish(r)
}

func hasConnections(r *room) bool {
	for _, p := range r.participants {
		if len(p.connections) > 0 {
			return true
		}
	}

	return false
}

func (s *Store) Sweep(expireRooms bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := s.now()

	for code, r := range s.rooms {
		idleTTL := s.idleTTL
		if !r.joined {
			idleTTL = 10 * time.Minute
		}

		if expireRooms && !r.emptySince.IsZero() && now.Sub(r.emptySince) >= idleTTL {
			delete(s.rooms, code)
			s.save(code, nil)
			continue
		}

		before := len(r.participants)
		r.participants = slices.DeleteFunc(r.participants, func(p *participant) bool {
			return len(p.connections) == 0 && now.Sub(p.disconnected) >= 30*time.Second
		})

		if before != len(r.participants) {
			s.publish(r)
		}
	}
}
