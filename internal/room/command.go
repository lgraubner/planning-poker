package room

import (
	"errors"
	"slices"
)

func (s *Store) Command(sub *Subscription, command, value string, round uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	r := s.rooms[sub.code]
	if r == nil || !sub.participant.connections[sub] {
		return ErrNotFound
	}

	if round != r.round && (command == "select" || command == "reveal" || command == "reset") {
		return errors.New("The round changed. Try again")
	}

	switch command {
	case "rename":
		title, err := ValidateLabel(value, maxTitleLength)
		if err != nil {
			return err
		}

		r.title = title
	case "name":
		name, err := ValidateLabel(value, maxNameLength)
		if err != nil {
			return err
		}

		sub.participant.name = name
	case "role":
		if value != "spectator" && value != "voter" {
			return errors.New("Unknown role")
		}

		sub.participant.spectator = value == "spectator"
		if !r.revealed {
			sub.participant.estimate = ""
		}
	case "select":
		if sub.participant.spectator {
			return errors.New("Spectators do not estimate")
		}

		if r.revealed {
			return errors.New("Wait for reset before selecting")
		}

		if !slices.Contains(Decks[r.deck], value) {
			return errors.New("Invalid estimate")
		}

		if sub.participant.estimate == value {
			sub.participant.estimate = ""
		} else {
			sub.participant.estimate = value
		}
	case "reveal":
		r.revealed = true
	case "reset":
		if !r.revealed {
			return errors.New("Reveal before resetting")
		}

		r.revealed = false
		r.round++
		for _, p := range r.participants {
			p.estimate = ""
		}
	default:
		return errors.New("Unknown command")
	}

	if command == "rename" || command == "reveal" || command == "reset" {
		s.save(sub.code, r)
	}

	s.publish(r)

	return nil
}

func (s *Store) publish(r *room) {
	for _, viewer := range r.participants {
		if len(viewer.connections) == 0 {
			continue
		}

		snapshot := Snapshot{Type: "snapshot", Title: r.title, Round: r.round, Deck: Decks[r.deck], Revealed: r.revealed, Self: viewer.id, Participants: make([]Card, 0, len(r.participants))}

		for _, p := range r.participants {
			if p.departed {
				continue
			}

			card := Card{ID: p.id, Name: p.name, Connected: len(p.connections) > 0, Selected: p.estimate != "", Spectator: p.spectator}
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
