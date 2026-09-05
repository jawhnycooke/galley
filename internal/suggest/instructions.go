package suggest

import "github.com/schuettc/galley/internal/docmodel"

// ClearInstructions returns the clean document committed when the reviewer
// sends a round. Instruction text has already moved to the ledger; highlights
// and note blocks are working-copy affordances and never enter a version.
func ClearInstructions(d docmodel.Doc) docmodel.Doc {
	d.Blocks = clearInstructionBlocks(d.Blocks)
	return d
}

func clearInstructionBlocks(blocks []docmodel.Block) []docmodel.Block {
	out := make([]docmodel.Block, 0, len(blocks))
	for _, block := range blocks {
		if block.Kind == docmodel.Note {
			continue
		}
		for i := range block.Inlines {
			marks := block.Inlines[i].Marks[:0]
			for _, mark := range block.Inlines[i].Marks {
				if mark.Kind != docmodel.Highlight {
					marks = append(marks, mark)
				}
			}
			block.Inlines[i].Marks = marks
		}
		block.Children = clearInstructionBlocks(block.Children)
		out = append(out, block)
	}
	return out
}
