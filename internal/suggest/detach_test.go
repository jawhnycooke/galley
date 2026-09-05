package suggest_test

import (
	"strings"
	"testing"
	"time"

	"github.com/schuettc/galley/internal/markdown"
	"github.com/schuettc/galley/internal/review"
	"github.com/schuettc/galley/internal/suggest"
)

// Detach is the DOCUMENT half of deleting a thread: the trace the conversation
// left in the file. Everything else about a delete is the sidecar's business.
//
// Two identical notes on one anchor are the case that decides whether the
// pairing is real or a coincidence — each thread has to take ITS OWN note, so
// deleting one leaves the other's words exactly where they were.
func TestDetachTakesTheRightOneOfTwoIdenticalNotes(t *testing.T) {
	d := parseDoc(t, "# Spec\n\nThe build is slow.\n\n{>>look at this<<}\n\n{>>look at this<<}\n")
	notes := suggest.Notes(d)
	if len(notes) != 2 {
		t.Fatalf("fixture has %d notes, want 2", len(notes))
	}
	at := time.Date(2026, 8, 8, 9, 0, 0, 0, time.UTC)
	threads := []review.Thread{
		suggest.NewNoteThread(notes[0], review.AuthorCourt, at),
		suggest.NewNoteThread(notes[1], review.AuthorCourt, at),
	}
	if threads[0].Key == threads[1].Key {
		t.Fatal("two identical notes were given one key — they are two conversations")
	}

	out, ok := suggest.Detach(d, threads, threads[1].Key)
	if !ok {
		t.Fatal("Detach found nothing to remove")
	}
	got := string(markdown.Serialize(out))
	if strings.Count(got, "look at this") != 1 {
		t.Errorf("want exactly one note left, got %q", got)
	}
	if !strings.Contains(got, "The build is slow.") {
		t.Errorf("Detach took the prose with it: %q", got)
	}
}

// A range thread's trace is its Highlight mark, and lifting it must not touch
// the words it covers — the same transform resolve uses, not a second one.
func TestDetachLiftsARangeCommentsHighlight(t *testing.T) {
	at := time.Date(2026, 8, 8, 9, 0, 0, 0, time.UTC)
	d := parseDoc(t, "A picture and an age.\n")
	d, _, err := suggest.CommentOn(d, "age", review.AuthorCourt, at)
	if err != nil {
		t.Fatal(err)
	}
	threads := []review.Thread{{
		Key:     "c-range",
		Heading: "age",
		Entries: []review.Entry{{Author: review.AuthorCourt, At: at, Text: "which age?"}},
	}}

	out, ok := suggest.Detach(d, threads, "c-range")
	if !ok {
		t.Fatal("Detach did not find the highlight")
	}
	got := string(markdown.Serialize(out))
	if strings.Contains(got, "{==") {
		t.Errorf("the highlight survived: %q", got)
	}
	if !strings.Contains(got, "A picture and an age.") {
		t.Errorf("Detach took the prose with it: %q", got)
	}
}

// PairFor is MarkFor's rule reaching every kind: a thread whose heading is a
// proposal's Text is that proposal's conversation, and the pairing back is how
// its card learns which mark it is about.
func TestPairForReachesProposals(t *testing.T) {
	at := time.Date(2026, 8, 8, 9, 0, 0, 0, time.UTC)
	one := []suggest.Pending{{
		Run:    "ab12cd34",
		Kind:   suggest.KindReplace,
		Anchor: suggest.AnchorRange,
		Text:   "old → new",
		Old:    "old",
		New:    "new",
	}}
	th := review.Thread{
		Key:     "cm-proposal",
		Heading: "old → new",
		Entries: []review.Entry{{Author: review.AuthorCourt, At: at, Text: "why this?"}},
	}

	p, ok := suggest.PairFor(one, th)
	if !ok {
		t.Fatal("PairFor did not reach the replace whose Text is the heading")
	}
	if p.Run != "ab12cd34" {
		t.Errorf("paired run = %q, want %q", p.Run, "ab12cd34")
	}

	// Two replaces the thread cannot be told apart from leave it unpaired.
	// AMBIGUITY IS REPORTED, NEVER RESOLVED BY GUESSING — same standard as
	// MarkFor, because it is the same rule.
	two := append([]suggest.Pending{}, one[0], one[0])
	two[1].Run = "ef56ab78"
	if _, ok := suggest.PairFor(two, th); ok {
		t.Error("two identical-text replaces were guessed between")
	}
}

