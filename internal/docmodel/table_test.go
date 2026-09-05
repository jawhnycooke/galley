package docmodel

import "testing"

// The kind string IS the element tag in the CRDT and IS the node name the
// browser's TipTap schema binds to. A kind spelled galley's own way rather
// than TipTap's does not fail — ygo accepts the write and the browser simply
// renders nothing, which is the silent desync CLAUDE.md warns about. So the
// spelling is pinned here, as a literal, rather than inferred anywhere.
func TestTableKindsAreTipTapNodeNames(t *testing.T) {
	for _, tc := range []struct {
		got  BlockKind
		want string
	}{
		{Table, "table"},
		{TableRow, "tableRow"},
		{TableCell, "tableCell"},
		{TableHeader, "tableHeader"},
	} {
		if string(tc.got) != tc.want {
			t.Errorf("kind = %q, want %q", tc.got, tc.want)
		}
	}
}

// A cell holds BLOCKS. TipTap's tableCell content is "block+", so a cell whose
// text hangs directly off Inlines cannot be built into a valid ProseMirror
// node — the same reason listItem carries Children. Walk has to reach through
// all three levels, because suggest.List, CommentOnRange and every path-
// addressed transform are built on it.
func TestWalkReachesInsideATableCell(t *testing.T) {
	d := Doc{Blocks: []Block{{
		Kind: Table,
		Children: []Block{{
			Kind: TableRow,
			Children: []Block{{
				Kind:     TableHeader,
				Attrs:    map[string]string{AlignAttr: "center"},
				Children: []Block{{Kind: Paragraph, Inlines: []Inline{{Text: "Phase"}}}},
			}},
		}},
	}}}

	var found []int
	Walk(d, func(path []int, b *Block) {
		if b.Kind == Paragraph && len(b.Inlines) == 1 && b.Inlines[0].Text == "Phase" {
			found = append([]int(nil), path...)
		}
	})
	if want := []int{0, 0, 0, 0}; len(found) != len(want) {
		t.Fatalf("cell paragraph path = %v, want %v", found, want)
	}
	for i, want := range []int{0, 0, 0, 0} {
		if found[i] != want {
			t.Fatalf("cell paragraph path = %v, want %v", found, []int{0, 0, 0, 0})
		}
	}
}

// Alignment is document content, not presentation: ":--" and "---" are
// different files. Equal has to see the difference or a transform that drops
// the attribute passes its own round-trip test.
func TestEqualSeesCellAlignment(t *testing.T) {
	cell := func(align string) Doc {
		b := Block{Kind: TableCell}
		if align != "" {
			b.Attrs = map[string]string{AlignAttr: align}
		}
		return Doc{Blocks: []Block{{Kind: Table, Children: []Block{{Kind: TableRow, Children: []Block{b}}}}}}
	}
	if Equal(cell("left"), cell("right")) {
		t.Error("Equal says a left-aligned column equals a right-aligned one")
	}
	if !Equal(cell("left"), cell("left")) {
		t.Error("Equal says a column does not equal itself")
	}
}
