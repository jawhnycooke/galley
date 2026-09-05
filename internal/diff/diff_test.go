package diff

import (
	"strings"
	"testing"
)

// Every rule the spec settled by measuring has a check here, and each one is
// named for the rule rather than for the function, so a rule deleted takes a
// red check with it rather than leaving a green one that reads a proxy.

func TestAHeadingIsOneUnit(t *testing.T) {
	// A heading ends in a full stop and is still one unit. Split as prose it
	// would be two, and a heading is one thing a reader meets.
	got := Sentences("## The rule. And its reason.", KindHeading)
	if len(got) != 1 {
		t.Fatalf("heading split into %d units: %q", len(got), got)
	}
}

func TestATableRowAndACodeLineAreEachTheSentenceOfTheirBlock(t *testing.T) {
	table := "| a | b |\n|---|---|\n| one | two |"
	if got := Sentences(table, KindTable); len(got) != 3 {
		t.Errorf("table split into %d units, want 3 rows: %q", len(got), got)
	}
	code := "```go\nfunc a() {}\nfunc b() {}\n```"
	if got := Sentences(code, KindCode); len(got) != 4 {
		t.Errorf("code split into %d units, want 4 lines: %q", len(got), got)
	}
}

func TestClosingMarksTravelWithTheTerminatorIncludingEmphasis(t *testing.T) {
	// The single largest splitter defect measured. Without the trailing `**`
	// the whole entry stays one unit that nothing can diff legibly.
	got := Sentences("**A rule.** The next sentence follows it.", KindPara)
	if len(got) != 2 {
		t.Fatalf("got %d units, want 2: %q", len(got), got)
	}
	if got[0] != "**A rule.**" {
		t.Errorf("the emphasis did not travel with the terminator: %q", got[0])
	}
	quoted := Sentences(`He said "no." Then he left the room.`, KindPara)
	if len(quoted) != 2 {
		t.Errorf("a closing quote did not travel with the terminator: %q", quoted)
	}
}

func TestCodeSpansLinksCriticMarkupAndEllipsesAreMasked(t *testing.T) {
	cases := []struct {
		name, text string
	}{
		{"a code span", "Call `x.y()` and then read the result. Twice."},
		{"a link destination", "See [the note](docs/a.b.md) for the rest. Twice."},
		{"a CriticMarkup span", "It said {++one. two++} in the file. Twice."},
		{"an ellipsis", "It trailed off... and then resumed. Twice."},
	}
	for _, c := range cases {
		if got := Sentences(c.text, KindPara); len(got) != 2 {
			t.Errorf("%s was not masked: %d units %q", c.name, len(got), got)
		}
	}
}

func TestAnAbbreviationIsNotATerminator(t *testing.T) {
	if got := Sentences("Use a bound, e.g. Ten, and stop there.", KindPara); len(got) != 1 {
		t.Errorf("an abbreviation ended a sentence: %q", got)
	}
	if got := Sentences("The value is 3.14 and it does not move.", KindPara); len(got) != 1 {
		t.Errorf("a decimal ended a sentence: %q", got)
	}
	if got := Sentences("No space after a stop.Like this one.", KindPara); len(got) != 1 {
		t.Errorf("no space after a full stop is not a terminator: %q", got)
	}
}

func TestASentenceNeverCrossesABlock(t *testing.T) {
	src := "One paragraph with no terminator\n\nAnother one"
	us := Units(src)
	var blocks []int
	for _, u := range us {
		if u.Kind != KindBoundary {
			blocks = append(blocks, u.Block)
		}
	}
	if len(blocks) != 2 || blocks[0] == blocks[1] {
		t.Fatalf("two paragraphs did not stay two units in two blocks: %+v", blocks)
	}
	if us[0].Kind != KindBoundary {
		t.Errorf("no boundary sentinel opens the document: %+v", us[0])
	}
}

func TestWhitespaceIsNotAChange(t *testing.T) {
	before := "The rule holds.  Twice over."
	after := "The rule holds. Twice   over."
	if n := Regions(Diff(before, after)); n != 0 {
		t.Errorf("respacing read as %d change(s)", n)
	}
	// A hard wrap moved is the same claim one construct out.
	if n := Regions(Diff("one two three four", "one two\nthree four")); n != 0 {
		t.Errorf("a moved wrap read as %d change(s)", n)
	}
}

