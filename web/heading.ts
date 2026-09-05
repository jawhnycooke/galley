// web/heading.ts owns coerceLevel — turning a heading level that may arrive
// as a string, or out of range, into one of the six TipTap actually
// understands.
//
// SHARED, NOT ENTRY.JS'S ALONE. TolerantHeading (web/entry.ts) calls it to
// render a heading whose level came off the wire as a string; sectionSpan
// (web/figures.ts) calls it to compare one heading's level against another's
// when it walks a section's extent. Two callers in two different modules is
// exactly the case that moves a helper out of entry.ts rather than leaving it
// there to be imported back — see the module-map plan's Global Constraints.

// --- heading levels arrive as strings ---
//
// internal/ydoc writes block attributes as XML attributes, which are strings:
// a level-2 heading reaches this client as level "2". TipTap's Heading
// renders `h${level}` after checking `levels.includes(node.attrs.level)` —
// and "2" is not in [1,2,3,4,5,6], so an untreated string level renders every
// heading as h1 (and any hand-rolled `h${attrs.level}` would render
// h-undefined). Coercing at render time is the right layer: it fixes what the
// reader sees without writing a normalisation back into a document the server
// owns the shape of.
const LEVELS = [1, 2, 3, 4, 5, 6];

export function coerceLevel(raw: unknown): number {
  // `raw` is `unknown` because it arrives through TipTap's own attrs, which
  // are untyped past the vendor boundary — see this file's header. The wire
  // shape is a number or the XML string form of one; anything else (an
  // object, say) has no honest string form to parse, and blindly running it
  // through `String()` used to print "[object Object]" and parseInt that
  // into NaN anyway. Naming the two real shapes and defaulting everything
  // else straight to NaN reaches the same NaN without the detour through a
  // stringified object.
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? parseInt(raw, 10)
        : NaN;
  return LEVELS.indexOf(n) === -1 ? 1 : n;
}
