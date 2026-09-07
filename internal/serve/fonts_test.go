package serve

import (
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"sort"
	"strings"
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

// THE LICENCE TRAVELS WITH THE FACES. Both families are OFL, which obliges
// galley to make the licence available wherever it makes the fonts available —
// and the file was embedded with no route at all until this test asked for it.
func TestFontLicenceIsServed(t *testing.T) {
	s := newEditServer(t, t.TempDir(), "doc.md", "Hello world.\n")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(
		http.MethodGet, "/_galley/fonts/LICENSE-OFL.txt", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "SIL OPEN FONT LICENSE") {
		t.Fatalf("body is not the OFL: %.80q", rec.Body.String())
	}
}

// TWO HAND-KEPT LISTS, CROSS-CHECKED. `fontFiles` above is the routes; the
// `src: url(...)` of every `@font-face` in web/editor.css is what the browser
// actually asks for. Nothing tied them together, so renaming a file on one side
// left the editor silently un-fonted — the page still renders, in the fallback
// stack, which is exactly the kind of wrong nobody files a bug about.
func TestFontFacesMatchTheRoutes(t *testing.T) {
	css, err := os.ReadFile("../../web/editor.css")
	if err != nil {
		t.Skipf("web/editor.css not in this checkout: %v", err)
	}
	re := regexp.MustCompile(`url\("/_galley/fonts/([^"]+)"\)`)
	var named []string
	for _, m := range re.FindAllStringSubmatch(string(css), -1) {
		named = append(named, m[1])
	}
	if len(named) != len(fontFiles) {
		t.Fatalf("editor.css names %d font URLs, fontFiles has %d: %v vs %v",
			len(named), len(fontFiles), named, fontFiles)
	}
	want := append([]string(nil), fontFiles...)
	got := append([]string(nil), named...)
	sort.Strings(want)
	sort.Strings(got)
	for i := range want {
		if want[i] != got[i] {
			t.Fatalf("font lists disagree: editor.css %v, fontFiles %v", got, want)
		}
	}
}
