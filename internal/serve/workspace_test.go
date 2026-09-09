package serve

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

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

// fakeSpawner stands in for `galley edit`: it advertises the document it was
// asked for, after a delay, from a process that is this test's own.
func fakeSpawner(t *testing.T, calls *int, url string, delay time.Duration) Spawner {
	return func(args []string) (*os.Process, error) {
		*calls++
		abs := args[1]
		go func() {
			time.Sleep(delay)
			_ = registry.Write(registry.Entry{URL: url, Room: "child-" + filepath.Base(abs), Page: docKey(abs), PID: os.Getpid()})
		}()
		return os.FindProcess(os.Getpid())
	}
}

func openDoc(t *testing.T, s *EditServer, rel string) (int, string) {
	t.Helper()
	rec := post(t, s.Handler(), "/_galley/workspace/open", map[string]any{"path": rel})
	return rec.Code, rec.Body.String()
}

func TestOpenAttachesToARunningEditor(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	root := t.TempDir()
	writeTree(t, root, map[string]string{"a.md": "# A\n", "b.md": "# B\n"})
	s := newEditServer(t, root, "a.md", "# A\n")
	defer func() { _ = s.Close() }()
	_ = registry.Write(registry.Entry{URL: "http://127.0.0.1:1234", Room: "b-room", Page: filepath.Join(root, "b.md"), PID: os.Getpid()})
	calls := 0
	s.Spawn = fakeSpawner(t, &calls, "http://127.0.0.1:9", 0)
	code, body := openDoc(t, s, "b.md")
	if code != http.StatusOK || !strings.Contains(body, "http://127.0.0.1:1234") || calls != 0 {
		t.Fatalf("attach: %d %s (spawned %d)", code, body, calls)
	}
}

func TestOpenSpawnsOnceAndWaitsForTheRegistry(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	root := t.TempDir()
	writeTree(t, root, map[string]string{"a.md": "# A\n", "sub/b.md": "# B\n"})
	s := newEditServer(t, root, "a.md", "# A\n")
	defer func() { _ = s.Close() }()
	s.ChildArgs = []string{"--on-revise", "true"}
	calls := 0
	var seen []string
	s.Spawn = func(args []string) (*os.Process, error) {
		seen = args
		return fakeSpawner(t, &calls, "http://127.0.0.1:4321", 300*time.Millisecond)(args)
	}
	var wg sync.WaitGroup
	codes := make([]int, 2)
	bodies := make([]string, 2)
	for i := range codes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes[i], bodies[i] = openDoc(t, s, "sub/b.md")
		}(i)
	}
	wg.Wait()
	for i := range codes {
		if codes[i] != http.StatusOK || !strings.Contains(bodies[i], "http://127.0.0.1:4321") {
			t.Fatalf("open %d: %d %s", i, codes[i], bodies[i])
		}
	}
	if calls != 1 {
		t.Fatalf("spawned %d times for one document", calls)
	}
	want := []string{"edit", filepath.Join(root, "sub", "b.md"), "--no-open", "--root", root, "--on-revise", "true"}
	if strings.Join(seen, " ") != strings.Join(want, " ") {
		t.Fatalf("args = %v, want %v", seen, want)
	}
}

func TestOpenRefusesWhatIsNotUnderTheRoot(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	root := t.TempDir()
	writeTree(t, root, map[string]string{
		"a.md":                       "# A\n",
		"notes.txt":                  "x",
		".galley/pages/x/content.md": "# X\n",
		"node_modules/p/x.md":        "# P\n",
		"sub/.draft.md":              "# Draft\n",
	})
	s := newEditServer(t, root, "a.md", "# A\n")
	defer func() { _ = s.Close() }()
	calls := 0
	s.Spawn = fakeSpawner(t, &calls, "http://127.0.0.1:9", 0)
	for _, rel := range []string{
		"../a.md", "/etc/passwd", "sub/../../a.md", "notes.txt", "missing.md", "",
		".galley/pages/x/content.md", "node_modules/p/x.md", "sub/.draft.md",
	} {
		if code, _ := openDoc(t, s, rel); code != http.StatusBadRequest {
			t.Errorf("open %q = %d, want 400", rel, code)
		}
	}
	if calls != 0 {
		t.Fatal("a refused open spawned something")
	}
}

