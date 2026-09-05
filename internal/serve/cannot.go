package serve

// cannot.go is THE EXCEPTION PATH, and it is a REPORT RATHER THAN A TURN IN A
// CONVERSATION.
//
// An instruction is discharged by the revision itself: there is nothing to
// resolve, because the thing it asked for happened. What is left is the one
// case that has no revision — the agent genuinely could not do it — and the
// spec is explicit that this is *"not a turn in a conversation, it is a
// report"*. So it is not a reply into a thread and it is not an ack: it is a
// ROUND, cut with the same bytes the document already had, carrying the reason
// as its instruction under its own reason word.
//
// AN INSTRUCTION WITH NO EDIT BESIDE IT IS STILL AN INSTRUCTION — cutIfSending
// already says so about the reviewer's press, and this is the agent's half of
// exactly that sentence. It is what makes the exception visible where every
// other round is visible, in the one list the history is, instead of being a
// status that scrolls past.
//
// (This file was apply.go while `galley apply` existed. The agent's write
// surface is the .md file itself now — see handoff.go — and the exception is
// the one verb that survived the apply loop's removal.)

import (
	"net/http"
	"strings"
)

func (s *EditServer) handleCannot(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Why string `json:"why"`
	}
	if !decode(w, r, &in) {
		return
	}
	if s.refuseSealed(w, verbReview) {
		return
	}
	why := strings.TrimSpace(in.Why)
	if why == "" {
		http.Error(w, "say why: a report with no reason is a refusal the reviewer cannot answer, and the "+
			"answer to one is a different instruction", http.StatusBadRequest)
		return
	}
	s.recordCannot(why)
	if s.Log != nil {
		s.Log("could not: " + why)
	}
	w.WriteHeader(http.StatusNoContent)
}
