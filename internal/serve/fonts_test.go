package serve

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// The editor names two faces and the server is loopback: they must ship in
// the binary, not be fetched from a CDN the reviewer's machine may not reach.
func TestFontsAreServedFromTheBinary(t *testing.T) {
	s := newEditServer(t, t.TempDir(), "doc.md", "Hello world.\n")
	h := s.Handler()
	for _, name := range fontFiles {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/fonts/"+name, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: got %d, want 200", name, rec.Code)
		}
		if ct := rec.Header().Get("Content-Type"); ct != "font/woff2" {
			t.Fatalf("%s: Content-Type %q, want font/woff2", name, ct)
		}
		if rec.Body.Len() < 1000 {
			t.Fatalf("%s: body is %d bytes — not a font", name, rec.Body.Len())
		}
	}
}
