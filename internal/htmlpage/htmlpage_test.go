package htmlpage

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestTemplateJSONRoundTrip(t *testing.T) {
	in := Template{
		Head: "<!doctype html><html><head></head><body>",
		Segments: []Segment{
			{Shell: "<nav>…</nav>"},
			{Slot: &Slot{Index: 0, Wrappers: []Wrapper{{Kind: "paragraph", Tag: "p", Attrs: ` class="eyebrow"`}}}},
		},
		Tail: "</body></html>",
	}
	b, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	var out Template
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(in, out) {
		t.Fatalf("round trip: got %#v", out)
	}
}
