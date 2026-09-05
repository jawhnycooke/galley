package serve

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestPreviewServesPageAndAssets: a page-mode server serves the live page and
// its sibling assets through /_galley/preview/.
func TestPreviewServesPageAndAssets(t *testing.T) {
	dir := t.TempDir()
	page := writePage(t, dir, "page.html", fixturePage)
	// A stylesheet beside the page: the preview must serve it too.
	writePage(t, dir, "style.css", "body{color:red}")
	// An SVG beside the page: it must carry the CSP sandbox.
	writePage(t, dir, "diagram.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>")

	s, err := NewEditPage(page)
	if err != nil {
		t.Fatalf("NewEditPage: %v", err)
	}
	defer func() { _ = s.Close() }()

	h := s.Handler()

	// The page itself, under its on-disk name.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/preview/page.html", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("page.html: status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("page.html: Content-Type = %q, want text/html", ct)
	}
	// Cross-Origin-Resource-Policy closes the existence oracle over the page's
	// directory, and must be present on every preview response.
	if corp := rec.Header().Get("Cross-Origin-Resource-Policy"); corp != "same-origin" {
		t.Errorf("page.html: Cross-Origin-Resource-Policy = %q, want same-origin", corp)
	}
	// The CSP sandbox is SVG-only: setting it on .html would break the page's
	// own scripts inside the iframe.
	if csp := rec.Header().Get("Content-Security-Policy"); csp != "" {
		t.Errorf("page.html: Content-Security-Policy = %q, want it unset on html", csp)
	}

	// The sibling stylesheet.
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/preview/style.css", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("style.css: status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/css") {
		t.Errorf("style.css: Content-Type = %q, want text/css", ct)
	}
	if corp := rec.Header().Get("Cross-Origin-Resource-Policy"); corp != "same-origin" {
		t.Errorf("style.css: Cross-Origin-Resource-Policy = %q, want same-origin", corp)
	}
	if body := rec.Body.String(); !strings.Contains(body, "color:red") {
		t.Errorf("style.css: body = %q, want the stylesheet bytes", body)
	}

	// The sibling SVG: served as image/svg+xml AND carrying the CSP sandbox, so
	// a script inside it lands in an opaque origin when navigated to directly.
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/preview/diagram.svg", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("diagram.svg: status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "image/svg+xml") {
		t.Errorf("diagram.svg: Content-Type = %q, want image/svg+xml", ct)
	}
	if corp := rec.Header().Get("Cross-Origin-Resource-Policy"); corp != "same-origin" {
		t.Errorf("diagram.svg: Cross-Origin-Resource-Policy = %q, want same-origin", corp)
	}
	if csp := rec.Header().Get("Content-Security-Policy"); csp != "default-src 'none'; sandbox" {
		t.Errorf("diagram.svg: Content-Security-Policy = %q, want the sandbox", csp)
	}
}

// TestPreviewSiteRootServesParentAssets: a page in a subdirectory, opened with
// an explicit site root, is mounted at its path beneath that root and its
// ../shared assets resolve through the same contained root — the case a
// subpage referencing /style.css one directory up could not reach when the
// preview root was the page's own folder.
func TestPreviewSiteRootServesParentAssets(t *testing.T) {
	root := t.TempDir()
	// A shared stylesheet at the site root, and the page one directory down.
	writePage(t, root, "style.css", "body{color:green}")
	sub := filepath.Join(root, "guide")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	page := writePage(t, sub, "index.html", fixturePage)

	s, err := NewEditPageRoot(page, root)
	if err != nil {
		t.Fatalf("NewEditPageRoot: %v", err)
	}
	defer func() { _ = s.Close() }()

	h := s.Handler()

	// The page is mounted at its path relative to the site root.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/preview/guide/index.html", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("guide/index.html: status = %d, want 200", rec.Code)
	}

	// The page's ../style.css resolves, from the iframe URL above, to
	// /_galley/preview/style.css — the shared stylesheet at the site root.
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/preview/style.css", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("style.css: status = %d, want 200", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, "color:green") {
		t.Errorf("style.css: body = %q, want the shared stylesheet bytes", body)
	}
}

// TestNewEditPageRootRejectsOutsidePage: a site root that does not contain the
// page is refused at construction rather than silently ignored.
func TestNewEditPageRootRejectsOutsidePage(t *testing.T) {
	root := t.TempDir()
	elsewhere := t.TempDir()
	page := writePage(t, elsewhere, "page.html", fixturePage)

	if s, err := NewEditPageRoot(page, root); err == nil {
		_ = s.Close()
		t.Fatalf("NewEditPageRoot with a root that does not contain the page: want error, got nil")
	}
}

// TestPreviewEmptyPathServesIndex: a request for the bare prefix (empty path)
// serves index.html — the preview's default document.
func TestPreviewEmptyPathServesIndex(t *testing.T) {
	dir := t.TempDir()
	page := writePage(t, dir, "page.html", fixturePage)
	// index.html beside the page: the empty-path default resolves to it.
	writePage(t, dir, "index.html", fixturePage)

	s, err := NewEditPage(page)
	if err != nil {
		t.Fatalf("NewEditPage: %v", err)
	}
	defer func() { _ = s.Close() }()

	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/preview/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("empty path: status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("empty path: Content-Type = %q, want text/html", ct)
	}
}

// TestPreviewRejectsNonGetMethod: a non-GET/HEAD method is a 404, not a 405 —
// a refusal and an absence are byte-identical, so the route never confirms it
// exists.
func TestPreviewRejectsNonGetMethod(t *testing.T) {
	dir := t.TempDir()
	page := writePage(t, dir, "page.html", fixturePage)
	writePage(t, dir, "index.html", fixturePage)

	s, err := NewEditPage(page)
	if err != nil {
		t.Fatalf("NewEditPage: %v", err)
	}
	defer func() { _ = s.Close() }()

	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/_galley/preview/index.html", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("POST: status = %d, want 404", rec.Code)
	}
}

// TestPreviewMarkdownModeIs404: a plain markdown-mode server has no preview.
func TestPreviewMarkdownModeIs404(t *testing.T) {
	dir := t.TempDir()
	doc := writePage(t, dir, "doc.md", "# hi\n")

	s, err := NewEdit(doc)
	if err != nil {
		t.Fatalf("NewEdit: %v", err)
	}
	defer func() { _ = s.Close() }()

	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/preview/index.html", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("markdown mode: status = %d, want 404", rec.Code)
	}
}

// TestPreviewRejectsTraversal: a request that tries to climb out of the page's
// directory is a 404 and never escapes pageRoot.
func TestPreviewRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	page := writePage(t, dir, "page.html", fixturePage)

	s, err := NewEditPage(page)
	if err != nil {
		t.Fatalf("NewEditPage: %v", err)
	}
	defer func() { _ = s.Close() }()

	// Call servePreview directly: ServeMux cleans ".." into a redirect before a
	// handler ever sees it, so this exercises the handler's OWN containment on a
	// raw traversal path the way a caller who bypassed the mux would hit it.
	for _, target := range []string{
		"/_galley/preview/../../etc/passwd",
		"/_galley/preview/sub/../../../etc/passwd",
	} {
		rec := httptest.NewRecorder()
		s.servePreview(rec, httptest.NewRequest(http.MethodGet, target, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: status = %d, want 404", target, rec.Code)
		}
		if rec.Body.Len() > 0 && strings.Contains(rec.Body.String(), "root:") {
			t.Errorf("%s: served content outside pageRoot: %q", target, rec.Body.String())
		}
	}
}