func TestAWholeBlockGoneIsOneChange(t *testing.T) {
	before := "Keep this one.\n\nFirst. Second. Third. Fourth.\n\nAnd keep this one."
	after := "Keep this one.\n\nAnd keep this one."
	ops := Diff(before, after)
	if n := Regions(ops); n != 1 {
		t.Fatalf("a four-sentence paragraph deleted read as %d regions, want 1", n)
	}
	var gone *Op
	for _, o := range ops {
		if o.Op == OpDelete && !o.Absorbed {
			gone = o
		}
	}
	if gone == nil || !gone.WholeBlock || gone.Count != 4 {
		t.Fatalf("the region does not speak for the whole block: %+v", gone)
	}
	if !strings.Contains(Render(before, after, ViewInPlace), "4 sentences at once") {
		t.Errorf("the view does not say how much went at once")
	}
}

func TestTwoAdjacentParagraphsDeletedStayTwoChanges(t *testing.T) {
	// The coalescing stops at the second block boundary. Without that stop,
	// every deletion to the end of the document would read as one.
	before := "Keep.\n\nFirst gone. Also gone.\n\nSecond gone. Also this.\n\nKeep."
	after := "Keep.\n\nKeep."
	if n := Regions(Diff(before, after)); n != 2 {
		t.Errorf("two deleted paragraphs read as %d regions, want 2", n)
	}
}

func TestWordDiffInsideASentenceUnlessItYieldsMoreThanThreePieces(t *testing.T) {
	// One word changed inside a long sentence: word-diff inside, and the
	// unchanged words are shown once, unmarked.
	small := Diff(
		"Four constructs in this file are refused with a line number and nothing else.",
		"Seven constructs in this file are refused with a line number and nothing else.")
	var change *Op
	for _, o := range small {
		if o.Op == OpChange {
			change = o
		}
	}
	if change == nil || !change.Inner {
		t.Fatalf("a one-word fix was not word-diffed inside: %+v", change)
	}

	// A rewrite: more than three pieces, so the sentence is replaced whole.
	big := Diff(
		"The rail is a fixed column and every card in it is clamped to the viewport edge.",
		"The rail is a column, tall as the document, and each card in it now sits beside the words it is really about.")
	change = nil
	for _, o := range big {
		if o.Op == OpChange {
			change = o
		}
	}
	if change == nil {
		t.Fatal("a rewrite did not pair as one change")
	}
	if change.Frags <= innerMaxFragments {
		t.Fatalf("this fixture yields %d pieces, which does not exercise the rule", change.Frags)
	}
	if change.Inner {
		t.Errorf("a %d-piece rewrite was word-diffed inside instead of replaced whole", change.Frags)
	}
}

func TestTheThresholdIsPiecesAndNotSimilarity(t *testing.T) {
	// THE RULE ASKS ABOUT PIECES. This pair is highly similar — most of its
	// words survive — and shreds anyway, which is the case a similarity
	// threshold gets wrong in the direction that costs the reader most.
	before := "a b c d e f g h i j k l m n o p"
	after := "a X c d Y f g Z i j W l m n Q p"
	ops := Diff(before, after)
	var change *Op
	for _, o := range ops {
		if o.Op == OpChange {
			change = o
		}
	}
	if change == nil {
		t.Fatal("the pair did not pair")
	}
	if change.Ratio < 0.6 {
		t.Fatalf("this fixture is only %.2f alike, so it does not test the rule", change.Ratio)
	}
	if change.Inner {
		t.Errorf("a %.2f-similar sentence shredding into %d pieces was still word-diffed inside",
			change.Ratio, change.Frags)
	}
}

func TestATableComesBackAsATable(t *testing.T) {
	// The rows are the block's sentences, so putting it back together joins
	// them on the break they were split on. Joined with a space a three-row
	// table reads as one line of pipes.
	before := "| setting | default |\n|---|---|\n| timeout | 30s |"
	after := "| setting | default |\n|---|---|\n| timeout | 45s |"
	h := Render(before, after, ViewInPlace)
	if strings.Count(h, "\n") < 2 {
		t.Errorf("the table came back on one line:\n%s", h)
	}
	if !strings.Contains(h, "gly-diff-atomic") {
		t.Errorf("the table is not drawn as an atomic block:\n%s", h)
	}
}

