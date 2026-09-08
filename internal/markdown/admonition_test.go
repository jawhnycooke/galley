package markdown

import (
	"testing"

	"github.com/schuettc/galley/internal/docmodel"
)

func inlineText(s string) docmodel.Inline { return docmodel.Inline{Text: s} }

func adm(marker, typ, title string, body ...docmodel.Block) docmodel.Block {
	children := []docmodel.Block{{Kind: docmodel.AdmonitionTitle}}
	if title != "" {
		children[0].Inlines = []docmodel.Inline{inlineText(title)}
	}
	attrs := map[string]string{docmodel.MarkerAttr: marker}
	if typ != "" {
		attrs[docmodel.TypeAttr] = typ
	}
	return docmodel.Block{Kind: docmodel.Admonition, Attrs: attrs, Children: append(children, body...)}
}

func para(s string) docmodel.Block {
	return docmodel.Block{Kind: docmodel.Paragraph, Inlines: []docmodel.Inline{inlineText(s)}}
}

func TestParseAdmonitionHeader(t *testing.T) {
	cases := []struct {
		line               string
		marker, typ, title string
		ok                 bool
	}{
		{`!!! note "Title"`, "!!!", "note", "Title", true},
		{`!!! note`, "!!!", "note", "", true},
		{`??? tip "Hidden"`, "???", "tip", "Hidden", true},
		{`???+ tip "Shown"`, "???+", "tip", "Shown", true},
		{`=== ":material-cloud: NeonDB (Recommended)"`, "===", "", ":material-cloud: NeonDB (Recommended)", true},
		{`!!! check "Say \"hi\""`, "!!!", "check", `Say "hi"`, true},
		{`!!! note "Title"   `, "!!!", "note", "Title", true},
		{`===`, "", "", "", false},            // a setext underline
		{`=== not quoted`, "", "", "", false}, // a tab needs its quotes
		{`=== note "x"`, "", "", "", false},   // a tab has no type
		{`!!! "no type"`, "", "", "", false},  // an admonition needs a type
		{`!!!`, "", "", "", false},
		{`!!! note "Title" trailing`, "", "", "", false},
		{`a !!! note "Title"`, "", "", "", false},
		{`!!! note "a\\b"`, "!!!", "note", `a\b`, true},
		{`=== ""`, "===", "", "", true},
		{`!!! note "C:\path\to"`, "!!!", "note", `C:\path\to`, true}, // a lone backslash is literal
	}
	for _, c := range cases {
		marker, typ, title, ok := parseAdmonitionHeader([]byte(c.line))
		if ok != c.ok || marker != c.marker || typ != c.typ || title != c.title {
			t.Errorf("%q → (%q,%q,%q,%v), want (%q,%q,%q,%v)", c.line, marker, typ, title, ok, c.marker, c.typ, c.title, c.ok)
		}
	}
}

