package htmlpage

import (
	"strings"
	"testing"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

func bodyNode() *html.Node {
	return &html.Node{Type: html.ElementNode, DataAtom: atom.Body, Data: "body"}
}

func firstElement(nodes []*html.Node) *html.Node {
	for _, n := range nodes {
		if n.Type == html.ElementNode {
			return n
		}
	}
	return nil
}

// TestIsChrome locks the chrome predicate: navigation landmarks and control
// strips are shell-whole; anything carrying block prose is not.
func TestIsChrome(t *testing.T) {
	cases := []struct {
		name, frag string
		want       bool
	}{
		// (a) landmarks by tag
		{"nav", `<nav class="toc"><a href="#top">galley</a><a href="#for">what it's for</a></nav>`, true},
		{"footer", `<footer><p>© galley</p></footer>`, true},
		// (a) landmarks by role — even on a generic tag, even carrying prose
		{"role navigation", `<div role="navigation"><a href="/">home</a></div>`, true},
		{"role banner", `<header role="banner"><p>a banner with prose</p></header>`, true},
		{"role contentinfo", `<div role="contentinfo"><p>site info</p></div>`, true},
		// (b) the statusbar shape: brand link, nav, label span, button, no prose
		{"statusbar control strip", `<div class="statusbar">` +
			`<a class="sb-brand" href="/"><b>galley</b></a>` +
			`<nav class="sb-nav"><a href="/buy/">license</a></nav>` +
			`<span class="sb-meta">local · fair core</span>` +
			`<button class="theme-toggle">theme</button>` +
			`</div>`, true},
		// THE HAZARD: the hero is a <header> without a banner role holding the
		// page's headline and intro prose. It must never be chrome.
		{"hero header with prose", `<header class="hero" id="top">` +
			`<p class="eyebrow">A document two parties revise in rounds</p>` +
			`<h1 class="lede">Edit the draft.</h1>` +
			`<div class="cta"><a class="btn" href="/x">Ask for a build →</a></div>` +
			`</header>`, false},
		// a label/value row: text, no interactive element → still Pass A prose
		{"row of spans", `<div class="row"><span class="k">REVISE</span><span class="v">Pressing Revise</span></div>`, false},
		// block prose plus a link-button: the block-prose test protects it
		{"prose with a button link", `<div class="card"><p>Buy a license.</p><a class="btn" href="/buy">Buy →</a></div>`, false},
		// a paragraph carrying a link is prose, not a control strip
		{"paragraph with a link", `<p>See the <a href="/docs">docs</a>.</p>`, false},
		// a list of links is block prose (ul), so not a control strip
		{"list of links", `<ul><li><a href="/a">a</a></li></ul>`, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			nodes, err := html.ParseFragment(strings.NewReader(c.frag), bodyNode())
			if err != nil {
				t.Fatal(err)
			}
			n := firstElement(nodes)
			if n == nil {
				t.Fatal("no element node parsed")
			}
			if got := isChrome(n); got != c.want {
				t.Errorf("isChrome = %v, want %v", got, c.want)
			}
		})
	}
}

func TestContentBlock(t *testing.T) {
	cases := []struct {
		name, frag string
		kind       string
		ok         bool
	}{
		{"plain p", `<p>hello <em>world</em></p>`, "paragraph", true},
		{"classed p is still content", `<p class="eyebrow">A document</p>`, "paragraph", true},
		{"link and code", `<p>run <code>galley edit</code>, see <a href="/docs">docs</a></p>`, "paragraph", true},
		// a span is a transparent inline wrapper: its prose is content.
		{"spanned p", `<p class="sub">the <span class="k">galley</span> cli <span>ships</span></p>`, "paragraph", true},
		{"span with strong", `<p>a <span><strong>b</strong> c</span></p>`, "paragraph", true},
		// a span holding a non-inline child (br) still fails. A <div> can't
		// nest in <p>, so the parser hoists it out; <br> stays inside the span
		// and is the honest way to exercise a non-inline span child.
		{"span with br", `<p>a <span>b<br>c</span></p>`, "", false},
		{"br makes shell", `<p>one<br>two</p>`, "", false},
		{"heading", `<h2 id="rounds">The round</h2>`, "heading", true},
		{"list of plain items", `<ul><li>one</li><li>two <strong>bold</strong></li></ul>`, "bulletList", true},
		{"list with spanned item", `<ul><li>a <span class="k">lit</span></li></ul>`, "bulletList", true},
		// a styled .k/.v band is NOT prose: its columns are classed sibling
		// spans markdown cannot say, so it is shelled verbatim (Option A) rather
		// than flattened into run-on text. An unclassed-span row still becomes a
		// paragraph — see TestExtractGenericContainerAsParagraph.
		{"classed span band is shell", `<div class="row"><span class="k">REVISE</span><span class="v">Pressing Revise</span></div>`, "", false},
		// an empty layout div is NOT content
		{"empty div", `<div class="tg"></div>`, "", false},
		// a whitespace-only div is NOT content
		{"blank div", "<div>\n   \n</div>", "", false},
		// a div wrapping block children stays a container, not a paragraph
		{"div of divs", `<div><div>a</div><div>b</div></div>`, "", false},
		// a <pre> is an editable code block, a leaf whose text is its content
		{"pre is code", "<pre>$ galley edit\ndocument x</pre>", "codeBlock", true},
		// inner spans are flattened to text; it is still a code block
		{"pre with spans", `<pre><span class="k">galley</span> edit</pre>`, "codeBlock", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			nodes, err := html.ParseFragment(strings.NewReader(c.frag), bodyNode())
			if err != nil {
				t.Fatal(err)
			}
			n := firstElement(nodes)
			if n == nil {
				t.Fatal("no element node parsed")
			}
			kind, ok := contentBlock(n)
			if kind != c.kind || ok != c.ok {
				t.Errorf("contentBlock = (%q, %v), want (%q, %v)", kind, ok, c.kind, c.ok)
			}
		})
	}
}
