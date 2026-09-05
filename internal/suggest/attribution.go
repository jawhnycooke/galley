// attribution.go restores what the file format cannot carry: which author
// made a pending suggestion, and when.
//
// It lives here, beside List, rather than in whichever caller needed it
// first, because the algorithm is defined entirely in terms of List's own
// output — it pairs sidecar metas against pendings positionally, and that
// pairing is only correct as long as it walks the same spans, in the same
// order, that listSpans produces. Two callers need it: the edit server, which
// attributes the live document it restarts into (internal/serve), and the
// CLI's offline suggest/accept/reject, which must carry the recorded
// attribution across a mutation instead of rebuilding it blank from a reparse
// (cmd/galley). A second implementation of the pairing rules would drift from
// listSpans the first time the grouping changed.

package suggest

import (
	"strings"
	"time"

	"github.com/schuettc/galley/internal/docmodel"
	"github.com/schuettc/galley/internal/review"
)

// ReplayAttribution restores suggestion authorship the file format itself
// cannot carry: CriticMarkup has nowhere to write a mark's author or
// timestamp (see markdown's wrapCritic), so every Ins/Del/Highlight mark
// comes out of Parse with empty Attrs. The sidecar recorded them the last
// time a projection ran, in the same document order List produces.
//
// A straight positional pairing (metas[i] belongs to pendings[i]) breaks the
// instant a new suggestion appears anywhere before the end of the document:
// one insertion between sessions shifts every pending after it by one index,
// and a naive walk that only ever advances both sides together loses
// attribution for everything downstream of that shift, not just the new
// entry — the wrong failure for something that is supposed to fail safe.
//
// So this is a two-pointer scan instead of a zip: i walks metas, j walks
// pendings, and they only advance together on a match. A mismatch advances j
// ALONE — pendings[j] is read as a suggestion the sidecar never saw (created
// after the last projection), so the scan keeps looking further into pendings
// for the SAME metas[i] without losing its place. That resynchronises after
// an insertion (see TestRestartReplayPreservesAttribution's probe: a new
// suggestion inserted before two already-attributed ones still leaves both
// of theirs intact). It does not resynchronise after a REMOVAL — a meta with
// no matching pending anywhere in the remainder exhausts j and the scan
// simply stops, so anything past a removed suggestion in the sidecar goes
// unattributed too. That is a real residual limitation, not silently
// swallowed: it is the same "fail safe, not fail exact" contract the Quote
// check already makes for a genuinely-changed suggestion, just for a
// different kind of drift between sessions.
//
// One further limitation worth naming: quote is the only signal here, so an
// inserted suggestion whose text happens to equal an already-attributed
// one's can still be matched to the wrong meta (Kind matching alone would
// not disambiguate a same-kind, same-text collision either). Fixing that
// would need a persistent identity across edits, which Pending deliberately
// does not have (its ID is a fresh ordinal every List call) — out of scope
// for this fix.
//
// Metas the scan cannot place are left alone: this only ever ADDS attribution
// to marks that have none, so calling it on an already-attributed model is a
// no-op rather than a rewrite.
func ReplayAttribution(model *docmodel.Doc, metas []review.SuggestionMeta) {
	if len(metas) == 0 {
		return
	}
	pendings := attributable(List(*model))
	i, j := 0, 0
	for i < len(metas) && j < len(pendings) {
		p := pendings[j]
		if p.Kind == KindReplace {
			// A substitution is one pending standing over TWO marks, and
			// the sidecar may hold either one meta for it or the two it
			// recorded before the halves became one suggestion.
			// replayReplace decides which and says how many it consumed; a
			// mismatch falls through to the same "advance j alone"
			// resynchronisation every other kind gets.
			if n, ok := replayReplace(model, p, metas[i:]); ok {
				i += n
			}
			j++
			continue
		}
		m := metas[i]
		if m.Quote != p.Text {
			j++
			continue
		}
		if mk, ok := markKindForKind(p.Kind); ok {
			attributeRun(model, p.Path, mk, p.Text, m.Author, m.At)
		}
		i++
		j++
	}
}

