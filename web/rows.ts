// rows.ts — everything galley pins INSIDE the paper is a decoration, so
// ProseMirror owns the DOM and a hand edit never fights a foreign node:
//   widget rows  — the pinned instruction under its block
//   widget was   — the WAS strip + agent note under a revised block (Task 11)
//   node marks   — the tinted background on a marked/revised block
//
// The rule this file exists to keep is the one note.ts and trail.ts already
// keep: NOTHING here is ever inserted into `.ProseMirror` by hand. A foreign
// element under the editor's own root is a node y-prosemirror does not know
// about, and what it does with one is DELETE it from the Yjs document — which
// galley then projects into the reviewer's .md. A widget decoration is
// ProseMirror's own "this is not in the document" and survives every redraw,
// every remote edit and every projection untouched.
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { AppShell } from './appshell.ts';
import { postJSON } from './net.ts';

export interface RowSpec {
  key: string;
  index: number;
  text: string;
  state: 'queued' | 'writing…' | 'applied' | 'not applied';
  tone: 'coral' | 'accent';
  removable: boolean;
}
export interface WasSpec {
  index: number;
  was: string;
  note?: string;
}
export interface RowsState {
  rows: RowSpec[];
  was: WasSpec[];
  marked: number[];
  revised: number[];
}

export const rowsKey = new PluginKey<RowsPluginState>('gly-rows');
const EMPTY: RowsState = { rows: [], was: [], marked: [], revised: [] };

interface RowsPluginState {
  spec: RowsState;
  decos: DecorationSet;
}

// blockEnd is the position just INSIDE the end of top-level child `index` — a
// widget put there renders after the block's own content and before its
// closing token, which is what makes a row read as belonging to the paragraph
// above it rather than to the one below.
export function blockEnd(
  doc: { childCount: number; child(i: number): { nodeSize: number } },
  index: number,
): number {
  if (index < 0 || index >= doc.childCount) {
    return -1;
  }
  let pos = 0;
  for (let i = 0; i < index; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos + doc.child(index).nodeSize - 1;
}

function blockRange(doc: PMNode, index: number): [number, number] | null {
  if (index < 0 || index >= doc.childCount) {
    return null;
  }
  let pos = 0;
  for (let i = 0; i < index; i++) {
    pos += doc.child(i).nodeSize;
  }
  return [pos, pos + doc.child(index).nodeSize];
}

// matchBlocks is THE ONLY BRIDGE between the diff and the paper, and it is a
// text match rather than a position map on purpose: the diff is a render of two
// SERVER documents and the paper is a live ProseMirror doc the reviewer may
// already have typed into, so there is no shared coordinate to map through.
// What both do share is the words, and the words the agent just wrote are the
// most distinctive thing on the page — a 40-character prefix of an insertion
// picks out one block or none. Whitespace and case are normalised because the
// diff's HTML and the editor's DOM disagree about both; a change with nothing
// inserted (a pure deletion) is looked up by what it removed instead, which is
// still in the block for as long as the region is only part of it.
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
export function matchBlocks(
  changes: { ins: string; del: string }[],
  blocks: string[],
): (number | null)[] {
  const bs = blocks.map(norm);
  return changes.map((c) => {
    const probe = norm(c.ins).slice(0, 40) || norm(c.del).slice(0, 40);
    if (!probe) {
      return null;
    }
    const i = bs.findIndex((b) => b.includes(probe));
    return i >= 0 ? i : null;
  });
}

function rowDOM(r: RowSpec, onRemove: (key: string) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'gly-row';
  el.dataset.tone = r.tone;
  el.dataset.key = r.key;
  el.contentEditable = 'false';
  const arrow = document.createElement('span');
  arrow.className = 'gly-row-arrow';
  arrow.textContent = '↳';
  const text = document.createElement('span');
  text.className = 'gly-row-text';
  text.textContent = r.text;
  const state = document.createElement('span');
  state.className = 'gly-row-state';
  state.textContent = r.state;
  el.append(arrow, text, state);
  if (r.removable) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'gly-row-remove';
    x.textContent = '×';
    x.title = 'remove this instruction';
    // The editor keeps its selection only while it keeps focus, and a
    // mousedown inside the paper moves the caret before the click ever fires
    // — the same preventDefault the gutter grips already take (figures.ts).
    x.addEventListener('mousedown', (e) => e.preventDefault());
    x.addEventListener('click', () => onRemove(r.key));
    el.append(x);
  }
  return el;
}

function wasDOM(w: WasSpec): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'gly-was-wrap';
  wrap.contentEditable = 'false';
  const strip = document.createElement('div');
  strip.className = 'gly-was';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'gly-was-eyebrow';
  eyebrow.textContent = 'WAS';
  const s = document.createElement('s');
  s.textContent = w.was;
  strip.append(eyebrow, s);
  wrap.append(strip);
  if (w.note) {
    const note = document.createElement('div');
    note.className = 'gly-agent-note';
    const label = document.createElement('span');
    label.className = 'gly-agent-note-label';
    label.textContent = 'agent ←';
    const text = document.createElement('span');
    text.textContent = w.note;
    note.append(label, text);
    wrap.append(note);
  }
  return wrap;
}

