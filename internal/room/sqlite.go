package room

import (
	"database/sql"
	"log/slog"
	"time"

	_ "modernc.org/sqlite"
)

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

	// Databases from before decks lack the column, and SQLite cannot add one only if missing
	if _, err := db.Exec(`SELECT deck FROM rooms LIMIT 0`); err != nil {
		if _, err := db.Exec(`ALTER TABLE rooms ADD COLUMN deck TEXT NOT NULL DEFAULT 'fibonacci'`); err != nil {
			db.Close()
			return nil, err
		}
	}

	s := New()
	s.db, s.idleTTL, s.maxRooms = db, 30*24*time.Hour, 100_000
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

		if r.revealed {
			r.revealed = false
			r.round++
		}

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
