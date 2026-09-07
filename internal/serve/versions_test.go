package serve

import (
	"testing"

	"github.com/schuettc/galley/internal/versions"
)

func TestRoundViewCarriesAsksWithAnswered(t *testing.T) {
	r := versions.Round{N: 3, Reason: versions.ReasonLanded,
		Asks:    []versions.Ask{{Key: "cm-1", Text: "tighter"}, {Key: "cm-2", Text: "shorter"}},
		Changes: []versions.Change{{Locator: "x", Answers: []string{"cm-2"}}},
	}
	v := roundViewOf(r) // the existing builder; rename to match
	if len(v.Asks) != 2 || v.Asks[0].Key != "cm-1" || v.Asks[0].Answered || !v.Asks[1].Answered {
		t.Fatalf("asks = %+v", v.Asks)
	}
}
