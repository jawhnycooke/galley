package markdown

import (
	"bytes"
	"regexp"
	"strings"

	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// A MKDOCS ADMONITION IS THE THIRD ANSWER TO dialects.go's QUESTION.
//
//	!!! check "Checkpoint"
//	    Run `uv --version`. You should see a version number.
//
// To CommonMark that is a paragraph whose second line is a lazy continuation,
// so the converter reflows it onto one line — the same silent harm the four
// dialects in dialects.go were measured doing. Front matter and math are
// carried VERBATIM because their content is not markdown; `:::` and `> [!NOTE]`
// are REFUSED because their content is markdown prose and carrying it verbatim
// would make the author's sentences unreviewable. This construct's body is
// markdown prose too, and it is MODELLED: a container, like a blockquote, whose
// children are ordinary blocks. Every sentence in it is prose the reviewer can
// mark.
//
// FOUR MARKERS, ONE SHAPE. `!!!` is an admonition, `???` a collapsed one, `???+`
// an expanded one, `===` a content tab; each is a header line and a body
// indented four columns, exactly as Python-Markdown's admonition and
// pymdownx.tabbed read them. The marker and the type word ride as attributes;
// the title is the first child (see docmodel.Admonition for why).
//
// A CONTAINER BLOCK PARSER, modelled on goldmark's own list item. The reader is
// advanced past the four columns of indent on every body line
// (util.IndentPosition + reader.AdvanceAndSetPadding), so a nested list, a
// fence or another admonition inside the body is parsed by its own parser with
// the container's prefix already stripped — which is the whole reason this is a
// block parser and not a scan over the raw bytes.

var kindAdmonition = ast.NewNodeKind("GalleyAdmonition")

type admonitionNode struct {
	ast.BaseBlock
	marker, typ, title string
}

func (n *admonitionNode) Kind() ast.NodeKind { return kindAdmonition }

// IsRaw keeps the inline parser off the node's OWN Lines (the header): goldmark
// walks every node's Lines() looking for inline content
// (parser.parseBlock resets its reader to parent.Lines() unconditionally), and
// without this the header line would come back as a stray Text child alongside
// the body blocks the container parser already built. It does not touch the
// children themselves — each is walked and inline-parsed through its own,
// separate Lines(), math.go's mathBlockNode uses the same guard for the same
// reason.
func (n *admonitionNode) IsRaw() bool { return true }

func (n *admonitionNode) Dump(src []byte, level int) {
	ast.DumpHelper(n, src, level, map[string]string{
		"Marker": n.marker, "Type": n.typ, "Title": n.title,
	}, nil)
}

// reAdmonitionHeader is the header grammar, whole line: marker, at least one
// space, an optional type word, an optional quoted title, trailing space. The
// two marker-specific rules (a tab has a title and no type; an admonition has a
// type) are checked after the match, because a regex that spelled them would
// be four alternations nobody could read.
var reAdmonitionHeader = regexp.MustCompile(
	`^(!!!|\?\?\?\+?|===)[ \t]+(?:([A-Za-z][A-Za-z0-9_-]*)(?:[ \t]+|$))?(?:"((?:[^"\\]|\\.)*)")?[ \t]*$`)

// parseAdmonitionHeader reads a header line with its indentation already
// skipped. EXACT, which is what makes it safe to interrupt a paragraph: a bare
// `===` is a setext underline and does not match, `=== not quoted` is prose,
// and nothing that reads as a sentence spells a marker at column 0.
func parseAdmonitionHeader(line []byte) (marker, typ, title string, ok bool) {
	m := reAdmonitionHeader.FindSubmatch(bytes.TrimRight(line, "\r\n"))
	if m == nil {
		return "", "", "", false
	}
	marker, typ = string(m[1]), string(m[2])
	quoted := m[3] != nil
	if marker == "===" && (typ != "" || !quoted) {
		return "", "", "", false
	}
	if marker != "===" && typ == "" {
		return "", "", "", false
	}
	title = unescapeTitle(string(m[3]))
	return marker, typ, title, true
}

// escapeTitle and unescapeTitle are the header's quoted-string escaping, one
// pass each, used by both the parser (read) and the serializer (write). The
// plan's original rule — "only `\"` is unescaped, `\\` is left alone" — is
// superseded here: the serializer must be able to write a title containing a
// backslash (a Windows path, a LaTeX fragment) without producing a header the
// parser rejects, which means `\` has to round-trip through `\\` like `"`
// does through `\"`. A sequential ReplaceAll can't do both at once (escaping
// `"` first then `\` would double-escape the backslashes it just introduced;
// escaping `\` first is fine on write, but unescaping is order-sensitive the
// same way), so both directions walk the string once instead.
func escapeTitle(s string) string {
	var sb strings.Builder
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '\\':
			sb.WriteString(`\\`)
		case '"':
			sb.WriteString(`\"`)
		default:
			sb.WriteByte(s[i])
		}
	}
	return sb.String()
}

