package markdown

import (
	"strings"
	"testing"
)

// TestARefusalNamesWhatTheAuthorTyped is the finding: goldmark's internal AST
// kind names were shipped to a reviewer's terminal.
//
// Measured on the binary 2026-08-23: `<https://example.com>` refused with
// "AutoLink not supported (line 1)" and `[foo]: /url` with
// "LinkReferenceDefinition not supported (line 3)". Neither name appears
// anywhere in either file, or in any document galley ships. A refusal is read
// by somebody who has to change the file.
func TestARefusalNamesWhatTheAuthorTyped(t *testing.T) {
	for _, c := range []struct {
		name, src string
		wants     []string
		forbids   []string
	}{
		{
			name:    "autolink",
			src:     "A link <https://example.com> inline.\n",
			wants:   []string{"<https://example.com>", "[https://example.com](https://example.com)", "line 1"},
			forbids: []string{"AutoLink"},
		},
		{
			name:    "reference-style link",
			src:     "See [foo] above.\n\n[foo]: /url\n",
			wants:   []string{"[foo]: /url", "[text](/url)", "line 3"},
			forbids: []string{"LinkReferenceDefinition"},
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, _, err := Parse([]byte(c.src))
			if err == nil {
				t.Fatalf("no refusal at all — the construct is modelled now, and this test needs deleting rather than fixing")
			}
			got := err.Error()
			for _, w := range c.wants {
				if !strings.Contains(got, w) {
					t.Errorf("the refusal does not say %q: %s", w, got)
				}
			}
			for _, f := range c.forbids {
				if strings.Contains(got, f) {
					t.Errorf("the refusal leaks goldmark's internal AST kind %q, which appears nowhere in the author's file: %s", f, got)
				}
			}
		})
	}
}

// TestTheRefusalsAlreadyInTheAuthorsVoiceAreUnCHANGED guards the half a rewrite
// like this usually breaks: four refusals were already good, and they are not
// in the map.
func TestTheRefusalsAlreadyInTheAuthorsVoiceAreUnchanged(t *testing.T) {
	for src, want := range map[string]string{
		"Text\n\n<div>raw</div>\n":       "raw HTML not supported",
		"Body[^1]\n\n[^1]: note\n":       "footnote not supported",
		"> [!NOTE]\n> A callout.\n":      "> [!NOTE] callout not supported",
		"Apple\n: A fruit that grows.\n": "definition list not supported",
	} {
		_, _, err := Parse([]byte(src))
		if err == nil {
			t.Errorf("no refusal for %q", src)
			continue
		}
		if !strings.Contains(err.Error(), want) {
			t.Errorf("want %q, got %q", want, err.Error())
		}
	}
}

// TestAnUnnamedConstructKeepsItsKind holds the fallback honest. A construct
// nobody has written a sentence for yet must still be greppable by whoever
// writes it — "something on line 4" is worse than a name, even an internal one.
func TestAnUnnamedConstructKeepsItsKind(t *testing.T) {
	if _, ok := refusals["RawHTML"]; ok {
		t.Fatal("RawHTML has its own arm and must not be in the map too")
	}
	// The map is the exception list, not the mechanism: everything absent from
	// it still refuses, with a line number.
	if len(refusals) == 0 {
		t.Fatal("the map is empty — the refusals under test have been removed")
	}
}

// TestAnEmailAutolinkIsNotCalledAURL. `<court@example.com>` was refused with
// "autolinks like <https://example.com> are not supported — write the URL
// inline as [https://example.com](https://example.com)": a construct the author
// did not write, and advice that does not apply to the one they did. goldmark
// distinguishes the two; only the refusal did not ask.
func TestAnEmailAutolinkIsNotCalledAURL(t *testing.T) {
	_, _, err := Parse([]byte("Email me at <court@example.com> please.\n"))
	if err == nil {
		t.Fatal("an email autolink was accepted — this test needs deleting rather than fixing")
	}
	got := err.Error()
	if !strings.Contains(got, "mailto:") || !strings.Contains(got, "name@example.com") {
		t.Errorf("the refusal does not tell an author what to write instead: %s", got)
	}
	if strings.Contains(got, "https://example.com") {
		t.Errorf("the refusal names a URL rewrite for an EMAIL address: %s", got)
	}
}
