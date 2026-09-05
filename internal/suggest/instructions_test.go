package suggest

import (
	"testing"

	"github.com/schuettc/galley/internal/docmodel"
)

func TestClearInstructionsLeavesCleanProse(t *testing.T) {
	d := docmodel.Doc{Blocks: []docmodel.Block{
		{Kind: docmodel.Paragraph, Inlines: []docmodel.Inline{{Text: "keep", Marks: []docmodel.Mark{{Kind: docmodel.Bold}, {Kind: docmodel.Highlight}}}}},
		{Kind: docmodel.Note, Inlines: []docmodel.Inline{{Text: "rewrite this"}}},
	}}
	got := ClearInstructions(d)
	if len(got.Blocks) != 1 || got.Blocks[0].Inlines[0].Text != "keep" ||
		len(got.Blocks[0].Inlines[0].Marks) != 1 || got.Blocks[0].Inlines[0].Marks[0].Kind != docmodel.Bold {
		t.Fatalf("cleared document = %#v", got)
	}
}
