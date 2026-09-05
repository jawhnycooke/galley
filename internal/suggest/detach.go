package suggest

import (
	"time"

	"github.com/schuettc/galley/internal/docmodel"
	"github.com/schuettc/galley/internal/review"
)

// detach.go is the document half of DELETING a thread — the verb that removes
// a comment which no longer applies, as opposed to resolving one, which settles
// it and keeps every word of it.
//
// A thread leaves exactly one trace in the document, and which one depends on
// its anchor:
//
//   - RANGE: a Highlight mark on the prose it covers. Deleting drops the mark
//     and keeps the text, which is precisely what resolving a range comment
//     already does — so it is the same transform, not a second spelling of it.
//   - BLOCK or DOCUMENT: a docmodel.Note block, which IS the note. There is no
//     mark to lift; the file is where those words live, and removing the block
//     is the only way to take them out of it. This is the one path in galley
//     that removes a {>>…<<} a human typed, and it exists precisely so that
//     nothing else has to.
//
// The sidecar half — dropping the conversation itself — is review.Session.
// Delete, and every caller does both.

// PairFor reports the pending mark a thread is the conversation about, for
// EVERY kind: a comment thread's highlight, and equally a proposal thread's
// insert, delete or replace — the thread whose heading is that proposal's
// Text. It is what lets a reply reach a proposal and the proposal's card
// render its conversation, and it is ONE RULE, NOT A SECOND ONE THAT AGREES
// FOR NOW: MarkFor below is this rule restricted to comment kinds, so the mark
// a card jumps to and the mark a delete lifts cannot drift from the mark a
// proposal thread pairs with.
//
// AMBIGUITY IS REPORTED, NEVER RESOLVED BY GUESSING. Attaching a conversation
// to the wrong text is the failure this whole line of work exists to remove, so
// a thread that two marks fit equally well has none.
//
// THE KEY GOES FIRST. A proposal thread's key is derived from the proposal by
// formula — CommentKey over its Text, Author and At, exactly what a reply-by-
// run mints — so recomputing that formula over the candidates finds THE pair
// without touching the entries at all. That matters because a reply-by-run
// thread's entries carry the REPLIER's author and at, which the strict pass
// below can never match against the proposal's, and because two proposals can
// carry the same text, which the loose pass must then refuse. The key digests
// all three identity parts, so it selects exactly; two candidates deriving one
// key means one (text, author, at) triple made twice, and picking between them
// would be a guess.
//
// The heading passes remain for every thread whose key does NOT recompute:
// comment threads keyed at nanosecond precision where the mark keeps whole
// seconds, and legacy keys that predate or drifted from the formula (see
// MigrateCommentKeys — keys have drifted before). The first pairs on
// (anchored text, author, second) — the three things a suggest-created
// comment thread and its mark genuinely share, since the endpoint writes the
// thread's first entry and the mark from one `at`, and both round to whole
// seconds through RFC3339. The second pairs on the TEXT alone, and only when
// exactly one mark in the whole list carries it: that is the case of a mark
// that was never attributed, which is every span typed into the file by hand,
// and "must match exactly once" is the same standard `--on TARGET` already
// holds a caller to. A cross-kind coincidence — a comment and a proposal
// sharing text, or even text+author+second — is residual ambiguity these
// passes tolerate by refusing to pair, deliberately.
//
// RANGE anchors only. A block or document comment has no mark — its trace is a
// docmodel.Note, and notes pair through matchNotes on the note's own words,
// not here on a heading.
//
// It is a function over the pending LIST rather than over the document because
// every caller already has one — the serve layer's pending view, Detach below
// — and listing twice is the per-item rescan this package has paid for before.
func PairFor(pending []Pending, t review.Thread) (Pending, bool) {
	var keyed []Pending
	for _, p := range pending {
		if p.Anchor != AnchorRange {
			continue
		}
		if CommentKey(p.Text, p.Author, p.At) == t.Key {
			keyed = append(keyed, p)
		}
	}
	if len(keyed) == 1 {
		return keyed[0], true
	}
	if len(keyed) > 1 {
		return Pending{}, false
	}

	var opened review.Entry
	if len(t.Entries) > 0 {
		opened = t.Entries[0]
	}
	// AN INLINE NOTE HAS NOTHING IN THE DOCUMENT TO PAIR WITH, EVER. A
	// {>>…<<} at a position in prose is LIFTED out at parse and never
	// serialized again (markdown/note.go), so there is no mark, no highlight
	// and no run — whatever its heading happens to say.
	//
	// This used to be asked as `t.Heading == ""`, which was true of exactly
	// this population and for the wrong reason: the import minted no heading,
	// so the proxy held. It stopped being a proxy the moment the thread was
	// given a name — an inline note in a short paragraph now carries that
	// paragraph's text, and the loose pass below matches a range mark on TEXT
	// ALONE, so the note would have claimed a stranger's highlight and `galley
	// delete md-…` would have lifted it out of the author's file. Ask the fact.
	if IsInlineNoteKey(t.Key) {
		return Pending{}, false
	}
	if t.Heading == "" {
		// Nothing to pair on: the passes below match on the heading, and a
		// thread with none has nothing to offer them.
		return Pending{}, false
	}
	exact := func(p Pending) bool {
		return p.Author == opened.Author &&
			p.At.Truncate(time.Second).Equal(opened.At.Truncate(time.Second))
	}
	var loose []Pending
	var strict []Pending
	for _, p := range pending {
		if p.Anchor != AnchorRange || p.Text != t.Heading {
			continue
		}
		loose = append(loose, p)
		if exact(p) {
			strict = append(strict, p)
		}
	}
	if len(strict) == 1 {
		return strict[0], true
	}
	if len(strict) == 0 && len(loose) == 1 {
		return loose[0], true
	}
	return Pending{}, false
}