func TestOpenTimesOutWhenTheChildNeverAdvertises(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	root := t.TempDir()
	writeTree(t, root, map[string]string{"a.md": "# A\n", "b.md": "# B\n"})
	s := newEditServer(t, root, "a.md", "# A\n")
	defer func() { _ = s.Close() }()
	s.spawnWait = 400 * time.Millisecond
	s.Spawn = func(args []string) (*os.Process, error) { return os.FindProcess(os.Getpid()) }
	if code, _ := openDoc(t, s, "b.md"); code != http.StatusGatewayTimeout {
		t.Fatalf("open = %d, want 504", code)
	}
}

func TestOpenRefusesASymlinkOutsideTheRoot(t *testing.T) {
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	root := t.TempDir()
	writeTree(t, root, map[string]string{"a.md": "# A\n"})
	outside := t.TempDir()
	writeTree(t, outside, map[string]string{"secret.md": "# S\n"})
	if err := os.Symlink(filepath.Join(outside, "secret.md"), filepath.Join(root, "escape.md")); err != nil {
		t.Fatal(err)
	}
	s := newEditServer(t, root, "a.md", "# A\n")
	defer func() { _ = s.Close() }()
	calls := 0
	s.Spawn = fakeSpawner(t, &calls, "http://127.0.0.1:9", 0)
	if code, _ := openDoc(t, s, "escape.md"); code != http.StatusBadRequest {
		t.Fatalf("open escape.md = %d, want 400", code)
	}
	if calls != 0 {
		t.Fatal("a refused open spawned something")
	}
}

// TestStopChildrenSignalsEveryChildBeforeWaitingOnAny reproduces the strand:
// two real child processes stand in for two editors this server started.
// stopChildren must SIGTERM both before waiting on either, so a child that
// were to ignore SIGTERM could never strand the other behind its own Wait.
func TestStopChildrenSignalsEveryChildBeforeWaitingOnAny(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("SIGTERM semantics differ on windows")
	}
	t.Setenv("GALLEY_LIVE_DIR", t.TempDir())
	s := newEditServer(t, t.TempDir(), "a.md", "# A\n")

	// THE FIRST CHILD IGNORES SIGTERM, which is the whole test: the old
	// one-loop stopChildren signalled it, blocked in Wait on it, and never
	// reached the second child at all. Two-phase, the second child is
	// signalled while the first is still sulking and dies at once.
	cmd1 := exec.Command("sh", "-c", "trap '' TERM; sleep 30")
	if err := cmd1.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cmd1.Process.Kill(); _, _ = cmd1.Process.Wait() })
	cmd2 := exec.Command("sleep", "30")
	if err := cmd2.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cmd2.Process.Kill(); _, _ = cmd2.Process.Wait() })
	// The shell has to have installed its trap before the signal lands.
	time.Sleep(200 * time.Millisecond)
	s.childMu.Lock()
	s.children = []*os.Process{cmd1.Process, cmd2.Process}
	s.childMu.Unlock()

	// THE TEST REAPS THE SECOND CHILD ITSELF. A signalled child is a zombie
	// until somebody waits on it, and kill(0) on a zombie still succeeds —
	// so "is it alive" cannot be asked with a signal while stopChildren is
	// blocked in Wait on the first child. Wait returning is the proof.
	reaped := make(chan struct{})
	go func() {
		_, _ = cmd2.Process.Wait()
		close(reaped)
	}()
	done := make(chan struct{})
	go func() {
		s.stopChildren()
		close(done)
	}()
	select {
	case <-reaped:
	case <-time.After(2 * time.Second):
		t.Fatal("the second child was never signalled — stopChildren waited on the first before signalling the rest")
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("stopChildren did not return within its own 3s bound")
	}
	if err := cmd1.Process.Signal(syscall.Signal(0)); err != nil {
		t.Fatal("the SIGTERM-ignoring child should still be alive — the fixture is not what the test thinks")
	}
}
