package ondisk

import (
	"errors"
	"strings"
	"testing"
)

type sample struct {
	V    int            `json:"v"`
	Name string         `json:"name"`
	Kids []sample       `json:"kids,omitempty"`
	Meta map[string]int `json:"meta,omitempty"`
}

func TestStrictRefusesAKeyItDoesNotKnow(t *testing.T) {
	var s sample
	if err := Strict([]byte(`{"v":1,"name":"a"}`), &s); err != nil {
		t.Fatalf("a known shape must decode: %v", err)
	}
	err := Strict([]byte(`{"v":1,"nmae":"a"}`), &s)
	if err == nil {
		t.Fatal("a renamed key decoded in silence — that is the whole bug")
	}
	if !strings.Contains(err.Error(), "nmae") {
		t.Fatalf("the refusal must name the key it did not know, got %v", err)
	}
}

func TestFutureTreatsAnAbsentVersionAsTheFirstGeneration(t *testing.T) {
	if Future(Legacy, 1) {
		t.Fatal("a record written before the field existed must not read as newer than this build")
	}
	if Future(1, 1) {
		t.Fatal("this build's own generation is not the future")
	}
	if !Future(2, 1) {
		t.Fatal("a newer generation must be recognised as one")
	}
}

func TestNewerCarriesTheSentinelAndTheRemedy(t *testing.T) {
	err := Newer("the widget", 4, 1, "delete it and reopen")
	if !errors.Is(err, ErrFuture) {
		t.Fatal("a caller must be able to branch on the condition without matching prose")
	}
	for _, want := range []string{"the widget", "v4", "v1", "delete it and reopen"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("refusal %q is missing %q", err, want)
		}
	}
}

// Keys is the check the tolerant formats have INSTEAD of a strict decoder, so
// the one thing it must never do is confuse a nested field name for a
// top-level one — that would let a rename hide behind a same-named key one
// level down.
func TestKeysReportsTheTopLevelOnly(t *testing.T) {
	got, err := Keys(sample{V: 1, Name: "a", Kids: []sample{{V: 1, Name: "b"}}, Meta: map[string]int{"name": 2}})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"v", "name", "kids", "meta"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("Keys = %v, want %v", got, want)
	}
}
