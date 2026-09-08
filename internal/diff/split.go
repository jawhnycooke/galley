package diff

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/schuettc/galley/internal/markdown"
)

// split.go is the SENTENCE-SPLITTING RULE from the rounds-and-versions spec,
// and every clause in it was measured rather than reasoned. See
// docs/superpowers/specs/2026-08-16-rounds-and-versions.md.
//
// Blocks first: a sentence never crosses one. A heading is one unit. A table
// row and a code line are each the sentence of their block — that alone took
// the worst unit in the corpus from 5,054 words to 213. Code spans, link
// destinations, CriticMarkup and ellipses are masked. Closing marks travel with
// the terminator INCLUDING markdown emphasis, which was the single largest
// splitter defect measured (CLAUDE.md's worst entry, 26 fragments down to 7).

// Kind names what a block is. A boundary is not a block: it is the sentinel
// unit that sits between them — see Units.
type Kind string

const (
	KindPara       Kind = "para"
	KindHeading    Kind = "heading"
	KindCode       Kind = "code"
	KindTable      Kind = "table"
	KindMath       Kind = "math"
	KindRule       Kind = "rule"
	KindFrontM     Kind = "frontmatter"
	KindListItem   Kind = "listitem"
	KindQuote      Kind = "quote"
	KindAdmonition Kind = "admonition"
	KindBoundary   Kind = "boundary"
)

// Atomic reports whether a block's content is NOT PROSE — code, a table,
// display math, or front matter. Nothing inside one is ever word-diffed: it
// has no sentences, only lines, and a word-diff of a code line paints half an identifier.
func (k Kind) Atomic() bool {
	return k == KindCode || k == KindTable || k == KindMath || k == KindFrontM
}

// Block is one container a sentence may never cross.
type Block struct {
	Kind Kind
	Text string
}

var (
	reFence    = regexp.MustCompile("^(```|~~~)")
	reHeading  = regexp.MustCompile(`^#{1,6}\s`)
	reListItem = regexp.MustCompile(`^\s*([-*+]|\d+[.)])\s+`)
	reQuote    = regexp.MustCompile(`^\s*>`)
	reTable    = regexp.MustCompile(`^\s*\|`)
	reMath     = regexp.MustCompile(`^\s*\$\$\s*$`)
	reRule     = regexp.MustCompile(`^\s*(\*\s*){3,}$|^\s*(-\s*){3,}$|^\s*(_\s*){3,}$`)
	// A MkDocs admonition or tab HEADER. The body under it is ordinary prose,
	// indented, and falls through to the arms below; only the header line is
	// its own block, one unit, like a heading. The grammar is
	// markdown.parseAdmonitionHeader's REGEX, loosened by leading indent AND
	// by dropping the two marker-specific rules the Go parser checks after
	// its match (a tab needs its quotes; an admonition needs a type word) —
	// this is a diff view, not the parser, so a near-miss header like
	// `=== note "x"` or a bare `!!! ` becomes its own block here while the
	// parser would call it prose. The cost is only block granularity in a
	// version diff, never bytes: it does not affect what Serialize writes.
	reAdmonition = regexp.MustCompile(`^\s*(!!!|\?\?\?\+?|===)[ \t]+(?:[A-Za-z][A-Za-z0-9_-]*(?:[ \t]+|$))?(?:"(?:[^"\\]|\\.)*")?[ \t]*$`)
)

