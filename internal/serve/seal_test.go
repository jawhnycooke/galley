package serve

import (
	"net/http"
	"testing"
)

// TestReopenUnsealsTheReview pins the sealed page's way back: a reopen on an
// approved review lifts the seal, tells the CLI (OnReopen), and a verb the
// seal refused is accepted again. On a live review it is a no-op 204.
func TestReopenUnsealsTheReview(t *testing.T) {
	s := newEditServer(t, t.TempDir(), "doc.md", "# Title\n\nDraft sentence.\n")
	defer func() { _ = s.Close() }()
	h := s.Handler()
	reopened := 0
	s.OnReopen = func() { reopened++ }

	if rec := post(t, h, "/_galley/reopen", map[string]any{}); rec.Code != http.StatusNoContent {
		t.Fatalf("reopen on a live review = %d, want 204", rec.Code)
	}
	if reopened != 0 {
		t.Fatal("a reopen on a live review fired OnReopen")
	}

	s.OnRevise = "true"
	press(t, s, `{"approveOnAnswer":true}`)
	if !s.Sealed() {
		t.Fatal("the fixture did not seal")
	}
	if rec := post(t, h, "/_galley/reopen", map[string]any{}); rec.Code != http.StatusNoContent {
		t.Fatalf("reopen = %d: %s", rec.Code, rec.Body.String())
	}
	if s.Sealed() {
		t.Fatal("reopen left the review sealed")
	}
	if reopened != 1 {
		t.Fatalf("OnReopen fired %d times, want 1", reopened)
	}
	if st := s.sealState(); st.Verdict != "" || !st.VerdictAt.IsZero() {
		t.Fatalf("reopen kept the verdict: %+v", st)
	}
	commentAs(t, s, "Draft sentence", "Make it final.")
}
