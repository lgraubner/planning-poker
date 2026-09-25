package room

import (
	"encoding/json"
	"fmt"
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
	code, err := s.Create("  Sprint  ")
	if err != nil || len(code) != 8 {
		t.Fatalf("create: %q %v", code, err)
	}
	join := func(id, name string) *Subscription {
		t.Helper()
		sub, err := s.Join(code, id, name)
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
	if _, _, err := s.Info(code, ""); err != ErrNotFound {
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
	code, _ := s.Create("Test")
	if _, err := s.Join(code, "guessable", "Alice"); err == nil {
		t.Fatal("bad identity accepted")
	}
	for i := 0; i < MaxParticipants; i++ {
		if _, err := s.Join(code, fmt.Sprintf("00000000-0000-4000-8000-%012d", i), "Same name"); err != nil {
			t.Fatal(err)
		}
	}
	if _, available, _ := s.Info(code, ""); available {
		t.Fatal("full room advertised a new participant slot")
	}
	if _, available, _ := s.Info(code, aliceID); !available {
		t.Fatal("full room blocked a returning participant")
	}
	if _, err := s.Join(code, "00000000-0000-4000-8000-999999999999", "Extra"); err != ErrFull {
		t.Fatal("participant cap missing")
	}
	for i := 0; i < 4; i++ {
		if _, err := s.Join(code, aliceID, "Alex"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Join(code, aliceID, "Alex"); err == nil {
		t.Fatal("tab cap missing")
	}
	if _, available, _ := s.Info(code, aliceID); available {
		t.Fatal("tab limit missing from availability")
	}
	for i := 0; i < 60; i++ {
		if err := s.Reserve(code); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Reserve(code); err != ErrFull {
		t.Fatal("socket cap missing")
	}
	s.Release(code)
	if err := s.Reserve(code); err != nil {
		t.Fatal("socket not released")
	}
}

func TestDepartHidesLastTabAndAllowsRejoin(t *testing.T) {
	s := New()
	code, _ := s.Create("Test")
	first, _ := s.Join(code, aliceID, "Alex")
	second, _ := s.Join(code, aliceID, "Alex")
	if err := s.Command(first, "select", "8", 1); err != nil {
		t.Fatal(err)
	}
	bob, _ := s.Join(code, bobID, "Bob")

	s.Depart(first)
	if snapshot := <-bob.Updates; len(snapshot.Participants) != 2 || !snapshot.Participants[0].Connected {
		t.Fatal("leaving one tab hid the participant")
	}
	s.Depart(second)
	if snapshot := <-bob.Updates; len(snapshot.Participants) != 1 {
		t.Fatal("leaving the last tab did not hide the participant")
	}
	rejoined, _ := s.Join(code, aliceID, "Alex")
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
	unused, _ := s.Create("Unused")
	used, _ := s.Create("Used")
	sub, _ := s.Join(used, aliceID, "Alex")
	s.Leave(sub)
	now = now.Add(10 * time.Minute)
	s.Sweep(true)
	if _, _, err := s.Info(unused, ""); err != ErrNotFound {
		t.Fatal("unjoined room did not expire after 10 minutes")
	}
	if _, _, err := s.Info(used, ""); err != nil {
		t.Fatal("joined room expired before one hour")
	}
}

func TestRenameIgnoresRoundAndValidates(t *testing.T) {
	s := New()
	code, _ := s.Create("Test")
	alice, _ := s.Join(code, aliceID, "Alice")
	bob, _ := s.Join(code, bobID, "Bob")
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
	if title, _, _ := s.Info(code, ""); title != "Retro" {
		t.Fatalf("room info kept %q", title)
	}
}