func TestParse_Admonitions(t *testing.T) {
	cases := []struct {
		name string
		src  string
		want []docmodel.Block
	}{
		{
			name: "one paragraph body",
			src:  "!!! check \"Checkpoint\"\n    Run it.\n",
			want: []docmodel.Block{adm("!!!", "check", "Checkpoint", para("Run it."))},
		},
		{
			name: "no title",
			src:  "!!! note\n    Body.\n",
			want: []docmodel.Block{adm("!!!", "note", "", para("Body."))},
		},
		{
			name: "empty body is refilled",
			src:  "!!! note \"Empty\"\n",
			want: []docmodel.Block{adm("!!!", "note", "Empty", docmodel.Block{Kind: docmodel.Paragraph})},
		},
		{
			name: "multi-block body with a blank line and a list",
			src:  "??? info \"More\"\n    First.\n\n    - one\n    - two\n",
			want: []docmodel.Block{adm("???", "info", "More",
				para("First."),
				docmodel.Block{Kind: docmodel.BulletList, Children: []docmodel.Block{
					{Kind: docmodel.ListItem, Children: []docmodel.Block{para("one")}},
					{Kind: docmodel.ListItem, Children: []docmodel.Block{para("two")}},
				}},
			)},
		},
		{
			name: "two adjacent tabs are siblings",
			src:  "=== \"A\"\n    a body\n\n=== \"B\"\n    b body\n",
			want: []docmodel.Block{adm("===", "", "A", para("a body")), adm("===", "", "B", para("b body"))},
		},
		{
			name: "a nested admonition",
			src:  "!!! note \"Outer\"\n    !!! tip \"Inner\"\n        deep\n",
			want: []docmodel.Block{adm("!!!", "note", "Outer", adm("!!!", "tip", "Inner", para("deep")))},
		},
		{
			name: "interrupts a paragraph",
			src:  "prose\n!!! note \"N\"\n    body\n",
			want: []docmodel.Block{para("prose"), adm("!!!", "note", "N", para("body"))},
		},
		{
			name: "an unindented line closes it",
			src:  "!!! note \"N\"\n    body\n\nafter\n",
			want: []docmodel.Block{adm("!!!", "note", "N", para("body")), para("after")},
		},
		{
			name: "a bare === under prose is still a setext heading",
			src:  "Title\n===\n",
			want: []docmodel.Block{{Kind: docmodel.Heading, Attrs: map[string]string{"level": "1"}, Inlines: []docmodel.Inline{inlineText("Title")}}},
		},
		{
			name: "inline markup in a body is parsed",
			src:  "!!! note \"N\"\n    a **bold** word\n",
			want: []docmodel.Block{adm("!!!", "note", "N", docmodel.Block{Kind: docmodel.Paragraph, Inlines: []docmodel.Inline{
				inlineText("a "),
				{Text: "bold", Marks: []docmodel.Mark{{Kind: docmodel.Bold}}},
				inlineText(" word"),
			}})},
		},
		{
			name: "a header inside a fence is code",
			src:  "```\n!!! note \"N\"\n```\n",
			want: []docmodel.Block{{Kind: docmodel.CodeBlock, Text: "!!! note \"N\"\n"}},
		},
		{
			name: "a header inside a blockquote is the quote's",
			src:  "> !!! note \"Q\"\n>     body\n",
			want: []docmodel.Block{{Kind: docmodel.Blockquote, Children: []docmodel.Block{adm("!!!", "note", "Q", para("body"))}}},
		},
		{
			name: "inside a list item",
			src:  "- item\n  !!! note \"In\"\n      body\n",
			want: []docmodel.Block{{Kind: docmodel.BulletList, Children: []docmodel.Block{
				{Kind: docmodel.ListItem, Children: []docmodel.Block{para("item"), adm("!!!", "note", "In", para("body"))}},
			}}},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc, _, err := Parse([]byte(c.src))
			if err != nil {
				t.Fatalf("Parse: %v", err)
			}
			if !docmodel.Equal(doc, docmodel.Doc{Blocks: c.want}) {
				t.Fatalf("got:\n%#v\nwant:\n%#v", doc.Blocks, c.want)
			}
		})
	}
}

func TestAdmonition_SoleCommentBodyStaysLegal(t *testing.T) {
	doc, comments, err := Parse([]byte("!!! note \"N\"\n    {>>a block note<<}\n"))
	if err != nil {
		t.Fatal(err)
	}
	if len(comments) != 0 {
		t.Fatalf("a standalone note is a Note block, not an inline comment: %v", comments)
	}
	b := doc.Blocks[0]
	if b.Kind != docmodel.Admonition || len(b.Children) != 2 || b.Children[0].Kind != docmodel.AdmonitionTitle || b.Children[1].Kind != docmodel.Note {
		t.Fatalf("got %#v", b)
	}
	if got := string(Serialize(doc)); got != "!!! note \"N\"\n    {>>a block note<<}\n" {
		t.Fatalf("got %q", got)
	}
}

