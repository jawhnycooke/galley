package htmlpage

import (
	"strings"
	"testing"
)

// TestRowsBandIdentityRoundTripKeepsSpans pins the mangle behind the reviewer's
// repeated complaint that a styled band ("rendering of table is wrong again")
// breaks after a round — seen on the guide, docs, and buy pages.
//
// A ".rows"/".row" band carries its two columns as inline spans: a ".k" label
// and a ".d" description, styled entirely by the page CSS. Those spans have NO
// Markdown equivalent, so Extract flattens each row to a single text run and
// Render rebuilds the row as one flat <div class="row"> with the spans gone —
// even on an IDENTITY round-trip where the reviewer changed nothing. With the
// spans gone the band's grid CSS has nothing to lay out and it renders wrong.
//
// This test asserts the fix-agnostic outcome: an identity round-trip must not
// destroy the inner structure the band's styling depends on. It fails today —
// the span structure is lost — and is the regression target for whichever fix
// is chosen (treat a richly-structured styled band as verbatim shell, or
// preserve the inline spans through the round-trip).
func TestRowsBandIdentityRoundTripKeepsSpans(t *testing.T) {
	src := []byte(`<!doctype html><html><head><title>x</title></head><body>
<header><div class="wrap">
<h1>Buy</h1>
<div class="rows">
  <div class="row"><span class="k">checkout</span><span class="d">Opens with the first release.</span></div>
  <div class="row"><span class="k">platforms</span><span class="d">macOS and Linux.</span></div>
  <div class="row"><span class="k">refunds</span><span class="d">14 days, no questions.</span></div>
</div>
</div></header>
</body></html>`)

	ex, err := Extract(src)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}

	// Render the extracted markdown back with NO edits — the purest round-trip.
	out, err := Render(ex.Template, ex.Markdown)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := string(out)

	// The band's CSS lays out `.k` and `.d`; if a no-op round-trip drops them,
	// the styled band is broken for the reviewer whatever else survived.
	for _, want := range []string{`<span class="k">`, `<span class="d">`} {
		if !strings.Contains(got, want) {
			t.Errorf("identity round-trip dropped %s — the .rows band's inner\n"+
				"structure is gone, so the styled band renders wrong.\n\n=== rendered ===\n%s",
				want, got)
		}
	}

	// And the two columns must not be fused into one text run: "checkout" (the
	// label) and its description belong to different spans, never one blob.
	if strings.Contains(got, "checkout Opens with the first release.") {
		t.Errorf("the .k label and .d description were flattened into one run —\n"+
			"the two-column band collapsed to a single line.\n\n=== rendered ===\n%s", got)
	}
}
