// web/cards.ts owns the one card component and everything that positions
// it: threadCard — head, entries, edit/delete verbs, and its bubble and
// overall-card wearings — and paintAnchors, the placement pass that puts
// every card beside its own mark or block, in document coordinates.
// It is a MIXIN — an object of methods `Object.assign`ed onto
// `App.prototype` in entry.ts — not a class of its own, so every method
// here still reads and writes `this` on the live App instance exactly as
// it did before the move (`this.cards`, `this.rail`, `this.overall`,
// `this.comments`, `this.blocks`, `this.editor`, `this.sheetOpen`, and
// so on). `this` IS TYPED AGAINST `AppShell` (web/appshell.ts) — see that
// file's own header for the this-typing decision.
//
// blockElement and blockTop are private to this module: they were free
// functions in entry.ts with exactly two callers, paintAnchors and
// revealBlock, and both moved here with them.
//
// draftRoots STAYS in entry.ts — it reads `this.overall.root` off the
// live instance, which the shared prototype makes safe from any module.

import { cardShell, revealOn, revealMark } from './card.ts';
import { postJSON } from './net.ts';
import { age } from './suggestions.ts';
import {
  censusCounts,
  submitOnEnter,
  growOnInput,
  threadLabel,
  overallThreads,
  railThreads,
  threadPlacement,
  unplacedSaid,
  AUTHOR,
} from './rail.ts';
import { WHOLE_DOC_PLACEHOLDER } from './frame.ts';
import type { AppShell, Thread, ThreadEntry, Placement } from './appshell.ts';
import type { EditorView } from '@tiptap/pm/view';

// A BLOCK-ANCHORED INSTRUCTION IS PINNED UNDER ITS BLOCK, NOT BESIDE IT — see
// web/rows.ts, where the same thread is drawn as a widget decoration after the
// block it is about. The rail keeps the ANCHORLESS ones and the MARK-anchored
// ones: a row carries the instruction's text and
// one verb, `×`, and a mark-anchored instruction is the one a reviewer revises
// in place — `edit` at settle weight, `delete` at destroy weight — which only
// the card offers.

// How long the delete control stays armed after its first click. Long enough
// to read what it now says and press it again; short enough that a card left
// armed and forgotten is not a trap for whatever the next click was for.
const DELETE_ARM_MS = 4000;

// What the card says between the two clicks. A constant because the disarm
// path clears it only if it is still this sentence — an error message written
// there in the meantime is the reviewer's business, not ours to wipe.
const DELETE_ARM_NOTE = 'this removes the comment and its mark — click again';

// makeOverallCard's return shape — the whole-document instructions already
// filed. Named and exported here (its owning file) so appshell.ts can type
// `AppState.overall` and `AppMethods.makeOverallCard` against one spelling
// rather than a second, hand-copied shape.
//
// THE FORM IS NOT IN IT ANY MORE. This object used to carry `input`, `form`,
// `note` and `toggle` as well — the `+ instruction on the whole document`
// button and the box it opened, pinned as the rail's first card. That is the
// thing that left: see makeCaptureCard, and the rail's own header for the rule
// it broke. What is left here is filed work, which is what the rail is for.
export interface OverallCard {
  root: HTMLElement;
  inner: HTMLElement;
  entries: HTMLElement;
  head: HTMLElement;
}

// makeCaptureCard's return shape — the box a whole-document instruction is
// WRITTEN in, as opposed to the ones already written. Separate object because
// it is a separate lifetime: the entries above are painted on every poll and
// the capture card exists only while somebody is typing into it.
export interface CaptureCard {
  root: HTMLElement;
  head: HTMLElement;
  form: HTMLFormElement;
  input: HTMLTextAreaElement;
  note: HTMLElement;
  cancel: HTMLButtonElement;
}

// teachCard, heldArrivalsNotice and unplacedSection are three of
// paintRailCards' internal rendering steps, pulled out because none of them
// touches `this` — pure DOM builders over exactly the fields they are
// handed. paintRailCards keeps the ordering and the conditions under which
// each is used; only the construction moved.

// `teachCard` IS DELETED — see paintRailCards' empty branch for why the
// cold-open sentence has no card of its own any more.

// A slot with work outstanding and nothing in it needs a reason, or it reads as
// a broken panel. §11 fixes no copy for this state — it did not exist when the
// spec was written — so the sentence is the plainest true one, and it names the
// control that ends it.
function heldArrivalsNotice(held: number): HTMLElement {
  const holding = document.createElement('div');
  holding.className = 'gly-card gly-settled gly-docslot-held';
  holding.textContent =
    held === 1
      ? '1 arrival held — ▶ release shows it'
      : `${held} arrivals held — ▶ release shows them`;
  return holding;
}

// changeCard AND changesSection ARE DELETED, and with them the rail's
// `.gly-rail-changes` list of the reviewer's own edits. A HAND EDIT HAS NO CARD:
// 02-states-and-behavior.md §1 gives it page-only ghost and insertion marks,
// cleared on send, and ONE count — the footer trail's `{E} edit(s), {I}
// instruction(s) →` (verdict.ts, trailSaid). A second surface listing the same
// edits beside the prose that already shows them is the "one instruction, two
// surfaces" defect this branch spent Task 9 removing, in the other direction.
// Targeted revert survives where the spec puts it: `× revert` on the ghost
// itself (pending.ts, makeRevertFloat) through the same `revertChange` below.

function unplacedSection(unplaced: HTMLElement[]): HTMLElement {
  const section = document.createElement('section');
  // NAMED FOR THE SURFACE IT IS ON. It was `.gly-rail-unplaced` and it renders
  // in the sheet's whole-document slot — a rail name on a slot surface is how
  // the next reader goes looking for a column that does not exist.
  section.className = 'gly-docslot-unplaced';
  const head = document.createElement('div');
  head.className = 'gly-docslot-unplaced-head';
  head.textContent = unplacedSaid(unplaced.length);
  section.append(head, ...unplaced);
  return section;
}

// declinedOutcome, threadCardHead and lostAnchorLine are three of
// threadCard's internal rendering steps, pulled out because none of them
// touches `this` — they are label composition and DOM construction over
// exactly the fields they are handed. threadCard stays the one component
// (CLAUDE.md: it "is not the shared builder and must not become one"); these
// are its own peeled steps, not a second builder.

// SETTLED AND declined, both: ↺ reopen flips `resolved` and leaves the
// outcome standing (handleThreadResolve writes resolved only), so on the
// outcome alone a reopened conversation would carry "declined" back into
// the rail's band as its head — an open thread wearing a verdict.
function declinedOutcome(thread: Thread): boolean {
  return !!thread.resolved && thread.outcome === 'declined';
}