func TestSerialize_Admonitions(t *testing.T) {
	cases := []struct {
		name string
		doc  []docmodel.Block
		want string
		// back is the shape the output reparses to, when that is not doc
		// itself — a hand-built admonition can lack the title child every
		// parse legalizes in.
		back []docmodel.Block
	}{
		{"header only", []docmodel.Block{adm("!!!", "warning", "Empty", docmodel.Block{Kind: docmodel.Paragraph})}, "!!! warning \"Empty\"\n", nil},
		{"no title", []docmodel.Block{adm("!!!", "note", "", para("Body."))}, "!!! note\n    Body.\n", nil},
		{"tab", []docmodel.Block{adm("===", "", "Docker", para("Body."))}, "=== \"Docker\"\n    Body.\n", nil},
		{"quote in title", []docmodel.Block{adm("!!!", "check", `Say "hi"`, para("Body."))}, "!!! check \"Say \\\"hi\\\"\"\n    Body.\n", nil},
		{"blank lines stay bare", []docmodel.Block{adm("!!!", "note", "N", para("One."), para("Two."))}, "!!! note \"N\"\n    One.\n\n    Two.\n", nil},
		{"followed by prose gets a blank line", []docmodel.Block{adm("!!!", "note", "N", para("Body.")), para("After.")}, "!!! note \"N\"\n    Body.\n\nAfter.\n", nil},
		{
			"titleless admonition followed by prose gets a blank line",
			[]docmodel.Block{
				{Kind: docmodel.Admonition, Attrs: map[string]string{docmodel.MarkerAttr: "!!!", docmodel.TypeAttr: "note"}, Children: []docmodel.Block{para("Body.")}},
				para("After."),
			},
			"!!! note\n    Body.\n\nAfter.\n",
			[]docmodel.Block{adm("!!!", "note", "", para("Body.")), para("After.")},
		},
		{
			// The pair that makes the start index load-bearing. Only a TIGHT
			// context asks needsBlankLine anything — at the top level every
			// join is loose already — and there a titleless admonition read as
			// "ends with nothing open" costs the blank line, which lets
			// "After." lazily continue the body paragraph it is meant to follow.
			"titleless admonition in a tight list item keeps its blank line",
			[]docmodel.Block{{Kind: docmodel.BulletList, Children: []docmodel.Block{
				{Kind: docmodel.ListItem, Children: []docmodel.Block{
					para("Item."),
					{Kind: docmodel.Admonition, Attrs: map[string]string{docmodel.MarkerAttr: "!!!", docmodel.TypeAttr: "note"}, Children: []docmodel.Block{para("Body.")}},
					para("After."),
				}},
			}}},
			"- Item.\n  !!! note\n      Body.\n\n  After.\n",
			[]docmodel.Block{{Kind: docmodel.BulletList, Children: []docmodel.Block{
				{Kind: docmodel.ListItem, Children: []docmodel.Block{
					para("Item."),
					adm("!!!", "note", "", para("Body.")),
					para("After."),
				}},
			}}},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := string(Serialize(docmodel.Doc{Blocks: c.doc}))
			if got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
			back, _, err := Parse([]byte(got))
			if err != nil {
				t.Fatalf("reparse: %v", err)
			}
			want := c.doc
			if c.back != nil {
				want = c.back
			}
			if !docmodel.Equal(back, docmodel.Doc{Blocks: want}) {
				t.Fatalf("did not reparse to itself:\n%#v", back.Blocks)
			}
		})
	}
}

// admonitionModel builds a raw docmodel.Block the way the CRDT bridge can —
// no parse ever produced it — so title and type can be anything, including
// the two shapes Critical 1/2 in the mkdocs-final-review named: empty on a
// marker that forbids it, or a title character that would otherwise break
// out of the header's quotes.
func admonitionModel(marker, typ, title string, body ...docmodel.Block) docmodel.Block {
	attrs := map[string]string{docmodel.MarkerAttr: marker}
	if typ != "" {
		attrs[docmodel.TypeAttr] = typ
	}
	titleChild := docmodel.Block{Kind: docmodel.AdmonitionTitle}
	if title != "" {
		titleChild.Inlines = []docmodel.Inline{inlineText(title)}
	}
	children := append([]docmodel.Block{titleChild}, body...)
	return docmodel.Block{Kind: docmodel.Admonition, Attrs: attrs, Children: children}
}

