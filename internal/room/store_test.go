package room

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"
)

const aliceID = "00000000-0000-4000-8000-000000000001"
const bobID = "00000000-0000-4000-8000-000000000002"

func TestRoundPrivacyAndReconnect(t *testing.T) {
	s := New()
	now := time.Now()
	s.now = func() time.Time { return now }
	code, err := s.Create("  Sprint  ", "fibonacci")
	if err != nil || len(code) != 8 {
		t.Fatalf("create: %q %v", code, err)
	}
	join := func(id, name string) *Subscription {
		t.Helper()
		sub, err := s.Join(code, id, name, false)
		if err != nil {
			t.Fatal(err)
		}
		return sub
	}
	alice := join(aliceID, "Alex")
	bob := join(bobID, "Alex")
	if err := s.Command(alice, "select", "8", 1); err != nil {
		t.Fatal(err)
	}
	a, b := <-alice.Updates, <-bob.Updates
	if a.Participants[0].Estimate != "8" || b.Participants[0].Estimate != "" || !b.Participants[0].Selected {
		t.Fatal("hidden estimates leaked or own selection missing")
	}
	if err := s.Command(alice, "select", "8", 1); err != nil {
		t.Fatal(err)
	}
	a, b = <-alice.Updates, <-bob.Updates
	if a.Participants[0].Estimate != "" || b.Participants[0].Selected {
		t.Fatal("selecting the same estimate did not clear it")
	}
	if err := s.Command(alice, "select", "8", 1); err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(b)
	if strings.Contains(string(encoded), aliceID) || strings.Contains(string(encoded), bobID) {
		t.Fatal("private identity leaked")
	}
	secondTab := join(aliceID, "Different name")
	if snapshot := <-secondTab.Updates; len(snapshot.Participants) != 2 || snapshot.Self != a.Self || snapshot.Participants[0].Name != "Alex" {
		t.Fatal("tabs did not share identity")
	}
	s.Leave(alice)
	if snapshot := <-bob.Updates; !snapshot.Participants[0].Connected {
		t.Fatal("one tab disconnect marked participant offline")
	}
	if err := s.Command(bob, "reveal", "", 1); err != nil {
		t.Fatal(err)
	}
	if snapshot := <-bob.Updates; !snapshot.Revealed || snapshot.Participants[0].Estimate != "8" {
		t.Fatal("reveal failed")
	}
	late := join("00000000-0000-4000-8000-000000000003", "Late")
	if err := s.Command(late, "select", "5", 1); err == nil {
		t.Fatal("late estimate accepted")
	}
	if err := s.Command(bob, "reset", "", 1); err != nil {
		t.Fatal(err)
	}
	if err := s.Command(secondTab, "select", "13", 1); err == nil {
		t.Fatal("stale command accepted")
	}
	if snapshot := <-bob.Updates; snapshot.Round != 2 || snapshot.Revealed || snapshot.Participants[0].Selected {
		t.Fatal("reset failed")
	}
	if err := s.Command(secondTab, "select", "☕", 2); err != nil {
		t.Fatal(err)
	}
	s.Leave(secondTab)
	now = now.Add(29 * time.Second)
	s.Sweep(false)
	reconnected := join(aliceID, "Alex")
	if snapshot := <-reconnected.Updates; snapshot.Self != a.Self || snapshot.Participants[0].Estimate != "☕" {
		t.Fatal("reconnect lost card")
	}
	s.Leave(reconnected)
	now = now.Add(30 * time.Second)
	s.Sweep(false)
	if snapshot := <-bob.Updates; len(snapshot.Participants) != 2 {
		t.Fatal("disconnected participant did not expire")
	}
	s.Leave(bob)
	s.Leave(late)
	now = now.Add(time.Hour)
	s.Sweep(true)
	if _, err := s.Info(code, ""); err != ErrNotFound {
		t.Fatal("empty room did not expire")
	}
}

