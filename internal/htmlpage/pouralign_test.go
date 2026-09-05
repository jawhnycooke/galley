package htmlpage

import (
	"strings"
	"testing"
)

// The muster #175 symptoms, inverted into gates: the identity pour (align.go)
// must keep every class with the block it belongs to across insert, reorder,
// and delete, and give a genuinely new block a sane wrapper — never slide a
// class onto the wrong block.

func poured(t *testing.T, src, find, repl string) string {
	t.Helper()
	ex, err := Extract([]byte(src))
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	md := strings.Replace(string(ex.Markdown), find, repl, 1)
	out, err := Render(ex.Template, []byte(md))
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	return string(out)
}

const twoClassed = `<!doctype html><html><head><title>x</title></head><body>
<section id="s"><div class="wrap">
<p class="lead">Lead sentence here.</p>
<p class="kicker">Kicker sentence here.</p>
</div></section>
</body></html>`

func TestPourInsertDoesNotStealClasses(t *testing.T) {
	got := poured(t, twoClassed, "Lead sentence here.\n", "Brand new intro line.\n\nLead sentence here.\n")
	if !strings.Contains(got, `<p class="lead">Lead sentence here.</p>`) {
		t.Errorf("the lead class did not stay with its sentence:\n%s", got)
	}
	if !strings.Contains(got, `<p class="kicker">Kicker sentence here.</p>`) {
		t.Errorf("the kicker class did not stay with its sentence:\n%s", got)
	}
	// The new line took neither class (the paragraphs disagree), rather than
	// stealing the lead's.
	if !strings.Contains(got, `<p>Brand new intro line.</p>`) {
		t.Errorf("the new line should be a bare <p>, not styled:\n%s", got)
	}
}

func TestPourReorderCarriesClasses(t *testing.T) {
	// Swap the two paragraphs' order in the markdown.
	ex, err := Extract([]byte(twoClassed))
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	md := strings.Replace(string(ex.Markdown),
		"Lead sentence here.\n\nKicker sentence here.\n",
		"Kicker sentence here.\n\nLead sentence here.\n", 1)
	out, err := Render(ex.Template, []byte(md))
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := string(out)
	// Each class travels with its own words even though their order flipped.
	if !strings.Contains(got, `<p class="kicker">Kicker sentence here.</p>`) ||
		!strings.Contains(got, `<p class="lead">Lead sentence here.</p>`) {
		t.Errorf("reorder did not carry classes with their blocks:\n%s", got)
	}
	if strings.Index(got, "Kicker sentence here.") > strings.Index(got, "Lead sentence here.") {
		t.Errorf("reorder was not honored:\n%s", got)
	}
}

func TestPourNewCodeInheritsSiblingClass(t *testing.T) {
	src := `<!doctype html><html><head><title>x</title></head><body>
<section id="s"><div class="wrap">
<pre class="code">first example</pre>
<pre class="code">second example</pre>
</div></section>
</body></html>`
	got := poured(t, src, "second example\n```\n", "second example\n```\n\n```\nthird example\n```\n")
	// All three code blocks carry .code — the new one inherited it from its
	// unanimous siblings.
	if n := strings.Count(got, `<pre class="code">`); n != 3 {
		t.Errorf("want 3 <pre class=\"code\">, got %d:\n%s", n, got)
	}
	if strings.Contains(got, "<pre>third example") {
		t.Errorf("the new code fence poured bare instead of inheriting .code:\n%s", got)
	}
}

func TestPourDeleteDropsWrapperKeepsSiblings(t *testing.T) {
	src := `<!doctype html><html><head><title>x</title></head><body>
<section id="s"><div class="wrap">
<p class="a">First para.</p>
<p class="b">Second para.</p>
<p class="c">Third para.</p>
</div></section>
</body></html>`
	// Delete the middle paragraph.
	got := poured(t, src, "Second para.\n\n", "")
	if !strings.Contains(got, `<p class="a">First para.</p>`) ||
		!strings.Contains(got, `<p class="c">Third para.</p>`) {
		t.Errorf("deleting the middle paragraph disturbed its siblings' classes:\n%s", got)
	}
	if strings.Contains(got, "Second para.") {
		t.Errorf("the deleted paragraph survived:\n%s", got)
	}
	if strings.Contains(got, `class="b"`) {
		t.Errorf("the deleted paragraph's class was reassigned to a sibling:\n%s", got)
	}
}

func TestPourIdempotentOnUnchanged(t *testing.T) {
	ex, err := Extract([]byte(twoClassed))
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	out, err := Render(ex.Template, ex.Markdown)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, `<p class="lead">Lead sentence here.</p>`) ||
		!strings.Contains(got, `<p class="kicker">Kicker sentence here.</p>`) {
		t.Errorf("an unchanged pour did not reproduce the classed paragraphs:\n%s", got)
	}
}