func TestCodeAndTablesAreNeverWordDiffedInside(t *testing.T) {
	before := "```\nretries := 3\n```"
	after := "```\nretries := 7\n```"
	for _, o := range Diff(before, after) {
		if o.Op == OpChange && o.Inner {
			t.Errorf("a code line was word-diffed inside: %q -> %q", o.Old.Text, o.New.Text)
		}
	}
}

func TestAMovedSentenceIsNeitherAnInsertionNorADeletion(t *testing.T) {
	// Detection through a one-word change, which is what actually happened in
	// the corpus.
	before := "If your file has any of the four constructs, galley refuses it. One. Two.\n\nThree. Four."
	after := "One. Two.\n\nThree. Four. If your file has any of the seven constructs, galley refuses it."
	ops := Diff(before, after)
	var moves int
	for _, o := range ops {
		if o.Moved {
			moves++
			if o.Partner == nil {
				t.Errorf("a move has no other end: %+v", o)
			}
		}
	}
	if moves != 2 {
		t.Fatalf("a relocated sentence was not detected as a move (%d ends marked)", moves)
	}
	// One fact, counted once.
	if n := Regions(ops); n != 1 {
		t.Errorf("a move read as %d regions, want 1", n)
	}
	html := Render(before, after, ViewInPlace)
	if !strings.Contains(html, "moved away") || !strings.Contains(html, "moved here") {
		t.Errorf("the view does not name both ends of the move:\n%s", html)
	}
	// AND IT IS NOT PAINTED AS INSERTED OR DELETED. That is the open decision:
	// the mark is outside the three-mark vocabulary on purpose.
	for _, frag := range []string{`<span class="gly-moved"`} {
		if !strings.Contains(html, frag) {
			t.Errorf("the move is not drawn in its own vocabulary: missing %s", frag)
		}
	}
	// BOTH ENDS ANSWER TO ONE ORDINAL, because the sentence moved once. Two
	// ids here would give the rail two cards for one fact.
	if n := strings.Count(html, `data-gly-region="0"`); n != 2 {
		t.Errorf("a move carries %d region ids, want both ends on region 0:\n%s", n, html)
	}
	if strings.Contains(html, `data-gly-region="1"`) {
		t.Errorf("the far end of the move claimed a region of its own:\n%s", html)
	}
}

func TestTheDiffIsTheSameInBothDirections(t *testing.T) {
	before := "One sentence here. Another one there.\n\nAnd a second paragraph."
	after := "One sentence here. A different one there.\n\nAnd a second paragraph."
	fwd, rev := Regions(Diff(before, after)), Regions(Diff(after, before))
	if fwd != rev {
		t.Errorf("the diff is not symmetric in regions: %d forward, %d back", fwd, rev)
	}
	if h := Render(before, after, ViewReverse); !strings.Contains(h, "gly-ins") {
		t.Errorf("the reverse view does not read as the earlier text:\n%s", h)
	}
}

func TestCleanCarriesNoMarkup(t *testing.T) {
	before := "Kept. Struck out.\n\nGone entirely."
	after := "Kept. Replaced by this.\n\nAnd a new paragraph."
	h := Render(before, after, ViewClean)
	for _, forbidden := range []string{"gly-ins", "gly-del", "gly-chg", "gly-moved", "gly-diff-gone"} {
		if strings.Contains(h, forbidden) {
			t.Errorf("the clean view carries %s:\n%s", forbidden, h)
		}
	}
	if !strings.Contains(h, "Replaced by this.") || strings.Contains(h, "Struck out.") {
		t.Errorf("the clean view is not the new document:\n%s", h)
	}
}

