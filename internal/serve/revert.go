package serve

import (
	"errors"
	"net/http"
	"strings"

	"github.com/reearth/ygo/crdt"
	"github.com/schuettc/galley/internal/diff"
	"github.com/schuettc/galley/internal/docmodel"
	"github.com/schuettc/galley/internal/markdown"
	"github.com/schuettc/galley/internal/review"
)

// REVERTING ONE EDIT IS NOT UNDO, AND THAT IS WHY IT EXISTS.
//
// ⌘Z is SEQUENTIAL: it walks back through what you did, most recent first.
// This is TARGETED — put back the paragraph I deleted three edits ago and keep
// the two I made after it — which is what Word's Reject and Docs' suggestion
// controls do, and what undo cannot do at any price.
//
// Court, on the card needing a press: "what if the edit card did have something
// to press… isn't this how most editors work?" It is, and the one part that
// does not transfer is accept/reject: in those tools a change is a PROPOSAL
// awaiting somebody's decision, and here the edit is the reviewer's own and
// already applied. Nobody is being asked. So there is one verb, and it is this.
//
// IT WORKS IN BLOCKS OF SOURCE, NOT IN A RENDERED MODEL, and that is what keeps
// it from being a second markdown writer. `diff.Blocks` splits a document into
// blocks whose `Text` is the RAW SOURCE — "# A careful review", "- one" — so a
// document is rebuilt by joining them, exactly as it was written. Reconstructing
// from `docmodel` instead would mean re-rendering, and this repository has one
// renderer on purpose.
//
// IT REFUSES WHAT IT CANNOT DO EXACTLY. A revert that lands the words in a
// plausible-but-wrong place is worse than a button that says no: the reviewer
// would have to notice, and the whole point of the verb is that they should not
// have to hold the document in their head. Three shapes are handled and
// anything else is refused by name.
func revertChange(before, after string, target ReviewerChange) (string, error) {
	beforeBlocks, afterBlocks := diff.Blocks(before), diff.Blocks(after)
	want := strings.TrimSpace(target.Before)
	now := strings.TrimSpace(target.After)

	switch target.Kind {
	case "removed":
		// A BLOCK THE REVIEWER DELETED, put back where it was. Its place is
		// found through the block ABOVE it that still exists — an index into
		// the old document means nothing in the new one, which is this
		// codebase's oldest rule about ordinals wearing different clothes.
		at := blockIndex(beforeBlocks, want)
		if at < 0 {
			return "", errors.New("that removal does not match a whole block, so there is no place to put it back")
		}
		insert := len(afterBlocks)
		for i := at - 1; i >= 0; i-- {
			if j := blockIndex(afterBlocks, strings.TrimSpace(beforeBlocks[i].Text)); j >= 0 {
				insert = j + 1
				break
			}
		}
		if at == 0 {
			insert = 0
		}
		out := make([]diff.Block, 0, len(afterBlocks)+1)
		out = append(out, afterBlocks[:insert]...)
		out = append(out, beforeBlocks[at])
		out = append(out, afterBlocks[insert:]...)
		return joinBlocks(out), nil

	case "added":
		at := blockIndex(afterBlocks, now)
		if at < 0 {
			return "", errors.New("that addition does not match a whole block, so it cannot be taken out on its own")
		}
		return joinBlocks(append(append([]diff.Block{}, afterBlocks[:at]...), afterBlocks[at+1:]...)), nil

	case "changed":
		// SUBSTITUTED INSIDE THE ONE BLOCK THAT HOLDS IT, and only if exactly
		// one does. Two blocks containing the same sentence is genuinely
		// ambiguous, and picking the first would be the wrong-place failure
		// this function refuses rather than guesses at.
		hits := 0
		at := -1
		for i, b := range afterBlocks {
			if strings.Contains(b.Text, now) {
				hits++
				at = i
			}
		}
		if hits != 1 {
			return "", errors.New("that edit's text appears " + plural(hits) + " in the document, so reverting it would have to guess which")
		}
		out := append([]diff.Block{}, afterBlocks...)
		out[at].Text = strings.Replace(out[at].Text, now, want, 1)
		return joinBlocks(out), nil
	}
	return "", errors.New("galley does not know how to revert a " + target.Kind)
}