// pinAt is where a row or a WAS strip actually hangs. For prose that is
// blockEnd — inside the paragraph, before its closing token, so the row reads
// as belonging to the block above it. A FENCE is the exception and has to be:
// a code block renders its content verbatim inside one <pre>, so a widget put
// inside it draws the row as the fence's last line, boxed in with the shell
// command it is about (measured by codeblock.mjs as 73px ABOVE the fence's own
// bottom). There the row hangs just after the node instead, which is the same
// place on screen for every other block and the only honest one here.
function pinAt(doc: PMNode, index: number): number {
  const end = blockEnd(doc, index);
  if (end < 0) {
    return -1;
  }
  return doc.child(index).type.spec.code ? end + 1 : end;
}

function build(
  doc: PMNode,
  s: RowsState,
  onRemove: (key: string) => void,
): DecorationSet {
  const decos: Decoration[] = [];
  for (const i of s.marked) {
    const r = blockRange(doc, i);
    if (r) {
      decos.push(Decoration.node(r[0], r[1], { class: 'gly-marked' }));
    }
  }
  for (const i of s.revised) {
    const r = blockRange(doc, i);
    if (r) {
      decos.push(Decoration.node(r[0], r[1], { class: 'gly-revised' }));
    }
  }
  for (const w of s.was) {
    const end = pinAt(doc, w.index);
    if (end >= 0) {
      decos.push(
        Decoration.widget(end, () => wasDOM(w), {
          side: 1,
          key: `was:${w.index}`,
        }),
      );
    }
  }
  for (const r of s.rows) {
    const end = pinAt(doc, r.index);
    if (end >= 0) {
      // The STATE rides in the key for trail.ts's reason: two widgets with one
      // key are one widget to ProseMirror and the DOM is not rebuilt, so a row
      // that went from `queued` to `writing…` would keep the word it was born
      // with. `side: 2` puts it after the WAS strip of the same block.
      decos.push(
        Decoration.widget(end, () => rowDOM(r, onRemove), {
          side: 2,
          key: `row:${r.key}:${r.state}:${r.tone}:${r.removable}`,
        }),
      );
    }
  }
  return DecorationSet.create(doc, decos);
}

export function rowsPlugin(onRemove: (key: string) => void): Plugin {
  return new Plugin<RowsPluginState>({
    key: rowsKey,
    state: {
      init: (_, state) => ({
        spec: EMPTY,
        decos: build(state.doc, EMPTY, onRemove),
      }),
      apply(tr, prev, _old, state) {
        const next = tr.getMeta(rowsKey) as RowsState | undefined;
        if (next) {
          return { spec: next, decos: build(state.doc, next, onRemove) };
        }
        if (tr.docChanged) {
          // Rebuilt rather than mapped: a row is pinned to a block INDEX, and
          // an index is not a position that survives a paragraph being split
          // above it. The list is short and the rebuild is a walk of the
          // top-level children.
          return {
            spec: prev.spec,
            decos: build(state.doc, prev.spec, onRemove),
          };
        }
        return prev;
      },
    },
    props: {
      decorations: (state) => rowsKey.getState(state)?.decos ?? null,
    },
  });
}

// NOTHING IS DISPATCHED FOR A STATE THAT HAS NOT MOVED. Both callers are on a
// beat — the 1.5s pending poll and the 1s revise poll — and a transaction per
// tick is a decoration rebuild per tick over a document nobody touched, on top
// of a redraw that can land under the reviewer's own caret.
export function setRows(view: EditorView, s: RowsState): void {
  const now = rowsKey.getState(view.state);
  if (now && JSON.stringify(now.spec) === JSON.stringify(s)) {
    return;
  }
  view.dispatch(view.state.tr.setMeta(rowsKey, s));
}

// The mixin: rows follow the pending instructions; WAS/revised follow the
// arrival (Task 11).
export const rowMethods = {
  paintRows(this: AppShell): void {
    const phase = this.phase();
    const rows: RowSpec[] = [];
    const marked: number[] = [];
    for (const t of this.comments) {
      // Whole-doc rows live in the frame slot (Task 7), and a settled thread
      // has nothing pending about it — the same two cuts railThreads makes.
      if (!t.anchorKey || t.resolved) {
        continue;
      }
      const block = this.blocks.find((b) => b.key === t.anchorKey);
      if (!block) {
        continue;
      }
      const applied = this.appliedKeys?.has(t.key) ?? false;
      const state: RowSpec['state'] =
        phase === 'revising'
          ? 'writing…'
          : phase === 'review'
            ? applied
              ? 'applied'
              : 'not applied'
            : phase === 'cannot'
              ? 'not applied'
              : 'queued';
      const tone: RowSpec['tone'] =
        state === 'applied' || state === 'writing…' ? 'accent' : 'coral';
      rows.push({
        key: t.key,
        index: block.index,
        text: t.entries[0]?.text ?? '',
        state,
        tone,
        removable: phase === 'markup' || phase === 'cannot',
      });
      if (phase !== 'review') {
        marked.push(block.index);
      }
    }
    const was = this.arrivalWas ?? [];
    setRows(this.editor.view, {
      rows,
      was,
      marked,
      revised: was.map((w) => w.index),
    });
  },

  removeInstruction(this: AppShell, key: string): void {
    void postJSON('/_galley/instruction/delete', { key }).then(() =>
      this.refreshPending(),
    );
  },
};
