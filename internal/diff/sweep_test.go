package diff

import (
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
	"testing"
)

// sweep_test.go RE-RUNS THE SPIKE'S CORPUS MEASUREMENT AGAINST THIS PORT.
//
// A port that cannot reproduce the measurement is not the same algorithm. The
// spike settled two things by measuring — that sentence granularity is worth
// having, and that the rule for going inside a sentence is PIECES rather than
// SIMILARITY — and both are statements about a distribution over real
// revisions. Nothing in a unit test can stand in for that: a hand-written pair
// exercises the code and says nothing about the numbers the design rests on.
//
// It is skipped without a corpus, because a check that needs somebody else's
// git history is not something `just verify` can run in CI. `just sweep` is the
// way in:
//
//	GALLEY_CORPUS=/path/to/a/repo/with/markdown/history go test ./internal/diff -run Sweep -v
//
// THE POPULATION IS STATED HERE RATHER THAN ASSUMED, because the spike's own
// aggregation script is not preserved — and neither, it turns out, is anything
// else of the spike: sdiff.py and sweep.py are not in this worktree and were
// never tracked, so nothing about them is reproducible by the next reader. A
// REVISED PROSE PARAGRAPH is: a block of kind para, listitem or quote, present
// in both revisions of a file, paired to a block of the same kind by the same
// monotonic look-ahead rule the sentence pairing uses, whose two texts are not
// equal after Norm. Word-level is the fragment count of a naive word diff of
// the two whole texts; sentence-level is Regions of this package's own diff of
// the same pair.
//
// AND THE POPULATION IS A CHOICE THE MEASUREMENTS DO NOT PIN DOWN. The two
// figures the spec states about INDIVIDUAL paragraphs come out exactly here,
// and it is tempting to read that as confirmation of this definition; it is
// not. Measured against the same corpus, 2026-08-16:
//
//	para                     237 paragraphs  580 -> 332   worst set 7 -> 3   worst 8 -> 2
//	para+listitem            377             1055 -> 573  worst set 8 -> 3   worst 26 -> 7
//	para+listitem+quote      387             1085 -> 593  worst set 9 -> 3   worst 26 -> 7
//	  (this one)
//	+heading                 412             1123 -> 618  worst set 9 -> 3   worst 26 -> 7
//
// So the 1,486-word CLAUDE.md worst case needs only listitem, and adding
// heading reproduces BOTH per-paragraph figures over a 6% larger population.
// The two figures narrow the space of populations; they do not pick a point in
// it. Nothing tried reaches the spec's 361 paragraphs or its 1,001 -> 552, so
// that divergence is UNEXPLAINED rather than explained — and what this file
// certifies is that the ALGORITHM is the spike's, which the difflib equivalence
// and corpus_test.go's five pinned cases are the durable evidence for.

type paraPair struct {
	path       string
	kind       Kind
	word, sent int
	words      int
}

