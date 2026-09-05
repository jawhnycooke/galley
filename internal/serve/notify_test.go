package serve

import (
	"testing"

	"github.com/schuettc/galley/internal/review"
	"github.com/schuettc/galley/internal/suggest"
)

func TestFingerprintPendingMovesWithSuggestions(t *testing.T) {
	threads := []review.Thread{{Key: "cm-1", Entries: []review.Entry{{Author: "court", Text: "hm"}}}}
	one := []suggest.Pending{{Run: "a1", Kind: suggest.KindInsert, Text: "hello"}}
	two := []suggest.Pending{{Run: "a1", Kind: suggest.KindInsert, Text: "hello"},
		{Run: "b2", Kind: suggest.KindDelete, Text: "world"}}

	if FingerprintPending(one, threads) == FingerprintPending(two, threads) {
		t.Error("a new suggestion did not move the fingerprint — the notifier would stay silent")
	}
	// Bound to locals rather than compared inline: staticcheck's SA4000 reads
	// `f(x) != f(x)` as a mistake, and it is right to — the claim here is that
	// two SEPARATE calls agree, which is what these two variables say.
	first, second := FingerprintPending(one, threads), FingerprintPending(one, threads)
	if first != second {
		t.Error("the same pending set fingerprinted differently twice")
	}
}

// The undo case, which is the reason a fingerprint exists at all.
func TestFingerprintPendingIgnoresAReturnToTheSameState(t *testing.T) {
	s := []suggest.Pending{{Run: "a1", Kind: suggest.KindInsert, Text: "hello"}}
	before := FingerprintPending(s, nil)
	// A different run for the same content: run is SESSION identity, re-minted
	// on every load, so including it would make every restart look like a change.
	after := FingerprintPending([]suggest.Pending{{Run: "zz", Kind: suggest.KindInsert, Text: "hello"}}, nil)
	if before != after {
		t.Error("a re-minted run changed the fingerprint — every restart would wake the agent")
	}
}

// The thread half must keep working: a reply is still news in edit mode, and
// review mode's Fingerprint keeps its own meaning beside this one.
func TestFingerprintPendingStillMovesWithThreads(t *testing.T) {
	one := []review.Thread{{Key: "cm-1", Entries: []review.Entry{{Author: "court", Text: "hm"}}}}
	two := []review.Thread{{Key: "cm-1", Entries: []review.Entry{
		{Author: "court", Text: "hm"}, {Author: "claude", Text: "on it"}}}}
	if FingerprintPending(nil, one) == FingerprintPending(nil, two) {
		t.Error("an agent reply did not move the fingerprint")
	}
}
