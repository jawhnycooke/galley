package serve

import (
	"os"
	"path/filepath"
	"testing"
)

// LOAD IS THE READ PATH AND IT MUST STAY TOLERANT. Nothing in the suite noticed
// when this function was made strict as an experiment — every sidecar any test
// writes is one this build wrote — so the tolerance was true by accident and
// one "tighten the decoder" commit away from being false.
//
// What it costs to get wrong: Load is what `galley pending` and cmd/galley's
// loadReview fall back to, and it is what mutateSidecar reads the PRIOR file
// with — the file whose Suggestions and Changes have no other home. A strict
// Load meeting a sidecar one field ahead of it returns an error, the prior is
// lost, and the very deletion review.ExportOnto exists to prevent happens on
// the next projection. Reading is always safe; the refusal belongs on the
// REPLAY, which is where review.File.Compatible puts it.
func TestLoadReadsASidecarFromANewerGalley(t *testing.T) {
	path := filepath.Join(t.TempDir(), "doc.comments.json")
	raw := `{"v":99,"page":"/tmp/doc.md","updated":"2026-08-20T10:00:00Z",
	  "threads":[{"key":"k","heading":"h","resolved":false,
	    "entries":[{"author":"court","at":"2026-08-20T10:00:00Z","text":"hi"}],
	    "mood":"cheerful"}],
	  "comments":[{"key":"k","heading":"h","text":"hi"}],
	  "suggestions":[{"id":"s1","kind":"insert","author":"agent","at":"2026-08-20T09:00:00Z","quote":"brave"}],
	  "somethingNew":{"deep":1}}`
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}
	f, err := Load(path)
	if err != nil {
		t.Fatalf("Load refused a sidecar it is only reading: %v", err)
	}
	if len(f.Threads) != 1 || f.Threads[0].Entries[0].Text != "hi" {
		t.Fatalf("threads = %+v", f.Threads)
	}
	if len(f.Suggestions) != 1 || f.Suggestions[0].Author != "agent" {
		t.Fatalf("suggestions = %+v — the prior a projection carries forward", f.Suggestions)
	}
	if err := f.Compatible(); err == nil {
		t.Fatal("reading it is fine; REPLAYING it is not, and Compatible is where that line is drawn")
	}
}