func TestSideBySideShowsBothVersionsWhole(t *testing.T) {
	before := "One. Two.\n\nThree."
	after := "One. Two changed.\n\nThree."
	h := Render(before, after, ViewSideBySide)
	if !strings.Contains(h, "gly-lit-old") || !strings.Contains(h, "gly-lit-new") {
		t.Errorf("side by side does not light the changed sentence on both sides:\n%s", h)
	}
	if !strings.Contains(h, "Two.") || !strings.Contains(h, "Two changed.") {
		t.Errorf("side by side dropped one of the two readings:\n%s", h)
	}
	// AND EACH VERSION READS AS ITSELF, which is the whole claim of this view:
	// a heading is a heading and a table is a table, not a paragraph of pipes.
	structured := Render("## A head\n\n| a | b |\n|---|---|\n| one | two |",
		"## A head\n\n| a | b |\n|---|---|\n| one | three |", ViewSideBySide)
	if !strings.Contains(structured, "gly-diff-h") {
		t.Errorf("side by side drew a heading as prose:\n%s", structured)
	}
	if !strings.Contains(structured, "gly-diff-atomic") {
		t.Errorf("side by side drew a table as prose:\n%s", structured)
	}
	if strings.Contains(structured, "<p>## A head</p>") {
		t.Errorf("side by side left the heading's own markup in the text:\n%s", structured)
	}
}

func TestDocumentTextIsEscapedBeforeItIsRendered(t *testing.T) {
	before := "A safe line."
	after := "A line with <script>alert(1)</script> in it."
	for _, v := range Views {
		h := Render(before, after, v)
		if strings.Contains(h, "<script>") {
			t.Errorf("view %s did not escape the document's own text:\n%s", v, h)
		}
	}
}

func TestATwoWordReplacementStillReadsAsTwoWords(t *testing.T) {
	// alphabeta, keptleft, nothingnobody — the same defect the marks in the
	// prose were measured with. A deletion and its replacement at one position
	// must not be drawn with 0px between them.
	h := Render("The alpha value holds.", "The beta value holds.", ViewInPlace)
	if strings.Contains(h, "</span><span") {
		t.Errorf("a deletion and its replacement are drawn with nothing between them:\n%s", h)
	}
}

// A BLOCK COALESCED FROM ITS BOUNDARY MUST NOT COUNT THE BOUNDARY'S BORROWED
// UNIT TWICE. When the deleted block ends the document there is no trailing
// boundary for the run to swallow, so the run is headed by the boundary — and
// the head then hands its place to the first real unit under it. That handover
// happens before Members is collected, so the head passes the "not a boundary"
// filter under its borrowed identity and the first sentence is collected twice,
// once as the head and once as the op it borrowed from. memberText joins
// Members, so the reader is shown the deleted paragraph TWICE inside one
// region. Mid-document blocks are safe — the matcher aligns the leading
// boundary and the run is headed by a real sentence — which is why every
// existing check is green.
func TestABlockGoneAtTheEndIsPaintedOnce(t *testing.T) {
	before := "# Draft\n\nKept paragraph.\n\nA section the reviewer will delete.\n"
	after := "# Draft\n\nKept paragraph.\n"
	ops := Diff(before, after)
	if n := Regions(ops); n != 1 {
		t.Fatalf("one deleted paragraph read as %d regions, want 1", n)
	}
	var gone *Op
	for _, o := range ops {
		if o.Op == OpDelete && !o.Absorbed {
			gone = o
		}
	}
	if gone == nil {
		t.Fatal("no unabsorbed deletion")
	}
	if n := len(gone.Members); n != 1 {
		var texts []string
		for _, m := range gone.Members {
			texts = append(texts, m.Old.Text)
		}
		t.Errorf("the region carries %d members for a one-sentence block: %q", n, texts)
	}
	for _, v := range []View{ViewInPlace, ViewReverse, ViewSideBySide} {
		if n := strings.Count(Render(before, after, v), "A section the reviewer will delete."); n != 1 {
			t.Errorf("%s paints the deleted paragraph %d times, want 1", v, n)
		}
	}
	// The same shape, added rather than removed.
	for _, v := range []View{ViewInPlace, ViewClean} {
		if n := strings.Count(Render(after, before, v), "A section the reviewer will delete."); n != 1 {
			t.Errorf("%s paints the added paragraph %d times, want 1", v, n)
		}
	}
}