// A reply-by-run thread's entries carry the REPLIER's author and at, so the
// heading passes' strict test can never see the proposal's identity — but its
// KEY is derived from the proposal by formula, and recomputing that formula
// over the candidates finds the pair even when a second proposal carries the
// very same text. Without the key pass, duplicate text stranded the thread.
func TestPairForPairsByKeyWhenTextsCollide(t *testing.T) {
	atA := time.Date(2026, 8, 8, 9, 0, 0, 0, time.UTC)
	atB := atA.Add(3 * time.Second)
	pending := []suggest.Pending{
		{Run: "run-a", Kind: suggest.KindDelete, Anchor: suggest.AnchorRange,
			Author: review.AuthorAgent, At: atA, Text: "old"},
		{Run: "run-b", Kind: suggest.KindDelete, Anchor: suggest.AnchorRange,
			Author: review.AuthorAgent, At: atB, Text: "old"},
	}
	// The thread a reply-by-run opens: keyed by the PROPOSAL's identity,
	// entries carrying the replier's.
	replied := func(at time.Time) review.Thread {
		return review.Thread{
			Key:     suggest.CommentKey("old", review.AuthorAgent, at),
			Heading: "old",
			Entries: []review.Entry{{Author: review.AuthorCourt, At: at.Add(time.Minute), Text: "why?"}},
		}
	}

	p, ok := suggest.PairFor(pending, replied(atB))
	if !ok {
		t.Fatal("duplicate text stranded the thread — the key pass did not run")
	}
	if p.Run != "run-b" {
		t.Errorf("paired run = %q, want %q — the key named the OTHER proposal", p.Run, "run-b")
	}
	// And the twin's own thread pairs the twin, not this one: the key selects
	// exactly, in both directions.
	p, ok = suggest.PairFor(pending, replied(atA))
	if !ok || p.Run != "run-a" {
		t.Errorf("twin's thread paired (%q, %v), want (%q, true)", p.Run, ok, "run-a")
	}
}

// A thread whose trace is already gone — the note deleted by hand, the
// highlighted text edited away — reports NOT FOUND rather than removing
// something adjacent. The caller still drops the thread; nothing else moves.
func TestDetachReportsNothingRatherThanGuessing(t *testing.T) {
	d := parseDoc(t, "# Spec\n\nThe build is slow.\n\n{>>a different note<<}\n")
	threads := []review.Thread{{
		Key: "cd-gone", Anchor: string(suggest.AnchorDocument),
		Entries: []review.Entry{{Author: review.AuthorCourt, Text: "the note that is gone"}},
	}}
	out, ok := suggest.Detach(d, threads, "cd-gone")
	if ok {
		t.Error("Detach claimed to have removed a trace that is not there")
	}
	if got := string(markdown.Serialize(out)); !strings.Contains(got, "a different note") {
		t.Errorf("Detach removed the wrong note: %q", got)
	}
}

// Reword is the DOCUMENT half of editing an instruction, and the two identical
// notes are here for the reason they are in the delete test above: the pairing
// has to be real, so rewording one may not touch the other's words.
func TestRewordChangesOneNoteAndLeavesItsTwinAlone(t *testing.T) {
	d := parseDoc(t, "# Spec\n\nThe build is slow.\n\n{>>look at this<<}\n\n{>>look at this<<}\n")
	notes := suggest.Notes(d)
	if len(notes) != 2 {
		t.Fatalf("fixture has %d notes, want 2", len(notes))
	}
	at := time.Date(2026, 8, 8, 9, 0, 0, 0, time.UTC)
	threads := []review.Thread{
		suggest.NewNoteThread(notes[0], review.AuthorCourt, at),
		suggest.NewNoteThread(notes[1], review.AuthorCourt, at),
	}

	out, ok := suggest.Reword(d, threads, threads[1].Key, "say which build")
	if !ok {
		t.Fatal("Reword found no note to rewrite")
	}
	got := string(markdown.Serialize(out))
	if strings.Count(got, "look at this") != 1 {
		t.Errorf("the twin was rewritten too: %q", got)
	}
	if !strings.Contains(got, "{>>say which build<<}") {
		t.Errorf("the new words never reached the file: %q", got)
	}
	if !strings.Contains(got, "The build is slow.") {
		t.Errorf("Reword took the prose with it: %q", got)
	}
}

// A RANGE INSTRUCTION HAS NO WORDS IN THE DOCUMENT, so there is nothing here to
// reword and the honest answer is to change nothing and say so. The words are
// the sidecar's; the file holds only a Highlight over prose the reviewer did
// not write, and rewriting THAT would rewrite the author's own sentence.
func TestRewordLeavesARangeInstructionsProseAlone(t *testing.T) {
	at := time.Date(2026, 8, 8, 9, 0, 0, 0, time.UTC)
	d := parseDoc(t, "A picture and an age.\n")
	d, _, err := suggest.CommentOn(d, "age", review.AuthorCourt, at)
	if err != nil {
		t.Fatal(err)
	}
	threads := []review.Thread{{
		Key:     "c-range",
		Heading: "age",
		Entries: []review.Entry{{Author: review.AuthorCourt, At: at, Text: "which age?"}},
	}}
	before := string(markdown.Serialize(d))
	out, ok := suggest.Reword(d, threads, "c-range", "which age exactly?")
	if ok {
		t.Error("Reword claimed to have rewritten a document that holds no note")
	}
	if got := string(markdown.Serialize(out)); got != before {
		t.Errorf("Reword changed the file anyway:\n got %q\nwant %q", got, before)
	}
}