func TestValidationAndLimits(t *testing.T) {
	for _, value := range []string{"", "  ", "name\n", "a\x00b", string([]byte{0xff}), strings.Repeat("界", 41)} {
		if _, err := ValidateLabel(value, 40); err == nil {
			t.Errorf("accepted invalid label %q", value)
		}
	}
	if _, err := ValidateLabel(strings.Repeat("界", 40), 40); err != nil {
		t.Fatal("Unicode characters counted as bytes")
	}
	s := New()
	code, _ := s.Create("Test", "fibonacci")
	if _, err := s.Join(code, "guessable", "Alice", false); err == nil {
		t.Fatal("bad identity accepted")
	}
	for i := 0; i < MaxParticipants; i++ {
		if _, err := s.Join(code, fmt.Sprintf("00000000-0000-4000-8000-%012d", i), "Same name", false); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Info(code, ""); err != ErrFull {
		t.Fatalf("full room advertised a new participant slot: %v", err)
	}
	if _, err := s.Info(code, aliceID); err != nil {
		t.Fatalf("full room blocked a returning participant: %v", err)
	}
	if _, err := s.Join(code, "00000000-0000-4000-8000-999999999999", "Extra", false); err != ErrFull {
		t.Fatal("participant cap missing")
	}
	for i := 0; i < 4; i++ {
		if _, err := s.Join(code, aliceID, "Alex", false); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Join(code, aliceID, "Alex", false); err != ErrTooManyTabs {
		t.Fatalf("tab cap missing: %v", err)
	}
	if _, err := s.Info(code, aliceID); err != ErrTooManyTabs {
		t.Fatalf("tab limit missing from availability: %v", err)
	}
	for i := 0; i < maxSockets; i++ {
		if err := s.Reserve(code); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Reserve(code); err != ErrBusy {
		t.Fatalf("socket cap missing: %v", err)
	}
	if _, err := s.Info(code, ""); err != ErrBusy {
		t.Fatalf("socket cap missing from availability: %v", err)
	}
	s.Release(code)
	if err := s.Reserve(code); err != nil {
		t.Fatal("socket not released")
	}
}

func TestDepartHidesLastTabAndAllowsRejoin(t *testing.T) {
	s := New()
	code, _ := s.Create("Test", "fibonacci")
	first, _ := s.Join(code, aliceID, "Alex", false)
	second, _ := s.Join(code, aliceID, "Alex", false)
	if err := s.Command(first, "select", "8", 1); err != nil {
		t.Fatal(err)
	}
	bob, _ := s.Join(code, bobID, "Bob", false)

	s.Depart(first)
	if snapshot := <-bob.Updates; len(snapshot.Participants) != 2 || !snapshot.Participants[0].Connected {
		t.Fatal("leaving one tab hid the participant")
	}
	s.Depart(second)
	if snapshot := <-bob.Updates; len(snapshot.Participants) != 1 {
		t.Fatal("leaving the last tab did not hide the participant")
	}
	rejoined, _ := s.Join(code, aliceID, "Alex", false)
	if snapshot := <-bob.Updates; len(snapshot.Participants) != 2 || !snapshot.Participants[0].Connected {
		t.Fatal("departed participant could not rejoin")
	}
	if snapshot := <-rejoined.Updates; snapshot.Participants[0].Estimate != "8" {
		t.Fatal("departed participant lost their estimate")
	}

	s.Leave(rejoined)
	s.Leave(bob)
}

func TestUnjoinedRoomsExpireEarly(t *testing.T) {
	s := New()
	now := time.Now()
	s.now = func() time.Time { return now }
	unused, _ := s.Create("Unused", "fibonacci")
	used, _ := s.Create("Used", "fibonacci")
	sub, _ := s.Join(used, aliceID, "Alex", false)
	s.Leave(sub)
	now = now.Add(10 * time.Minute)
	s.Sweep(true)
	if _, err := s.Info(unused, ""); err != ErrNotFound {
		t.Fatal("unjoined room did not expire after 10 minutes")
	}
	if _, err := s.Info(used, ""); err != nil {
		t.Fatal("joined room expired before one hour")
	}
}

func TestRenameIgnoresRoundAndValidates(t *testing.T) {
	s := New()
	code, _ := s.Create("Test", "fibonacci")
	alice, _ := s.Join(code, aliceID, "Alice", false)
	bob, _ := s.Join(code, bobID, "Bob", false)
	<-alice.Updates
	<-bob.Updates
	for _, title := range []string{"", "  ", "a\nb", strings.Repeat("界", 101)} {
		if err := s.Command(alice, "rename", title, 1); err == nil {
			t.Errorf("accepted invalid title %q", title)
		}
	}
	if err := s.Command(alice, "rename", "  Retro  ", 7); err != nil {
		t.Fatal(err)
	}
	if snapshot := <-bob.Updates; snapshot.Title != "Retro" {
		t.Fatalf("other participant saw %q", snapshot.Title)
	}
	if title, _ := s.Info(code, ""); title != "Retro" {
		t.Fatalf("room info kept %q", title)
	}
}

func TestNameIgnoresRoundAndValidates(t *testing.T) {
	s := New()
	code, _ := s.Create("Test", "fibonacci")
	alice, _ := s.Join(code, aliceID, "Alice", false)
	bob, _ := s.Join(code, bobID, "Bob", false)
	<-alice.Updates
	<-bob.Updates
	for _, name := range []string{"", "  ", "a\nb", strings.Repeat("界", 41)} {
		if err := s.Command(alice, "name", name, 1); err == nil {
			t.Errorf("accepted invalid name %q", name)
		}
	}
	if err := s.Command(alice, "name", "  Alicia  ", 7); err != nil {
		t.Fatal(err)
	}
	if snapshot := <-bob.Updates; snapshot.Participants[0].Name != "Alicia" || snapshot.Participants[1].Name != "Bob" {
		t.Fatalf("other participant saw %+v", snapshot.Participants)
	}
}

func TestSpectatorsHoldNoEstimate(t *testing.T) {
	s := New()
	code, _ := s.Create("Test", "fibonacci")
	alice, _ := s.Join(code, aliceID, "Alice", true)
	bob, _ := s.Join(code, bobID, "Bob", false)
	<-alice.Updates
	if snapshot := <-bob.Updates; !snapshot.Participants[0].Spectator || snapshot.Participants[1].Spectator {
		t.Fatalf("join did not set roles: %+v", snapshot.Participants)
	}
	if err := s.Command(alice, "select", "8", 1); err == nil {
		t.Error("spectator selected an estimate")
	}
	for _, role := range []string{"", "Spectator", "admin"} {
		if err := s.Command(bob, "role", role, 1); err == nil {
			t.Errorf("accepted role %q", role)
		}
	}
	if err := s.Command(bob, "select", "8", 1); err != nil {
		t.Fatal(err)
	}
	<-bob.Updates
	// A stale round must not block a role change, as with renames.
	if err := s.Command(bob, "role", "spectator", 7); err != nil {
		t.Fatal(err)
	}
	if snapshot := <-alice.Updates; !snapshot.Participants[1].Spectator || snapshot.Participants[1].Selected {
		t.Fatalf("spectator kept an estimate: %+v", snapshot.Participants[1])
	}
	if err := s.Command(alice, "role", "voter", 1); err != nil {
		t.Fatal(err)
	}
	<-alice.Updates
	// Another tab joining as a spectator shares the voter's seat.
	secondTab, _ := s.Join(code, aliceID, "Alice", true)
	if snapshot := <-secondTab.Updates; snapshot.Participants[0].Spectator {
		t.Fatal("rejoining changed an existing participant's role")
	}
}

func TestWatchingAfterTheRevealKeepsTheVote(t *testing.T) {
	s := New()
	code, _ := s.Create("Test", "fibonacci")
	alice, _ := s.Join(code, aliceID, "Alice", false)
	bob, _ := s.Join(code, bobID, "Bob", false)
	for _, c := range []struct {
		sub            *Subscription
		command, value string
	}{{alice, "select", "3"}, {bob, "select", "8"}, {alice, "reveal", ""}, {bob, "role", "spectator"}} {
		if err := s.Command(c.sub, c.command, c.value, 1); err != nil {
			t.Fatal(c.command, err)
		}
	}
	// The team is still discussing the revealed cards, so they must not change under it.
	if snapshot := <-alice.Updates; snapshot.Participants[1].Estimate != "8" || !snapshot.Participants[1].Spectator {
		t.Fatalf("revealed vote changed: %+v", snapshot.Participants[1])
	}
	if err := s.Command(alice, "reset", "", 1); err != nil {
		t.Fatal(err)
	}
	if snapshot := <-alice.Updates; snapshot.Participants[1].Selected {
		t.Fatal("a spectator kept a vote into the next round")
	}
}

func TestSQLitePersistsRoomsAcrossRestarts(t *testing.T) {
	path := t.TempDir() + "/rooms.db"
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	// A past clock tells a persisted idle clock apart from one reset at startup.
	now := time.Now().Add(-365 * 24 * time.Hour)
	start := now
	s.now = func() time.Time { return now }
	code, _ := s.Create("Sprint", "tshirt")
	unused, _ := s.Create("Unused", "fibonacci")
	idle, _ := s.Create("Idle", "fibonacci")
	alice, _ := s.Join(code, aliceID, "Alice", false)
	for _, c := range []struct {
		command, value string
		round          uint64
	}{{"reveal", "", 1}, {"reset", "", 1}, {"reveal", "", 2}, {"rename", "Retro", 2}} {
		if err := s.Command(alice, c.command, c.value, c.round); err != nil {
			t.Fatal(c.command, err)
		}
	}
	// Alice stays connected: the restart finds the room occupied.
	bob, _ := s.Join(idle, bobID, "Bob", false)
	s.Leave(bob)
	now = now.Add(10 * time.Minute)
	s.Sweep(true)

	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	s.now = func() time.Time { return now }
	if _, err := s.Info(unused, ""); err != ErrNotFound {
		t.Fatal("expired room came back after restart")
	}
	bob, err = s.Join(code, bobID, "Bob", false)
	if err != nil {
		t.Fatal("room lost on restart:", err)
	}
	// The votes of a revealed round stay in memory, so the room comes back ready for the next round.
	if snapshot := <-bob.Updates; snapshot.Title != "Retro" || snapshot.Deck[0] != "XS" || snapshot.Round != 3 || snapshot.Revealed {
		t.Fatalf("room state lost on restart: %+v", snapshot)
	}
	s.Leave(bob)

	s, _ = Open(path)
	s.now = func() time.Time { return now }
	now = start.Add(30 * 24 * time.Hour)
	s.Sweep(true)
	if _, err := s.Info(idle, ""); err != ErrNotFound {
		t.Fatal("idle clock reset on restart")
	}
	if _, err := s.Info(code, ""); err != nil {
		t.Fatal("joined room expired before 30 idle days")
	}
}

func TestEachRoomUsesItsOwnDeck(t *testing.T) {
	s := New()
	for _, deck := range []string{"", "Fibonacci", "nope"} {
		if _, err := s.Create("Room", deck); err == nil {
			t.Errorf("created a room with deck %q", deck)
		}
	}
	shirts, _ := s.Create("Shirts", "tshirt")
	points, _ := s.Create("Points", "fibonacci")
	alice, _ := s.Join(shirts, aliceID, "Alice", false)
	bob, _ := s.Join(points, bobID, "Bob", false)
	if snapshot := <-alice.Updates; !slices.Equal(snapshot.Deck, Decks["tshirt"]) {
		t.Fatalf("snapshot deck: %v", snapshot.Deck)
	}
	<-bob.Updates
	for _, c := range []struct {
		sub   *Subscription
		value string
		ok    bool
	}{{alice, "M", true}, {alice, "8", false}, {bob, "8", true}, {bob, "M", false}, {alice, "?", true}} {
		if err := s.Command(c.sub, "select", c.value, 1); (err == nil) != c.ok {
			t.Errorf("select %q: %v", c.value, err)
		}
	}
}

func TestSQLiteAddsDecksToOlderDatabases(t *testing.T) {
	path := t.TempDir() + "/rooms.db"
	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE rooms (code TEXT PRIMARY KEY, title TEXT NOT NULL, round INTEGER NOT NULL, revealed INTEGER NOT NULL, joined INTEGER NOT NULL, empty_since INTEGER NOT NULL);
		INSERT INTO rooms VALUES ('abcdefgh', 'Old', 1, 0, 0, 0)`)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	for range 2 { // the second open finds the column already there
		s, err := Open(path)
		if err != nil {
			t.Fatal(err)
		}
		alice, err := s.Join("abcdefgh", aliceID, "Alice", false)
		if err != nil {
			t.Fatal(err)
		}
		if snapshot := <-alice.Updates; !slices.Equal(snapshot.Deck, Decks["fibonacci"]) {
			t.Fatalf("old room deck: %v", snapshot.Deck)
		}
		s.db.Close()
	}
}

func TestRoomLimitDependsOnPersistence(t *testing.T) {
	memory := New()
	for range 1000 {
		if _, err := memory.Create("Room", "fibonacci"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := memory.Create("Room", "fibonacci"); err != nil || len(memory.rooms) != 1000 {
		t.Fatalf("in-memory store did not stay at 1,000 rooms: %d, %v", len(memory.rooms), err)
	}
	s, err := Open(t.TempDir() + "/rooms.db")
	if err != nil {
		t.Fatal(err)
	}
	for range 1001 {
		if _, err := s.Create("Room", "fibonacci"); err != nil {
			t.Fatal("database store stopped at the in-memory room limit:", err)
		}
	}
}

func TestFullStoreMakesRoomFromTheLongestEmpty(t *testing.T) {
	s := New()
	s.maxRooms = 3
	now := time.Now()
	s.now = func() time.Time { return now }
	codes := make([]string, 3)
	for i := range codes {
		codes[i], _ = s.Create("Room", "fibonacci")
		now = now.Add(time.Minute)
	}
	// Someone is joining the oldest room, so it must survive.
	if err := s.Reserve(codes[0]); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create("New", "fibonacci"); err != nil {
		t.Fatal("full store refused a room while some stood empty:", err)
	}
	if _, err := s.Info(codes[1], ""); err != ErrNotFound {
		t.Fatal("did not remove the room empty the longest")
	}
	if _, err := s.Info(codes[0], ""); err != nil {
		t.Fatal("removed a room someone was joining")
	}
	for code := range s.rooms {
		if _, err := s.Join(code, aliceID, "Alice", false); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Create("Extra", "fibonacci"); err == nil {
		t.Fatal("removed an occupied room")
	}
}

// Sweep runs every second under the store lock, so it must stay cheap at the room limit.
func BenchmarkSweepAtDatabaseRoomLimit(b *testing.B) {
	s := New()
	for i := range 100_000 {
		s.rooms[fmt.Sprint(i)] = &session{title: "Room", round: 1, emptySince: time.Now()}
	}
	for b.Loop() {
		s.Sweep(false)
	}
}
