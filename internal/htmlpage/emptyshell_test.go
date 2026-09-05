package htmlpage

import (
	"strings"
	"testing"
)

// TestPruneEmptiedGridCell is galley-edits friction #2: when the reviewer
// deletes a block's whole content in content.md, the .html kept an empty grid
// cell (<div class="tg"></div>). Render now prunes the container the emptied
// slot bracketed, while leaving its filled sibling and the id'd landmark around
// it standing.
func TestPruneEmptiedGridCell(t *testing.T) {
	src := []byte(`<!doctype html><html><head><title>x</title></head><body>
<section id="agents"><div class="wrap">
<h2>Use the agent you already have.</h2>
<div class="tg"><h3>the channel</h3><p>MCP server that delivers each Revise.</p></div>
<div class="tg"><h3>a shell loop</h3><p>An agent runs galley wait.</p></div>
</div></section>
</body></html>`)
	ex, err := Extract(src)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}

	// Delete the first .tg's whole content (h3 + p) from the markdown.
	md := strings.Replace(string(ex.Markdown),
		"### the channel\n\nMCP server that delivers each Revise.\n\n", "", 1)
	out, err := Render(ex.Template, []byte(md))
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := string(out)

	if strings.Contains(got, `<div class="tg"></div>`) {
		t.Errorf("empty grid cell was not pruned:\n%s", got)
	}
	if strings.Count(got, `class="tg"`) != 1 {
		t.Errorf("want exactly one .tg left (the filled sibling), got:\n%s", got)
	}
	if !strings.Contains(got, "a shell loop") {
		t.Errorf("the filled sibling cell was lost:\n%s", got)
	}
	if !strings.Contains(got, `<section id="agents">`) {
		t.Errorf("the id'd landmark section was pruned — anchors would 404:\n%s", got)
	}
}

// TestPruneKeepsIdContainer: an emptied container that carries an id is a
// landmark or anchor target and is kept standing even when empty, because a
// link elsewhere on the site may point at it.
func TestPruneKeepsIdContainer(t *testing.T) {
	src := []byte(`<!doctype html><html><head><title>x</title></head><body>
<main><div id="keepme" class="panel"><p>delete me</p></div></main>
</body></html>`)
	ex, err := Extract(src)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	md := strings.Replace(string(ex.Markdown), "delete me", "", 1)
	out, err := Render(ex.Template, []byte(md))
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !strings.Contains(string(out), `id="keepme"`) {
		t.Errorf("id'd container was pruned:\n%s", out)
	}
}

// TestPruneLeavesUnchangedPourIdentical is the idempotence guard: a pour of the
// original markdown, unchanged, peels nothing — so a decorative always-empty
// element (page furniture that lives wholly inside shell) survives untouched,
// and the pruning pass is invisible when no slot was emptied.
func TestPruneLeavesUnchangedPourIdentical(t *testing.T) {
	src := []byte(`<!doctype html><html><head><title>x</title></head><body>
<header role="banner"><span class="lamp"></span></header>
<section><div class="tg"><h3>the channel</h3><p>real prose here.</p></div></section>
</body></html>`)
	ex, err := Extract(src)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	out, err := Render(ex.Template, ex.Markdown)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, `<span class="lamp"></span>`) {
		t.Errorf("a decorative always-empty element was pruned on an unchanged pour:\n%s", got)
	}
	if !strings.Contains(got, `<div class="tg"><h3>the channel</h3>`) {
		t.Errorf("an unchanged, filled container was disturbed:\n%s", got)
	}
}
