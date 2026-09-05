// Package diff computes what changed between two versions of a document.
//
// A DIFF IS COMPUTED AND NEVER STORED. A stored diff is a second copy of a fact
// that can disagree with the documents it came from, so this package is a pure
// function of two clean markdown documents: the same pair always yields the
// same answer, in either direction, and there is nothing on disk for it to fall
// out of step with.
//
// The granularity is the SENTENCE, and that is a measurement rather than a
// taste. Word-level is precise and unreadable on a rewrite; paragraph-level is
// readable and blunt on a typo. Across 174 real revisions of this repository's
// own markdown the two differ by 1.8x in fragments painted, and on the
// paragraphs word-level shreds worst the median falls from 9 pieces to 3. See
// docs/superpowers/specs/2026-08-16-rounds-and-versions.md and sweep_test.go,
// which re-runs that measurement.
//
// THE RULE FOR WHEN TO GO INSIDE A SENTENCE IS PIECES, NOT SIMILARITY. Word-
// diff within a changed sentence unless doing so yields more than three
// fragments; past that, replace the sentence whole. The similarity threshold
// that was proposed first does not work at any value: mean fragment count by
// similarity bucket is non-monotonic, because similarity confounds extent with
// length and length is the larger term. Three is a judgement on a smooth
// distribution; asking about pieces instead of similarity is not.
package diff

// Unit is one diffable thing: a sentence, a table row, a code line, a heading —
// or a BOUNDARY, the sentinel that sits between two blocks.
//
// The boundary is what stops a sentence from one paragraph aligning against a
// sentence in another, and it is also what makes a whole block appearing or
// disappearing legible as such rather than as a run of unrelated sentences.
type Unit struct {
	Kind Kind
	// BKind is the kind of the block a boundary opens. Empty on a real unit.
	BKind Kind
	// Block is the index of the block this unit belongs to, in its own document.
	Block int
	Text  string
}

// Units flattens a document to the sequence the matcher aligns.
func Units(src string) []*Unit {
	var out []*Unit
	for bi, b := range Blocks(src) {
		out = append(out, &Unit{Kind: KindBoundary, BKind: b.Kind, Block: bi, Text: "\x00" + string(b.Kind)})
		for _, s := range Sentences(b.Text, b.Kind) {
			out = append(out, &Unit{Kind: b.Kind, Block: bi, Text: s})
		}
	}
	return out
}

// Operation names what happened to one unit.
type Operation string

const (
	OpEqual  Operation = "equal"
	OpChange Operation = "change"
	OpDelete Operation = "delete"
	OpInsert Operation = "insert"
)

// Op is ONE CHANGE REGION AS A READER MEETS IT — not one edit as a matcher
// found it. The distinction is the whole of the coalescing below: four
// sentences struck out of one paragraph is one thing that happened, and
// reporting it as four is the complaint sentence granularity exists to answer,
// one construct up.
type Op struct {
	Op       Operation
	Old, New *Unit

	// Ratio and Frags are set on a change: how alike the two sentences are, and
	// how many fragments a word diff inside them would paint.
	Ratio float64
	Frags int
	// Inner is the decision this package exists to make — word-diff inside this
	// sentence, or replace it whole.
	Inner bool

	// Moved marks a relocated sentence and Partner is the other end of it.
	// A MOVE IS NEITHER AN INSERTION NOR A DELETION, and how it should be
	// rendered is an open decision — see render.go.
	Moved     bool
	Partner   *Op
	MoveRatio float64

	// Absorbed marks an op that a neighbouring op has taken over: it is part of
	// a coalesced region and must not be counted or painted on its own.
	Absorbed bool
	// WholeBlock is set on the op that speaks for a whole block appearing or
	// disappearing; Count is how many sentences it carries, Members are the
	// non-boundary ops it absorbed, and KindHint is the block's kind when this
	// op's own unit was the boundary.
	WholeBlock bool
	Count      int
	Members    []*Op
	KindHint   Kind
}

const (
	// pairMin is where two sentences stop being a rewrite of each other and
	// start being unrelated text that happens to sit in the same place.
	pairMin = 0.35
	// moveMin is how alike an unpaired deletion and an unpaired insertion must
	// be to be one relocated sentence. Measured: it finds a real relocation
	// through a one-word change.
	moveMin = 0.80
	// innerMaxFragments is the threshold rule. See the package comment.
	innerMaxFragments = 3
)