// replayReplace attributes a substitution, which is ONE pending standing
// over TWO marks, and reports how many metas it consumed.
//
// TWO SPELLINGS ARE READ, because the sidecar outlives the change that made
// a substitution one suggestion. A sidecar written since carries ONE meta,
// quoting the pair the way List renders it ("old → new"). One written
// before carries TWO, quoting each half on its own, in document order — and
// a scan that did not know that would fail to match the first, advance past
// every remaining pending hunting for it, and leave the whole rest of the
// file unattributed. The sidecar is the only record of who suggested what,
// so reading the older spelling is not a courtesy.
//
// A lone delete-half meta with no insert-half after it is still honoured:
// the deletion's author is recovered and only the insertion goes without,
// which is the fail-safe direction. What is NOT done is matching the insert
// half alone — the metas are in document order, so a pair always opens with
// the deletion, and a bare match on the second half would consume a meta
// that may belong to a later suggestion entirely.
func replayReplace(model *docmodel.Doc, p Pending, metas []review.SuggestionMeta) (int, bool) {
	if metas[0].Quote == p.Text {
		attributeRun(model, p.Path, docmodel.Del, p.Old, metas[0].Author, metas[0].At)
		attributeRun(model, p.Path, docmodel.Ins, p.New, metas[0].Author, metas[0].At)
		return 1, true
	}
	if metas[0].Quote != p.Old {
		return 0, false
	}
	attributeRun(model, p.Path, docmodel.Del, p.Old, metas[0].Author, metas[0].At)
	if len(metas) > 1 && metas[1].Quote == p.New {
		attributeRun(model, p.Path, docmodel.Ins, p.New, metas[1].Author, metas[1].At)
		return 2, true
	}
	return 1, true
}

// Attributable reports whether a pending entry is one the sidecar records
// attribution for: a MARK, whose author and instant CriticMarkup cannot
// carry. A block or document comment is a Note block, which has no mark to
// attribute and whose author lives in its thread — so it must be kept out of
// the metas entirely.
//
// That is not tidiness. ReplayAttribution pairs metas against pendings
// POSITIONALLY, and its resynchronisation rule advances only on a matching
// quote; a note whose text happened to equal a suggestion's would consume
// that meta and silently unattribute everything after it. Filtering both the
// list this scan walks and the list callers write keeps the two sides
// describing the same sequence.
func Attributable(p Pending) bool { return p.Anchor == AnchorRange }

func attributable(pendings []Pending) []Pending {
	out := make([]Pending, 0, len(pendings))
	for _, p := range pendings {
		if Attributable(p) {
			out = append(out, p)
		}
	}
	return out
}

func markKindForKind(k Kind) (docmodel.MarkKind, bool) {
	switch k {
	case KindInsert:
		return docmodel.Ins, true
	case KindDelete:
		return docmodel.Del, true
	case KindComment:
		return docmodel.Highlight, true
	default:
		return "", false
	}
}

// attributeRun finds the first still-unattributed maximal run of inlines in
// the block at path carrying mk whose combined text is exactly text, and
// stamps author/at onto every mark in it.
//
// "Still-unattributed" is what makes this safe to call once per pending in
// order: a block with two identical suggestions of the same kind gets its
// metas matched to its runs in the same left-to-right order List found them
// in, because the run this call just stamped no longer qualifies as
// unattributed for the next.
func attributeRun(model *docmodel.Doc, path []int, mk docmodel.MarkKind, text, author string, at time.Time) {
	docmodel.Walk(*model, func(p []int, b *docmodel.Block) {
		if !pathEqual(p, path) {
			return
		}
		start, end, ok := findUnattributedRun(b.Inlines, mk, text)
		if !ok {
			return
		}
		atStr := at.UTC().Format(time.RFC3339)
		for i := start; i < end; i++ {
			for j := range b.Inlines[i].Marks {
				if b.Inlines[i].Marks[j].Kind != mk {
					continue
				}
				if b.Inlines[i].Marks[j].Attrs == nil {
					b.Inlines[i].Marks[j].Attrs = map[string]string{}
				}
				b.Inlines[i].Marks[j].Attrs["author"] = author
				b.Inlines[i].Marks[j].Attrs["at"] = atStr
			}
		}
	})
}

// findUnattributedRun locates the first maximal run of consecutive inlines
// carrying mk with no author yet set, whose concatenated text equals target.
//
// It walks the SAME boundaries spansForMark does, through the same spanKey, so
// what this attributes is exactly what List will report as one suggestion. It
// used to hand-copy the comparison, and the copy is what drifted: when the
// CriticMarkup parser began stamping a run per span, a scan that did not break
// on the run ran straight across "{--age--}{--age--}", concatenated "ageage",
// matched neither meta's quote, and DROPPED BOTH AUTHORS silently. There is one
// definition of the key now; see spanKey.
//
// The "author not yet assigned" filter is this function's own addition, and it
// is a starting condition rather than a second grouping rule: every mark
// reaching here was just parsed, so it starts out unattributed uniformly, and
// spanKey equality then keeps the whole stretch unattributed anyway.
func findUnattributedRun(inlines []docmodel.Inline, mk docmodel.MarkKind, target string) (start, end int, ok bool) {
	for i := 0; i < len(inlines); i++ {
		if !inlines[i].Has(mk) || inlines[i].Attr(mk, "author") != "" {
			continue
		}
		key := spanKeyOf(inlines[i], mk)
		j := i
		var b strings.Builder
		for j < len(inlines) && inlines[j].Has(mk) && spanKeyOf(inlines[j], mk) == key {
			b.WriteString(inlines[j].Text)
			j++
		}
		if b.String() == target {
			return i, j, true
		}
		i = j - 1
	}
	return 0, 0, false
}
