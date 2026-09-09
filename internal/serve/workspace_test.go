package serve

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/schuettc/galley/internal/registry"
)

func getJSON(t *testing.T, h http.Handler, path string, v any) int {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	if rec.Code == http.StatusOK {
		if err := json.Unmarshal(rec.Body.Bytes(), v); err != nil {
			t.Fatalf("%s: %v\n%s", path, err, rec.Body.String())
		}
	}
	return rec.Code
}

func writeTree(t *testing.T, root string, files map[string]string) {
	t.Helper()
	for rel, body := range files {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestWorkspaceListsDocumentsUnderTheRoot(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	root := t.TempDir()
	writeTree(t, root, map[string]string{
		"guide/getting-started.md": "# G\n",
		"guide/reference.md":       "# R\n",
		"index.html":               "<html><body><p>x</p></body></html>",
		"notes.TXT":                "no",
		".hidden/secret.md":        "# no\n",
		"node_modules/pkg/x.md":    "# no\n",
		"dist/out.md":              "# no\n",
		"guide/.draft.md":          "# no\n",
		"UPPER.MD":                 "# yes\n",
	})
	s := newEditServer(t, filepath.Join(root, "guide"), "getting-started.md", "# G\n")
	defer func() { _ = s.Close() }()
	if err := s.SetRoot(root); err != nil {
		t.Fatal(err)
	}
	var v WorkspaceView
	if code := getJSON(t, s.Handler(), "/_galley/workspace", &v); code != http.StatusOK {
		t.Fatalf("workspace = %d", code)
	}
	if v.Root != root || v.Truncated {
		t.Fatalf("root/truncated = %q/%v", v.Root, v.Truncated)
	}
	got := []string{}
	for _, d := range v.Docs {
		got = append(got, d.Path+":"+d.Kind)
	}
	want := []string{"UPPER.MD:md", "guide/getting-started.md:md", "guide/reference.md:md", "index.html:html"}
	if len(got) != len(want) {
		t.Fatalf("docs = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("docs = %v, want %v", got, want)
		}
	}
	if v.Current != "guide/getting-started.md" || !v.Docs[1].Current || v.Docs[0].Current {
		t.Fatalf("current = %q; flags %v %v", v.Current, v.Docs[0].Current, v.Docs[1].Current)
	}
	if v.Docs[1].Rounds != 1 || v.Docs[1].Last == nil || v.Docs[1].Last.Reason != "opened" {
		t.Fatalf("the served document has the opening round: %+v", v.Docs[1])
	}
	if v.Docs[2].Rounds != 0 || v.Docs[2].Last != nil || v.Docs[2].URL != "" {
		t.Fatalf("an untouched document is untouched: %+v", v.Docs[2])
	}
}

func TestWorkspaceShowsLiveEditorsFromTheRegistry(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	root := t.TempDir()
	writeTree(t, root, map[string]string{"a.md": "# A\n", "b.md": "# B\n", "p.html": "<html><body><p>x</p></body></html>"})
	s := newEditServer(t, root, "a.md", "# A\n")
	defer func() { _ = s.Close() }()
	if err := registry.Write(registry.Entry{URL: "http://127.0.0.1:1234", Room: "b-room", Page: filepath.Join(root, "b.md"), PID: os.Getpid()}); err != nil {
		t.Fatal(err)
	}
	if err := registry.Write(registry.Entry{URL: "http://127.0.0.1:1235", Room: "p-room", Page: docKey(filepath.Join(root, "p.html")), PID: os.Getpid()}); err != nil {
		t.Fatal(err)
	}
	var v WorkspaceView
	getJSON(t, s.Handler(), "/_galley/workspace", &v)
	byPath := map[string]WorkspaceDoc{}
	for _, d := range v.Docs {
		byPath[d.Path] = d
	}
	if byPath["b.md"].URL != "http://127.0.0.1:1234" {
		t.Fatalf("b.md url = %q", byPath["b.md"].URL)
	}
	if byPath["p.html"].URL != "http://127.0.0.1:1235" {
		t.Fatalf("a page matches by its derived document: %+v", byPath["p.html"])
	}
}

func TestWorkspaceIsCappedAndSaysSo(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	root := t.TempDir()
	files := map[string]string{}
	for i := 0; i < workspaceCap+5; i++ {
		files[filepath.Join("many", "d"+strconv.Itoa(i)+".md")] = "# d\n"
	}
	writeTree(t, root, files)
	s := newEditServer(t, root, "index.md", "# I\n")
	defer func() { _ = s.Close() }()
	var v WorkspaceView
	getJSON(t, s.Handler(), "/_galley/workspace", &v)
	if !v.Truncated || len(v.Docs) != workspaceCap {
		t.Fatalf("truncated=%v docs=%d", v.Truncated, len(v.Docs))
	}
}

func TestSetRootRefusesADocumentOutsideIt(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	s := newEditServer(t, t.TempDir(), "a.md", "# A\n")
	defer func() { _ = s.Close() }()
	if err := s.SetRoot(t.TempDir()); err == nil {
		t.Fatal("a root that does not contain the document was accepted")
	}
	if s.Root != filepath.Dir(s.MdPath) {
		t.Fatalf("default root = %q, want the document's directory", s.Root)
	}
}
