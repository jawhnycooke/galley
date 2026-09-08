package ydoc_test

import (
	"testing"

	"github.com/reearth/ygo/crdt"

	"github.com/schuettc/galley/internal/docmodel"
	"github.com/schuettc/galley/internal/ydoc"
)

// AN ADMONITION IS A CONTAINER, AND ITS TITLE IS A CHILD. writeBlock writes a
// block as inlines OR children, never both — which is why the title is
// Children[0] and not an attribute. Both readers must hand back the same tree,
// attributes and all, and an EMPTY title (no inlines, no children) must come
// back as an empty title rather than vanish.
func admonitionModel() docmodel.Doc {
	return docmodel.Doc{Blocks: []docmodel.Block{
		{Kind: docmodel.Paragraph, Inlines: []docmodel.Inline{text("Before.")}},
		{
			Kind:  docmodel.Admonition,
			Attrs: map[string]string{docmodel.MarkerAttr: "!!!", docmodel.TypeAttr: "check"},
			Children: []docmodel.Block{
				{Kind: docmodel.AdmonitionTitle, Inlines: []docmodel.Inline{text("Checkpoint")}},
				{Kind: docmodel.Paragraph, Inlines: []docmodel.Inline{text("Run it.")}},
			},
		},
		{
			Kind:  docmodel.Admonition,
			Attrs: map[string]string{docmodel.MarkerAttr: "==="},
			Children: []docmodel.Block{
				{Kind: docmodel.AdmonitionTitle},
				{Kind: docmodel.Paragraph},
			},
		},
	}}
}

func TestAdmonitionSurvivesTheBridge(t *testing.T) {
	want := admonitionModel()
	got := roundTrip(t, want)
	if !docmodel.Equal(got, want) {
		t.Fatalf("admonition did not survive Load -> Read:\n got:  %#v\n want: %#v", got, want)
	}
	doc := crdt.New()
	ydoc.Load(doc, own(doc), want)
	live, err := ydoc.ReadLive(doc)
	if err != nil {
		t.Fatalf("ReadLive: %v", err)
	}
	if !docmodel.Equal(live, want) {
		t.Errorf("admonition did not survive Load -> ReadLive:\n got:  %#v\n want: %#v", live, want)
	}
}