// KIND · WHAT IT IS ABOUT · AGE — the card's one fixed anatomy, and the AGE
// was the part this head was missing. Every other card in the deck carries
// it (see suggestionCard), and an instruction is the one object a reviewer
// accumulates over a session: without it a rail of four cards says nothing
// about which of them is from this sitting.
function threadCardHead(thread: Thread, label: string): string {
  const opened = (thread.entries || [])[0];
  return ['instruction', label, opened && opened.at ? age(opened.at) : '']
    .filter(Boolean)
    .join(' · ');
}

// WHICH WORDS WENT. An unplaced instruction is one whose anchor the
// reviewer deleted, and the thread still remembers what that anchor said —
// so the card quotes it, struck through in the removal colour the prose
// already speaks, instead of apologising in grey about a mark. See
// threadLabel, where the apology used to live.
function lostAnchorLine(heading: string): HTMLElement {
  const lost = document.createElement('div');
  lost.className = 'gly-card-body gly-lost-anchor-line';
  const on = document.createElement('span');
  on.textContent = 'on ';
  const quote = document.createElement('span');
  quote.className = 'gly-lost-anchor';
  quote.textContent = heading;
  lost.append(on, quote);
  return lost;
}

// revertChange asks the server to put one reviewer edit back. It is a free
// function and not a method because it is called from another file: the
// floating `× revert` over a deletion ghost (pending.ts), which is the one
// surface a hand edit has now that the rail's change card is gone. It stays a
// free function so that surface, and any later one, share the server's refusal
// sentence rather than each keeping a copy of it.
export function revertChange(app: AppShell, key: string): Promise<void> {
  return postJSON('/_galley/revert', { key }).then((res) => {
    if (res.ok) {
      return app.refreshPending();
    }
    return res.text().then((said) => {
      // THE SERVER'S OWN SENTENCE. It refuses a revert it cannot do
      // exactly — an ambiguous match, a partial removal — and that reason
      // is the only thing that tells the reviewer why the words did not
      // come back. Replacing it with a generic failure would be this
      // codebase's own "a status code means what the server meant by it".
      app.say(said.trim() || 'that edit could not be put back');
    });
  });
}