// MarkFor reports the comment highlight a range thread is anchored to: PairFor
// over the comment-kind marks alone. Detach resolves a range thread's
// highlight through it, so a delete can only ever lift a highlight — a
// proposal's ins/del marks are not candidates, whatever text they carry.
func MarkFor(pending []Pending, t review.Thread) (Pending, bool) {
	var comments []Pending
	for _, p := range pending {
		if p.Kind == KindComment {
			comments = append(comments, p)
		}
	}
	return PairFor(comments, t)
}

// Detach removes from d whatever trace the thread named by key left there, and
// reports whether it found one.
//
// NOT FINDING ONE IS AN ORDINARY OUTCOME, not an error: the note may have been
// deleted by hand, the highlighted words edited away, or the thread may never
// have had a mark to begin with. The honest answer then is to change nothing
// and say so — the caller still drops the conversation, and removing something
// merely adjacent is the outcome nothing can undo.
func Detach(d docmodel.Doc, threads []review.Thread, key string) (docmodel.Doc, bool) {
	var t review.Thread
	found := false
	for _, th := range threads {
		if th.Key == key {
			t, found = th, true
			break
		}
	}
	if !found {
		return d, false
	}

	if t.Anchor == string(AnchorBlock) || t.Anchor == string(AnchorDocument) {
		notes, paths := notesWithPaths(d)
		matched := matchNotes(notes, threads)
		for i, j := range matched {
			if j >= 0 && threads[j].Key == key {
				return removeBlockAt(d, paths[i]), true
			}
		}
		return d, false
	}

	p, ok := MarkFor(List(d), t)
	if !ok {
		return d, false
	}
	// applyDecision, not a local mark-dropping walk: mutateSpan is where what
	// "lift a highlight" means is decided, and resolving a range comment already
	// goes through it. One implementation, reached two ways.
	out, err := Accept(d, p.ID)
	if err != nil {
		return d, false
	}
	return out, true
}

// Reword rewrites the words of the note the thread named by key left in the
// document, and reports whether it found one.
//
// It is Detach's sibling and shares its whole argument about where a thread's
// words actually live. A RANGE thread keeps its words in the sidecar alone —
// the document holds only a Highlight over prose the reviewer did not write —
// so there is nothing here to reword and this answers false, correctly and
// without changing anything. A BLOCK or DOCUMENT thread's words ARE a
// docmodel.Note block in the file, and rewriting that block is the only way an
// edit reaches the .md at all. Not finding a note is an ordinary outcome for
// the same reasons Detach lists: it may have been deleted by hand, or the
// thread may never have had one.
//
// THE THREAD'S KEY IS NOT RECOMPUTED, AND THAT IS DELIBERATE. A note's key
// digests the note's own words (CommentKeyFor), so rewording one changes what
// its key WOULD be — but the sidecar is upserted by the key it already has, and
// ReconcileNotes pairs a note back onto its thread on Entries[0].Text, never on
// the key. So as long as the caller writes the same new text into both halves
// in ONE mutation, the pairing holds and the old key stays reachable, which is
// exactly the migration story CLAUDE.md records for keys that have drifted
// before. Re-keying here would orphan every reply already in the conversation.
func Reword(d docmodel.Doc, threads []review.Thread, key, text string) (docmodel.Doc, bool) {
	var t review.Thread
	found := false
	for _, th := range threads {
		if th.Key == key {
			t, found = th, true
			break
		}
	}
	if !found {
		return d, false
	}
	if t.Anchor != string(AnchorBlock) && t.Anchor != string(AnchorDocument) {
		return d, false
	}
	notes, paths := notesWithPaths(d)
	matched := matchNotes(notes, threads)
	for i, j := range matched {
		if j < 0 || threads[j].Key != key {
			continue
		}
		clone := cloneDoc(d)
		b, ok := blockAt(clone, paths[i])
		if !ok {
			return d, false
		}
		// One unmarked inline, which is what every note this package writes
		// holds: a note's words are prose the reviewer typed into a box, never
		// marked-up document text, and ydoc.writeBlock crosses it as a single
		// YXmlText run.
		b.Inlines = []docmodel.Inline{{Text: text}}
		return clone, true
	}
	return d, false
}
