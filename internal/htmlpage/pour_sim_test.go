package htmlpage

import (
	"fmt"
	"regexp"
	"strings"
	"testing"
)

// A page shaped like the channels.tools/docs page from muster #175: multiple
// <section>s, a nested .demo figure with .poster-todo + .demo-cap children, a
// .lead paragraph, and <pre class="code"> blocks.
const simPage = `<!doctype html><html><head><title>docs</title></head><body>
<header class="statusbar"><nav class="nav"><a href="/">home</a></nav></header>
<section id="protocol"><div class="wrap">
<p class="kicker">the protocol</p>
<h2>Protocol</h2>
<p class="lead">The protocol is a simple line-oriented handshake.</p>
<div class="demo">
<div class="poster-todo">screencast coming soon</div>
<div class="demo-cap">The reference server's handshake, step by step.</div>
</div>
<pre class="code">galley channel connect</pre>
</div></section>
<section id="reference"><div class="wrap">
<p class="kicker">the reference</p>
<h2>Reference</h2>
<p class="lead">Every message is one line of JSON.</p>
<pre class="code">{"type":"hello"}</pre>
</div></section>
</body></html>`

var tagClassRe = regexp.MustCompile(`<(section|div|p|h2|h3|pre|header|nav)( class="[^"]*")?( id="[^"]*")?[^>]*>`)

// skeleton is the ordered list of structural openings (tag + class + id) on a
// page — the thing that must survive a round untouched while only prose changes.
func skeleton(html string) []string {
	var out []string
	for _, m := range tagClassRe.FindAllStringSubmatch(html, -1) {
		out = append(out, strings.TrimSpace(m[1]+m[2]+m[3]))
	}
	return out
}

func eq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// roundTrip runs one full loop: extract the current html, apply the edit to the
// markdown, render back. Returns the new html and the extracted markdown.
func roundTrip(t *testing.T, html string, edit func(md string) string) (string, string) {
	t.Helper()
	ex, err := Extract([]byte(html))
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	md := string(ex.Markdown)
	if edit != nil {
		md = edit(md)
	}
	out, err := Render(ex.Template, []byte(md))
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	return string(out), md
}

// TestSimEditsPreserveStructure runs a sequence of realistic reviewer edits and
// checks, after each, that the structural skeleton is intact and the component
// classes survived — the whole of the #175 report, simulated.
func TestSimEditsPreserveStructure(t *testing.T) {
	base := simPage
	baseSkel := skeleton(base)
	fmt.Printf("BASE skeleton (%d structural tags):\n  %s\n\n", len(baseSkel), strings.Join(baseSkel, "\n  "))

	steps := []struct {
		name string
		edit func(string) string
		// wantSameSkeleton: the edit changes only prose, so structure must match base.
		wantSameSkeleton bool
		mustContain      []string
	}{
		{
			name: "edit the lead paragraph in place",
			edit: func(md string) string {
				return strings.Replace(md, "The protocol is a simple line-oriented handshake.", "The protocol is a simple, line-oriented handshake over stdio.", 1)
			},
			wantSameSkeleton: true,
			mustContain:      []string{`<p class="lead">The protocol is a simple, line-oriented handshake over stdio.</p>`, `<div class="demo-cap">`, `<pre class="code">galley channel connect`},
		},
		{
			name: "reword the demo caption (the '#175 caption became a kicker' case)",
			edit: func(md string) string {
				return strings.Replace(md, "The reference server's handshake, step by step.", "The reference server's handshake, annotated.", 1)
			},
			wantSameSkeleton: true,
			mustContain:      []string{`<div class="demo-cap">The reference server&#39;s handshake, annotated.</div>`},
		},
		{
			name: "add a new code fence in the reference section",
			edit: func(md string) string {
				return strings.Replace(md, "{\"type\":\"hello\"}\n```", "{\"type\":\"hello\"}\n```\n\n```\n{\"type\":\"bye\"}\n```", 1)
			},
			wantSameSkeleton: false,                                                        // one more <pre> is expected
			mustContain:      []string{`<pre class="code">{&#34;type&#34;:&#34;bye&#34;}`}, // NEW code inherits .code
		},
		{
			name:             "delete the poster-todo placeholder line",
			edit:             func(md string) string { return strings.Replace(md, "screencast coming soon\n\n", "", 1) },
			wantSameSkeleton: false,                              // one fewer div is expected
			mustContain:      []string{`<div class="demo-cap">`}, // sibling caption keeps its class
		},
	}

	html := base
	for _, s := range steps {
		out, md := roundTrip(t, html, s.edit)
		skel := skeleton(out)
		fmt.Printf("=== after: %s ===\n", s.name)
		fmt.Printf("markdown the reviewer sees:\n%s\n", indent(md))
		fmt.Printf("skeleton: %s\n", strings.Join(skel, " · "))
		same := eq(skel, baseSkel)
		if s.wantSameSkeleton && !same {
			t.Errorf("[%s] structure moved on a prose-only edit:\n base: %v\n now:  %v", s.name, baseSkel, skel)
		}
		for _, want := range s.mustContain {
			if !strings.Contains(out, want) {
				t.Errorf("[%s] missing %q in:\n%s", s.name, want, out)
			}
		}
		// no class ever migrated to the wrong tag
		if strings.Contains(out, `<h2 class=`) || strings.Contains(out, `<p class="poster-todo">`) {
			t.Errorf("[%s] a class migrated to the wrong element:\n%s", s.name, out)
		}
		fmt.Println()
		html = out // feed forward (the loop rides the template)
	}
}

// TestSimManyRoundsDoNotDegrade is the compounding check: the #175 page
// "degraded each round". Run 20 rounds of a small in-place wording edit through
// the full render→re-extract loop and assert the structural skeleton never
// drifts and the components never dissolve.
func TestSimManyRoundsDoNotDegrade(t *testing.T) {
	html := simPage
	baseSkel := skeleton(html)
	for i := 0; i < 20; i++ {
		want := fmt.Sprintf("Every message is one line of JSON (round %d).", i)
		prev := regexp.MustCompile(`Every message is one line of JSON[^<]*`).ReplaceAllString(html, "MARK")
		_ = prev
		out, _ := roundTrip(t, html, func(md string) string {
			return regexp.MustCompile(`Every message is one line of JSON[^.]*\.`).ReplaceAllString(md, want)
		})
		skel := skeleton(out)
		if !eq(skel, baseSkel) {
			t.Fatalf("round %d: structure drifted:\n base: %v\n now:  %v\n%s", i, baseSkel, skel, out)
		}
		for _, must := range []string{`<div class="demo">`, `<div class="poster-todo">`, `<div class="demo-cap">`, `<pre class="code">`, `<p class="lead">`, `<section id="protocol">`, `<section id="reference">`} {
			if !strings.Contains(out, must) {
				t.Fatalf("round %d: component %q dissolved:\n%s", i, must, out)
			}
		}
		html = out
	}
	fmt.Printf("20 rounds: skeleton stable at %d structural tags, all components intact.\n", len(baseSkel))
}

func indent(s string) string {
	return "  " + strings.ReplaceAll(strings.TrimRight(s, "\n"), "\n", "\n  ")
}