// Blocks turns markdown source into the blocks a sentence may not cross.
//
// It is deliberately NOT markdown.Parse. This splitter answers one question —
// where may a sentence boundary fall — over the bytes of a version file, and it
// must give the same answer for a version written by any hand, including one
// galley never opened. markdown.Parse builds a document model, refuses four
// dialects it cannot review, and is the input to a serializer whose round trip
// is a property under test; making the diff depend on it would put "can galley
// open this" in front of "can the reviewer read what changed", and a version is
// a record, not a document under review.
//
// FRONT MATTER IS PEELED OFF FIRST, AND IT IS THE ONE PLACE THIS SPLITTER
// DEFERS TO ANOTHER PACKAGE. Without this the opening "---" matches reRule and
// the YAML under it is swept into a paragraph — line breaks flattened to
// spaces, the closing "---" swallowed as the paragraph's last word. That is
// cosmetic in a diff and destructive in `revertChange`, which REBUILDS the
// document by joining these blocks: it wrote the flattened paragraph back to
// the author's file and the front matter was gone.
//
// `markdown.SplitFrontMatter` is a byte scanner, not `markdown.Parse` — it
// decodes nothing and refuses no dialect, so the doctrine above holds. Sharing
// it is the point: two spellings of "where does the front matter end" is
// exactly the disagreement that corrupted the file.
func Blocks(src string) []Block {
	var out []Block
	if raw, rest := markdown.SplitFrontMatter([]byte(src)); raw != nil {
		out = append(out, Block{KindFrontM, strings.TrimRight(string(raw), "\n")})
		src = string(rest)
	}
	lines := strings.Split(src, "\n")
	for i := 0; i < len(lines); {
		ln := lines[i]
		if strings.TrimSpace(ln) == "" {
			i++
			continue
		}
		if m := reFence.FindStringSubmatch(ln); m != nil {
			mark := m[1]
			j := i + 1
			for j < len(lines) && !strings.HasPrefix(lines[j], mark) {
				j++
			}
			end := j + 1
			if end > len(lines) {
				end = len(lines)
			}
			out = append(out, Block{KindCode, strings.Join(lines[i:end], "\n")})
			i = j + 1
			continue
		}
		if reMath.MatchString(ln) {
			j := i + 1
			for j < len(lines) && !reMath.MatchString(lines[j]) {
				j++
			}
			end := j + 1
			if end > len(lines) {
				end = len(lines)
			}
			out = append(out, Block{KindMath, strings.Join(lines[i:end], "\n")})
			i = j + 1
			continue
		}
		if reTable.MatchString(ln) {
			j := i
			for j < len(lines) && reTable.MatchString(lines[j]) {
				j++
			}
			out = append(out, Block{KindTable, strings.Join(lines[i:j], "\n")})
			i = j
			continue
		}
		if reHeading.MatchString(ln) {
			out = append(out, Block{KindHeading, strings.TrimSpace(ln)})
			i++
			continue
		}
		if reRule.MatchString(ln) {
			out = append(out, Block{KindRule, strings.TrimSpace(ln)})
			i++
			continue
		}
		if reAdmonition.MatchString(ln) {
			out = append(out, Block{KindAdmonition, strings.TrimSpace(ln)})
			i++
			continue
		}
		if reListItem.MatchString(ln) || reQuote.MatchString(ln) {
			kind := KindQuote
			if reListItem.MatchString(ln) {
				kind = KindListItem
			}
			buf := []string{strings.TrimRightFunc(ln, unicode.IsSpace)}
			j := i + 1
			for j < len(lines) && strings.TrimSpace(lines[j]) != "" &&
				!reListItem.MatchString(lines[j]) && !reHeading.MatchString(lines[j]) &&
				!reFence.MatchString(lines[j]) && !reTable.MatchString(lines[j]) &&
				!reAdmonition.MatchString(lines[j]) {
				buf = append(buf, strings.TrimSpace(lines[j]))
				j++
			}
			out = append(out, Block{kind, strings.Join(buf, " ")})
			i = j
			continue
		}
		var buf []string
		j := i
		for j < len(lines) && strings.TrimSpace(lines[j]) != "" &&
			!reHeading.MatchString(lines[j]) && !reFence.MatchString(lines[j]) &&
			!reListItem.MatchString(lines[j]) && !reTable.MatchString(lines[j]) &&
			!reQuote.MatchString(lines[j]) && !reMath.MatchString(lines[j]) &&
			!reAdmonition.MatchString(lines[j]) {
			buf = append(buf, strings.TrimSpace(lines[j]))
			j++
		}
		out = append(out, Block{KindPara, strings.Join(buf, " ")})
		i = j
	}
	return out
}