// blockIndex is the ONE block whose whole text is `said`, or -1 if none is or
// more than one is. Ambiguity is refused rather than resolved by position.
func blockIndex(blocks []diff.Block, said string) int {
	found := -1
	for i, b := range blocks {
		if strings.TrimSpace(b.Text) != said {
			continue
		}
		if found >= 0 {
			return -1
		}
		found = i
	}
	return found
}

// joinBlocks rebuilds a document from blocks whose Text is raw source. The
// blank line between blocks is what `diff.Blocks` split on, so putting it back
// is the inverse rather than a formatting choice.
func joinBlocks(blocks []diff.Block) string {
	parts := make([]string, 0, len(blocks))
	for _, b := range blocks {
		if t := strings.TrimRight(b.Text, "\n"); strings.TrimSpace(t) != "" {
			parts = append(parts, t)
		}
	}
	return strings.Join(parts, "\n\n") + "\n"
}

func plural(n int) string {
	if n == 0 {
		return "nowhere"
	}
	return "more than once"
}

// handleRevert puts one of the reviewer's own edits back.
//
// IT RECOMPUTES THE LIST RATHER THAN TRUSTING THE PRESS. The browser sends a
// key and nothing else: the words to restore come from the server's own diff of
// the last version against the live document, so a card left open while the
// document moved cannot revert text the server never computed. A key it does
// not recognise is a 404 and not a guess.
//
// IT REBUILDS THROUGH THE ORDINARY WRITE PATH — parse the reverted markdown and
// hand it to `mutate` — so it inherits the projection, the version cut and the
// notify discipline every other mutation has. It is a TEXT change, so
// `ydoc.Write` correctly falls back to a full reload and the browser's undo
// stack is orphaned. That is accepted rather than overlooked: Court, asked
// directly, said "we can lose the undo. that's ok." Targeted text mutation is
// what removes the cost, and this becomes cheap the day it lands without
// changing here.
func (s *EditServer) handleRevert(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Key string `json:"key"`
	}
	if !decode(w, r, &in) {
		return
	}
	if s.refuseSealed(w, verbReview) {
		return
	}
	if s.refuseHandoff(w) {
		return
	}
	if in.Key == "" {
		http.Error(w, "which edit? pass its key", http.StatusBadRequest)
		return
	}

	code, err := s.mutate(byReviewer, func(model docmodel.Doc) (docmodel.Doc, func(*crdt.Doc, review.Tx), error) {
		store := s.Versions()
		latest, ok, err := store.Latest()
		if err != nil || !ok {
			return docmodel.Doc{}, nil, errors.New("this document has no round to revert against yet")
		}
		before, err := store.Content(latest.N)
		if err != nil {
			return docmodel.Doc{}, nil, errors.New("the last round cannot be read, so there is nothing to restore from")
		}
		// THE SAME COMPARISON THE RAIL MADE, or the key would not be found and
		// the revert would be computed against a document that includes the
		// instruction markup the rail deliberately strips. See plainText.
		before = plainOf(before)
		after := plainText(model)
		changes, _ := summarise(diff.Diff(before, after))
		for i := range changes {
			changes[i].Key = changeKey(changes[i])
		}
		var target *ReviewerChange
		for i := range changes {
			if changes[i].Key == in.Key {
				target = &changes[i]
				break
			}
		}
		if target == nil {
			return docmodel.Doc{}, nil, errUnknownChange
		}
		reverted, err := revertChange(before, after, *target)
		if err != nil {
			return docmodel.Doc{}, nil, err
		}
		out, _, err := markdown.Parse([]byte(reverted))
		if err != nil {
			return docmodel.Doc{}, nil, err
		}
		return out, nil, nil
	})
	if err != nil {
		if errors.Is(err, errUnknownChange) {
			http.Error(w, "that edit is not in this round any more — the document moved under the card", http.StatusNotFound)
			return
		}
		if code == 0 {
			code = http.StatusBadRequest
		}
		writeMutationError(w, code, err)
		return
	}
	s.writePending(w)
}

// errUnknownChange separates "the card is stale" from "this cannot be reverted",
// because the two want different words and different status codes.
var errUnknownChange = errors.New("no such change in this round")
