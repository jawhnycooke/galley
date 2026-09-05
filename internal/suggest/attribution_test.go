package suggest

import (
	"testing"
	"time"

	"github.com/schuettc/galley/internal/markdown"
	"github.com/schuettc/galley/internal/review"
)

// ReplayAttribution is how a suggestion keeps its author across a restart: the
// file cannot carry one (CriticMarkup has no slot), so the sidecar records it
// and this puts it back on the parsed marks. When it fails it fails SILENTLY —
// the suggestion simply reads "(unattributed)" forever after, and nothing
// errors — which is why it needs pinning at this level and had nothing.

func metaOf(kind, author, quote string, at time.Time) review.SuggestionMeta {
	return review.SuggestionMeta{Kind: kind, Author: author, Quote: quote, At: at}
}

func authorsOf(pendings []Pending) []string {
	out := make([]string, len(pendings))
	for i, p := range pendings {
		out[i] = p.Author
	}
	return out
}

// TWO ADJACENT DELETIONS OF THE SAME WORD, BY DIFFERENT PEOPLE. This is the
// case findUnattributedRun's spanKey exists for, and the one that regresses
// invisibly: drop the run from the key and the scan runs across the boundary,
// concatenates "ageage", matches neither quote, and both authors are lost.
//
// It is reachable the ordinary way — two reviewers deleting the same word in
// the same paragraph, then a restart.
func TestReplayAttribution_AdjacentIdenticalDeletionsKeepTheirOwnAuthors(t *testing.T) {
	model, _, err := markdown.Parse([]byte("keep {--age--}{--age--} here.\n"))
	if err != nil {
		t.Fatal(err)
	}
	if n := len(List(model)); n != 2 {
		t.Fatalf("two {--…--} in the file listed as %d suggestion(s), want 2", n)
	}

	ReplayAttribution(&model, []review.SuggestionMeta{
		metaOf("delete", "ann", "age", tCourt),
		metaOf("delete", "bob", "age", tAlice),
	})

	got := authorsOf(List(model))
	want := []string{"ann", "bob"}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("suggestion %d attributed to %q, want %q (all: %v) — "+
				"a scan that crosses the span boundary matches neither quote and drops both",
				i, got[i], want[i], got)
		}
	}
}

// The other direction, and the reason the boundary has to be the run rather
// than the text: ONE span crossing a code span is one suggestion, so one meta
// attributes the whole of it — including the inlines the formatting split off.
func TestReplayAttribution_ASpanCrossingFormattingIsAttributedWhole(t *testing.T) {
	model, _, err := markdown.Parse([]byte("{==The `retryBudget` value controls==} retries.\n"))
	if err != nil {
		t.Fatal(err)
	}
	pending := List(model)
	if len(pending) != 1 {
		t.Fatalf("one {==…==} listed as %d suggestion(s), want 1", len(pending))
	}

	ReplayAttribution(&model, []review.SuggestionMeta{
		metaOf("comment", "court", pending[0].Text, tCourt),
	})

	got := List(model)
	if got[0].Author != "court" {
		t.Errorf("author = %q, want court", got[0].Author)
	}
	// Every inline the span covers must carry it, not just the first — a
	// half-attributed span splits on the next spansForMark pass, because
	// author is in the very same key.
	if n := len(got); n != 1 {
		t.Errorf("attributing split the span into %d suggestions, want 1", n)
	}
}

// Attribution must not invent one. A meta whose quote no longer matches
// anything is dropped rather than applied to whatever happens to be next —
// "fail safe, not fail exact", as ReplayAttribution's own comment puts it.
func TestReplayAttribution_AStaleQuoteIsNotAppliedToTheWrongMark(t *testing.T) {
	model, _, err := markdown.Parse([]byte("keep {--age--} here.\n"))
	if err != nil {
		t.Fatal(err)
	}
	ReplayAttribution(&model, []review.SuggestionMeta{
		metaOf("delete", "ann", "something else entirely", tCourt),
	})
	if got := List(model)[0].Author; got != "" {
		t.Errorf("author = %q, want empty — a stale meta was applied to the wrong mark", got)
	}
}
