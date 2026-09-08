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
