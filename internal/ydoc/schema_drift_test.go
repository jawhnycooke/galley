package ydoc_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// Every block kind ydoc can write into the shared fragment must be a node the
// browser's TipTap schema declares.
//
// This is not style. y-prosemirror's createNodeFromYElement calls
// schema.node(el.nodeName, …) and its catch DELETES the element from the Yjs
// document — an unknown node is not ignored, it is erased, broadcast, and
// projected to disk. docmodel.Note shipped on feat/anchors with no JS
// counterpart, so opening any document containing a block note destroyed it.
//
// The gate lives here rather than only in web/probe.mjs because the drift is
// introduced on the GO side, and a Go author adding a BlockKind should not have
// to remember that a JS file exists. It reads the kinds out of docmodel's own
// source rather than repeating them, so adding a constant is enough to fail
// this test — a hand-copied list would have to be updated to notice, which is
// exactly the step that gets skipped.
//
// What it checks is probe.mjs's FRAGMENT_NODES declaration, and the division of
// labour matters: this side proves the LIST names every kind Go writes;
// probe.mjs proves the editor's real, built schema has a node for every name in
// the list. Neither half alone would have caught the note — a text search for
// "'paragraph'" finds nothing either, because StarterKit registers most of
// these implicitly and they appear nowhere in web/ as literals.
func TestEveryBlockKindExistsInTheBrowserSchema(t *testing.T) {
	kinds := blockKindsFromSource(t)
	if len(kinds) < 5 {
		t.Fatalf("only found %v in docmodel — the constant scan is broken, not the schema", kinds)
	}
	declared := fragmentNodesFromProbe(t)

	for _, k := range kinds {
		if !declared[k] {
			t.Errorf("block kind %q is written into the fragment but is not in "+
				"web/probe.mjs's FRAGMENT_NODES — y-prosemirror will DELETE it from "+
				"the document and the next projection will write the deletion to disk", k)
		}
	}
	for name := range declared {
		if !contains(kinds, name) {
			t.Errorf("web/probe.mjs declares fragment node %q, which no docmodel.BlockKind "+
				"produces — the two lists have drifted", name)
		}
	}
}

func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

// blockKindsFromSource reads the string value of every BlockKind constant out
// of docmodel's source, so the gate cannot be satisfied by a stale copy.
func blockKindsFromSource(t *testing.T) []string {
	t.Helper()
	path := filepath.Join("..", "docmodel", "doc.go")
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, path, nil, 0)
	if err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}

	var out []string
	for _, d := range f.Decls {
		gd, ok := d.(*ast.GenDecl)
		if !ok || gd.Tok != token.CONST {
			continue
		}
		for _, spec := range gd.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			id, ok := vs.Type.(*ast.Ident)
			if !ok || id.Name != "BlockKind" {
				continue
			}
			for _, v := range vs.Values {
				lit, ok := v.(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					continue
				}
				s, err := strconv.Unquote(lit.Value)
				if err != nil {
					t.Fatalf("unquote %s: %v", lit.Value, err)
				}
				out = append(out, s)
			}
		}
	}
	sort.Strings(out)
	return out
}

var fragmentNodesDecl = regexp.MustCompile(`(?s)const FRAGMENT_NODES = \[(.*?)\]`)

// fragmentNodesFromProbe reads probe.mjs's FRAGMENT_NODES array. probe.mjs is
// where the list lives because that is the only place a Go-side name can be
// checked against the schema the browser actually builds.
func fragmentNodesFromProbe(t *testing.T) map[string]bool {
	t.Helper()
	path := filepath.Join("..", "..", "web", "probe.mjs")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	m := fragmentNodesDecl.FindSubmatch(raw)
	if m == nil {
		t.Fatalf("web/probe.mjs has no `const FRAGMENT_NODES = [ … ]` declaration — "+
			"the cross-language gate has no list to check against (%d bytes read)", len(raw))
	}
	out := map[string]bool{}
	for _, part := range strings.Split(string(m[1]), ",") {
		name := strings.Trim(strings.TrimSpace(part), `'"`)
		if name == "" || strings.HasPrefix(name, "//") {
			continue
		}
		out[name] = true
	}
	return out
}