// TestSerialize_AdmonitionHostileModels is the test the review asked for
// (Important 3): every one of these models is a shape markdown source cannot
// express but the CRDT can hold — an editor clearing a tab's title, a fresh
// node still carrying TipTap's default empty type, a title that ends in the
// one character (`\`) that used to escape the closing quote instead of
// itself. Before the by-construction fix in renderAdmonition, the first two
// silently destroyed the admonition on the next parse (Critical 1) and the
// backslash case corrupted the body that followed it (Critical 2); this
// table is what proves the fix rather than just asserting it.
func TestSerialize_AdmonitionHostileModels(t *testing.T) {
	fence := docmodel.Block{Kind: docmodel.CodeBlock, Attrs: map[string]string{"language": "go"}, Text: "x := 1\n"}
	cases := []struct {
		name string
		doc  []docmodel.Block
	}{
		{"tab with empty title", []docmodel.Block{admonitionModel("===", "", "", para("Body."))}},
		{"admonition with empty type and a title", []docmodel.Block{admonitionModel("!!!", "", "T", para("Body."))}},
		{"admonition with empty type and empty title", []docmodel.Block{admonitionModel("!!!", "", "", para("Body."))}},
		{"title ending in a single backslash", []docmodel.Block{admonitionModel("!!!", "note", `a\`, para("Body."))}},
		{"title containing a backslash-quote", []docmodel.Block{admonitionModel("!!!", "note", `x\"y`, para("Body."))}},
		{"title containing a double backslash", []docmodel.Block{admonitionModel("!!!", "note", `x\\y`, para("Body."))}},
		{"title that is only whitespace", []docmodel.Block{admonitionModel("!!!", "note", "   ", para("Body."))}},
		{"collapsed admonition whose body ends in a fence", []docmodel.Block{admonitionModel("???+", "note", "T", para("Body."), fence)}},
		{"TipTap default pair", []docmodel.Block{admonitionModel("!!!", "note", "", docmodel.Block{Kind: docmodel.Paragraph})}},
		{"title with a lone backslash", []docmodel.Block{admonitionModel("!!!", "note", `C:\path\to`, para("Body."))}},
		{"a marker the grammar does not read", []docmodel.Block{admonitionModel("xyz", "note", "T", para("Body."))}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			out := Serialize(docmodel.Doc{Blocks: c.doc})
			back, _, err := Parse(out)
			if err != nil {
				t.Fatalf("reparse: %v", err)
			}
			if len(back.Blocks) != 1 || back.Blocks[0].Kind != docmodel.Admonition {
				t.Fatalf("Serialize(%q) = %q, reparsed to %#v (want exactly one Admonition)", c.name, out, back.Blocks)
			}
			gotBodyLen := len(back.Blocks[0].Children) - 1 // minus the title
			wantBodyLen := len(c.doc[0].Children) - 1
			if gotBodyLen != wantBodyLen {
				t.Fatalf("Serialize(%q) = %q, reparsed body has %d blocks, want %d", c.name, out, gotBodyLen, wantBodyLen)
			}
			// Byte-stable from the first write — for every case except the
			// whitespace-only title, where extractCriticBlocks' trimLineEdges
			// already treats an all-whitespace title exactly like an
			// all-whitespace paragraph and empties it on the FIRST parse,
			// before renderAdmonition ever sees it. That normalization is
			// pre-existing and orthogonal to Critical 1/2 (which are about a
			// header the parser rejects outright, not about content the
			// parser legitimately discards) — this table checks that it
			// converges rather than that it never happens.
			out2 := Serialize(back)
			if c.name != "title that is only whitespace" && string(out2) != string(out) {
				t.Fatalf("not byte-stable from the first write:\nfirst:  %q\nsecond: %q", out, out2)
			}
			back2, _, err := Parse(out2)
			if err != nil {
				t.Fatalf("re-reparse: %v", err)
			}
			if out3 := Serialize(back2); string(out3) != string(out2) {
				t.Fatalf("did not converge:\nsecond: %q\nthird:  %q", out2, out3)
			}
		})
	}
}

// A LONE BACKSLASH IN A SOURCE TITLE IS NOT REWRITTEN. escapeTitle doubles
// only the backslashes unescapeTitle would consume, so `C:\path` in a
// hand-written header is byte-identical after a parse and a write — the
// branch's headline invariant, which FuzzRoundTrip cannot see (it asserts
// convergence, not first-write identity). The trade is a `\\` in a source
// title, which reads as one backslash and is written back as one: SerializeOnto
// keeps an untouched block's own bytes regardless, and a lone backslash is
// the common case (paths), a doubled one the rare one.
func TestAdmonition_LoneBackslashTitleIsSourceStable(t *testing.T) {
	for _, src := range []string{
		"!!! note \"C:\\path\\to\"\n    Body.\n",
		"=== \"a\\b\"\n    Body.\n",
	} {
		doc, _, err := Parse([]byte(src))
		if err != nil {
			t.Fatalf("Parse(%q): %v", src, err)
		}
		if got := string(Serialize(doc)); got != src {
			t.Errorf("not source-stable:\n src: %q\n got: %q", src, got)
		}
	}
}
