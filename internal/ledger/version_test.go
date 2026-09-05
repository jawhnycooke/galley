package ledger

import (
	"os"
	"testing"
)

// `v` WAS DECORATIVE. It was written on every line, hashed into Digest and
// stored in its own column, and nothing ever compared it to anything — so a log
// carrying rows from a galley whose meanings had moved read exactly like one
// that did not, and every rollup was quietly counting a mixed population
// without being able to say so.
//
// The policy stated on Version is unchanged and is the right one for a
// committed, merge=union, append-only log: the row is KEPT and indexed, not
// skipped and not refused. Counting is the whole of what that policy allows,
// and it is the difference between a number nobody can question and one a
// reader can.
func TestARecordFromANewerGalleyIsCountedAndStillIndexed(t *testing.T) {
	_, doc := repo(t)
	x := openTestIndex(t)

	log := decide(t, doc, Record{Kind: KindApproved, Author: AuthorAgent, Quote: "mine"})
	// A line as a future galley would append it: this build's fields, plus a
	// generation it has never heard of.
	f, err := os.OpenFile(log, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString(
		`{"v":99,"at":"2026-08-20T10:00:00Z","doc":"doc.md","review":"","kind":"approved","author":"agent","old":"","new":"","reason":"","quote":"theirs","context":"","round":0,"text":""}` + "\n"); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}

	res, err := x.Sync(log)
	if err != nil {
		t.Fatal(err)
	}
	if res.Added != 2 {
		t.Fatalf("added %d, want 2 — a future row is KEPT; the log is authoritative and lines are never rewritten", res.Added)
	}
	if res.Skipped != 0 {
		t.Fatalf("skipped %d — a future row is not an unparseable one", res.Skipped)
	}
	if res.Future != 1 {
		t.Fatalf("future = %d, want 1 — the field was decorative until something read it", res.Future)
	}
}

func TestARecordFromThisGalleyIsNotCountedAsFuture(t *testing.T) {
	_, doc := repo(t)
	x := openTestIndex(t)
	log := decide(t, doc, Record{Kind: KindApproved, Author: AuthorAgent, Quote: "mine"})
	res, err := x.Sync(log)
	if err != nil {
		t.Fatal(err)
	}
	if res.Future != 0 {
		t.Fatalf("future = %d, want 0 — this build's own generation is not the future", res.Future)
	}
}