// Diff reports what changed between two clean documents.
func Diff(before, after string) []*Op {
	a, b := Units(before), Units(after)
	ka := make([]string, len(a))
	for i, u := range a {
		ka[i] = Norm(u.Text)
	}
	kb := make([]string, len(b))
	for i, u := range b {
		kb[i] = Norm(u.Text)
	}
	var ops []*Op
	for _, oc := range Opcodes(ka, kb) {
		if oc.Tag == TagEqual {
			for k := 0; k < oc.I2-oc.I1; k++ {
				ops = append(ops, &Op{Op: OpEqual, Old: a[oc.I1+k], New: b[oc.J1+k]})
			}
			continue
		}
		ops = append(ops, pair(a[oc.I1:oc.I2], b[oc.J1:oc.J2])...)
	}
	findMoves(ops)
	for _, o := range ops {
		if o.Op != OpChange {
			continue
		}
		o.Ratio = Ratio(o.Old.Text, o.New.Text)
		o.Frags = changedFragments(o.Old.Text, o.New.Text)
		o.Inner = o.Frags > 0 && o.Frags <= innerMaxFragments && !o.Old.Kind.Atomic()
		if o.Frags == 0 {
			// WHITESPACE IS NOT A CHANGE. Norm already agreed these two units
			// were different, so the only way a word diff finds nothing is that
			// the difference was spacing.
			o.Op = OpEqual
		}
	}
	coalesceBlocks(ops)
	return ops
}

// changedFragments counts the non-equal opcodes a word diff of two texts
// produces — the number the threshold rule is stated in.
func changedFragments(a, b string) int {
	n := 0
	for _, oc := range Opcodes(Words(a), Words(b)) {
		if oc.Tag != TagEqual {
			n++
		}
	}
	return n
}

// WordFragments is changedFragments under the name the spec uses for it: how
// many separate change runs a naive WORD-level diff of the same text produces.
// Exported because the sweep measures the two granularities against each other.
func WordFragments(a, b string) int { return changedFragments(a, b) }

// InnerOps is the word-level opcode list inside one sentence, for a renderer
// that has decided to go inside it.
func InnerOps(a, b string) []Opcode { return Opcodes(Words(a), Words(b)) }

// pair aligns sentences inside one replace run, monotonically, by similarity.
//
// It looks ONE AHEAD on both sides, which is what lets a sentence inserted in
// the middle of a rewritten paragraph be an insertion rather than dragging
// every sentence after it into a spurious pairing.
func pair(olds, news []*Unit) []*Op {
	var out []*Op
	i, j := 0, 0
	for i < len(olds) && j < len(news) {
		a, b := olds[i], news[j]
		if a.Kind == KindBoundary || b.Kind == KindBoundary {
			switch {
			case a.Kind == KindBoundary && b.Kind == KindBoundary:
				out = append(out, &Op{Op: OpEqual, Old: a, New: b})
				i, j = i+1, j+1
			case a.Kind == KindBoundary:
				out = append(out, &Op{Op: OpDelete, Old: a})
				i++
			default:
				out = append(out, &Op{Op: OpInsert, New: b})
				j++
			}
			continue
		}
		r := Ratio(a.Text, b.Text)
		altA, altB := 0.0, 0.0
		if i+1 < len(olds) && olds[i+1].Kind != KindBoundary {
			altA = Ratio(olds[i+1].Text, b.Text)
		}
		if j+1 < len(news) && news[j+1].Kind != KindBoundary {
			altB = Ratio(a.Text, news[j+1].Text)
		}
		switch {
		case r >= pairMin && r >= altA && r >= altB:
			out = append(out, &Op{Op: OpChange, Old: a, New: b})
			i, j = i+1, j+1
		case altA > r && altA >= pairMin:
			out = append(out, &Op{Op: OpDelete, Old: a})
			i++
		case altB > r && altB >= pairMin:
			out = append(out, &Op{Op: OpInsert, New: b})
			j++
		default:
			out = append(out, &Op{Op: OpDelete, Old: a})
			out = append(out, &Op{Op: OpInsert, New: b})
			i, j = i+1, j+1
		}
	}
	for _, a := range olds[i:] {
		out = append(out, &Op{Op: OpDelete, Old: a})
	}
	for _, b := range news[j:] {
		out = append(out, &Op{Op: OpInsert, New: b})
	}
	return out
}

// findMoves pairs an unpaired deletion against an unpaired insertion that is
// very nearly the same text.
//
// A MOVED SENTENCE IS NEITHER AN INSERTION NOR A DELETION. Detection is
// reliable — it finds a real relocation through a one-word change — but
// galley's mark vocabulary has only insert, delete and highlight, so how a move
// should READ is an open decision and is flagged as one. See render.go.
func findMoves(ops []*Op) {
	var dels, inss []*Op
	for _, o := range ops {
		switch {
		case o.Op == OpDelete && o.Old.Kind != KindBoundary:
			dels = append(dels, o)
		case o.Op == OpInsert && o.New.Kind != KindBoundary:
			inss = append(inss, o)
		}
	}
	for _, d := range dels {
		var best *Op
		br := 0.0
		for _, n := range inss {
			if n.Moved {
				continue
			}
			if r := Ratio(d.Old.Text, n.New.Text); r > br {
				best, br = n, r
			}
		}
		if best != nil && br >= moveMin {
			d.Moved, best.Moved = true, true
			d.Partner, best.Partner = best, d
			d.MoveRatio, best.MoveRatio = br, br
		}
	}
}

