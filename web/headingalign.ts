// headingalign.ts — nudge each content heading down to sit level with the same
// heading in the live page, so the two panes read together at the section level.
//
// PAGE MODE ONLY, and PRESENTATION ONLY. Like marker.ts, this restyles the
// heading's own DOM element without touching the document: a NODE DECORATION,
// not an inline style, because CLAUDE.md's rule holds — a style written straight
// onto a ProseMirror-rendered element is wiped on the next redraw, and a
// page-backed document is redrawn on every projection. The decoration adds
// `padding-top` above a heading (padding, not margin: it does not collapse, and
// it adds to the heading's own box so everything below flows down with it),
// leaving the node, its text, its position in content.md untouched.
//
// The PX PER HEADING is not derived from the document — it is a MEASUREMENT of
// where each heading lands in the live preview versus the editor, computed in
// web/preview.ts and pushed in through a transaction meta. This plugin only
// stores that map and paints it onto the matching heading nodes, re-deriving the
// decorations whenever the document changes (a projection replaces the whole
// doc, so positions move) so the spacers ride along. Detection is by heading
// TEXT, the one thing both panes share.

import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction, EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Extension } from '@tiptap/core';

// The meta channel preview.ts writes the measured map onto, and the key this
// plugin's state is read back through.
export const headingAlignKey = new PluginKey<AlignState>('glyHeadingAlign');

// normHeading is the match key: a heading's text, whitespace-collapsed and
// lowered, so the editor's `# Heading` and the page's `<h2>Heading</h2>` meet.
// Exported for preview.ts to key its measured map the same way.
export function normHeading(s: string | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

interface AlignState {
  pads: Map<string, number>;
  decos: DecorationSet;
}

// The key is the heading's text AND its occurrence index among headings of that
// same text (`usage#0`, `usage#1`), so a page with two identically-titled
// sections pads each independently. preview.ts builds the map with the same
// scheme, walking the same headings in the same document order, so occurrence n
// here is occurrence n there. Exported so the gate can key its reading the same.
export function alignKey(text: string | null, occ: number): string {
  return `${normHeading(text)}#${occ}`;
}

function alignDecorations(
  doc: PMNode,
  pads: Map<string, number>,
): DecorationSet {
  if (pads.size === 0) {
    return DecorationSet.empty;
  }
  const decos: Decoration[] = [];
  const seen = new Map<string, number>();
  doc.descendants((node: PMNode, pos: number) => {
    if (node.type.name === 'heading') {
      const text = normHeading(node.textContent);
      const occ = seen.get(text) ?? 0;
      seen.set(text, occ + 1);
      const px = pads.get(alignKey(text, occ));
      if (px && px > 0) {
        decos.push(
          Decoration.node(pos, pos + node.nodeSize, {
            style: `padding-top:${px}px`,
          }),
        );
      }
      // A heading has no block children to descend into.
      return false;
    }
    return undefined;
  });
  return DecorationSet.create(doc, decos);
}

// headingAlign is the extension entry.ts installs in page mode only. Markdown
// mode never installs it, and it has no effect until preview.ts pushes a map.
export function headingAlign() {
  return Extension.create({
    name: 'galleyHeadingAlign',
    addProseMirrorPlugins() {
      return [
        new Plugin<AlignState>({
          key: headingAlignKey,
          state: {
            init: (): AlignState => ({
              pads: new Map(),
              decos: DecorationSet.empty,
            }),
            apply(tr: Transaction, prev: AlignState): AlignState {
              const meta = tr.getMeta(headingAlignKey) as
                Map<string, number> | undefined;
              if (meta) {
                return { pads: meta, decos: alignDecorations(tr.doc, meta) };
              }
              // No new measurement, but a projection replaced the doc: the old
              // positions are gone, so re-derive the spacers on the new tree.
              if (tr.docChanged) {
                return {
                  pads: prev.pads,
                  decos: alignDecorations(tr.doc, prev.pads),
                };
              }
              return prev;
            },
          },
          props: {
            decorations(state: EditorState): DecorationSet {
              return (
                headingAlignKey.getState(state)?.decos ?? DecorationSet.empty
              );
            },
          },
        }),
      ];
    },
  });
}
