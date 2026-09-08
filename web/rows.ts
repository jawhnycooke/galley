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
import type { AskView, RoundView } from './wire';
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
  /** What a change that removed nothing put there — read under an `ADDED`
   *  eyebrow, the mirror of `WAS`, so a pure insertion is not silent. */
  added?: string;
  note?: string;
  /** The asks (by text) the change under this block claimed — the fallback
   *  address for a sent ask whose own words the agent rewrote. */
  asks?: string[];
}
interface RowsState {
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
//
// THE PROBE HAS A FLOOR, AND THE FLOOR IS DIFFERENT FOR THE TWO KINDS.
//
// An INSERTION probe is words the agent has just written INTO this document.
// They are distinctive by construction — nothing else on the page says them,
// because they did not exist a version ago — so eight characters of them is
// already an answer.
//
// WHEN THE INSERTION IS TOO SHORT TO PROBE WITH — `three` → `four`, or nothing
// inserted at all — the change is found by its CONTEXT: the region's surviving
// words, which are on the page by definition. The DELETED words never are: they
// are gone from the version on screen, so probing with them could only ever hit
// some OTHER block that happens to say the same thing, and a real round that
// removed one sentence from a paragraph got no strip at all that way. Context
// is ordinary prose rather than freshly written words, so it is held to a
// higher floor: a twelve-character run (`, this skill`) once matched the
// document's frontmatter and hung a WAS strip full of the wrong prose at the
// top of the paper. Twenty characters picks out one block or none, and "none"
// is the honest answer here: the strip is an enrichment, and a missing one
// costs the reviewer nothing while a wrong one tells them the agent changed
// something it never touched.
//
// AND ONE WAS PER BLOCK. A round that edits three phrases in one paragraph
// renders three regions, all matching that paragraph, and three strips stacked
// under it read as three separate rewrites of the same words. The longest
// deletion is kept because it is the one that shows most of what was there.
const PROBE_MIN_INS = 8;
export const PROBE_MIN_CTX = 20;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
export function matchBlocks(
  changes: { ins: string; ctx?: string }[],
  blocks: string[],
): (number | null)[] {
  const bs = blocks.map(norm);
  return changes.map((c) => {
    const ins = norm(c.ins).slice(0, 40);
    const ctx = norm(c.ctx ?? '').slice(0, 40);
    const probe =
      ins.length >= PROBE_MIN_INS
        ? ins
        : ctx.length >= PROBE_MIN_CTX
          ? ctx
          : '';
    if (!probe) {
      return null;
    }
    const i = bs.findIndex((b) => b.includes(probe));
    return i >= 0 ? i : null;
  });
}

// Keeps one WAS per block — the longest `was` wins. Order is the order the
// blocks first appear, so the strips read down the page as the paper does.
export function dedupeWas(was: WasSpec[]): WasSpec[] {
  const best = new Map<number, WasSpec>();
  for (const w of was) {
    const now = best.get(w.index);
    // One strip per block, the longest deletion — but every ask any of the
    // block's changes claimed, so the losing entry's asks still find a row.
    const asks = [...new Set([...(now?.asks ?? []), ...(w.asks ?? [])])];
    const keep = !now || w.was.length > now.was.length ? w : now;
    best.set(w.index, asks.length ? { ...keep, asks } : keep);
  }
  return [...best.values()].sort((a, b) => a.index - b.index);
}

// A SENT ASK IS FOUND BY THE WORDS IT WAS ON. Its thread has left the pending
// list by then (`internal/serve/editmode.go`: sent instructions live in the
// immutable round ledger and never come back), so there is no anchorKey to look
// up — but the round carries the `quote` the reviewer selected, and that text is
// still in the paper unless the agent rewrote exactly it.
//
// AMBIGUITY IS A NO, AND THAT IS THE RULE HERE RATHER THAN A LENGTH FLOOR. A
// quote is whatever the reviewer happened to select: `retry budget` is twelve
// characters and a perfectly ordinary instruction anchor, so refusing it by
// length would drop the row off the one block it belongs to. What makes a short
// quote dangerous is not its length but its being in TWO blocks — and that is
// checkable directly. Exactly one match is an answer; two is a coin toss, and a
// row under the wrong paragraph is worse than no row, because the reviewer reads
// it as the agent having been asked about words it never was.
export function quoteBlockIndex(
  doc: { childCount: number; child(i: number): { textContent: string } },
  quote: string,
): number {
  const probe = norm(quote).slice(0, 40);
  if (!probe) {
    return -1;
  }
  let found = -1;
  for (let i = 0; i < doc.childCount; i++) {
    if (norm(doc.child(i).textContent).includes(probe)) {
      if (found >= 0) {
        return -1;
      }
      found = i;
    }
  }
  return found;
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
  if (w.was) {
    const s = document.createElement('s');
    s.textContent = w.was;
    strip.append(eyebrow, s);
    wrap.append(strip);
  } else if (w.added) {
    strip.classList.add('gly-added');
    eyebrow.textContent = 'ADDED';
    const ins = document.createElement('span');
    ins.textContent = w.added;
    strip.append(eyebrow, ins);
    wrap.append(strip);
  }
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

// pinAt is where a row or a WAS strip actually hangs: JUST AFTER the block,
// for every block. A fence always needed that — a code block renders its
// content verbatim inside one <pre>, so a widget put inside it draws the row
// as the fence's last line, boxed in with the shell command it is about
// (measured by codeblock.mjs as 73px ABOVE the fence's own bottom).
//
// PROSE NEEDS IT TOO, and Task 18 is where that showed. A row pinned inside
// the paragraph grows the paragraph's own box by the height of the row, and
// the reviewer's click into their paragraph then lands in a
// contenteditable="false" widget instead of the prose: the caret does not
// move and what they type goes nowhere. Measured in rounds-ux.mjs — with the
// row inside, the click-End-type gesture left the .md unchanged; with the row
// after the node it lands. On screen this is the same place either way (the
// spec's "pinned instruction row UNDER the block"), and it keeps the coral
// block tint on the block rather than around the readout about it.
function pinAt(doc: PMNode, index: number): number {
  const end = blockEnd(doc, index);
  if (end < 0) {
    return -1;
  }
  return end + 1;
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
    if (end >= 0 && (w.was || w.added || w.note)) {
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
function setRows(view: EditorView, s: RowsState): void {
  const now = rowsKey.getState(view.state);
  if (now && JSON.stringify(now.spec) === JSON.stringify(s)) {
    return;
  }
  view.dispatch(view.state.tr.setMeta(rowsKey, s));
}

// The ordinary instruction — select words, type — carries no anchorKey; it is
// a highlight mark in the prose whose `run` attr is the thread's run. The spec
// pins every instruction under its block, so the block comes from the mark.
export function runBlockIndex(
  doc: {
    childCount: number;
    child(i: number): {
      descendants(
        cb: (n: {
          marks: readonly { attrs: Record<string, unknown> }[];
        }) => boolean | void,
      ): void;
    };
  },
  run: string,
): number {
  for (let i = 0; i < doc.childCount; i++) {
    let hit = false;
    doc.child(i).descendants((n) => {
      if (n.marks.some((m) => m.attrs.run === run)) {
        hit = true;
        return false;
      }
      return undefined;
    });
    if (hit) {
      return i;
    }
  }
  return -1;
}

// The asks of the newest REVISE round, or none. `reason` tells a revise apart
// from the other things a round can be (a restore, a could-not); the newest one
// is the round whose answers the page is showing.
function latestRevise(rounds: RoundView[] | null | undefined): AskView[] {
  let round: RoundView | null = null;
  for (const r of rounds ?? []) {
    if (r.reason === 'revise' && (!round || r.n > round.n)) {
      round = r;
    }
  }
  return round?.asks ?? [];
}

// Where a SENT ask's row hangs. The pending thread is gone by definition, but a
// thread that has not been sent yet can still be keyed the same way (the
// arrival poll and the versions poll are on different beats), so its anchor is
// preferred while it lasts — a key is exact and a quote is a text match.
function askBlockIndex(shell: AppShell, doc: PMNode, ask: AskView): number {
  const thread = shell.comments.find((t) => t.key === ask.key);
  const block = thread?.anchorKey
    ? shell.blocks.find((b) => b.key === thread.anchorKey)
    : undefined;
  if (block) {
    return block.index;
  }
  const byQuote = quoteBlockIndex(doc, ask.quote ?? '');
  if (byQuote >= 0) {
    return byQuote;
  }
  // The words the ask was on are gone — usually because the agent did what it
  // was asked and rewrote them. The change that claimed the ask knows where
  // it landed; without this an answered ask had no row at all, and the only
  // rows left were the ones whose words survived, reading `not applied`.
  const claimed = (shell.arrivalWas ?? []).find((w) =>
    w.asks?.includes(ask.text),
  );
  return claimed ? claimed.index : -1;
}

// The word a sent ask's row reads, per spec §2-§4. Exported for probe.mjs:
// `writing…` is the one of the three the browser gates cannot reach — the
// fixtures' `--on-revise` returns at once, so the revising window is shorter
// than a poll — and a vocabulary nothing pins is a vocabulary that drifts.
export function askState(
  phase: 'revising' | 'review' | 'cannot',
  answered: boolean,
): RowSpec['state'] {
  if (phase === 'revising') {
    return 'writing…';
  }
  return phase === 'review' && answered ? 'applied' : 'not applied';
}

// The mixin: rows follow the pending instructions; WAS/revised follow the
// arrival (Task 11).
export const rowMethods = {
  // THE ROUND KEEPS THE ROWS ALIVE AFTER THE PRESS. Rows used to be built from
  // `this.comments` alone, which is the PENDING list — so the instant Revise
  // was pressed the server emptied it and every row vanished from the paper,
  // taking spec §2-§4's `writing…`, `applied` and `not applied` with it. That
  // left the repo's own invariant — nothing the reviewer sent may ever
  // disappear — with no surface at all, because the unanswered-ask card lived
  // on History's landing and this branch deleted it.
  //
  // The round is the right source, not a second copy of pending: it is the
  // immutable ledger, it carries each ask's `text`, its `quote` and whether the
  // agent `answered` it, and it is already on the wire and already refreshed by
  // the versions poll. Rows built from it are NOT removable — a sent
  // instruction is a fact about the past, and a `×` on it would be offering to
  // un-say something the agent has already read.
  sentRows(this: AppShell, phase: 'revising' | 'review' | 'cannot'): RowSpec[] {
    const doc = this.editor.state.doc;
    return latestRevise(this.versionsPanel?.rounds).flatMap((a) => {
      const index = askBlockIndex(this, doc, a);
      if (index < 0) {
        return [];
      }
      const state = askState(phase, a.answered);
      return [
        {
          key: a.key,
          index,
          text: a.text,
          state,
          tone: state === 'not applied' ? 'coral' : 'accent',
          removable: false,
        },
      ];
    });
  },

  paintRows(this: AppShell): void {
    const phase = this.phase();
    if (phase === 'revising' || phase === 'review' || phase === 'cannot') {
      const rows = this.sentRows(phase);
      const was = this.arrivalWas ?? [];
      setRows(this.editor.view, {
        rows,
        was,
        // `review` is the one phase that does not tint: the block already wears
        // `.gly-revised` from the arrival, and a coral mark under an accent
        // wash would be saying the round is both done and outstanding.
        marked: phase === 'review' ? [] : rows.map((r) => r.index),
        revised: was.map((w) => w.index),
      });
      return;
    }
    const rows: RowSpec[] = [];
    const marked: number[] = [];
    for (const t of this.comments) {
      // Whole-doc rows live in the frame slot (Task 7), and a settled thread
      // has nothing pending about it — the same two cuts railThreads makes.
      if (t.resolved) {
        continue;
      }
      let index = -1;
      if (t.anchorKey) {
        const block = this.blocks.find((b) => b.key === t.anchorKey);
        if (block) {
          index = block.index;
        }
      } else if (t.run) {
        index = runBlockIndex(this.editor.state.doc, t.run);
      }
      // Unplaced: stays in the whole-doc slot's unplaced group.
      if (index < 0) {
        continue;
      }
      // Only `markup` reaches here now — the three sent phases returned above
      // — so the state is the one a pending instruction has: waiting to go.
      rows.push({
        key: t.key,
        index,
        text: t.entries[0]?.text ?? '',
        state: 'queued',
        tone: 'coral',
        removable: true,
      });
      marked.push(index);
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
