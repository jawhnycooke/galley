package serve

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/schuettc/galley/internal/registry"
	"github.com/schuettc/galley/internal/versions"
)

// THE DRAWER'S LISTING. One server still serves ONE document; what the
// workspace adds is knowing its neighbours. The listing is pure file reads —
// the versions index beside each document and the live registry — so it
// never needs a second server to answer, and a bad sidecar on one document
// costs that document its round count, never the listing.

// workspaceCap bounds the walk: a docs tree is hundreds of files, a monorepo
// root is not, and a drawer nobody can scroll is not a listing.
const workspaceCap = 2000

var skippedDirs = map[string]bool{"node_modules": true, "dist": true, "build": true, "vendor": true}

type WorkspaceLast struct {
	Reason  string `json:"reason"`
	At      int64  `json:"at"`
	Authors string `json:"authors"`
}

type WorkspaceDoc struct {
	Path    string         `json:"path"`
	Kind    string         `json:"kind"`
	Rounds  int            `json:"rounds"`
	Last    *WorkspaceLast `json:"last,omitempty"`
	URL     string         `json:"url,omitempty"`
	Current bool           `json:"current,omitempty"`
}

type WorkspaceView struct {
	Root      string         `json:"root"`
	Current   string         `json:"current"`
	Docs      []WorkspaceDoc `json:"docs"`
	Truncated bool           `json:"truncated"`
}

// listable is the walk's skip rules, restated as a predicate so the open
// endpoint can share them: any segment with a leading dot, or named in
// skippedDirs, makes the path unlisted, regardless of the walk's own
// early-exit for efficiency.
func listable(rel string) bool {
	for _, seg := range strings.Split(filepath.ToSlash(rel), "/") {
		if strings.HasPrefix(seg, ".") || skippedDirs[seg] {
			return false
		}
	}
	return true
}

// docKind is the listing's extension rule; "" means not listed.
func docKind(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".md":
		return "md"
	case ".html", ".htm":
		return "html"
	}
	return ""
}

// docKey is the path a document's rounds and registry entry are keyed by:
// the file itself for markdown, and for a page the derived document page
// mode serves and advertises (see newEditPage).
func docKey(abs string) string {
	if docKind(abs) == "html" {
		return filepath.Join(filepath.Dir(abs), ".galley", "pages", pageBase(abs), "content.md")
	}
	return abs
}

// SetRoot widens the workspace. The document must be under the new root.
func (s *EditServer) SetRoot(root string) error {
	abs, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	if !underDir(s.documentPath(), abs) {
		return fmt.Errorf("--root %q does not contain %s", root, s.documentPath())
	}
	s.Root = abs
	return nil
}

// documentPath is the file the reviewer named: the page in page mode, the
// markdown otherwise. MdPath is the SERVED document, which for a page is
// the derived content.md.
func (s *EditServer) documentPath() string {
	if s.pageMode {
		return s.pagePath
	}
	abs, err := filepath.Abs(s.MdPath)
	if err != nil {
		return s.MdPath
	}
	return abs
}

func underDir(p, dir string) bool {
	rel, err := filepath.Rel(dir, p)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

// Workspace exposes listWorkspace to callers outside the package, namely the
// CLI's startup line reporting the workspace's document count.
func (s *EditServer) Workspace() (WorkspaceView, error) { return s.listWorkspace() }

func (s *EditServer) listWorkspace() (WorkspaceView, error) {
	view := WorkspaceView{Root: s.Root, Docs: []WorkspaceDoc{}}
	current := s.documentPath()
	live := liveByKey()
	err := filepath.WalkDir(s.Root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			// AN UNREADABLE SUBTREE IS NOT A REASON TO LIST NOTHING. WalkDir
			// hands the error here and asks what to do; returning it would
			// abort the whole listing over one directory nobody can read, and
			// SkipDir on a non-directory entry would skip its siblings too. So
			// the entry is passed over and the walk goes on — deliberately the
			// shape nilerr flags.
			return nil //nolint:nilerr // see above
		}
		name := d.Name()
		if d.IsDir() {
			if p != s.Root && (strings.HasPrefix(name, ".") || skippedDirs[name]) {
				return fs.SkipDir
			}
			return nil
		}
		kind := docKind(name)
		if kind == "" {
			return nil
		}
		rel, _ := filepath.Rel(s.Root, p)
		if !listable(rel) {
			return nil
		}
		if len(view.Docs) >= workspaceCap {
			view.Truncated = true
			return fs.SkipAll
		}
		doc := WorkspaceDoc{Path: filepath.ToSlash(rel), Kind: kind, Current: p == current}
		key := docKey(p)
		if rounds, err := versions.Open(key).List(); err == nil && len(rounds) > 0 {
			last := rounds[len(rounds)-1]
			doc.Rounds = len(rounds)
			doc.Last = &WorkspaceLast{Reason: last.Reason, At: last.At.Unix(), Authors: strings.Join(last.Authors, ", ")}
		}
		doc.URL = live[key]
		if doc.URL == "" {
			if real, err := filepath.EvalSymlinks(key); err == nil {
				doc.URL = live[real]
			}
		}
		if doc.Current {
			view.Current = doc.Path
		}
		view.Docs = append(view.Docs, doc)
		return nil
	})
	sort.Slice(view.Docs, func(i, j int) bool { return view.Docs[i].Path < view.Docs[j].Path })
	return view, err
}

// liveByKey is the registry as a map from advertised document to URL. Dead
// PIDs are reaped by List itself, so a stale entry never becomes a live dot.
func liveByKey() map[string]string {
	out := map[string]string{}
	entries, err := registry.List()
	if err != nil {
		return out
	}
	for _, e := range entries {
		out[e.Page] = e.URL
	}
	return out
}

