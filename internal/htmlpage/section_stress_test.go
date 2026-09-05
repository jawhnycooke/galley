package htmlpage

import (
	"fmt"
	"regexp"
	"strings"
	"testing"
)

// sectionBody returns the inner HTML of <section id="want">…</section>, so a
// test can assert content did not migrate ACROSS a section boundary (#175 #1).
func sectionBody(html, id string) string {
	re := regexp.MustCompile(`(?s)<section id="` + id + `">(.*?)</section>`)
	m := re.FindStringSubmatch(html)
	if m == nil {
		return ""
	}
	return m[1]
}

// TestSectionBleedStress hammers a two-section page: it edits, adds, and deletes
// blocks in BOTH sections across many rounds (feeding each render forward, so
// the template rides the loop), and after every round asserts that each
// section's marker text stayed inside its OWN section. This is the #175
// "content from #reference poured into #protocol" symptom, turned into a gate.
func TestSectionBleedStress(t *testing.T) {
	html := `<!doctype html><html><head><title>x</title></head><body>
<section id="protocol"><div class="wrap">
<h2>Protocol</h2>
<p class="lead">PROTO one.</p>
<p>PROTO two.</p>
<pre class="code">proto code</pre>
</div></section>
<section id="reference"><div class="wrap">
<h2>Reference</h2>
<p class="lead">REF one.</p>
<p>REF two.</p>
<pre class="code">ref code</pre>
</div></section>
</body></html>`

	edits := []func(string) string{
		func(md string) string { return strings.Replace(md, "PROTO one.", "PROTO one, revised.", 1) },
		func(md string) string { return strings.Replace(md, "REF two.", "REF two, revised, and longer now.", 1) },
		func(md string) string {
			return strings.Replace(md, "PROTO two.\n", "PROTO two.\n\nPROTO three, added.\n", 1)
		}, // add in section 1
		func(md string) string { return strings.Replace(md, "REF one.\n\n", "", 1) }, // delete in section 2
		func(md string) string { return strings.Replace(md, "ref code", "ref code v2", 1) },
		func(md string) string { return strings.Replace(md, "proto code", "proto code v2", 1) },
		func(md string) string {
			return strings.Replace(md, "REF two, revised, and longer now.", "REF two, revised again.", 1)
		},
		func(md string) string {
			return strings.Replace(md, "PROTO one, revised.", "PROTO one, revised twice.", 1)
		},
	}

	for i, edit := range edits {
		out, _ := roundTrip(t, html, edit)
		proto := sectionBody(out, "protocol")
		ref := sectionBody(out, "reference")
		if proto == "" || ref == "" {
			t.Fatalf("round %d: a section vanished:\n%s", i, out)
		}
		// Every PROTO* string must be in protocol and NOT in reference, and vice versa.
		if strings.Contains(ref, "PROTO") {
			t.Errorf("round %d: PROTO content bled into #reference:\n%s", i, ref)
		}
		if strings.Contains(proto, "REF") {
			t.Errorf("round %d: REF content bled into #protocol:\n%s", i, proto)
		}
		if strings.Contains(ref, "proto code") {
			t.Errorf("round %d: proto code bled into #reference:\n%s", i, ref)
		}
		if strings.Contains(proto, "ref code") {
			t.Errorf("round %d: ref code bled into #protocol:\n%s", i, proto)
		}
		html = out
	}
	fmt.Println("section-bleed stress: 8 mixed rounds, no content crossed a section boundary.")
}
