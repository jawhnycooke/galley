package serve

import (
	"fmt"
	"net/http"
	"time"

	"github.com/schuettc/galley/internal/ledger"
)

const VerdictApproved = "approved"

type sealRecord struct {
	Sealed    bool      `json:"sealed"`
	Verdict   string    `json:"verdict,omitempty"`
	VerdictAt time.Time `json:"verdictAt,omitempty"`
}

func (s *EditServer) Sealed() bool {
	s.sealMu.Lock()
	defer s.sealMu.Unlock()
	return s.sealed
}

func (s *EditServer) sealState() sealRecord {
	s.sealMu.Lock()
	defer s.sealMu.Unlock()
	return sealRecord{Sealed: s.sealed, Verdict: s.verdict, VerdictAt: s.verdictAt}
}

func (s *EditServer) seal(verdict string, _ int) {
	s.sealMu.Lock()
	s.sealed = true
	s.verdict = verdict
	s.verdictAt = time.Now().UTC()
	s.sealMu.Unlock()
}

// unseal is the seal's one way back. Approve changes no bytes and cuts no
// version, so there is nothing to undo but the flag and the verdict it
// carries; the rounds, the trail and the sidecar are all still there.
func (s *EditServer) unseal() {
	s.sealMu.Lock()
	s.sealed = false
	s.verdict = ""
	s.verdictAt = time.Time{}
	s.sealMu.Unlock()
}

// handleReopen answers the sealed page's own `reopen` link — POST
// /_galley/reopen. Restarting `galley edit` was the only way back from a
// mis-pressed Approve, and the readout said so in words the reviewer had to
// carry to a terminal; this is the same recovery as a press. Idempotent: a
// reopen on a live review is a 204 that changes nothing, so a double press
// or a stale page cannot fail.
func (s *EditServer) handleReopen(w http.ResponseWriter, r *http.Request) {
	var in struct{}
	if !decode(w, r, &in) {
		return
	}
	if !s.Sealed() {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.unseal()
	s.remember(verdictRecord(ledger.KindReopened, ""))
	if s.OnReopen != nil {
		s.OnReopen()
	}
	if s.Log != nil {
		s.Log("reopened")
	}
	w.WriteHeader(http.StatusNoContent)
}

type sealedVerb int

const verbReview sealedVerb = 0

func (s *EditServer) refuseSealed(w http.ResponseWriter, _ sealedVerb) bool {
	st := s.sealState()
	if !st.Sealed {
		return false
	}
	http.Error(w, fmt.Sprintf("the review is sealed (%s)", st.Verdict), http.StatusConflict)
	return true
}

func (s *EditServer) handleStop(w http.ResponseWriter, r *http.Request) {
	var in struct{}
	if !decode(w, r, &in) {
		return
	}
	stop := s.OnStop
	if stop == nil {
		http.Error(w, "this server was started without a stop hook — Ctrl-C in the session that started it",
			http.StatusNotImplemented)
		return
	}
	w.WriteHeader(http.StatusNoContent)
	go stop()
}
