package serve

import (
	"github.com/schuettc/galley/internal/docmodel"
	"github.com/schuettc/galley/internal/review"
	"github.com/schuettc/galley/internal/suggest"
)

// DELETE THE SENTENCE, DELETE THE INSTRUCTION ABOUT IT.
//
// Court: "if we highlight a sentence and add an instruction and then delete the
// sentence, we should delete the instruction as well."
//
// It is the idiom this codebase already uses one population over. Deleting text
// under an AGENT's pending mark has always been the verdict by hand — the
// proposal vanishes and `suggest.ReplayAttribution` tolerates the absent mark by
// design. An instruction is the reviewer's own mark over their own words, and
// until now removing those words left the instruction behind, orphaned, in a
// section headed "unplaced · their words were removed". That heading describes
// the mechanism; what the reviewer did was retract the note.
//
// ONLY A RANGE INSTRUCTION, and `Anchor` is what says so. A block or
// whole-document instruction has no anchor text by construction — that is what
// docmodel.Note exists for — so it has no mark to lose and nothing here may
// touch it.
//
// THAT CHECK IS CURRENTLY SUBSUMED BY `seenAnchored` AND IS KEPT ANYWAY, which
// is worth stating because it means no test can distinguish it: a block thread
// never pairs with a mark, so it never enters `seenAnchored`, so removing the
// `Anchor` clause changes no outcome today — measured, by deleting it and
// watching the whole-document test stay green. It is kept because it is the
// RULE and the other is a mechanism: the day anything makes a block thread pair
// transiently, this is the clause that already says no. Do not remove it as
// dead on the strength of a green suite, and do not remove `seenAnchored` on
// the strength of this one — they guard different things and only one of them
// is currently reachable.
//
// ONLY AN ANCHOR THIS SERVER HAS SEEN. `suggest.PairFor` failing means "there is
// no mark for this thread NOW", which is not the same claim as "the reviewer
// deleted it". A sidecar written by an older galley, a legacy key, a pairing
// this build cannot reproduce — each of those also has no mark, and deleting on
// that evidence would destroy instructions nobody touched, at startup, silently.
// `seenAnchored` records the keys that HAVE paired, so the predicate is the one
// actually wanted: the anchor was there, and now it is gone.
//
// The cost of that guard is stated rather than hidden: an instruction whose
// anchor was already missing before this process started is never swept. It
// stays an unplaced card, which is the honest rendering — this server cannot
// know it was ever anchored.
//
// IT RUNS FROM `project`, which is where the server first learns the reviewer
// moved: a browser edit reaches the CRDT, `doc.OnUpdate` fires, `touch`
// schedules the debounced projection. There is no HTTP hook for typing, and the
// browser must NOT decide this — a thread is transiently anchorless on its first
// paint there, every time, because the projection reaches `/_galley/pending`
// before the websocket reaches the document, and a browser-side sweep would
// delete instructions as they arrived.
//
// IT CHANGES NO TEXT. The highlight went with the words the reviewer deleted, so
// there is nothing left to detach from the document — this removes the thread
// from the review map and nothing else. That is why it can sit inside `project`
// without touching the bytes `project` is about to write.
// noteAnchored records which range instructions currently have a real mark, and
// retractLost drops the ones whose mark has GONE from what the reviewer is
// shown. Together they are Court's rule — delete the sentence, delete the
// instruction about it — with NO document write of their own.
//
// EAGER DELETION WAS BUILT FIRST AND BACKED OUT, and the measurements are why.
// Deleting the thread from inside `project` cut spurious rounds:
// `web/rounds-ux.mjs` showed the arrival strip naming `round 3 answered · v6`
// while the record had already run on to v8. Moving the write out to a
// goroutine that went through `mutate`, exactly as the reviewer's own delete
// button does, made it WORSE — three failures in five runs, then five in five.
// Seeding the notifier after each retraction, the idiom `sendReviewerRound`
// uses for precisely this ("part of THIS send, not a new live edit"), left one
// run in four still red.
//
// The reason is structural rather than a race to be tuned out: IN LIVE MODE A
// SETTLE IS A SEND. Any document mutation can become a round, and a retraction
// is a document mutation. Making one class of write exempt means teaching
// `wakeSettle`/`cutIfSending` about it — and CLAUDE.md's entry on that code
// says in terms not to re-add a mode test there, because the digest clause it
// replaced was exactly that mistake.
//
// SO NOTHING IS WRITTEN. The instruction leaves the rail because it leaves the
// PENDING VIEW, which is what every surface renders from, and the thread itself
// is cleared by the send that already clears every instruction thread
// (`sendReviewerRound`). There is no window in which the reviewer sees a card
// for words that are gone.
//
// THE ONE HONEST COST, stated rather than hidden: a retracted instruction is
// filtered for the life of this server and not deleted from the review map, so
// a session that never sends and is then reopened shows the card again — the
// new process has never seen that anchor paired, and cannot know it was ever
// there. Making that consistent is what the eager deletion was for, and it
// needs the round-cutting question answered first.
//
// ONLY A RANGE INSTRUCTION. `Anchor` is what says so: a block or
// whole-document instruction has no anchor text by construction — that is what
// docmodel.Note exists for — so it has no mark to lose. Getting this wrong
// would hide every whole-document instruction on the first projection.
//
// ONLY AN ANCHOR THIS SERVER HAS SEEN. `suggest.PairFor` failing means "there
// is no mark for this thread NOW", which is not "the reviewer deleted it". A
// sidecar written by an older galley, a legacy key, a pairing this build cannot
// reproduce — each has no mark, and filtering on that evidence would hide
// instructions nobody touched, at startup, silently.
func (s *EditServer) noteAnchored(model docmodel.Doc) {
	threads := review.Read(s.doc)
	if len(threads) == 0 {
		return
	}
	pending := suggest.List(model)
	s.anchorMu.Lock()
	defer s.anchorMu.Unlock()
	if s.seenAnchored == nil {
		s.seenAnchored = map[string]bool{}
	}
	for _, th := range threads {
		if th.Resolved || th.Anchor != "" {
			continue
		}
		if _, ok := suggest.PairFor(pending, th); ok {
			s.seenAnchored[th.Key] = true
		}
	}
}

// retracted reports whether this thread's anchor was seen and has since gone.
func (s *EditServer) retracted(th review.Thread, paired bool) bool {
	if th.Anchor != "" || paired {
		return false
	}
	s.anchorMu.Lock()
	defer s.anchorMu.Unlock()
	return s.seenAnchored[th.Key]
}