func (s *EditServer) handleWorkspace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "the workspace listing is read-only", http.StatusMethodNotAllowed)
		return
	}
	view, err := s.listWorkspace()
	if err != nil {
		http.Error(w, "could not list the workspace: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(view)
}

// Spawner starts a child `galley edit` for the given arguments, returning its
// process so this server can wait for it to advertise and, later, stop it.
type Spawner func(args []string) (*os.Process, error)

type openResult struct {
	url  string
	code int
	err  error
}

// THE WAY TO A NEIGHBOUR. If somebody is already serving it, that is the
// answer; otherwise this server starts a child editor for it and waits for
// the child to say where it is, through the same registry a channel reads.
// Two clicks on one row share one child: the second waits on the first's
// result rather than starting a second server on the same file.
func (s *EditServer) openWorkspaceDoc(rel string) openResult {
	abs, code, err := s.resolveWorkspacePath(rel)
	if err != nil {
		return openResult{code: code, err: err}
	}
	key := docKey(abs)
	if url := liveByKey()[key]; url != "" {
		return openResult{url: url, code: http.StatusOK}
	}
	if s.Spawn == nil {
		return openResult{code: http.StatusNotImplemented, err: fmt.Errorf("this editor was started without a spawner — run `galley edit %s` yourself", rel)}
	}
	s.childMu.Lock()
	ch, waiting := s.inflight[key]
	if !waiting {
		ch = make(chan openResult, 1)
		s.inflight[key] = ch
	}
	s.childMu.Unlock()
	if waiting {
		res := <-ch
		ch <- res // put it back for the next waiter
		return res
	}
	res := s.spawnAndWait(abs, key)
	s.childMu.Lock()
	delete(s.inflight, key)
	s.childMu.Unlock()
	ch <- res
	return res
}

func (s *EditServer) spawnAndWait(abs, key string) openResult {
	// DECISION: --root is the ONE flag, so an .html child inherits the whole
	// workspace as its preview's site root rather than just its own
	// directory — its preview can therefore reach assets anywhere under
	// s.Root, not only beside the page. Same-site-guarded and localhost-only;
	// accepted as the one-flag tradeoff rather than a second root concept.
	args := append([]string{"edit", abs, "--no-open", "--root", s.Root}, s.ChildArgs...)
	proc, err := s.Spawn(args)
	if err != nil {
		return openResult{code: http.StatusInternalServerError, err: fmt.Errorf("could not start an editor for %s: %w", filepath.Base(abs), err)}
	}
	s.childMu.Lock()
	s.children = append(s.children, proc)
	s.childMu.Unlock()
	deadline := time.Now().Add(s.spawnWait)
	for time.Now().Before(deadline) {
		if url := liveByKey()[key]; url != "" {
			return openResult{url: url, code: http.StatusOK}
		}
		time.Sleep(200 * time.Millisecond)
	}
	return openResult{code: http.StatusGatewayTimeout, err: fmt.Errorf("the editor for %s did not come up within %s", filepath.Base(abs), s.spawnWait)}
}

// resolveWorkspacePath is the containment check: relative, no `..`, under
// Root after cleaning and after resolving symlinks, a listed kind, a file.
func (s *EditServer) resolveWorkspacePath(rel string) (string, int, error) {
	bad := func(why string) (string, int, error) { return "", http.StatusBadRequest, fmt.Errorf("%s", why) }
	if rel == "" || filepath.IsAbs(rel) || strings.HasPrefix(rel, "/") {
		return bad("path must be relative to the workspace root")
	}
	for _, seg := range strings.Split(filepath.ToSlash(rel), "/") {
		if seg == ".." {
			return bad("path may not leave the workspace root")
		}
	}
	abs := filepath.Join(s.Root, filepath.FromSlash(rel))
	if !underDir(abs, s.Root) {
		return bad("path may not leave the workspace root")
	}
	if relClean, err := filepath.Rel(s.Root, abs); err != nil || !listable(relClean) {
		return bad("that document is not listed here")
	}
	// If the path is (or passes through) a symlink, its resolved target must
	// still be under the root — under the root's own resolved target when
	// that succeeds, or under the root literally otherwise.
	if real, err := filepath.EvalSymlinks(abs); err == nil {
		allowedRoot := s.Root
		if rootReal, err := filepath.EvalSymlinks(s.Root); err == nil {
			allowedRoot = rootReal
		}
		if !underDir(real, allowedRoot) {
			return bad("path resolves outside the workspace root")
		}
	}
	if docKind(abs) == "" {
		return bad("only .md and .html documents open here")
	}
	if st, err := os.Stat(abs); err != nil || !st.Mode().IsRegular() {
		return bad("no such document under the workspace root")
	}
	return abs, http.StatusOK, nil
}

func (s *EditServer) handleWorkspaceOpen(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Path string `json:"path"`
	}
	if !decode(w, r, &in) {
		return
	}
	res := s.openWorkspaceDoc(in.Path)
	if res.err != nil {
		http.Error(w, res.err.Error(), res.code)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"url": res.url})
}

// stopChildren is Close's share of the drawer: SIGTERM to every editor this
// one started (each projects and withdraws itself on the way down), and a
// bounded wait so a stuck child cannot hold Ctrl-C hostage.
func (s *EditServer) stopChildren() {
	s.childMu.Lock()
	children := s.children
	s.children = nil
	s.childMu.Unlock()
	if len(children) == 0 {
		return
	}
	done := make(chan struct{})
	go func() {
		for _, p := range children {
			if p.Pid == os.Getpid() {
				continue // a test's stand-in
			}
			_ = p.Signal(syscall.SIGTERM)
		}
		for _, p := range children {
			if p.Pid == os.Getpid() {
				continue // a test's stand-in
			}
			_, _ = p.Wait()
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
	}
}
