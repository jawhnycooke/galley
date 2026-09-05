package suggest

import (
	"testing"

	"github.com/schuettc/galley/internal/docmodel"
)

func bulkDoc(t *testing.T) docmodel.Doc {
	t.Helper()
	at := "2026-08-07T00:00:00Z"
	mark := func(k docmodel.MarkKind) []docmodel.Mark {
		return []docmodel.Mark{{Kind: k, Attrs: map[string]string{"author": "agent", "at": at}}}
	}
	return docmodel.Doc{Blocks: []docmodel.Block{{
		Kind: docmodel.Paragraph,
		Inlines: []docmodel.Inline{
			{Text: "keep "},
			{Text: "added", Marks: mark(docmodel.Ins)},
			{Text: " "},
			{Text: "struck", Marks: mark(docmodel.Del)},
			{Text: " "},
			{Text: "noted", Marks: mark(docmodel.Highlight)},
		},
	}}}
}

// THREADS ARE UNTOUCHED. A thread is resolved, never accepted — the bulk verbs
// in the census strip decide suggestions, and a reviewer clearing six edits must
// not silently close a conversation they have not read.
func TestDecideAllLeavesThreadsAlone(t *testing.T) {
	out, n := DecideAll(bulkDoc(t), true)
	if n != 2 {
		t.Fatalf("decided %d, want 2 (the insert and the delete)", n)
	}
	left := List(out)
	if len(left) != 1 {
		t.Fatalf("want 1 pending left, got %d (%+v)", len(left), left)
	}
	if left[0].Kind != KindComment || left[0].Text != "noted" {
		t.Errorf("the surviving pending item is %+v, want the comment highlight", left[0])
	}
}

// Accepting all means what accepting one means, applied to each: the insertion
// keeps its text and loses its mark, the deletion's text goes.
func TestDecideAllAcceptAppliesEachDecision(t *testing.T) {
	out, _ := DecideAll(bulkDoc(t), true)
	text := plainText(out.Blocks[0].Inlines)
	if text != "keep added  noted" {
		t.Errorf("accept-all produced %q", text)
	}
}

// And rejecting all is the mirror: the insertion's text goes, the deletion's
// stays.
func TestDecideAllRejectAppliesEachDecision(t *testing.T) {
	out, _ := DecideAll(bulkDoc(t), false)
	text := plainText(out.Blocks[0].Inlines)
	if text != "keep  struck noted" {
		t.Errorf("reject-all produced %q", text)
	}
}

func TestDecideAllOnASettledDocumentDecidesNothing(t *testing.T) {
	d := docmodel.Doc{Blocks: []docmodel.Block{{
		Kind: docmodel.Paragraph, Inlines: []docmodel.Inline{{Text: "nothing pending"}},
	}}}
	out, n := DecideAll(d, true)
	if n != 0 || len(List(out)) != 0 {
		t.Errorf("decided %d on a settled document", n)
	}
}
