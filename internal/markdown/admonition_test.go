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
