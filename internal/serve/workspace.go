package serve

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"path/filepath"
	"sort"
	"strings"

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

func (s *EditServer) listWorkspace() (WorkspaceView, error) {
	view := WorkspaceView{Root: s.Root, Docs: []WorkspaceDoc{}}
	current := s.documentPath()
	live := liveByKey()
	err := filepath.WalkDir(s.Root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // an unreadable subtree is not a reason to list nothing
		}
		name := d.Name()
		if d.IsDir() {
			if p != s.Root && (strings.HasPrefix(name, ".") || skippedDirs[name]) {
				return fs.SkipDir
			}
			return nil
		}
		kind := docKind(name)
		if kind == "" || strings.HasPrefix(name, ".") {
			return nil
		}
		if len(view.Docs) >= workspaceCap {
			view.Truncated = true
			return fs.SkipAll
		}
		rel, _ := filepath.Rel(s.Root, p)
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
