package serve

import (
	"strings"
	"testing"
)

const beforeDoc = "# Title\n\nAlpha one here.\n\nBeta two here.\n\nGamma three here.\n"

// TestRevertingARemovalPutsTheBlockBackWhereItWas is the case Court asked for:
// undo the paragraph I deleted, and keep the edits I made after it. ⌘Z cannot
// do that at any price — it is sequential, and this is targeted.
func TestRevertingARemovalPutsTheBlockBackWhereItWas(t *testing.T) {
	after := "# Title\n\nAlpha one here.\n\nGamma three, reworded.\n"
	got, err := revertChange(beforeDoc, after, ReviewerChange{Kind: "removed", Before: "Beta two here."})
	if err != nil {
		t.Fatalf("refused: %v", err)
	}
	want := "# Title\n\nAlpha one here.\n\nBeta two here.\n\nGamma three, reworded.\n"
	if got != want {
		t.Errorf("the block came back in the wrong place.\nwant:\n%q\ngot:\n%q", want, got)
	}
}

// TestRevertingARemovalAtTheTopOfTheDocument — there is no block above it to
// find the place through, which is the one case the search cannot answer.
func TestRevertingARemovalAtTheTop(t *testing.T) {
	after := "Alpha one here.\n\nBeta two here.\n"
	got, err := revertChange(beforeDoc, after, ReviewerChange{Kind: "removed", Before: "# Title"})
	if err != nil {
		t.Fatalf("refused: %v", err)
	}
	if !strings.HasPrefix(got, "# Title\n\nAlpha one here.") {
		t.Errorf("the first block did not come back first:\n%q", got)
	}
}

// TestRevertingAnAddition takes out a block the reviewer wrote.
func TestRevertingAnAddition(t *testing.T) {
	after := beforeDoc[:len(beforeDoc)-1] + "\n\nDelta four, new.\n"
	got, err := revertChange(beforeDoc, after, ReviewerChange{Kind: "added", After: "Delta four, new."})
	if err != nil {
		t.Fatalf("refused: %v", err)
	}
	if strings.Contains(got, "Delta four") {
		t.Errorf("the added block survived its own revert:\n%q", got)
	}
	if !strings.Contains(got, "Beta two here.") {
		t.Errorf("reverting an addition took something else with it:\n%q", got)
	}
}

// TestRevertingAChangeRestoresTheOldWords.
func TestRevertingAChangeRestoresTheOldWords(t *testing.T) {
	after := "# Title\n\nAlpha one here.\n\nBeta two here.\n\nGamma three, reworded.\n"
	got, err := revertChange(beforeDoc, after,
		ReviewerChange{Kind: "changed", Before: "Gamma three here.", After: "Gamma three, reworded."})
	if err != nil {
		t.Fatalf("refused: %v", err)
	}
	if got != beforeDoc {
		t.Errorf("reverting the only change did not restore the document.\nwant:\n%q\ngot:\n%q", beforeDoc, got)
	}
}

// TestAnAmbiguousRevertIsREFUSED, and this is the check that matters most.
//
// A revert that lands the words in a plausible-but-wrong place is worse than a
// button that says no: the reviewer would have to notice, and the whole point
// of the verb is that they should not have to hold the document in their head.
func TestAnAmbiguousRevertIsRefused(t *testing.T) {
	before := "# T\n\nSame line.\n\nMiddle.\n\nSame line.\n"
	after := "# T\n\nSame line.\n\nMiddle.\n\nSame line.\n\nSame line.\n"
	if _, err := revertChange(before, after, ReviewerChange{Kind: "added", After: "Same line."}); err == nil {
		t.Error("an addition matching three blocks was reverted anyway — one of them at random")
	}
	if _, err := revertChange(before, after,
		ReviewerChange{Kind: "changed", Before: "Middle.", After: "Same line."}); err == nil {
		t.Error("a change whose text appears three times was reverted anyway")
	}
}

// TestARemovalThatIsNotAWholeBlockIsRefused — half a sentence has no block to
// put back, and guessing where it went is the failure this refuses.
func TestARemovalThatIsNotAWholeBlockIsRefused(t *testing.T) {
	after := "# Title\n\nAlpha here.\n\nBeta two here.\n\nGamma three here.\n"
	if _, err := revertChange(beforeDoc, after, ReviewerChange{Kind: "removed", Before: "one"}); err == nil {
		t.Error("a partial removal was reverted, which means it was put back somewhere guessed")
	}
}

// TestRevertingKeepsEveryOtherEdit is the whole difference from undo, asserted
// rather than implied: two edits, revert the first, the second survives.
func TestRevertingKeepsEveryOtherEdit(t *testing.T) {
	after := "# Title\n\nAlpha one here.\n\nGamma three, reworded.\n"
	got, err := revertChange(beforeDoc, after, ReviewerChange{Kind: "removed", Before: "Beta two here."})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "Gamma three, reworded.") {
		t.Errorf("reverting one edit undid another — that is what undo does, and the point of this is that it does not:\n%q", got)
	}
}