export const cardMethods = {
  // The growth watch, over this rail's own cards. See growthWatch: observing an
  // element already observed is a no-op, so this is safe to call on every
  // paint; unwatching is how the observer stops holding cards the last rebuild
  // destroyed.
  watchCards(this: AppShell) {
    this.cardSizes.watch(this.cards.map((card) => card.el));
  },

  unwatchCards(this: AppShell) {
    this.cardSizes.unwatch();
  },

  // paintAnchors AND setBandHeight ARE DELETED WITH THE RAIL. Between them
  // they were the placement pass: read every card's mark with `coordsAtPos`,
  // read every card's height, hand both to `placeCards`, and write the band's
  // own height so its absolutely positioned children held it up. Every line of
  // it wrote into `this.rail.band`, and there is no band — an instruction with
  // a place in the document is a ROW pinned under its block now (web/rows.ts),
  // which ProseMirror positions, and the only cards left are anchorless ones,
  // which are in flow in the sheet's slot and have never had coordinates.
  //
  // The scroll and resize listeners that drove it went with it (entry.ts), as
  // did `scheduleAnchors`. `stackCards` and `placeCards` stay: History's
  // version rail is the other caller and still measures its own column.

  // bubbleThreadCard is the fifth wearing of the one card: the rail's band, the
  // whole-document panel, the settled list, the sheet, and now a conversation
  // floating over the prose on the mark it is about. It is the SAME threadCard,
  // and the two things done around it here are both about where it ends up
  // rather than what it is.
  //
  // this.cards is paintAnchors' work list, and threadCard pushes every ANCHORED
  // card into it. A card floating over the document must never be positioned by
  // the rail's band, so the list is set aside and put back — the same move
  // paintSheet makes, for the same reason, and for the same reason it is done
  // here rather than by withholding the anchor.
  //
  // THE PLACEMENT IS TRUE, NOT CONVENIENT. Task 1 handed this card's sibling a
  // hardcoded `{ where: 'anchorless' }` and every anchored conversation was drawn with
  // the adrift dash and captioned "not tied to a mark" — a card telling the
  // reviewer its highlight was gone while they were looking straight at the
  // highlight. threadPlacement is asked instead, and its answer here is 'mark'
  // by construction: the bubble found this thread BY ITS RUN (see threadFor),
  // and a thread with a run is exactly what threadPlacement calls anchored.
  bubbleThreadCard(this: AppShell, thread: Thread): HTMLElement {
    const keep = this.cards;
    this.cards = [];
    const el = this.threadCard(thread, threadPlacement(thread, this.blocks));
    this.cards = keep;
    el.classList.add('gly-bubble-card');

    // ONLY THE CONVERSATION SCROLLS. This card is capped to the room its mark
    // leaves (SuggestionUI.roomFor), so on any thread longer than that gap
    // something is below the fold — and what was below the fold was the ACTIONS
    // ROW. A reviewer on a phone could read the top of a thread and reach
    // neither `✓ resolve` nor `delete`. So the head, the reply box and both
    // verbs are pinned and the entries are the one thing that gives, exactly as
    // .gly-overall pins its head and its input.
    //
    // The region is made HERE rather than in threadCard because the other four
    // surfaces have no cap and so need no region, and changing the component
    // for five surfaces to suit one is how a card stops being one card.
    const said = el.querySelectorAll(':scope > .gly-thread-entry');
    if (said.length) {
      const region = document.createElement('div');
      region.className = 'gly-bubble-said';
      // Inserted where the first entry stood, so the order the card was built
      // in survives the move: head, conversation, reply, verbs.
      el.insertBefore(region, said[0]);
      region.append(...said);
    }
    return el;
  },

  // --- the whole-document instructions already filed ---
  //
  // WHAT THIS SECTION USED TO BE, AND THE ONE THING THAT LEFT IT. It was a
  // permanent panel pinned as the rail's FIRST CARD, carrying a `+ instruction
  // on the whole document` button, the box that button opened, and the threads
  // already filed. R7's complaint had been that there was nowhere to say
  // anything about the file as a whole, and an always-visible affordance
  // answered it.
  //
  // IT ANSWERED R7 IN THE ONE PLACE THAT COULD NOT HOLD IT. The rail holds live
  // work only — *here is what needs you, beside the text it is about* — and a
  // `+ add` button needs nothing and is beside nothing. It was chrome standing
  // in the work column, and that placement caused BOTH of Court's reported
  // defects at once: it scrolled out of reach on any document longer than a
  // screen (the rail is `position: absolute` in the PAGE, so its first card is
  // reachable at exactly one scroll position), and opening it slid every
  // anchored card 39.29px off its mark, because `paintAnchors` floors every
  // card at the band's own top and the band no longer started at the rail's
  // top. Three better placements were proposed and all three were wrong for the
  // same reason; the button did not need a better place in the rail, it needed
  // to not be in the rail.
  //
  // SO CAPTURE IS CHROME NOW — a control in the bar beside `Instructions`,
  // `History` and `Revise`, and a right-click in the document (web/menu.ts) —
  // and the TYPING happens in `makeCaptureCard`'s card, which is in the rail
  // because an instruction being written IS live work. What is left here is the
  // filed threads, which were always live work and always belonged.
  //
  // The document-anchored threads are its entries and are taken out of the
  // rail's own list (see railThreads) — a note about the whole file rendered in
  // both places is R9's two-objects complaint arriving through a new surface.
  // AND THE FILED THREADS LEFT THE RAIL TOO, WHICH IS THE OTHER HALF OF THE
  // SAME MOVE. The verb went to the frame's whole-doc slot (history.ts); a
  // list of instructions about the document is about the document, so it goes
  // where the verb that makes it is — directly above the paper, in the slot,
  // with the dashed `+` row kept last so the way to make another is always at
  // the foot of the ones already made.
  paintOverall(this: AppShell) {
    if (!this.overall) {
      this.overall = this.makeOverallCard();
    }
    const slot = this.frame?.slot;
    if (slot && this.overall.root.parentElement !== slot) {
      slot.appendChild(this.overall.root);
      if (this.captureBtn) {
        slot.appendChild(this.captureBtn);
      }
    }
    // Captured once, so the rest of this method reads a narrowed local
    // rather than re-reading the optional `this.overall` field after the
    // calls below (`this.threadCard`) would otherwise invalidate its
    // narrowing.
    const overall = this.overall;
    const threads = overallThreads(this.comments);
    const list = overall.entries;
    list.textContent = '';
    // NOTHING TO SHOW, AND THE SLOT IS STILL RESERVED — those are two claims
    // and this line has to make both.
    //
    // The panel used to be permanent because it carried the affordance: a
    // reviewer had to be able to find the verb on a document with no
    // whole-document instructions yet. The verb is in the bar now, so a head
    // saying `ON THE WHOLE DOCUMENT` above nothing would be chrome in the work
    // column one paint later — which is the thing this whole change removes.
    //
    // SO THE INK GOES AND THE BOX STAYS. The first cut of this hid the ROOT,
    // and `web/rounds-ux.mjs` caught it: `.gly-overall-head` carries
    // `.gly-rail-head`, THE ONE SLOT at the top of the rail, shared with
    // History's `‹ all rounds` and its `ROUNDS — NEWEST FIRST` — one height in
    // all three states, so switching mode swaps the label and not the layout.
    // Collapsing it made the draft rail's head 0/0 against History's 116.2/34,
    // so the map sat 34px higher in one mode than the other and moved when the
    // reviewer changed modes. Reserve, do not collapse: the same primitive the
    // sub-bar row and `.gly-capture` use, and for the same reason.
    //
    // The entries list is empty here, so it contributes no height of its own;
    // what is held is exactly the head's slot.
    overall.root.classList.toggle('gly-overall-quiet', threads.length === 0);
    for (const thread of threads) {
      // 'anchorless' verbatim, not merely "unanchored": a note about the whole file
      // is the one thread that genuinely has no coordinates, so it gets no
      // light — there is nothing for a note about the whole file to light, and
      // the panel is not beside the prose in the first place.
      const row = this.threadCard(thread, {
        where: 'anchorless',
        index: -1,
        region: null,
      });
      // `.gly-row-doc` is the slot's own pill — ONE class, carrying its own
      // whole rule, and deliberately not also `.gly-row`: that class belongs
      // to the rows pinned inside the paper (rows.ts) and its bare selector
      // would win over this one on background and margin. `paintFrame` counts
      // these to decide whether the slot still needs its empty line.
      row.classList.add('gly-row-doc');
      list.appendChild(row);
    }
  },

  makeOverallCard(this: AppShell): OverallCard {
    const root = document.createElement('section');
    // A BAND WITH A COLUMN IN IT, and no longer a card. The band is full bleed
    // so it reads as chrome hanging off the bar; the column inside carries the
    // document's own measure, because a note about the document is prose and
    // prose set 1978px wide on a 2000px window is what Court was looking at.
    // `gly-card` came off with the same change — this is a panel, and the card
    // border, padding and pointer it brought were all being overridden anyway.
    root.className = 'gly-overall gly-overall-rail';
    const inner = document.createElement('div');
    inner.className = 'gly-overall-inner';
    root.appendChild(inner);

    // A LABEL, AND NO LONGER A BUTTON. The toggle that stood here opened the
    // form; the form is `makeCaptureCard`'s and is opened from the bar. What
    // the head has to do now is say what the cards under it are about, which is
    // the one thing a head was ever for.
    // `.gly-rail-head` — THE ONE SLOT AT THE TOP OF THE RAIL, shared with
    // History's `‹ all rounds` and its `ROUNDS — NEWEST FIRST`. One height in
    // all three states, so switching mode swaps the label and not the layout.
    const head = document.createElement('div');
    head.className = 'gly-card-head gly-overall-head gly-rail-head';
    head.textContent = 'on the whole document';

    const entries = document.createElement('div');
    entries.className = 'gly-overall-entries';

    inner.append(head, entries);
    return { root, inner, entries, head };
  },

  // --- writing one: the capture card ---
  //
  // A CARD, IN THE RAIL, AND IT COVERS RATHER THAN DISPLACES.
  //
  // It is a child of `.gly-rail` and `position: absolute` within it, above the
  // band on z-index. Three things follow, and each of them is one of the two
  // defects this replaces:
  //
  //   · NOTHING IN FLOW CHANGES WHEN IT OPENS. The band's top is where it was,
  //     so every anchored card is still on its mark. That is §3's 39.29px,
  //     gone by construction rather than by a re-measure.
  //   · IT IS DRAWN AT THE VIEWPORT, not at the rail's top, and its `top` is
  //     computed from `chromeFrame()` — the bar's MEASURED height, never a
  //     constant, because the bar folds. That is §13: reachable at any scroll
  //     position, because it is placed against the window rather than against
  //     the document.
  //   · IT COVERS THE CARDS UNDER IT. A disclosure covers; it does not push.
  //     The band already accepts sliding over overlapping as a stated trade,
  //     and a box the reviewer is typing into is the one box allowed to win.
  //
  // It does not follow the scroll while open, deliberately, and that is the
  // same contract the composer popover has: a surface that chases the viewport
  // while somebody types in it is a surface that moves under the caret.
  openCapture(this: AppShell) {
    // The panel is where the card LIVES now — it is inserted under the
    // whole-document head, above the filed threads. paintOverall builds the
    // panel and inserts it before the band; a click can beat the first paint,
    // so build it here rather than assume it. See makeOverallCard.
    if (!this.overall) {
      this.paintOverall();
    }
    if (!this.capture) {
      this.capture = this.makeCaptureCard();
    }
    const overall = this.overall;
    const capture = this.capture;
    if (overall && capture.root.parentElement !== overall.inner) {
      overall.inner.insertBefore(capture.root, overall.entries);
    }
    // The frame's whole-doc slot is the surface this card lives on now. A
    // shell that built no frame (no `.ProseMirror`) has nowhere to open it,
    // and a control that reports success and shows nothing is the defect the
    // rail-hidden guard this replaces existed to prevent.
    if (!this.frame) {
      return;
    }
    capture.note.textContent = '';
    capture.input.disabled = !!this.sealed;
    capture.input.value = '';
    // Assigning `value` fires no `input` event, so without this the box keeps
    // the height the LAST instruction grew it to. See growOnInput.
    capture.input.dispatchEvent(new Event('input'));
    capture.root.hidden = false;
    // WHILE SOMEBODY IS WRITING ABOUT THE WHOLE DOCUMENT, THE DOCUMENT RECEDES.
    // The selection composer dims every block but the one it is about; this
    // instruction is about all of them, so it dims all of them. Paint only —
    // opacity takes no space, so nothing under the cursor moves.
    document.body.classList.toggle('gly-doc-composing', true);
    capture.input.focus();
  },

  closeCapture(this: AppShell) {
    // The class is cleared whether or not the card was ever built: closeCapture
    // is reached from Esc, from entering History and from a landed verdict, and
    // a dimmed document with no composer over it is unreadable.
    document.body.classList.toggle('gly-doc-composing', false);
    if (!this.capture) {
      return;
    }
    this.capture.root.hidden = true;
    this.capture.note.textContent = '';
  },

  makeCaptureCard(this: AppShell): CaptureCard {
    // ONE BOX, AND IT IS THE CARD. The first cut of this had a `.gly-capture`
    // wrapper with a `.gly-capture-inner.gly-card` inside it, and the wrapper
    // carried the position while the inner carried the card — which put the
    // card's left edge and its WIDTH one indirection away from the two
    // coordinates every other card in the rail is written with, and got the
    // width wrong by the rail's own padding. `just layers` §9 reads every card
    // in the rail, whatever it is in, and holds them to one left edge and one
    // width; there is nothing for a wrapper to do that this element cannot do
    // itself, so there is no wrapper. See the stylesheet for the measurement.
    const root = document.createElement('section');
    root.className = 'gly-capture gly-card';
    root.hidden = true;

    // THE PREFIX THE PINNED ROW WEARS, so the thing being made and the thing
    // that appears are recognisably one object — the rule `headComposer`
    // already follows on the passage composer. It said `INSTRUCTION · WHOLE
    // DOCUMENT` on its own line while this was a card in the rail among cards
    // that each had to name their own scope; in the whole-doc slot the scope
    // is the slot, so it is `whole doc ↳` in front of the box instead — the
    // same mark the filed rows carry.
    const head = document.createElement('span');
    head.className = 'gly-capture-head';
    head.textContent = 'whole doc ↳';

    const form = document.createElement('form');
    form.className = 'gly-overall-form';
    // A TEXTAREA, and the change is the contract rather than the look. As a
    // single-line <input> this field filed on Enter only through the browser's
    // implicit form submission, and Shift-Enter could not break a line at all
    // — so the one surface galley asks for prose about the WHOLE document was
    // the one surface that could not hold a second sentence. Two rows, the
    // same as every reply box, and the same submitOnEnter contract.
    //
    // AND IT GROWS, which is §6 of the live review: `rows` is where it starts
    // and was also where it ended. The cap is this box's own `max-height` — see
    // growOnInput for why the number is not in the TypeScript.
    const input = document.createElement('textarea');
    input.className = 'gly-overall-input';
    input.rows = 2;
    // §11 fixes this string verbatim; it is the slot's own constant now.
    input.placeholder = WHOLE_DOC_PLACEHOLDER;
    growOnInput(input);
    form.append(head, input);

    const note = document.createElement('div');
    note.className = 'gly-card-note';

    // THE WAY OUT IS VISIBLE. Esc reaches `closeCapture` through onKey, and a
    // surface whose only exit is a key nobody was told about is a surface with
    // no exit — the argument the composer's own `cancel` already carries, and
    // this box is the composer's twin on the other scope.
    //
    // ITS OWN CLASSES, AND THE FIRST CUT BORROWED THE COMPOSER'S. This button
    // wore `.gly-composer-cancel` because it does the composer's job — and the
    // seal reaches the composer's cancel through `.gly-composer button`, a
    // DESCENDANT selector, which this button is not underneath. So a sealed
    // review had two `.gly-composer-cancel` in the tree and killed one:
    // measured by `just layers` §8 as `{found: 2, killed: false}`, which is the
    // "the flag was set and the control looked alive" defect that section
    // exists for. One spelling naming two objects is the same fault as two
    // spellings naming one. The PAINT is still one rule — the stylesheet lists
    // both selectors — and `.gly-capture button` is in SEALED_VERBS now, which
    // is how the seal reaches this one.
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'gly-capture-cancel';
    // `×`, like the pinned rows' remove: the bar is one line and the word
    // `cancel` beside `↵ pin` made it two verbs of equal weight.
    cancel.textContent = '×';
    cancel.title = 'cancel';
    cancel.addEventListener('click', () => this.closeCapture());
    const esc = document.createElement('span');
    esc.className = 'gly-capture-esc';
    esc.textContent = 'esc cancels';
    const actions = document.createElement('div');
    actions.className = 'gly-capture-actions';
    actions.append(cancel, esc);

    // fileNote is the one write, reached two ways: Enter through
    // submitOnEnter, and the form's own submit — which a textarea never fires
    // implicitly, so that listener is kept for what it actually still does,
    // refusing a navigation should anything ever submit this form.
    const fileNote = () => {
      // FLATTEN NEWLINES TO A SPACE BEFORE FILING. A whole-document note is
      // stored inline as `{>>@document …<<}`, and CriticMarkup has no way to
      // hold a newline — checkNote (internal/suggest/anchor.go) refuses one
      // rather than write a note that reads back cut short. But this box is a
      // multi-line textarea that invites paragraphs, so the reviewer's own
      // affordance produced input the format bounced. A blank line between two
      // sentences of an instruction is spacing, not structure the agent parses:
      // joining on a single space keeps every word and every order, and the
      // instruction reaches the agent the same. `<<}` is left to the server —
      // genuinely unwritable and vanishingly rare, it earns a refusal, not a
      // silent rewrite.
      const text = input.value.replace(/\s*\n\s*/g, ' ').trim();
      // AN EMPTY PIN IS A CANCEL, not a no-op. The box used to swallow the
      // press and sit there, which reads as a control that did not work; the
      // reviewer who pins nothing has decided not to write one, and the slot
      // takes that as the answer it is.
      if (!text) {
        this.closeCapture();
        return;
      }
      input.disabled = true;
      note.textContent = 'filing…';
      // comment_document, not a second spelling of it: the endpoint that files
      // a note on the whole file already exists and is the one `galley
      // comment --on-document` and the agent use. A rail-only op would be a
      // second way to write the same {>>@document …<<}, and the two would
      // drift the first time either grew a rule.
      postJSON('/_galley/instruct', {
        op: 'comment_document',
        text,
        author: AUTHOR,
      })
        .then((res) => {
          // THE SEAL IS THE ONLY WRITER IN THE SEALING DIRECTION, and a verdict
          // that landed while this POST was in flight wins over the box's own
          // in-flight flag. `false` here was the same shape that produced two
          // findings on this branch, seen from the other side: the success path
          // below re-derives the flag through `refreshPending`, but both
          // failure paths return without one, so a review sealed mid-submit
          // kept a live note box until the next poll's `applySealedVerbs` — a
          // sub-second window, and a live control on a sealed page is the exact
          // thing the seal exists to remove.
          input.disabled = !!this.sealed;
          if (!res.ok) {
            return res.text().then((body) => {
              note.textContent = body.trim() || `failed: ${res.status}`;
            });
          }
          input.value = '';
          input.dispatchEvent(new Event('input'));
          note.textContent = '';
          // THE CARD IS THE WRITING, SO IT GOES WHEN THE WRITING IS FILED. The
          // instruction it just made is about to be painted as a card of its
          // own in the panel above; leaving this box open over it would show
          // the reviewer the same sentence twice, once as work and once as a
          // draft they had already sent.
          this.closeCapture();
          return this.refreshPending();
        })
        .catch((err) => {
          // Same rule as the branch above, and this one has no `refreshPending`
          // behind it at all.
          input.disabled = !!this.sealed;
          note.textContent = `failed: ${err}`;
        });
    };
    submitOnEnter(input, fileNote);
    // THE KEY IS ON THE BUTTON'S FACE. Enter has filed this box since it was a
    // rail card and still does; what it never did was say so, and a surface
    // whose only way out is a key nobody was told about is the argument
    // `cancel` above already makes. `↵ pin` is one control naming the gesture
    // and offering itself, and it is built after `fileNote` because it is the
    // second way in to that one write rather than a second write.
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'gly-capture-pin';
    pin.textContent = '↵ pin';
    pin.addEventListener('click', () => fileNote());
    actions.prepend(pin);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      fileNote();
    });

    // `head` is inside the form now — it is the box's prefix, not a card head.
    root.append(form, actions, note);
    return { root, head, form, input, note, cancel };
  },

  // THE ANCHORLESS GROUP RENDERS IN THE SHEET'S SLOT NOW, and that is the only
  // thing this method still puts anywhere. The rail is deleted: there is no
  // band to position anchored cards in, because an instruction with a place in
  // the document is a ROW under its block, and no notice flow beneath it,
  // because the two things that lived there are answered elsewhere — the teach
  // card by the slot's own empty line and the ? sheet, and the held-arrivals
  // sentence by the slot, which is where a reviewer with nothing else on screen
  // is already looking.
  paintRailCards(this: AppShell) {
    const slot = this.frame?.slot;
    for (const el of slot?.querySelectorAll(
      '.gly-docslot-unplaced, .gly-docslot-held',
    ) ?? []) {
      el.remove();
    }
    // Nothing in this.cards survives the line above, and the observer watching
    // them for growth must not outlive them either — a stale observation is a
    // repaint scheduled for a card that no longer exists.
    this.unwatchCards();
    this.cards = [];

    // Before the empty-state return, and into its own slot: the overall card is
    // permanent. "Nothing pending" is a statement about the work, not about
    // whether there is anywhere to say something — and a settled document is
    // exactly when a reviewer is most likely to want to say one thing about the
    // whole of it.
    this.paintOverall();
    // THE SETTLED REGION IS NOT PAINTED HERE ANY MORE, and the reason it used to
    // be — "nothing pending is exactly the state a reviewer looks for what they
    // settled in, so it must be built before the empty-state return" — is
    // answered better by where it went. It is a section of the SHEET now, which
    // is painted whenever the sheet is open, at every width, whatever the map
    // holds. The old ordering hazard cannot recur because there is no return to
    // be ahead of.
    this.paintNoteState();

    // The census counts the SERVER's projection; the rail draws only what hold
    // is letting through. The two can honestly disagree, and this is the one
    // place that has to know it: an empty rail with a non-zero count is
    // "holding", not "settled", and saying "settled" there would be the editor
    // telling the reviewer their document is done when it is not.
    const census = censusCounts({
      suggestions: this.suggestions,
      comments: this.comments,
    });
    const held = this.heldArrivals.length;
    // A ROUND WITH EDITS IN IT IS NOT EMPTY, and this test used to say it was.
    // The empty state offers the teach card — *select any words to ask for a
    // change* — which is the right thing to say to a reviewer who has done
    // nothing, and the wrong thing to say to one who has just deleted a
    // paragraph: their edit IS in the round and it IS what Revise will send.
    // The edits have no cards any more (see changeCard's epitaph above) and the
    // count is still read from the round, not from the rail's contents.
    if (
      census.pending === 0 &&
      census.threads === 0 &&
      this.changes.length === 0
    ) {
      // THE TEACH CARD IS DELETED. `HOW THIS WORKS — select any words in the
      // document to ask for a change` was a dashed card in the rail's margin,
      // and it was the last thing the rail still drew: on every cold open it
      // floated at the right of a page whose design has no right-hand column.
      // Both halves of what it said are already on screen without it — the
      // slot's own empty line says where an instruction goes, and the `?` sheet
      // lists the five gestures — so this branch has nothing left to paint but
      // the figures. They still carry their ⊕ when nothing is pending: a
      // settled document is exactly when someone reads it closely enough to
      // point at part of a picture.
      this.paintFigures();
      return;
    }

    // THE PROPOSAL LOOP IS DELETED, and with it the `paired` set that kept a
    // conversation off the thread list when its own proposal card carried it.
    // Both existed for `suggestionCard`, which nothing builds — `this.suggestions`
    // is empty by construction on the rounds-only wire. One conversation, one
    // object still holds; there is simply only one object left to be.
    // Instructions whose original highlight is gone still belong in this
    // rail. They cannot be positioned beside prose, so collect their complete
    // cards for a small in-flow section after the anchored map.
    const unplaced = this.paintRailThreads();

    // The figures, after the cards: a pin's click has to find a card that is
    // already in the DOM.
    this.paintFigures();

    if (held > 0 && unplaced.length === 0) {
      slot?.appendChild(heldArrivalsNotice(held));
    }

    if (unplaced.length > 0) {
      slot?.appendChild(unplacedSection(unplaced));
    }
  },

  // railThreads drops the resolved ones — a settled thread has nothing
  // pending about it and no highlight left to point at; it stays in the
  // sidecar and in `galley pending`, and the map is for what is still open —
  // AND the document-anchored ones, which the overall card above owns.
  //
  // Split out of paintRailCards because it is `this`-bound (`this.held`,
  // `this.blocks`, `this.threadCard`) rather than because it is a second
  // component: it is the same one loop, called from the one place that ever
  // called it, now named for what it does. Returns the anchorless cards for
  // paintRailCards' own unplaced section; an instruction that HAS a place in
  // the document is drawn by its row and gets no card here at all.
  paintRailThreads(this: AppShell): HTMLElement[] {
    const unplaced: HTMLElement[] = [];
    for (const thread of railThreads(this.comments)) {
      if (thread.run && this.held.has(thread.run)) {
        // A thread whose highlight is held is a card not yet shown, same as
        // any other arrival.
        continue;
      }
      if (thread.resolved) {
        // A settled thread has nothing pending about it and no highlight left
        // to point at. It stays in the sidecar and in `galley pending`; the map
        // is for what is still open.
        continue;
      }
      // NOT `!!thread.run`. A thread has a run only if it hangs on a MARK, and
      // a block or figure thread has none by construction — so that predicate
      // sent every one of them out of the map, far from the figure it was
      // about, and drew a connector from it to nothing (that line is deleted;
      // the wrong question outlived it, which is why this is still here).
      // threadPlacement is the question that was actually being asked: does
      // this thread have a place in the document, and how is it found?
      //
      // AN INSTRUCTION WITH A PLACE HAS A ROW, AND A ROW IS ALL IT HAS. The
      // block-anchored ones lost their card when the row took over everything
      // it carried; the mark-anchored ones lose it here, for the same reason
      // and by the spec's own rule that a pinned row offers `×` and nothing
      // else. One instruction on two surfaces was the whole defect, and
      // "revising your own words" is not a second surface's job.
      const place = threadPlacement(thread, this.blocks);
      if (place.where === 'anchorless') {
        unplaced.push(this.threadCard(thread, place));
      }
    }
    return unplaced;
  },

  // suggestionCard IS DELETED. It drew the proposal card — kind head, the
  // struck/underlined substitution body, a reply box and the ✓ accept / ✗ reject
  // pair — for every entry in `this.suggestions`, and `this.suggestions` is a
  // literal empty array: `pendingView` is `{instructions, blocks}` and carries
  // no suggestions at all, so `refreshPending` assigns it from `const next = []`
  // and no card was ever built. Nothing replaces it on the rail: the rail's one
  // card is `threadCard`, the instruction, and its verbs are edit and delete.

  // A comment is ONE object. It used to be two — a suggestion card offering
  // accept and reject on the highlight, and a separate entry list below it
  // showing what was actually said — which asked the reviewer to decide the
  // anchor of a conversation as though it were an edit. A thread has one verb.
  //
  // `place` is threadPlacement's verdict: 'mark' for a thread on a highlight,
  // 'block' for one on a block or a figure region, 'anchorless' for a thread with
  // nowhere in the document to sit. The first two are positioned in the band and
  // can be connected to what they are about; the third is never handed to the
  // stacker, and it never draws a line, because a line says "this card is about
  // THAT" and an anchorless card has no THAT.
  //
  // The overall card passes 'anchorless' too: its threads are about the whole file,
  // which is the one anchor with no coordinates at all.
  threadCard(this: AppShell, thread: Thread, place: Placement): HTMLElement {
    // `place || {...}` is a dead fallback now — `Placement` is never
    // null/undefined per this method's own signature, and every call site
    // (paintOverall, paintRailCards, bubbleThreadCard, sheet.ts) always
    // passes a real one. Left rather than deleted, per this migration's own
    // rule: typing proves it unreachable, and Task 9 sweeps dead guards.
    const at = place || { where: 'anchorless', index: -1, region: null };
    const anchored = at.where !== 'anchorless';
    // cardShell — the one anatomy, shared with the suggestion card and with
    // History's rail. `head` comes back already in the card; the body is asked
    // for below only where there is a lost anchor to quote, because a thread
    // card's entries and verbs follow the head directly.
    const { el, head } = cardShell(
      'gly-thread',
      thread.resolved ? 'gly-resolved' : '',
    );
    // tabIndex HERE and not only through `revealOn`: an anchorless thread card
    // gets no reveal — there is nowhere to go — and it still has to be reachable
    // by keyboard, because `delete` and `edit` are on it.
    el.tabIndex = 0;
    el.dataset.run = thread.run || '';
    // Its own key, so a region pin on a figure can find the card it belongs to
    // — a thread anchored to a block has no run to be found by.
    el.dataset.key = thread.key || '';

    // What this thread is ABOUT, decided in one place for all three shapes —
    // see threadLabel. A block or document thread is not adrift: it has no
    // mark because it never had one, which is a different fact from a
    // highlight that went missing and must not wear the same sentence.
    const about = threadLabel(thread, { anchored });
    // Every thread card carries its own head, including the ones in the
    // whole-document panel — the panel's own head is chrome voice summoning
    // the margin, not a repetition of what the card underneath says.
    //
    // A DECLINED NO STAYS VISIBLE. Declining a proposal settles its thread
    // with outcome "declined" (handleDecline), and in the settled region that
    // record leads with which no it was rather than with the generic "thread".
    // ONE CLASS, PAINT ONLY — the kind-rule cascade lesson: a card-state rule
    // declares paint and never position (see .gly-card.gly-declined).
    //
    if (declinedOutcome(thread)) {
      el.classList.add('gly-declined');
    }
    head.textContent = threadCardHead(thread, about.label);

    // Only when there is something to quote: a block or document thread
    // never had a mark, so it is not adrift and has nothing to have lost.
    if (about.adrift && thread.heading) {
      el.appendChild(lostAnchorLine(thread.heading));
    }

    for (const entry of thread.entries || []) {
      el.appendChild(this.entryRow(entry));
    }

    // Declared before the handlers that report through it, rather than after:
    // a closure over a const declared further down works, and reads like a bug.
    const note = document.createElement('div');
    note.className = 'gly-card-note';

    // An instruction is immutable work for the next round, not a conversation
    // and not a proposal. It can still be removed before it is sent.
    const actions = document.createElement('div');
    actions.className = 'gly-card-actions gly-instruction-actions';
    // EDIT BEFORE DELETE, AND AT A DIFFERENT WEIGHT. An instruction the
    // reviewer got slightly wrong had exactly one verb on it, and that verb
    // was the irreversible one — so the cheapest way to change a word was to
    // destroy the instruction and write it again. Settle weight per
    // docs/design/2026-08-08-handoff-spec.md §4 (a single outlined pill, no
    // partner); `delete` keeps the destroy weight and its two-click arm, with
    // the specced 2rem clear between them, and must never regress to a pill.
    actions.appendChild(this.editButton(thread, el, note));
    actions.appendChild(this.deleteButton(thread, el, note));
    el.appendChild(actions);
    el.appendChild(note);

    if (!anchored) {
      // No place to point at. For a RANGE thread that means the pairing was
      // ambiguous or the mark is gone, and the card says so rather than
      // offering a jump that cannot land; for a block or document thread it
      // means only that a mark was never the anchor, so it says nothing.
      el.classList.toggle('gly-adrift', about.adrift);
      // Only when there is something to say. This line runs AFTER the actions
      // are built, so an unconditional write erases the "click again" sentence
      // a rebuilt-but-armed delete control just put there — and a block or
      // document thread's note is empty by design, which is exactly the case
      // that armed card is in.
      if (about.note) {
        note.textContent = about.note;
      }
      return el;
    }

    // The title and the handler are ONE fact, which is why `revealOn` sets
    // both: `.gly-card.gly-thread:not([title])` is what paints an unanchored
    // card's cursor, and it was keyed on the title precisely so it could not
    // drift from the early return above.
    revealOn(el, () => {
      if (at.where === 'block') {
        // A block thread has no run and no span, so there is nothing for
        // reveal's mark lookup to find. What the reviewer is asking is the
        // same question either way — WHERE is this — so the block itself is
        // scrolled to and rung.
        this.revealBlock(at.index);
        return;
      }
      this.reveal(thread.run, el);
    });

    // Only PLACED cards are recorded: this.cards is what paintAnchors measures
    // and stacks, and a card in the loose block is in flow. blockIndex is what
    // tells the two apart there — it is read on the very next paint and never
    // stored anywhere that outlives it, because an index renumbers.
    this.cards.push({
      el,
      run: thread.run,
      thread,
      blockIndex: at.where === 'block' ? at.index : -1,
      region: at.region,
    });
    return el;
  },

  // editButton is the settle-weight verb: it keeps every word the reviewer
  // wrote and offers them back for changing.
  //
  // THE OPEN EDITOR LIVES ON THE APP, keyed by the thread's stable key, for
  // exactly the reason the armed delete flag does: paintRail destroys and
  // rebuilds every card on every pending refresh — the 1.5s poll and every
  // mutation — so an editor held in this closure is an editor that vanishes
  // mid-sentence. The textarea carries a `data-draft` key so carryDrafts moves
  // its value, its selection and its focus across the rebuild, which is the
  // same contract every reply box in this file has.
  //
  // IT IS ONE MUTATION, NOT A DELETE AND A RE-FILE. See the "edit" case in
  // handleInstruction: both halves of the change — the note in the .md and the
  // entry in the sidecar — land together or neither does.
  editButton(
    this: AppShell,
    thread: Thread,
    el: HTMLElement,
    note: HTMLElement,
  ): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gly-thread-edit';
    b.textContent = 'edit';
    b.title = 'change the words of this instruction';
    b.addEventListener('click', () => {
      this.editingThread =
        this.editingThread === thread.key ? null : thread.key;
      this.paintRail();
    });
    if (this.editingThread !== thread.key) {
      return b;
    }
    // The card is in edit mode: the box and its two verbs replace the row.
    b.classList.add('is-open');
    const box = document.createElement('div');
    box.className = 'gly-thread-editor';
    const text = document.createElement('textarea');
    text.className = 'gly-thread-edit-text';
    text.rows = 2;
    text.dataset.draft = `edit:${thread.key}`;
    const opened =
      (thread.entries || []).find((e) => e.author === AUTHOR) ||
      (thread.entries || [])[0];
    text.value = (opened && opened.text) || '';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'gly-thread-edit-save';
    save.textContent = 'save';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'gly-thread-edit-cancel';
    cancel.textContent = 'cancel';
    cancel.addEventListener('click', () => {
      this.editingThread = null;
      this.paintRail();
    });
    const send = () => {
      const next = text.value.trim();
      if (!next) {
        note.textContent = 'an instruction with no words is a delete';
        return;
      }
      el.classList.add('gly-busy');
      note.textContent = 'saving…';
      postJSON('/_galley/instruct', {
        op: 'edit',
        key: thread.key,
        text: next,
        author: AUTHOR,
      })
        .then((res) => {
          el.classList.remove('gly-busy');
          if (!res.ok) {
            return res.text().then((body) => {
              // THE WORDS STAY IN THE BOX. A failed save that also closed the
              // editor would be a failed save that ate the sentence, which is
              // the one outcome an edit verb may never have.
              note.textContent = body.trim() || `failed: ${res.status}`;
            });
          }
          this.editingThread = null;
          note.textContent = '';
          return this.refreshPending();
        })
        .catch((err) => {
          el.classList.remove('gly-busy');
          note.textContent = `failed: ${err}`;
        });
    };
    save.addEventListener('click', send);
    submitOnEnter(text, send);
    const row = document.createElement('div');
    row.className = 'gly-card-actions gly-thread-editor-actions';
    row.append(save, cancel);
    box.append(text, row);
    el.appendChild(box);
    return b;
  },

  // deleteButton is the destructive verb, and everything about it is chosen so
  // that a slip cannot reach it.
  //
  // It is NOT where resolve is: it sits at the far end of the row (CSS pushes
  // it right), it is the quieter of the two, and it takes TWO clicks — the
  // first arms it and rewrites it as "delete?", the second sends. The arming
  // lapses on its own, so a card left armed and forgotten is not a trap for the
  // next click.
  //
  // THE ARMED STATE LIVES ON THE APP, NOT IN THIS CLOSURE, and that is not
  // tidiness. paintRail destroys and rebuilds every card on every pending
  // refresh — the 1.5s poll and every mutation — so a flag held here was
  // MEASURED surviving about a second: the first click armed a button that no
  // longer existed when the second one landed, and the verb could not be
  // completed at all. Same hazard the reply drafts are carried across, and the
  // same answer: key it by the thread's stable key, and let the rebuilt card
  // render itself already armed. The timestamp is what makes the arming lapse
  // whether or not the card that armed it is still in the DOM.
  //
  // A confirm() dialog would be the obvious alternative and is the wrong one:
  // a modal blocks the whole page, and this editor is a live document with a
  // websocket under it.
  deleteButton(
    this: AppShell,
    thread: Thread,
    el: HTMLElement,
    note: HTMLElement,
  ): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gly-thread-delete';
    // Both labels, always both present, stacked in one grid cell — see
    // .gly-thread-delete. The button is therefore always as wide as `delete?`,
    // and arming changes which one is painted, never how much room it takes.
    const rest = document.createElement('span');
    rest.textContent = 'delete';
    const armedLabel = document.createElement('span');
    armedLabel.textContent = 'delete?';
    b.append(rest, armedLabel);
    b.title = 'remove this thread and its mark — irreversible outside git';
    const paintLabel = (armed: boolean) => {
      rest.classList.toggle('gly-reserved', armed);
      armedLabel.classList.toggle('gly-reserved', !armed);
    };
    paintLabel(false);
    const armedNow = () =>
      this.armedDelete === thread.key &&
      Date.now() - this.armedAt < DELETE_ARM_MS;
    const clear = () => {
      if (this.armedDelete === thread.key) {
        this.armedDelete = null;
      }
    };
    const reset = () => {
      paintLabel(false);
      b.classList.remove('gly-armed');
      if (note.textContent === DELETE_ARM_NOTE) {
        note.textContent = '';
      }
    };
    const arm = () => {
      paintLabel(true);
      b.classList.add('gly-armed');
      note.textContent = DELETE_ARM_NOTE;
    };
    if (armedNow()) {
      arm();
    }
    b.addEventListener('click', () => {
      if (!armedNow()) {
        this.armedDelete = thread.key;
        this.armedAt = Date.now();
        const armedAt = this.armedAt;
        arm();
        // THE EXPIRY IS A CLOCK AND THE PAINT HAS TO FOLLOW IT. This closure
        // used to read `const lapsed = armedNow()` and repaint only `if
        // (lapsed)` — and `armedNow` is `Date.now() - armedAt < DELETE_ARM_MS`,
        // evaluated AT exactly DELETE_ARM_MS, which is false by construction.
        // So the repaint was dead code and the label was stuck: measured five
        // seconds after arming, the button still read `delete?` and still
        // carried its armed note, on state that had already expired. Not
        // destructive — the next click on the LIVE card re-armed, because
        // `armedDelete` really was cleared — but a button reading `delete?`
        // that does not delete is its own lie.
        //
        // It repaints from APP STATE and unconditionally, which is CLAUDE.md's
        // rule for exactly this: `paintRail` destroys and rebuilds every card,
        // so the `b`, `note` and `paintLabel` this closure holds are detached
        // by the time it runs — resetting them writes to an element nobody can
        // see. The armed flag lives on the App keyed by the thread's stable
        // key, and re-rendering from it is the only way the reviewer sees the
        // change.
        //
        // The instant is captured so a RE-ARM of the same thread is not
        // disarmed early by the previous arm's timer: the key alone would
        // match, and four seconds after the first press the second press's
        // window would close.
        window.setTimeout(() => {
          if (this.armedDelete !== thread.key || this.armedAt !== armedAt) {
            return;
          }
          this.armedDelete = null;
          this.paintRail();
        }, DELETE_ARM_MS);
        // THE BUTTON JUST WRITTEN TO MAY ALREADY BE DETACHED. A real mouse
        // click blurs the editor on mousedown, and that blur repaints the rail
        // — so by the time the click event runs, the card holding this button
        // has been replaced and nothing the handler writes is on screen.
        // Measured: a synthetic .click() armed and a real one did not. Painting
        // from the app's own state is what puts the armed control where the
        // reviewer is looking, which is the whole reason the state is on the
        // app rather than in this closure.
        this.paintRail();
        return;
      }
      clear();
      el.classList.add('gly-busy');
      note.textContent = 'deleting…';
      postJSON('/_galley/instruction/delete', { key: thread.key })
        .then((res) => {
          el.classList.remove('gly-busy');
          if (!res.ok) {
            reset();
            return res.text().then((body) => {
              note.textContent = body.trim() || `failed: ${res.status}`;
            });
          }
          return this.refreshPending();
        })
        .catch((err) => {
          el.classList.remove('gly-busy');
          reset();
          note.textContent = `failed: ${err}`;
        });
    });
    return b;
  },

  // revealBlock is reveal() for a thread with no mark: scroll the block into
  // view and ring it. Same shape as flashThreadCard in the other direction.
  revealBlock(this: AppShell, index: number) {
    if (this.sheetOpen) {
      this.closeSheet();
    }
    const el = blockElement(this.editor.view, index);
    if (!el) {
      return;
    }
    // revealMark, the same call a card's reveal ends in: the scroll is
    // VERIFIED as well as asked for, which this site did not do — `smooth` is a
    // request and a browser that ignores it left the block rung and the page
    // where it was.
    revealMark(el);
  },

  // One row of a conversation, wherever a conversation renders — the thread
  // card's entries and the proposal card's are the same rows on purpose, so
  // the two surfaces cannot drift into saying the same reply two ways.
  entryRow(this: AppShell, entry: ThreadEntry): HTMLElement {
    const row = document.createElement('div');
    row.className = 'gly-thread-entry';
    const who = document.createElement('span');
    who.className = 'gly-thread-who';
    who.textContent = [entry.author || 'someone', age(entry.at)]
      .filter(Boolean)
      .join(' · ');
    const said = document.createElement('p');
    said.textContent = entry.text;
    row.append(who, said);
    return row;
  },
};