// abbrev is the CLOSED LIST the spec calls for. A terminator does not end a
// sentence after one of these. Closed rather than heuristic on purpose: a
// heuristic that is wrong about "no." splits a sentence in the middle of a
// number, and there is no evidence in a document to tell it apart.
var abbrev = map[string]bool{
	"e.g.": true, "i.e.": true, "cf.": true, "vs.": true, "etc.": true,
	"al.": true, "approx.": true, "no.": true, "fig.": true, "eq.": true,
	"ch.": true, "sec.": true, "p.": true, "pp.": true, "mr.": true,
	"mrs.": true, "ms.": true, "dr.": true, "prof.": true, "st.": true,
	"inc.": true, "ltd.": true, "co.": true, "jr.": true, "sr.": true,
	"u.s.": true, "a.m.": true, "p.m.": true,
}

// maskable are the opaque regions: a dot inside one is never a sentence end.
// They are replaced with same-length filler so every offset survives the mask.
var maskable = []*regexp.Regexp{
	regexp.MustCompile("`{1,3}[^`]*`{1,3}"), // `code`
	regexp.MustCompile(`\]\([^)]*\)`),       // ](destination)
	regexp.MustCompile(`\{[+~=>-][^}]*\}`),  // a CriticMarkup span
	regexp.MustCompile(`\.\.\.`),            // an ellipsis spelled with stops
}

const maskRune = '\x01'

// terminators are the four characters that can end a sentence.
func isTerminator(r rune) bool {
	return r == '.' || r == '!' || r == '?' || r == '…'
}

// closingMark is a quote or bracket that travels with the terminator.
func isClosingMark(r rune) bool {
	switch r {
	case '"', '\'', '’', '”', ')', ']':
		return true
	}
	return false
}

// closingEmphasis is markdown emphasis that travels with the terminator, and it
// is the clause the spec singles out: `**A rule.** Next` is TWO sentences, and
// without the trailing `**` the whole entry stays one unit that nothing can
// diff legibly.
func isClosingEmphasis(r rune) bool {
	return r == '*' || r == '_' || r == '`'
}