func TestSweepTheCorpus(t *testing.T) {
	repo := os.Getenv("GALLEY_CORPUS")
	if repo == "" {
		t.Skip("set GALLEY_CORPUS to a git repository with markdown history")
	}
	git := func(args ...string) string {
		out, err := exec.Command("git", append([]string{"-C", repo}, args...)...).Output()
		if err != nil {
			return ""
		}
		return string(out)
	}
	docs := strings.Fields(git("ls-files", "*.md"))
	if len(docs) == 0 {
		t.Fatalf("no tracked markdown in %s", repo)
	}
	var pairs []paraPair
	revisions := 0
	for _, path := range docs {
		revs := strings.Fields(git("log", "--format=%H", "--reverse", "--", path))
		for i := 0; i+1 < len(revs); i++ {
			ta := git("show", revs[i]+":"+path)
			tb := git("show", revs[i+1]+":"+path)
			if ta == "" || tb == "" || ta == tb {
				continue
			}
			revisions++
			A, B := Blocks(ta), Blocks(tb)
			for _, p := range pairBlocks(A, B) {
				ka, kb := A[p[0]].Kind, B[p[1]].Kind
				if ka != kb || !prose(ka) {
					continue
				}
				oldT, newT := A[p[0]].Text, B[p[1]].Text
				pairs = append(pairs, paraPair{
					path: path, kind: ka,
					word:  WordFragments(oldT, newT),
					sent:  Regions(Diff(oldT, newT)),
					words: len(Words(oldT)),
				})
			}
		}
	}
	if len(pairs) == 0 {
		t.Fatalf("swept %d revisions and found no revised prose paragraph", revisions)
	}

	word, sent := sum(pairs, func(p paraPair) int { return p.word }), sum(pairs, func(p paraPair) int { return p.sent })
	var worst []paraPair
	for _, p := range pairs {
		if p.word >= 6 {
			worst = append(worst, p)
		}
	}
	t.Logf("revisions=%d revised-prose-paragraphs=%d", revisions, len(pairs))
	t.Logf("word-level fragments=%d (median %d)  sentence-level regions=%d (median %d)  %.2fx fewer",
		word, median(pairs, func(p paraPair) int { return p.word }),
		sent, median(pairs, func(p paraPair) int { return p.sent }),
		float64(word)/float64(sent))
	t.Logf("the worst %d (word-level >= 6 pieces): median %d -> %d",
		len(worst), median(worst, func(p paraPair) int { return p.word }),
		median(worst, func(p paraPair) int { return p.sent }))
	longest := pairs[0]
	for _, p := range pairs {
		if p.words > longest.words {
			longest = p
		}
	}
	t.Logf("worst case: a %d-word %s in %s goes %d -> %d",
		longest.words, longest.kind, longest.path, longest.word, longest.sent)

	// THE MEASUREMENT MUST HOLD ITS OWN SHAPE, or the sweep is a print
	// statement. These are the two claims the granularity decision rests on and
	// they are asserted, not merely reported: sentence-level paints strictly
	// fewer fragments than word-level over the corpus as a whole, and on the
	// paragraphs word-level shreds worst it is better by more than half.
	if sent >= word {
		t.Errorf("sentence-level (%d) is not fewer than word-level (%d)", sent, word)
	}
	if len(worst) > 0 {
		mw, ms := median(worst, func(p paraPair) int { return p.word }), median(worst, func(p paraPair) int { return p.sent })
		if ms*2 > mw {
			t.Errorf("on the worst %d paragraphs the median went %d -> %d, which is not the collapse the design rests on",
				len(worst), mw, ms)
		}
	}
	if out := os.Getenv("GALLEY_SWEEP_OUT"); out != "" {
		var b strings.Builder
		fmt.Fprintf(&b, "path\tkind\twords\tword-level\tsentence-level\n")
		for _, p := range pairs {
			fmt.Fprintf(&b, "%s\t%s\t%d\t%d\t%d\n", p.path, p.kind, p.words, p.word, p.sent)
		}
		if err := os.WriteFile(out, []byte(b.String()), 0o644); err != nil {
			t.Fatalf("write %s: %v", out, err)
		}
	}
}

func prose(k Kind) bool { return k == KindPara || k == KindListItem || k == KindQuote }

// pairBlocks aligns two documents' BLOCKS the same way pair aligns sentences —
// difflib over normalised text, then a monotonic look-ahead inside each replace
// run. It is the sweep's own, not the product's: the diff itself never needs to
// name which paragraph became which, only what a reader meets.
func pairBlocks(a, b []Block) [][2]int {
	ka := make([]string, len(a))
	for i, x := range a {
		ka[i] = Norm(x.Text)
	}
	kb := make([]string, len(b))
	for i, x := range b {
		kb[i] = Norm(x.Text)
	}
	var out [][2]int
	for _, oc := range Opcodes(ka, kb) {
		if oc.Tag != TagReplace {
			continue
		}
		i, j := oc.I1, oc.J1
		for i < oc.I2 && j < oc.J2 {
			r := Ratio(a[i].Text, b[j].Text)
			altA, altB := 0.0, 0.0
			if i+1 < oc.I2 {
				altA = Ratio(a[i+1].Text, b[j].Text)
			}
			if j+1 < oc.J2 {
				altB = Ratio(a[i].Text, b[j+1].Text)
			}
			switch {
			case r >= pairMin && r >= altA && r >= altB:
				out = append(out, [2]int{i, j})
				i, j = i+1, j+1
			case altA > r && altA >= pairMin:
				i++
			case altB > r && altB >= pairMin:
				j++
			default:
				i, j = i+1, j+1
			}
		}
	}
	return out
}

func sum(ps []paraPair, f func(paraPair) int) int {
	n := 0
	for _, p := range ps {
		n += f(p)
	}
	return n
}

func median(ps []paraPair, f func(paraPair) int) int {
	if len(ps) == 0 {
		return 0
	}
	v := make([]int, len(ps))
	for i, p := range ps {
		v[i] = f(p)
	}
	sort.Ints(v)
	return v[len(v)/2]
}
