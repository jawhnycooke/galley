package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// minimalHTML is the smallest page Extract accepts: a doctype, head/title,
// and one prose paragraph in the body.  The exact shape mirrors the fixture in
// internal/htmlpage/extract_test.go so we know Extract will not reject it.
const minimalHTML = `<!doctype html><html><head><title>x</title></head><body>
<p>Hello world, edited in rounds.</p>
</body></html>`

// TestRunEditRoutesHTMLToPageMode asserts that runEdit on a .html file starts
// the page-backed editor: the working-directory content.md must exist after
// the server is constructed (it is written by NewEditPage's writePageWorkdir
// before any HTTP request arrives).
//
// We do not start a full HTTP server here — runEdit blocks in serve, which is
// heavier than what a unit test wants to drive.  Instead we reach one level
// below: construct serve.NewEditPage indirectly by calling the routing helper
// that runEdit uses (serve.NewEditPage), or simply assert the file artefact
// that proves the page path was taken.
//
// The simplest observable: after "galley edit page.html" takes the page
// branch, .galley/pages/<base>/content.md exists in the same directory as the
// HTML file.  We verify that by calling serve.NewEditPage directly — the same
// call runEdit must make — and checking the file.
func TestRunEditRoutesHTMLToPageMode(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	dir := t.TempDir()
	htmlPath := filepath.Join(dir, "review.html")
	if err := os.WriteFile(htmlPath, []byte(minimalHTML), 0o644); err != nil {
		t.Fatal(err)
	}

	// routeEdit is the internal dispatch that runEdit will call; we test it
	// here so we can assert the artefact without blocking on a live server.
	srv, err := routeEdit(htmlPath, "")
	if err != nil {
		t.Fatalf("routeEdit(%q): %v", htmlPath, err)
	}
	_ = srv.Close()

	contentMD := filepath.Join(dir, ".galley", "pages", "review", "content.md")
	if _, err := os.Stat(contentMD); err != nil {
		t.Errorf("content.md not written by page mode: %v\nexpected path: %s", err, contentMD)
	}
}

// TestRunEditKeesMDRouteForMarkdown confirms the .md path is unchanged —
// routing must not accidentally redirect plain markdown files to NewEditPage.
func TestRunEditKeepsMDRouteForMarkdown(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	dir := t.TempDir()
	mdPath := filepath.Join(dir, "doc.md")
	if err := os.WriteFile(mdPath, []byte("# T\n\nProse.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	srv, err := routeEdit(mdPath, "")
	if err != nil {
		t.Fatalf("routeEdit(%q): %v", mdPath, err)
	}
	_ = srv.Close()

	// No .galley/pages directory must appear for a plain .md
	pagesDir := filepath.Join(dir, ".galley", "pages")
	if _, err := os.Stat(pagesDir); !os.IsNotExist(err) {
		t.Errorf(".galley/pages/ must not exist for a plain .md file; got: %v", err)
	}
}

// TestAgentPromptPageBackedContainsLayerWarning asserts the page-backed
// paragraph is appended when the doc lives under .galley/pages/.
func TestAgentPromptPageBackedContainsLayerWarning(t *testing.T) {
	doc := "/x/.galley/pages/index/content.md"
	got := agentPrompt(doc)
	want := "backed by an HTML page"
	if !strings.Contains(got, want) {
		t.Errorf("agentPrompt(%q) missing %q:\n%s", doc, want, got)
	}
}

// TestAgentPromptPlainMDHasNoPageWarning asserts the page paragraph is absent
// for a plain .md file.
func TestAgentPromptPlainMDHasNoPageWarning(t *testing.T) {
	doc := "/x/plan.md"
	got := agentPrompt(doc)
	if strings.Contains(got, "backed by an HTML page") {
		t.Errorf("agentPrompt(%q) should not contain page-backed paragraph:\n%s", doc, got)
	}
}

func TestRootWidensAMarkdownWorkspace(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	root := t.TempDir()
	sub := filepath.Join(root, "guide")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	mdPath := filepath.Join(sub, "doc.md")
	if err := os.WriteFile(mdPath, []byte("# T\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	srv, err := routeEdit(mdPath, root)
	if err != nil {
		t.Fatalf("--root on markdown: %v", err)
	}
	defer func() { _ = srv.Close() }()
	if srv.Root != root {
		t.Fatalf("root = %q, want %q", srv.Root, root)
	}
	plain, err := routeEdit(mdPath, "")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = plain.Close() }()
	if plain.Root != sub {
		t.Fatalf("default root = %q, want the document's directory %q", plain.Root, sub)
	}
	if _, err := routeEdit(mdPath, t.TempDir()); err == nil {
		t.Fatal("a root that does not contain the document was accepted")
	}
}
