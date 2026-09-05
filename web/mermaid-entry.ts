// The mermaid renderer, built as its OWN bundle.
//
// Why not folded into editor.js, which every page loads: mermaid is several
// megabytes minified, and editor.js is under a megabyte. Making every document
// pay that so that a document containing a diagram can draw one is not a trade
// worth making — a review page for a text-only spec would be slower to open
// than the whole rest of galley put together.
//
// So it is a second esbuild output, committed like editor.js (same vendored
// bundle precedent), embedded in the binary the same way, and fetched by the
// figure NodeView only when the document actually contains a mermaid fence.
// See loadMermaid in web/figure.ts.
//
// The default export is what --global-name hands to window.galleyMermaid.
import mermaid from 'mermaid';

export default mermaid;
