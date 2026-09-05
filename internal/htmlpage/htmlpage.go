// Package htmlpage splits an HTML page into the prose markdown can carry and
// the template it cannot, so galley can review the prose as a normal markdown
// document and re-render the page on every projection.
//
// Design spec: docs/superpowers/specs/2026-08-28-html-pages-design.md
package htmlpage

// Extraction is one page split into the prose markdown can carry and the
// template it cannot. Markdown is what the reviewer edits; Template is what
// Render needs to rebuild the page around whatever the markdown becomes.
type Extraction struct {
	Markdown []byte
	Template Template
}

// Template is the ordered shell of the page. Segments alternate between
// verbatim shell HTML and slots that content regions pour into.
type Template struct {
	Head     string    `json:"head"`     // verbatim <!doctype>+<html …>+<head>…</head>+<body …> opening
	Segments []Segment `json:"segments"` // body content, in order
	Tail     string    `json:"tail"`     // verbatim </body></html> closing
}

// Segment is either shell (verbatim HTML, Slot nil) or a slot (Shell empty).
type Segment struct {
	Shell string `json:"shell,omitempty"`
	Slot  *Slot  `json:"slot,omitempty"`
}

// Slot is one content region: a contiguous run of blocks the reviewer edits.
type Slot struct {
	Index    int       `json:"index"`    // 0-based, matches the stand-in numbering
	Wrappers []Wrapper `json:"wrappers"` // per-block wrappers, original order
}

// Wrapper is the block-level element a content block came out of.
type Wrapper struct {
	Kind  string `json:"kind"`  // docmodel.BlockKind the block parsed as
	Tag   string `json:"tag"`   // "p", "h2", "ul", "blockquote", …
	Attrs string `json:"attrs"` // verbatim attribute text incl. leading space, e.g. ` class="eyebrow"`
	// Text is the block's original text, normalised to words, so a re-poured
	// block can be matched back to this wrapper by identity rather than by
	// position (see align.go). Omitted when empty.
	Text string `json:"text,omitempty"`
}
