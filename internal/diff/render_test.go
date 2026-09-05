package diff

import (
	"strings"
	"testing"
)

// THE SPACING IN A WORD DIFF IS THE SOURCE'S, NOT A GUESS.
//
// The tokenizer drops whitespace so that respacing is not a change; the
// renderer used to put it back as one space between every token, with a regex
// stripping the space before a closing punctuation mark. That rule cannot tell
// a sentence's full stop from the dot in an identifier, and it has nothing at
// all to say about a hyphen — so a diff of ordinary prose wrote words nobody
// typed. Found by reading the in-place view in a browser on phase 2's own
// artifact document, which is where this surface is finally load-bearing.
//
// Red, against the rejoin-with-one-space renderer:
//
//	It is a per - host number <ins>, read from client. retry_budget,</ins> and …
func TestAWordDiffKeepsTheSourcesOwnSpacing(t *testing.T) {
	const (
		a = "It is a per-host number and the default is three."
		b = "It is a per-host number, read from client.retry_budget, and the default is three."
	)
	got := Render(a, b, ViewInPlace)
	for _, want := range []string{"per-host", "client.retry_budget,"} {
		if !strings.Contains(got, want) {
			t.Errorf("the diff broke %q apart:\n%s", want, got)
		}
	}
	for _, never := range []string{"per - host", "client. retry", "number <"} {
		if strings.Contains(got, never) {
			t.Errorf("the diff wrote %q, which nobody typed:\n%s", never, got)
		}
	}
	// AND THE ONE SPACE THAT IS THE RENDERER'S STAYS. Two words at one position
	// must still read as two words — the space between a deletion and its
	// replacement is drawn, not diffed.
	pair := Render("The retryBudget value controls it.", "The retry budget controls it.", ViewInPlace)
	if !strings.Contains(pair, "</span> <span") {
		t.Errorf("a replacement is drawn against what it replaced with no space:\n%s", pair)
	}
}

// splitColumns cuts a side-by-side render at the head of the after column, so a
// test can ask WHICH SIDE a fragment landed on. The marker is the same literal
// Render writes, and it is written out here rather than derived: a helper that
// re-derives the markup it is checking agrees with a broken renderer.
func splitColumns(t *testing.T, h string) (before, after string) {
	t.Helper()
	const marker = `<div class="gly-sbs-col"><div class="gly-sbs-head">after</div>`
	i := strings.Index(h, marker)
	if i < 0 {
		t.Fatalf("the side-by-side render has no after column:\n%s", h)
	}
	return h[:i], h[i:]
}

// TestSideBySideMarksItsRegions is the fix for a CLICK THAT MOVED THE RAIL.
//
// The reading rail places every change card beside its mark by looking up
// `[data-gly-region="k"]` in the rendered diff. renderFlow has stamped that
// attribute since the ids were introduced; renderSideBySide stamped nothing at
// all — so switching the view from `changes` to `side by side` failed every
// lookup at once, and each card fell back to stacking from the top of the rail
// and visibly moved. CLAUDE.md: A CLICK MOVES NOTHING EXCEPT THE THING THAT WAS
// CLICKED. Choosing a reading is the click; the cards are not the thing.
//
// Red, before the stamp: `region 0 appears 0 times in the side-by-side render,
// want exactly 1` — three times over, once per region.
//
// EXACTLY ONE, NOT AT LEAST ONE. The browser looks a region up with
// querySelector, which answers with the FIRST match in document order; two
// elements carrying one id would silently hand every card the before column's
// copy of the change, which is the one reading the card is not about.
func TestSideBySideMarksItsRegions(t *testing.T) {
	const (
		before = "Kept whole. This one is rewritten.\n\nThis paragraph goes away entirely."
		after  = "Kept whole. This one now reads differently.\n\nAnd this one is brand new."
	)
	ops := Diff(before, after)
	n := Regions(ops)
	if n < 3 {
		t.Fatalf("the fixture stopped exercising change, delete and insert: %d regions", n)
	}
	h := Render(before, after, ViewSideBySide)
	for k := 0; k < n; k++ {
		if got := strings.Count(h, `data-gly-region="`+itoa(k)+`"`); got != 1 {
			t.Errorf("region %d appears %d times in the side-by-side render, want exactly 1:\n%s", k, got, h)
		}
	}

	// THE AFTER COLUMN IS THE CARD'S OWN SIDE. A card says what the agent
	// wrote, so a change and an insertion are stamped on the right.
	l, r := splitColumns(t, h)
	if !strings.Contains(r, `<span class="gly-lit-new" data-gly-region=`) {
		t.Errorf("a change the agent wrote is not addressable in the after column:\n%s", r)
	}
	// A DELETION HAS NO AFTER TEXT, so its only element is on the left and that
	// is where its id has to live — a card pointing at nothing is the defect
	// this test exists for, not a lesser version of it.
	if !strings.Contains(l, `<span class="gly-lit-old" data-gly-region=`) {
		t.Errorf("a deletion is unaddressable in either column:\n%s", l)
	}
}

