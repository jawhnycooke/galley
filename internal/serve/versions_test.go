package serve

import (
	"testing"

	"github.com/schuettc/galley/internal/versions"
)

// The asks live on the revise round and the changes that answer them on the
// landed round whose Answers points back — so `answered` is only true when
// the two are read together.
func TestRoundViewCarriesAsksWithAnswered(t *testing.T) {
	revise := versions.Round{N: 2, Reason: versions.ReasonRevise,
		Asks: []versions.Ask{{Key: "cm-1", Text: "tighter"}, {Key: "cm-2", Text: "shorter"}},
	}
	landed := versions.Round{N: 3, Reason: versions.ReasonLanded, Answers: 2,
		Changes: []versions.Change{{Locator: "x", Answers: []string{"cm-2"}}},
	}
	rounds := []versions.Round{revise, landed}

	v := roundViewOf(revise, claimedAsks(rounds, revise.N))
	if len(v.Asks) != 2 || v.Asks[0].Key != "cm-1" || v.Asks[0].Answered || !v.Asks[1].Answered {
		t.Fatalf("asks = %+v", v.Asks)
	}
	if got := roundViewOf(revise, claimedAsks([]versions.Round{revise}, revise.N)); got.Asks[1].Answered {
		t.Fatalf("read off the revise round alone, nothing can be answered: %+v", got.Asks)
	}
}
