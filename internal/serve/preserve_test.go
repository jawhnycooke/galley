package serve

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// nonCanonical is a document spelled the way authors actually spell markdown,
// and every line of it is a thing the serializer used to change: a setext
// heading, a hard-wrapped paragraph, "*" bullets, "__bold__"/"_em_", and a
// table whose delimiter row is written tight.
const nonCanonical = `Setext Heading
==============

A hard wrapped
paragraph over
three lines.

* one
* two

__bold__ and _em_.

| a | b |
|---|---|
| 1 | 2 |
`

// TestOpeningAndClosingChangesNoBytes is the incident, at the layer it
// happened at.
//
// Measured 2026-08-22 on the shipped binary: `galley edit` on this document
// with no browser attached and no key pressed, then quit, and six separate
// things had been rewritten. The cause was not the open — the file was
// untouched for as long as the server ran — it was cmd/galley's shutdown
// Flush, which projects unconditionally because it cannot tell a pending
// keystroke from nothing at all.
//
// The cheap fix was to skip a write whose bytes match disk. This asserts the
// real one: the projection is built ONTO the file that is there, so there is
// nothing to skip, and the same guarantee holds on the projection after a real
// edit — which the skip could never have covered.
func TestOpeningAndClosingChangesNoBytes(t *testing.T) {
	dir := t.TempDir()
	md := filepath.Join(dir, "a-document-with-a-real-name.md")
	if err := os.WriteFile(md, []byte(nonCanonical), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := NewEdit(md)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close() }()

	if err := s.Flush(); err != nil {
		t.Fatalf("flush: %v", err)
	}
	after, err := os.ReadFile(md)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != nonCanonical {
		t.Errorf("opening a document and flushing rewrote it.\n--- was ---\n%s\n--- now ---\n%s",
			nonCanonical, after)
	}
}

// TestTheSeedVersionIsTheAuthorsOwnBytes closes the consequence that arrives
// with the fix rather than before it.
//
// v1 is seeded from a rendering deliberately, so that the first diff is not a
// picture of the parser. The moment a projection PRESERVES the author's
// spelling, seeding from the plain rendering inverts that same defect: v1
// canonical against a preserved v2 paints the parser backwards. The invariant
// was always "v1 is the document galley read, in the spelling the next
// projection will use".
func TestTheSeedVersionIsTheAuthorsOwnBytes(t *testing.T) {
	dir := t.TempDir()
	md := filepath.Join(dir, "seeded.md")
	if err := os.WriteFile(md, []byte(nonCanonical), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := NewEdit(md)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close() }()

	store := s.Versions()
	v, ok, err := store.Latest()
	if err != nil || !ok {
		t.Fatalf("no seeded version: ok=%v err=%v", ok, err)
	}
	content, err := store.Content(v.N)
	if err != nil {
		t.Fatalf("reading v%d: %v", v.N, err)
	}
	for _, spelling := range []string{"Setext Heading\n==============", "* one", "__bold__"} {
		if !strings.Contains(content, spelling) {
			t.Errorf("v1 lost the author's spelling %q — the first diff will paint the parser:\n%s",
				spelling, content)
		}
	}
}

// TestAnUnknownFieldIsRefusedRatherThanIgnored is the inbound half of the wire
// contract, and the failure it prevents is a SILENT one.
//
// encoding/json ignores a field it does not recognise, so a page posting a
// misspelled key at a handler got a success code and a no-op: the press
// "worked", the server did nothing, and there was no error anywhere to look at.
// web/wire.d.ts covers Go->browser; nothing covered browser->Go. The sender is
// this repository's own bundle, shipped in the same binary as this server, so a
// field mismatch is a bug and never a version skew to be tolerated.
func TestAnUnknownFieldIsRefusedRatherThanIgnored(t *testing.T) {
	dir := t.TempDir()
	md := filepath.Join(dir, "strict.md")
	if err := os.WriteFile(md, []byte("# T\n\nProse about Galley.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := NewEdit(md)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close() }()

	// "tex" for "text" — one letter, and it used to be a success and a no-op.
	body := map[string]any{"op": "comment", "target": "Prose about Galley.", "tex": "bold this"}
	rec := postRec(t, s, "/_galley/instruct", body)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("a misspelled field got %d, want 400 — it was accepted and did nothing: %s",
			rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "tex") {
		t.Errorf("the refusal does not name the field that was wrong: %s", rec.Body.String())
	}
}