// TestEveryRegionIsAddressableInEveryView is the general form, run over the
// corpus's real revisions rather than a written fixture: a card carries one
// ordinal and must find its mark whichever reading the reviewer is in.
//
// The clean view is excluded BY DESIGN and not by oversight — it carries no
// markup at all, so it has no marks to find, and History does not draw the rail
// against it.
func TestEveryRegionIsAddressableInEveryView(t *testing.T) {
	for _, name := range []string{"case-rewrite", "case-oneword", "case-deleted", "case-move", "worst"} {
		before, after := readCase(t, name)
		n := Regions(Diff(before, after))
		for _, v := range []View{ViewInPlace, ViewReverse, ViewSideBySide} {
			h := Render(before, after, v)
			for k := 0; k < n; k++ {
				got := strings.Count(h, `data-gly-region="`+itoa(k)+`"`)
				if got == 0 {
					t.Errorf("%s in %s: region %d has no mark, so its card has nothing to sit beside", name, v, k)
				}
				// The flow views stamp BOTH ends of a move with the one
				// ordinal the move earns, which is deliberate and asserted
				// elsewhere; two columns are a single lookup, so side by side
				// may not.
				if v == ViewSideBySide && got != 1 {
					t.Errorf("%s in %s: region %d appears %d times, and querySelector answers with the first", name, v, k, got)
				}
			}
		}
	}
}

// TestABreakIsFindableTooEvenThoughItLightsNothing is the case the first cut of
// the stamp left out, and it is here because the count on the wire promised a
// card for it.
//
// Splitting a paragraph in two — or merging two into one — changes not a single
// sentence, so neither column has a word to paint. The op is still a region:
// Regions counts it, the rail draws a card for it, and before the anchor was
// added that card was the one card still falling back to the top of the rail
// after every other one had been fixed. Found by sweeping twenty thousand
// random pairs for a region with no mark; a break was the only shape that came
// back, which is the reason this pins the shape rather than keeping the sweep.
func TestABreakIsFindableTooEvenThoughItLightsNothing(t *testing.T) {
	for _, c := range []struct{ name, before, after string }{
		{"merged", "One sentence. Two here.\n\nThree there.", "One sentence. Two here. Three there."},
		{"split", "One sentence. Two here. Three there.", "One sentence. Two here.\n\nThree there."},
	} {
		t.Run(c.name, func(t *testing.T) {
			if n := Regions(Diff(c.before, c.after)); n != 1 {
				t.Fatalf("the fixture stopped being one lone break: %d regions", n)
			}
			h := Render(c.before, c.after, ViewSideBySide)
			if got := strings.Count(h, `data-gly-region="0"`); got != 1 {
				t.Fatalf("a break the reader gets a card for is stamped %d times:\n%s", got, h)
			}
			// AND IT IS NOT PAINTED AS A CHANGED SENTENCE. There are no words
			// here, so an empty box in the change colour would be a mark for
			// text that does not exist.
			if strings.Contains(h, `class="gly-lit-old" data-gly-region="0"`) ||
				strings.Contains(h, `class="gly-lit-new" data-gly-region="0"`) {
				t.Errorf("a break is lit as though it were a sentence:\n%s", h)
			}
		})
	}
}