func unescapeTitle(s string) string {
	var sb strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) && (s[i+1] == '\\' || s[i+1] == '"') {
			sb.WriteByte(s[i+1])
			i++
			continue
		}
		sb.WriteByte(s[i])
	}
	return sb.String()
}

type admonitionParser struct{}

func (admonitionParser) Trigger() []byte { return []byte{'!', '?', '='} }

func (admonitionParser) Open(_ ast.Node, reader text.Reader, pc parser.Context) (ast.Node, parser.State) {
	line, seg := reader.PeekLine()
	pos := pc.BlockOffset()
	if pos < 0 {
		return nil, parser.NoChildren
	}
	marker, typ, title, ok := parseAdmonitionHeader(line[pos:])
	if !ok {
		return nil, parser.NoChildren
	}
	node := &admonitionNode{marker: marker, typ: typ, title: title}
	// The header is the node's own line: it is what preserve.go's firstSegment
	// finds, so an admonition with no body is still a chunk of its own.
	node.Lines().Append(seg.WithStart(seg.Start + pos))
	reader.AdvanceToEOL()
	return node, parser.HasChildren
}

const admonitionIndent = 4

func (admonitionParser) Continue(_ ast.Node, reader text.Reader, _ parser.Context) parser.State {
	line, _ := reader.PeekLine()
	if util.IsBlank(line) {
		// A blank line inside the body does not close it, exactly as in a
		// list item; the next indented line is still the body.
		reader.AdvanceToEOL()
		return parser.Continue | parser.HasChildren
	}
	indent, _ := util.IndentWidth(line, reader.LineOffset())
	if indent < admonitionIndent {
		return parser.Close
	}
	pos, padding := util.IndentPosition(line, reader.LineOffset(), admonitionIndent)
	reader.AdvanceAndSetPadding(pos, padding)
	return parser.Continue | parser.HasChildren
}

// Close has nothing to give back: a header with no body is a valid, empty
// admonition in MkDocs, and legalize (parse.go) gives it the empty paragraph
// the browser's `block+` needs.
func (admonitionParser) Close(_ ast.Node, _ text.Reader, _ parser.Context) {}

// A header line ENDS the paragraph above it. Prose flush over `!!! note "N"`
// is prose and then an admonition — the same answer the serializer gives in
// interruptsParagraph, and the two must agree or the round trip breaks.
func (admonitionParser) CanInterruptParagraph() bool { return true }

// An indented header is somebody else's body, never a new block of its own at
// this level.
func (admonitionParser) CanAcceptIndentedLine() bool { return false }

// admonitionOption registers the parser after fenced code (700) and before the
// blockquote (800): a `!!!` inside a fence is code, and one inside a quote is
// that quote's admonition.
func admonitionOption() parser.Option {
	return parser.WithBlockParsers(util.Prioritized(admonitionParser{}, 740))
}
