// web/keys.ts owns the rail's keyboard: the Esc chain, and the j/k stepper
// that walks pending suggestions in document order. It is a MIXIN — an object
// of methods `Object.assign`ed onto `App.prototype` in entry.ts — not a
// class of its own, so every method here still reads and writes `this` on
// the live App instance exactly as it did before the move (`this.stepped`,
// `this.suggestions`, `this.cards`, `this.sheetCards`, `this.versionsPanel`,
// and so on).
//
// `this` IS TYPED AGAINST `AppShell` (web/appshell.ts), the shape every
// mixin's `this` shares from here on — see that file's own header for the
// three options weighed and why this one was chosen.

import { stepPending, keyTargetIsEditable } from './rail.ts';
import { motion } from './card.ts';
import { rowsKey } from './rows.ts';
import { closeMenu, menuOpen, moveMenuFocus } from './menu.ts';
import type { AppShell } from './appshell.ts';

export const keyMethods = {
  // onKey is the rail's keyboard, and it is deliberately quiet while anything
  // is being typed into. The document is contenteditable, so j and k are
  // ordinary letters most of the time; Esc is the way out of the field and into
  // the stepper, which is why it is listed as blurring rather than only
  // dismissing.
  onKey(this: AppShell, event: KeyboardEvent) {
    // THE PALETTE'S ONE CHORD, before the modifier guard that keeps every
    // other chord the browser's: Cmd/Ctrl+K opens the drawer with the filter
    // focused, the convention every command palette uses.
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === 'k'
    ) {
      event.preventDefault();
      this.openDrawer(true);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === 'Escape') {
      // THE DRAWER IS TOPMOST when it is open: it is a full-height overlay
      // over everything the chain below dismisses. A filter with text clears
      // first; a second Esc closes.
      if (this.drawerOpen && this.drawer) {
        if (this.drawer.filter.value) {
          this.drawer.filter.value = '';
          this.paintDrawer();
        } else {
          this.closeDrawer();
        }
        return;
      }
      // Esc is the one key that acts INSIDE a field: it dismisses what is open,
      // and failing that hands focus back to the page so the rest of these keys
      // become available.
      // THE MENU IS TOPMOST, so it is first — the ordering rule this chain is
      // built on. It is drawn over everything the pointer was on and it is the
      // most recent thing the reviewer opened, so a press that closed anything
      // else while it was up would be closing something they cannot see.
      if (menuOpen(this.menu)) {
        closeMenu(this.menu);
        return;
      }
      this.hideRefusal();
      this.bubble.hide();
      this.hideComposer();
      // The verdict menu closes on Esc like every other surface here — a
      // disclosure the press opened, put away by the one key that means "put
      // that away". Reopening is a fresh press.
      if (this.verdictOpen) {
        this.closeVerdictMenu();
        return;
      }
      if (this.sheetOpen) {
        this.closeSheet();
        return;
      }
      // THE VERSION ON SCREEN, and the position in this chain is the ordering
      // rule this chain is built on: TOPMOST FIRST. The read-only version
      // floats at z-index 44, over the whole-document panel below it, so Esc
      // has to reach it before the panel — otherwise a reviewer with both open
      // presses Esc, watches something they cannot see close, and presses it
      // again.
      // READING A VERSION is one surface with one exit: Esc returns to the
      // head. It used to be two stacked meanings — release the pinned change,
      // then leave the reading mode — and the pin went with the change rail.
      if (!this.atHead()) {
        this.scrubHome();
        return;
      }
      // The capture card closes on Esc like every other surface here — it is
      // something on screen that is in the way, and the one key that means
      // "put that away" has to reach it. Its `cancel` button says the same
      // thing for the mouse; the two are one exit spelled for two reviewers.
      if (this.capture && !this.capture.root.hidden) {
        this.closeCapture();
        return;
      }
      const active = document.activeElement;
      // `document.activeElement` is `Element | null` to the DOM's own types,
      // and `blur()` is only on the HTML/SVG element mixin, not on `Element`
      // itself — a real `instanceof` narrowing where this used to read the
      // method's presence off `active.blur`. Every element `keyTargetIsEditable`
      // answers true for (an input, a textarea, a select, or a
      // contenteditable node) is an HTMLElement in this document, so nothing
      // reachable here changes which branch runs.
      if (keyTargetIsEditable(active) && active instanceof HTMLElement) {
        active.blur();
      }
      return;
    }
    // ←/→ STEP THE TIMELINE, BEFORE THE MENU'S OWN ARROWS: a reviewer
    // scrubbing keyframes is not typing into anything and has no menu open,
    // so the guard here is the same editability check the stepper below
    // uses, done early because the target keys collide with nothing else.
    const editable =
      keyTargetIsEditable(event.target) ||
      keyTargetIsEditable(document.activeElement);
    if (
      !editable &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      this.timeline
    ) {
      event.preventDefault();
      this.scrubStep(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    // THE MENU'S OWN ARROWS, BEFORE THE EDITABLE GUARD AND BEFORE THE STEPPER.
    // A menu the mouse can reach and the keyboard cannot is half a menu, and
    // `j`/`k` walking the document underneath an open menu would be two
    // surfaces answering one press.
    if (menuOpen(this.menu)) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (moveMenuFocus(this.menu, event.key === 'ArrowDown' ? 1 : -1)) {
          event.preventDefault();
        }
      }
      return;
    }
    if (
      keyTargetIsEditable(event.target) ||
      keyTargetIsEditable(document.activeElement)
    ) {
      return;
    }
    // `a` AND `r` ARE DELETED, AND THE GUARD BELOW OUTLIVES THEM. They ran
    // `decideStepped`, which POSTed /_galley/accept and /_galley/reject — two
    // of the twelve endpoints internal/serve/rounds_surface_test.go asserts
    // are 404. Nothing could reach them: `stepped` is armed only by `step`, and
    // `step` walks `this.suggestions`, which is empty by construction on the
    // rounds-only wire), so nothing is lost: there is no verdict on an
    // instruction. The rail's card verbs are edit and delete, and they are on
    // the card.
    //
    // NOT WHILE AN EARLIER VERSION IS ON THE SHEET. That is a READING mode:
    // `body.gly-scrubbing` puts a version's paper where the draft's is and the
    // whole premise of the surface is that it computes nothing and decides
    // nothing. `j`/`k` are inert there — the rows they walk are the draft's,
    // and the draft is not on screen — but they still moved `this.stepped`,
    // which is state a reading mode may not write. Every neighbour already knew:
    // `paintReadout`, `paintSurfaces` and the Esc chain all branch on the panel
    // being open. This switch was the one reader that did not ask, which is this
    // codebase's most-repeated shape — the rule spelled in every place but one,
    // and the silent place is the one that costs you.
    //
    // j/k AND `↓ next` WALK THE INSTRUCTION CARDS — see stepOrder, which used
    // to walk `this.suggestions.filter(decidable)` over a wire that carries no
    // suggestions, and so reached nothing at all. The note that stood here
    // named both exits ("point the stepper at the instruction cards or take
    // that check with it") and this is the first of them.
    if (!this.atHead()) {
      return;
    }
    switch (event.key) {
      case 'j':
        event.preventDefault();
        this.step(1);
        break;
      case 'k':
        event.preventDefault();
        this.step(-1);
        break;
      default:
        break;
    }
  },

  // stepOrder is what `j`/`k` walk: the PINNED ROWS first — the rows plugin's
  // own state (rows.ts) rather than anything re-derived here, so a block or
  // whole-doc instruction cannot drift from what is on screen — and then any
  // instruction card the rows miss. `SetAnchor` (internal/review/doc.go) only
  // stamps `anchorKey` for a thread that is not a range of prose, so a
  // selection-anchored instruction has no row: it is a mark in the paper and a
  // card in the rail, and the rail's own cards are still what places it here.
  //
  // WHEN NEITHER HAS ANYTHING AND THE PHASE IS REVIEW, the pending
  // instructions are gone (landed and cleared) but the WAS strips are still
  // up, so the walk falls back to the `.gly-revised` blocks they hang under —
  // keyed by their position in the document, the only identity a revised
  // block has once its row is gone.
  stepOrder(this: AppShell): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const s = rowsKey.getState(this.editor.state);
    for (const r of s?.spec.rows ?? []) {
      if (!seen.has(r.key)) {
        seen.add(r.key);
        out.push(r.key);
      }
    }
    const surface = this.cards.length ? this.cards : this.sheetCards;
    for (const card of surface) {
      const key = card.thread.key;
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    if (out.length) {
      return out;
    }
    if (this.phase() !== 'review') {
      return [];
    }
    return [...document.querySelectorAll('.gly-revised')].map(
      (_, i) => `revised:${i}`,
    );
  },

  // step moves to the next pinned row (or, in review with nothing pinned, the
  // next revised block), outlines its card the same way it always has, and
  // scrolls the row itself into view.
  step(this: AppShell, direction: 1 | -1) {
    const next = stepPending(this.stepOrder(), this.stepped, direction);
    if (!next) {
      return;
    }
    this.stepped = next;
    // The sheet's cards too: with the sheet open it is the surface showing
    // the list, and outlining a card behind it would be outlining nothing.
    const all = this.cards.concat(this.sheetCards);
    for (const card of all) {
      card.el.classList.toggle('gly-stepped', card.thread.key === next);
    }
    // AND THE ROW ITSELF WEARS THE STEP. The card that used to carry
    // `.gly-stepped` for an anchored instruction is deleted — the row is its
    // one surface now — so a walk that only scrolled would move the page and
    // mark nothing, which is a stepper the reviewer cannot follow. Same class,
    // same ring, on whichever surface the instruction actually has.
    let row: Element | null = null;
    for (const el of document.querySelectorAll('.gly-row')) {
      const on = el.getAttribute('data-key') === next;
      el.classList.toggle('gly-stepped', on);
      if (on) {
        row = el;
      }
    }
    if (row) {
      row.scrollIntoView({ block: 'center', behavior: motion() });
      return;
    }
    if (next.startsWith('revised:')) {
      const i = Number(next.slice('revised:'.length));
      document
        .querySelectorAll('.gly-revised')
        [i]?.scrollIntoView({ block: 'center', behavior: motion() });
      return;
    }
    // A selection-anchored instruction has no row (see stepOrder) — its card
    // is the only place on screen that names it, so that is what is revealed.
    this.flashThreadCard(next);
  },
};
