// marker.ts — quiet the `⟦ shell N ⟧` marker paragraphs in the content pane.
//
// PAGE MODE ONLY. A page-backed review (galley edit page.html) renders the
// editable words beside a live preview of the real page; the preview shows
// every shell region in place, at full fidelity, so the reviewer no longer
// needs to SEE the `⟦ shell N ⟧` marker paragraphs the renderer routes on.
// This extension makes them inert and quiet in the editor — WITHOUT touching
// the document. The markers stay in the fragment and in content.md byte for
// byte; the projection still writes them; the CRDT round-trip is unchanged.
//
// PRESENTATION ONLY, AND THAT IS WHY IT IS A DECORATION. CLAUDE.md's rule —
// a class on a ProseMirror-rendered element is not yours to keep — is why
// web/lit.ts exists, and the same rule applies here: the obvious "walk the DOM
// and add a class" is wiped on the next redraw, and a page-backed document is
// redrawn on every projection. A NODE DECORATION is the safe mechanism: it
// restyles the paragraph's own DOM element (a class the CSS hides, plus
// contenteditable=false so the caret skips it and typing near it cannot split
// or merge it) while leaving the node itself — its text, its position, its
// place in content.md — completely untouched. A node view would REPLACE the
// paragraph's rendering; a decoration only dresses it, which is exactly the
// least-invasive, caret-safe thing this task asks for.
//
// Detection is by CONTENT, not by any node attribute: a paragraph whose full
// text matches the marker shape. Markdown mode never carries these markers, and
// this extension is only installed in page mode anyway (see web/entry.ts), so
// ordinary prose is never touched twice over.

import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction, EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Extension } from '@tiptap/core';

// The marker shape the renderer routes on: a paragraph that is ONLY
// `⟦ shell N ⟧`. Anchored at both ends so a paragraph merely CONTAINING the
// glyphs (a reviewer quoting one in prose) is left alone.
const SHELL_MARKER_RE = /^⟦ shell \d+ ⟧$/;

// The class the stylesheet hides (body.gly-page .gly-shell-marker, editor.css).
const SHELL_MARKER_CLASS = 'gly-shell-marker';

const shellMarkerKey = new PluginKey<DecorationSet>('glyShellMarker');

// isMarkerParagraph detects a shell-marker paragraph by CONTENT, the one and
// only signal marker.ts routes on (SHELL_MARKER_RE). Reused by both the
// decoration pass and the merge-safety keymap below, so the two never drift on
// what counts as a marker.
function isMarkerParagraph(node: PMNode | null | undefined): boolean {
  return (
    !!node &&
    node.type.name === 'paragraph' &&
    SHELL_MARKER_RE.test(node.textContent)
  );
}

// blocksMarkerJoin answers the ONE keystroke this extension has to refuse: a
// caret-only Backspace/Delete whose cross-block join would merge prose into a
// marker paragraph. The node decoration hides the marker and skips the caret
// over it, but a decoration is presentation only — it does NOT stop
// ProseMirror's model-level join, so Backspace at the START of the paragraph
// after a hidden marker (dir -1) or Delete at the END of the paragraph before
// one (dir +1) would still fold prose into the marker, break its
// `^⟦ shell N ⟧$` shape, un-hide it AND corrupt the routing anchor in
// content.md. When the join target is a marker paragraph we consume the key
// with a no-op (return true, no transaction): the marker, its text and its
// position are all left exactly as they were. Any other target is left to the
// ordinary Backspace/Delete chain (return false).
function blocksMarkerJoin(state: EditorState, dir: -1 | 1): boolean {
  const { selection } = state;
  if (!selection.empty) {
    return false;
  }
  const { $from } = selection;
  if (dir === -1) {
    // Backspace only guards a JOIN — the caret must sit at the very start of
    // its textblock, where Backspace would reach across into the block before.
    if ($from.parentOffset !== 0) {
      return false;
    }
    const $before = state.doc.resolve($from.before());
    return isMarkerParagraph($before.nodeBefore);
  }
  // Delete only guards a JOIN — the caret must sit at the very end of its
  // textblock, where Delete would reach across into the block after.
  if ($from.parentOffset !== $from.parent.content.size) {
    return false;
  }
  const $after = state.doc.resolve($from.after());
  return isMarkerParagraph($after.nodeAfter);
}

// markerDecorations builds one NODE decoration per shell-marker paragraph. The
// decoration adds the quiet class and contenteditable=false; it never changes
// the node, so the document and content.md are untouched.
function markerDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node: PMNode, pos: number) => {
    if (isMarkerParagraph(node)) {
      decos.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: SHELL_MARKER_CLASS,
          contenteditable: 'false',
        }),
      );
      // A paragraph has no block children to descend into.
      return false;
    }
    return undefined;
  });
  return DecorationSet.create(doc, decos);
}

// shellMarkerQuiet is the extension entry.ts installs — in page mode only —
// so the markers go quiet without any change to the schema, the projection or
// the CRDT.
export function shellMarkerQuiet() {
  return Extension.create({
    name: 'galleyShellMarker',
    // MERGE-SAFETY KEYMAP. Presentation cannot protect the model: the
    // decoration hides the marker but a reviewer can still Backspace/Delete a
    // prose block INTO it, breaking the anchor. These handlers refuse exactly
    // that join and nothing else — a no-op consume when the join target is a
    // marker paragraph, and full pass-through everywhere else. Installed only
    // with this extension, i.e. page mode only; markdown mode never sees it.
    addKeyboardShortcuts() {
      return {
        Backspace: ({ editor }) => blocksMarkerJoin(editor.state, -1),
        Delete: ({ editor }) => blocksMarkerJoin(editor.state, 1),
      };
    },
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: shellMarkerKey,
          state: {
            init: (_config, state: EditorState) => markerDecorations(state.doc),
            // RE-DERIVE on a doc change rather than mapping: a projection
            // replaces the whole document, so the old positions are gone, and
            // re-scanning the new doc is both correct and cheap (one linear
            // pass over the blocks). No document change means the set stands.
            apply(tr: Transaction, prev: DecorationSet): DecorationSet {
              return tr.docChanged ? markerDecorations(tr.doc) : prev;
            },
          },
          props: {
            decorations(state: EditorState) {
              return shellMarkerKey.getState(state) ?? DecorationSet.empty;
            },
          },
        }),
      ];
    },
  });
}