// --- reaching a whole-block target from a block thread's card ---

// blockElement finds the DOM node rendering a top-level block by its INDEX
// among the document's children — the same ordinal suggest.BlockRef.Index
// carries, and the same one paintFigures already pairs figures by.
//
// The index is read from the last /_galley/pending and used immediately. It is
// never stored: it renumbers the moment anything is inserted above it, which is
// why the key exists at all (CLAUDE.md — an ordinal ID is not identity). What
// is stored is the KEY, and the index is looked up from it on every paint.
function blockElement(view: EditorView, index: number): Element | null {
  const doc = view.state.doc;
  if (!Number.isFinite(index) || index < 0 || index >= doc.childCount) {
    return null;
  }
  let pos = 0;
  for (let i = 0; i < index; i += 1) {
    pos += doc.child(i).nodeSize;
  }
  let dom: ReturnType<EditorView['nodeDOM']>;
  try {
    // nodeDOM, not domAtPos: this position is BEFORE the node, and domAtPos
    // resolves that to the parent — which is the whole document.
    dom = view.nodeDOM(pos);
  } catch {
    return null;
  }
  return dom instanceof Element ? dom : null;
}

// blockTop IS DELETED WITH THE PLACEMENT PASS. It measured a block or a
// figure region's top for `paintAnchors`, which is gone; a block-anchored
// instruction is a row under its block now and ProseMirror positions it.