// isOpener reports what may legitimately begin the next sentence. A masked
// region cannot: \x01 is not in this set, so a sentence never starts at a code
// span, which is deliberate and is what keeps `foo. `bar“ one unit.
func isOpener(r rune) bool {
	switch r {
	case '(', '[', '`', '"', '“', '*', '_', '—', '‘', '’', '-':
		return true
	}
	return (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')
}

// mask replaces opaque regions with same-length filler, working in runes so
// every offset the splitter computes indexes the same character in both.
func mask(runes []rune) []rune {
	text := string(runes)
	out := make([]rune, len(runes))
	copy(out, runes)
	// byte offset -> rune index, so a regexp match over the string can be
	// applied to the rune slice.
	idx := make(map[int]int, len(runes)+1)
	pos := 0
	for i, r := range runes {
		idx[pos] = i
		pos += len(string(r))
	}
	idx[pos] = len(runes)
	for _, pat := range maskable {
		for _, m := range pat.FindAllStringIndex(text, -1) {
			s, e := idx[m[0]], idx[m[1]]
			for k := s; k < e; k++ {
				out[k] = maskRune
			}
		}
	}
	return out
}

// Sentences splits ONE block. Headings, math and rules are one unit each,
// terminators or not; a table row and a code line are each the sentence of
// their block.
func Sentences(text string, kind Kind) []string {
	switch kind {
	case KindHeading, KindMath, KindRule, KindAdmonition:
		return []string{text}
	case KindTable, KindCode, KindFrontM:
		var out []string
		for _, ln := range strings.Split(text, "\n") {
			if strings.TrimSpace(ln) != "" {
				out = append(out, ln)
			}
		}
		if len(out) == 0 {
			return []string{text}
		}
		return out
	}
	runes := []rune(text)
	masked := mask(runes)
	var out []string
	start := 0
	for i := 0; i < len(masked); i++ {
		if !isTerminator(masked[i]) {
			continue
		}
		end := i + 1
		for end < len(masked) && isClosingMark(masked[end]) {
			end++
		}
		for end < len(masked) && isClosingEmphasis(masked[end]) {
			end++
		}
		// finditer does not overlap: the next scan resumes at the match end.
		i = end - 1
		if end >= len(masked) {
			break
		}
		if masked[end] != ' ' && masked[end] != '\t' {
			continue // 3.14, foo.bar
		}
		next := end + 1
		for next < len(masked) && (masked[next] == ' ' || masked[next] == '\t') {
			next++
		}
		if next >= len(masked) || !isOpener(masked[next]) {
			continue
		}
		head := string(masked[start:end])
		if last := lastField(head); last != "" {
			if abbrev[strings.ToLower(last)] {
				continue
			}
			if isInitial(last) { // an initial, or "a."
				continue
			}
		}
		if piece := strings.TrimSpace(string(runes[start:end])); piece != "" {
			out = append(out, piece)
		}
		start = next
	}
	if tail := strings.TrimSpace(string(runes[start:])); tail != "" {
		out = append(out, tail)
	}
	if len(out) == 0 {
		return []string{text}
	}
	return out
}

func lastField(s string) string {
	f := strings.Fields(s)
	if len(f) == 0 {
		return ""
	}
	return f[len(f)-1]
}

// isInitial matches difflib-side `[a-z]\.` as a FULL match on the lowercased
// last word — one letter and a stop.
func isInitial(s string) bool {
	r := []rune(strings.ToLower(s))
	return len(r) == 2 && r[0] >= 'a' && r[0] <= 'z' && r[1] == '.'
}

// Norm is the whitespace rule: WHITESPACE IS NOT A CHANGE. 27 of 545 real
// changed pairs in the first sweep differed only in it — a table's `|---|`
// respaced, a hard wrap moved — and rendered as changes they are noise the
// reader dismisses on every round.
func Norm(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	space := false
	for _, r := range s {
		if unicode.IsSpace(r) {
			space = true
			continue
		}
		if space && b.Len() > 0 {
			b.WriteRune(' ')
		}
		space = false
		b.WriteRune(r)
	}
	return b.String()
}

// isWordRune is Python's Unicode `\w`: a letter, a number, or an underscore.
// ASCII-only would split "café" into two tokens and move every fragment count
// on any document with an accent in it.
func isWordRune(r rune) bool {
	return r == '_' || unicode.IsLetter(r) || unicode.IsDigit(r)
}

// Words tokenises for the inner word diff: runs of word characters, and every
// other non-space character on its own. Whitespace tokens are dropped, which is
// what makes the word diff agree with Norm about whitespace.
func Words(s string) []string {
	w, _ := wordsWithGaps(s)
	return w
}

// wordsWithGaps is Words plus WHERE THE SPACES WERE, and the second return value
// is what the renderer needs and could not invent.
//
// Whitespace is dropped from the tokens deliberately — that is what makes the
// word diff agree with Norm that respacing is not a change — but a renderer that
// then rejoins with one space between every token writes prose nobody typed:
// `per-host` tokenises as `per`, `-`, `host` and came back **`per - host`**, and
// `client.retry_budget` came back **`client. retry_budget`** (a rule that
// stripped the space BEFORE a full stop cannot know there should be none after
// this one either, because it cannot tell a sentence's stop from a dotted
// identifier's). Measured in a browser on the phase-2 artifact's own document,
// which is where a diff that reads wrong actually costs something.
//
// So the gap is OBSERVED rather than guessed: gaps[i] reports whether token i
// had whitespace before it in the SOURCE. The tokens cover the source in order
// with nothing but whitespace between them, so this is exact, and there is
// nothing left for a punctuation heuristic to be wrong about.
func wordsWithGaps(s string) ([]string, []bool) {
	var out []string
	var gaps []bool
	runes := []rune(s)
	spaced := false
	for i := 0; i < len(runes); {
		r := runes[i]
		switch {
		case unicode.IsSpace(r):
			spaced = true
			i++
		case isWordRune(r):
			j := i
			for j < len(runes) && isWordRune(runes[j]) {
				j++
			}
			out, gaps = append(out, string(runes[i:j])), append(gaps, spaced)
			spaced = false
			i = j
		default:
			out, gaps = append(out, string(r)), append(gaps, spaced)
			spaced = false
			i++
		}
	}
	return out, gaps
}

// Ratio is difflib's similarity over two texts' words.
func Ratio(a, b string) float64 { return SeqRatio(Words(a), Words(b)) }
