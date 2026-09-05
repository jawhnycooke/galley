package serve

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/schuettc/galley/internal/review"
)

// jsonPost builds the request every legitimate caller of a mutating endpoint
// makes: POST, application/json, no Origin (the CLI's shape). Anything less is
// refused by serve.guard — see csrf_test.go.
func jsonPost(path, body string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	return r
}

// mustAppend writes through the server, which is the path that also broadcasts
// — the same one the agent's reply takes.
func mustAppend(t *testing.T, s *Server, key, heading, author, text string) {
	t.Helper()
	if err := s.Append(key, heading, author, text, time.Now()); err != nil {
		t.Fatal(err)
	}
}

func newTestServer(t *testing.T, page string) *Server {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "review.html")
	if err := os.WriteFile(path, []byte(page), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := New(path, "")
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestInjectGoesBeforeClosingBody(t *testing.T) {
	out := string(Inject([]byte("<body><section><h2>One</h2></section></body>")))
	script := strings.Index(out, "<script")
	closing := strings.Index(out, "</body>")
	if script < 0 {
		t.Fatal("overlay not injected")
	}
	if script > closing {
		t.Fatalf("overlay injected after </body>: script=%d body=%d", script, closing)
	}
}

func TestInjectUsesTheLastClosingBody(t *testing.T) {
	// A page that talks about HTML must not have the overlay spliced into its
	// own example markup.
	page := "<body><pre>&lt;/body&gt;</pre><p></BODY >"
	out := string(Inject([]byte(page)))
	if strings.Index(out, "<script") > strings.LastIndex(out, "</BODY >") {
		t.Fatal("overlay was not placed before the final closing body tag")
	}
}

func TestInjectAppendsWhenThereIsNoBodyTag(t *testing.T) {
	out := string(Inject([]byte("<section><h2>One</h2></section>")))
	if !strings.Contains(out, "<script") {
		t.Fatal("overlay not appended to a body-less page")
	}
}

func TestInjectCarriesTheWasmLoader(t *testing.T) {
	// The overlay is inert without Go's wasm loader; a page served without the
	// tag would fail silently in the browser.
	out := string(Inject([]byte("<body></body>")))
	if !strings.Contains(out, "/_galley/wasm_exec.js") {
		t.Fatal("injected overlay does not load wasm_exec.js")
	}
}

func TestMissingCommentFileIsNotAnError(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	f, err := Load(s.CommentsPath)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(f.Threads) != 0 {
		t.Fatalf("want no threads, got %d", len(f.Threads))
	}
}

func TestEditsReachDiskAsAProjection(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	mustAppend(t, s, "01-shape", "01 Shape", review.AuthorCourt, "the split is right")
	if err := s.Export(); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(s.CommentsPath)
	if err != nil {
		t.Fatalf("projection: %v", err)
	}
	if !bytes.Contains(raw, []byte("the split is right")) {
		t.Fatalf("projection missing the comment: %s", raw)
	}

	f, err := Load(s.CommentsPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(f.Threads) != 1 || f.Threads[0].Comment() != "the split is right" {
		t.Fatalf("projection lost the thread: %+v", f.Threads)
	}
	// The flat view is what casual readers and older tooling see.
	if len(f.Comments) != 1 || f.Comments[0].Text != "the split is right" {
		t.Fatalf("flat view wrong: %+v", f.Comments)
	}
}

// TestExportSurvivesACorruptSidecar guards against a regression: Export used
// to Load the existing sidecar and merge onto it, so a sidecar that fails to
// parse — a git merge conflict landed in a committed, "git-friendly" file is
// a realistic route — made Export fail entirely. On this path (Server serves
// HTML review pages, whose sidecars never carry a Suggestions block) the
// merge buys nothing, and the failure mode is real: replies kept answering
// HTTP 200 while the debounced projection silently died, and Ctrl-C's final
// export returned a JSON error and lost every thread from the session. Export
// must self-heal by overwriting a corrupt sidecar, the way it always did.
func TestExportSurvivesACorruptSidecar(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	mustAppend(t, s, "k", "H", review.AuthorCourt, "must not be lost")

	// Simulate corruption landing on disk after the server already started —
	// New() only reads the sidecar once, at startup.
	if err := os.WriteFile(s.CommentsPath, []byte("<<<<<<< HEAD\nnot json\n=======\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := s.Export(); err != nil {
		t.Fatalf("export refused to overwrite a corrupt sidecar: %v", err)
	}

	f, err := Load(s.CommentsPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(f.Threads) != 1 || f.Threads[0].Comment() != "must not be lost" {
		t.Fatalf("export lost the session's thread: %+v", f.Threads)
	}
}

func TestAPreviousSessionIsReplayedAtStartup(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	mustAppend(t, s, "k", "H", review.AuthorCourt, "survives a restart")
	if err := s.Export(); err != nil {
		t.Fatal(err)
	}

	restarted, err := New(s.PagePath, s.CommentsPath)
	if err != nil {
		t.Fatal(err)
	}
	got := review.Read(restarted.Doc())
	if len(got) != 1 || got[0].Comment() != "survives a restart" {
		t.Fatalf("startup replay lost the comment: %+v", got)
	}
}

func TestReplyEndpointAppendsToTheThread(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	mustAppend(t, s, "k", "H", review.AuthorCourt, "why?")
	h := s.Handler()

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, jsonPost("/_galley/reply", `{"key":"k","text":"because the binary must stand alone"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("reply: got %d, body %s", rec.Code, rec.Body.String())
	}

	got := review.Read(s.Doc())[0]
	if len(got.Entries) != 2 {
		t.Fatalf("want 2 entries, got %d", len(got.Entries))
	}
	if got.Entries[1].Author != review.AuthorAgent {
		t.Fatalf("reply attributed to %q", got.Entries[1].Author)
	}
	// A reply must not become the reviewer's comment.
	if got.Comment() != "why?" {
		t.Fatalf("comment drifted to %q", got.Comment())
	}
}

func TestReplyRejectsAnEmptyBody(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, jsonPost("/_galley/reply", `{"key":"k","text":"   "}`))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestResolveEndpoint(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	mustAppend(t, s, "k", "H", review.AuthorCourt, "look")
	h := s.Handler()

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, jsonPost("/_galley/resolve", `{"key":"k","resolved":true}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("resolve: got %d", rec.Code)
	}
	if !review.Read(s.Doc())[0].Resolved {
		t.Fatal("thread did not resolve")
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, jsonPost("/_galley/resolve", `{"key":"missing","resolved":true}`))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 for an unknown section, got %d", rec.Code)
	}
}

func TestRootServesTheInjectedPage(t *testing.T) {
	s := newTestServer(t, "<body><section><h2>One</h2></section></body>")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "_galley") {
		t.Fatal("served page carries no overlay")
	}
}

func TestWasmLoaderIsAlwaysServed(t *testing.T) {
	// wasm_exec.js is committed, so it is served from any checkout.
	s := newTestServer(t, "<body></body>")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/wasm_exec.js", nil))
	if rec.Code != http.StatusOK || rec.Body.Len() == 0 {
		t.Fatalf("wasm_exec.js not served: %d, %d bytes", rec.Code, rec.Body.Len())
	}
	if got := rec.Header().Get("Content-Type"); got != "application/javascript; charset=utf-8" {
		t.Fatalf("served as %q", got)
	}
}

func TestFaviconIsAlwaysServed(t *testing.T) {
	// Committed, like wasm_exec.js — never built, so it is served from any
	// checkout, including one where `just build`/`just assets` never ran.
	s := newTestServer(t, "<body></body>")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/favicon.svg", nil))
	if rec.Code != http.StatusOK || rec.Body.Len() == 0 {
		t.Fatalf("favicon.svg not served: %d, %d bytes", rec.Code, rec.Body.Len())
	}
	if got := rec.Header().Get("Content-Type"); got != "image/svg+xml" {
		t.Fatalf("served as %q, want image/svg+xml", got)
	}
}

func TestWasmClientIsServedOrExplainsItself(t *testing.T) {
	// galley.wasm is BUILT, not committed — `just build` compiles it first. Both
	// states are real and the contract covers both: when it is there it must be
	// served as application/wasm, because instantiateStreaming refuses anything
	// else; when it is not, the response must say what to run rather than
	// leaving a bare 404 for someone to debug in a browser console.
	s := newTestServer(t, "<body></body>")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/galley.wasm", nil))

	switch rec.Code {
	case http.StatusOK:
		if rec.Body.Len() == 0 {
			t.Fatal("wasm client served empty")
		}
		if got := rec.Header().Get("Content-Type"); got != "application/wasm" {
			t.Fatalf("wasm client served as %q; instantiateStreaming will refuse it", got)
		}
	case http.StatusNotFound:
		if !strings.Contains(rec.Body.String(), "just build") {
			t.Fatalf("a missing wasm client must say how to build it, got: %s", rec.Body.String())
		}
	default:
		t.Fatalf("unexpected status %d", rec.Code)
	}
}

func TestRoomIsThePageBasename(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	if s.Room != "review" {
		t.Fatalf("room = %q", s.Room)
	}
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/room", nil))
	var out struct {
		Room string `json:"room"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Room != "review" {
		t.Fatalf("advertised room = %q", out.Room)
	}
}

func TestRevChangesWhenThePageIsRegenerated(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	h := s.Handler()

	rev := func() int64 {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/_galley/rev", nil))
		var out struct {
			Rev int64 `json:"rev"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out.Rev
	}

	before := rev()
	if err := os.WriteFile(s.PagePath, []byte("<body>changed</body>"), 0o644); err != nil {
		t.Fatal(err)
	}
	later := time.Now().Add(time.Second)
	if err := os.Chtimes(s.PagePath, later, later); err != nil {
		t.Fatal(err)
	}
	if rev() == before {
		t.Fatal("rev did not change after the page was rewritten")
	}
}

func TestRuntimeAdvertisementRoundTrip(t *testing.T) {
	// `galley reply` has to find a running server without being handed a port.
	s := newTestServer(t, "<body></body>")
	if _, ok := FindRuntime(s.PagePath); ok {
		t.Fatal("found a runtime before one was announced")
	}
	if err := s.Announce("http://127.0.0.1:9999"); err != nil {
		t.Fatal(err)
	}
	rt, ok := FindRuntime(s.PagePath)
	if !ok || rt.URL != "http://127.0.0.1:9999" || rt.Room != "review" {
		t.Fatalf("runtime wrong: %+v ok=%v", rt, ok)
	}
	s.Withdraw()
	if _, ok := FindRuntime(s.PagePath); ok {
		t.Fatal("runtime survived withdrawal")
	}
}

func TestNotifierFiresOnceCommentsSettle(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	marker := filepath.Join(filepath.Dir(s.PagePath), "fired")
	s.Notify = &Notifier{
		Command: "echo fired >> " + marker,
		Quiet:   40 * time.Millisecond,
	}
	defer s.Notify.Stop()

	// Three edits in quick succession must produce one notification, not three:
	// the reviewer is typing, and each keystroke should reset the clock.
	for _, text := range []string{"a", "ab", "abc"} {
		mustAppend(t, s, "k", "H", review.AuthorCourt, text)
	}
	waitFor(t, marker, 1)
	// waitFor only proves at least one fired. The claim in the name is that
	// three edits produce EXACTLY one, so give the other two a generous window
	// to show up and then count.
	time.Sleep(200 * time.Millisecond)
	if got := countLines(t, marker); got != 1 {
		t.Fatalf("three quick edits fired %d notifications, want exactly 1", got)
	}
}

func TestNotifierStaysQuietWhenNothingChanged(t *testing.T) {
	s := newTestServer(t, "<body></body>")
	marker := filepath.Join(filepath.Dir(s.PagePath), "fired")
	s.Notify = &Notifier{
		Command: "echo fired >> " + marker,
		Quiet:   30 * time.Millisecond,
	}
	defer s.Notify.Stop()

	mustAppend(t, s, "k", "H", review.AuthorCourt, "settled")
	waitFor(t, marker, 1)

	// Re-notifying on identical content — a reviewer who typed and undid —
	// must not wake anyone a second time.
	s.Notify.Touch(Fingerprint(review.Read(s.Doc())))
	time.Sleep(120 * time.Millisecond)
	if got := countLines(t, marker); got != 1 {
		t.Fatalf("want 1 notification, got %d", got)
	}
}

func TestSeedSuppressesTheStartupReplay(t *testing.T) {
	// Replaying a previous session's comments must not read as a burst of new
	// ones the moment the server comes up.
	s := newTestServer(t, "<body></body>")
	marker := filepath.Join(filepath.Dir(s.PagePath), "fired")
	mustAppend(t, s, "k", "H", review.AuthorCourt, "from last time")

	s.Notify = &Notifier{Command: "echo fired >> " + marker, Quiet: 20 * time.Millisecond}
	defer s.Notify.Stop()
	s.Notify.Seed(Fingerprint(review.Read(s.Doc())))

	s.Notify.Touch(Fingerprint(review.Read(s.Doc())))
	time.Sleep(100 * time.Millisecond)
	if got := countLines(t, marker); got != 0 {
		t.Fatalf("startup replay woke someone: %d notifications", got)
	}
}

// waitFor blocks until at least want notifications have landed. AT LEAST: a
// caller asserting an exact count must count again after a settling window of
// its own — see TestNotifierFiresOnceCommentsSettle.
func waitFor(t *testing.T, marker string, want int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if countLines(t, marker) >= want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("notification never fired (%s)", marker)
}

func countLines(t *testing.T, path string) int {
	t.Helper()
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return 0
	}
	if err != nil {
		t.Fatal(err)
	}
	return len(bytes.Fields(raw))
}

func TestDefaultCommentsPathSitsBesideThePage(t *testing.T) {
	if got := DefaultCommentsPath("/tmp/x/review.html"); got != "/tmp/x/review.comments.json" {
		t.Fatalf("got %s", got)
	}
	if got := DefaultRuntimePath("/tmp/x/review.html"); got != "/tmp/x/review.serve.json" {
		t.Fatalf("got %s", got)
	}
}