// coalesceBlocks makes A WHOLE BLOCK GONE ONE CHANGE.
//
// Without it a real single-paragraph deletion read as four — one region per
// sentence — which is the same defect as word-level shredding, one construct
// out. The run it absorbs stops at the second block boundary it meets, so two
// adjacent deleted paragraphs stay two regions.
func coalesceBlocks(ops []*Op) {
	i := 0
	for i < len(ops) {
		o := ops[i]
		if (o.Op != OpDelete && o.Op != OpInsert) || o.Moved {
			i++
			continue
		}
		side := func(x *Op) *Unit { return x.Old }
		if o.Op == OpInsert {
			side = func(x *Op) *Unit { return x.New }
		}
		sents := 1
		sawBlock := false
		if side(o).Kind == KindBoundary {
			sents, sawBlock = 0, true
		}
		j := i + 1
		for j < len(ops) && ops[j].Op == o.Op && !ops[j].Moved {
			u := side(ops[j])
			if u.Kind == KindBoundary {
				if sawBlock && sents > 0 {
					break // a second block starts here
				}
				sawBlock = true
			} else {
				sents++
			}
			ops[j].Absorbed = true
			j++
		}
		if j > i+1 {
			o.WholeBlock = sawBlock
			o.Count = sents
			// The region should READ as the block, so a boundary head hands its
			// place to the first real unit under it.
			//
			// AFTER THE HANDOVER THE HEAD IS NOT ITS OWN MEMBER. It is now
			// carrying ops[i+1]'s unit, so collecting it would put that one
			// sentence in Members twice and memberText would paint the block's
			// opening sentence twice — visibly, in every marked view. Members
			// starts below the head in that case, and the borrowed unit is
			// still collected once, as ops[i+1].
			start := i
			if side(o).Kind == KindBoundary {
				next := ops[i+1]
				o.KindHint = side(next).Kind
				o.Old, o.New = next.Old, next.New
				start = i + 1
			}
			for k := start; k < j; k++ {
				if side(ops[k]) != nil && side(ops[k]).Kind != KindBoundary {
					o.Members = append(o.Members, ops[k])
				}
			}
		}
		i = j
	}
}

// RegionOps is THE ONE ENUMERATION OF THE CHANGED REGIONS, in the order a
// reader meets them, and everything that needs to talk about "region k" must
// get k from here.
//
// The filters are the reader's, not the matcher's: an EQUAL op is not a place
// to attend to, an ABSORBED op is part of a neighbour and speaks for nothing on
// its own, and a MOVE IS ONE FACT counted once, at its deletion — the insertion
// end reaches its ordinal through Partner rather than claiming one of its own.
//
// It exists because three callers already needed this walk and were each
// spelling it out: the count beside a round, the after-text a manifest quote is
// matched against, and now the per-region ids the rendered HTML carries. Three
// spellings of one rule agree on every document anyone tries and disagree on
// the one that matters — and the disagreement here would put an agent's note
// beside the wrong change, with nothing to catch it. One list, three readers.
func RegionOps(ops []*Op) []*Op {
	var out []*Op
	for _, o := range ops {
		if o.Op == OpEqual || o.Absorbed {
			continue
		}
		if o.Moved && o.Op == OpInsert {
			continue
		}
		out = append(out, o)
	}
	return out
}

// Regions is HOW MANY PLACES ON THE PAGE THE READER MUST ATTEND TO. A move is
// one fact and is counted once, at the deletion.
func Regions(ops []*Op) int { return len(RegionOps(ops)) }

// Runs is how many separately-coloured ins/del runs are painted. It is a
// different question from Regions — a sentence word-diffed into three pieces is
// one region and three runs — and the two are reported side by side because the
// reader's cost is the first and the paint's is the second.
func Runs(ops []*Op) int {
	n := 0
	for _, o := range ops {
		if o.Op == OpEqual || o.Absorbed {
			continue
		}
		if (o.Old != nil && o.Old.Kind == KindBoundary) || (o.New != nil && o.New.Kind == KindBoundary) {
			n++
			continue
		}
		if o.Op == OpChange {
			if o.Inner {
				n += o.Frags
			} else {
				n += 2
			}
			continue
		}
		n++
	}
	return n
}

// Changed reports whether anything at all changed — the cheap question a caller
// asks before deciding whether to offer a diff.
func Changed(ops []*Op) bool { return Regions(ops) > 0 }
