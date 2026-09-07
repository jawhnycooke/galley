// versions.ts — THE RECORD BEHIND THE SCRUBBER, and nothing else any more.
//
// THIS SURFACE COMPUTES NOTHING. The round list, the version numbers and the
// rendered document all come off the server already decided, because there is
// one implementation of each and it is Go's. A second one in the browser would
// agree on every document anyone tried and disagree on the one that mattered —
// the shape this codebase has paid for repeatedly (a run stamped in two places,
// a pairing re-derived across a wire, six agreeing spellings and one silence).
//
// HISTORY IS DELETED, AND THE SCRUBBER IS WHAT REPLACED IT. The spec is one
// sheet, no panes and no History drawer: changes are read INLINE at the head as
// WAS strips (web/history.ts's readArrivalInline) and earlier versions are read
// by dragging the timeline (web/timeline.ts). So the landing — a rail of round
// cards, a seed card, an empty line — and the reading stage — the views picker,
// side by side, region pinning, the change rail, the amber-until-read arrival —
// are gone with the chip that opened them. What is left is the RECORD:
//
//   - `rounds`, refreshed from `/_galley/versions`, which is what the timeline
//     draws its keyframes from and what the eyebrow reads an age off;
//   - `restoreButton`, with its two-click arming, which lives in the sheet's
//     eyebrow while the reviewer is off the head;
//   - the pure helpers other modules import, which are pure precisely so they
//     can be read without a browser.
//
// AND IT OWNS NO ELEMENT EXCEPT THE BUTTON. The `<section class="gly-versions">`
// this class used to build — a second document body, drawn while `main` was
// taken to `display: none` — is deleted with the reading stage it existed for.
// An earlier version is shown ON THE SHEET now: the scrubber's two papers sit
// in the frame where the draft's own paper does, so there is one column, one
// measure and one scroll position, and nothing to put back on the way out.
// `open` is still the state every neighbour branches on (paintReadout,
// paintSurfaces, the Esc chain); it just no longer has a panel behind it.

// THE WIRE'S OWN TYPES, GENERATED FROM THE GO STRUCTS THAT SEND THEM.
//
// web/wire.d.ts is written by internal/serve/wire_test.go and checked by `just
// verify`, so a field renamed on the Go side is a RED BUILD here rather than a
// `TypeError: Cannot read properties of undefined` weeks later in a gate
// nobody ran — which is exactly what `pending.suggestions` becoming
// `pending.instructions` cost. Nothing in this file describes the payload in
// its own words; describing it twice is how the two copies come to disagree.
import type { RoundView, VersionsView } from './wire';

// An ARRIVAL is NOT a round, and this interface is the place that says so. It
// is assembled in the browser from `GET /_galley/revise` — which carries the
// number that landed and the agent's exception, and nothing else — so it has
// no wire struct of its own and must not borrow RoundView's.
export interface Arrival {
  n: number;
  exception?: boolean;
  why?: string;
}

// BACK_TO_DRAFT is the way out of a version, and it lives in the PRIMARY's slot
// — the one place on this page a reviewer already looks for "the thing to press
// next". It is the scrubber's exit now; it was History's before.
export const BACK_TO_DRAFT = '← back to draft';

const RESTORE_ARM_MS = 4000;
// The armed label, spelled once. Its idle partner carries a version number and
// is composed at paint time.
const RESTORE_ARMED = 'replace draft?';
// The third face of the restore button. It is a LABEL SPAN like the other two
// and not a `textContent` write, and that distinction is the whole of the bug
// this constant exists to close — see paintRestore.
const RESTORE_BUSY = 'restoring…';

// ageSaid is the eyebrow's second clause — how long ago, in the chrome's own
// shorthand. It is deliberately COARSE: a card that says `4m ago` and a card
// that says `4m 12s ago` carry the same information and only one of them is
// scannable down a column of five.
export function ageSaid(at: string, now: number = Date.now()): string {
  const t = Date.parse(at || '');
  if (!Number.isFinite(t)) {
    return '';
  }
  const secs = Math.max(0, Math.round((now - t) / 1000));
  if (secs < 45) return 'JUST NOW';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${Math.max(1, mins)}M AGO`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}H AGO`;
  return `${Math.round(hours / 24)}D AGO`;
}

// arrivalSaid is what the readout says when a round ARRIVES — the one thing on
// this page the reviewer did not do themselves.
//
// IT NAMES THE SURFACE THAT CAN SHOW THE ROUND, which is the timeline: History
// is deleted and a sentence pointing at a door that is not there is worse than
// one that points nowhere.
//
// AND IT IS SHORT BECAUSE THE CELL ELLIPSISES AT ITS END. The readout is the
// bar's one flexible box and it truncates on the right, so a clause put last is
// a clause that can be lost — the ORDER IS THE TRUNCATION POLICY, which this
// codebase already states about `paintReadout` composing three clauses and had
// to be told again about one. Measured in a real browser at 1440px on a
// 16-character filename: `v3 · the agent revised the document — rounds shows
// what changed` rendered as `v3 · the agent revised the docum…`, so the half
// that says WHERE TO READ IT — the only actionable half — never reached the
// reviewer at all.
//
// THE EXCEPTION SPENDS ITS ROOM ON THE REASON, which is what the reviewer needs
// to write the next instruction from.
export function arrivalSaid(round: Arrival | null): string {
  if (!round || !round.n) {
    return '';
  }
  if (round.exception) {
    return `v${round.n} · could not${round.why ? `: ${round.why}` : ''}`;
  }
  return `v${round.n} · agent revised · see timeline`;
}

// workRounds is every round that is WORK — the file as galley opened it is not
// a round anybody had, and the scrubber draws it as the track's own first
// keyframe rather than as an exchange.
export function workRounds(
  rounds: RoundView[] | null | undefined,
): RoundView[] {
  return (rounds || []).filter((r) => !(r.n === 1 && r.reason === 'opened'));
}

// roundCards is WHAT A REVIEWER MEANS BY "A ROUND", which is not what the store
// means by one.
//
// The store records every version, and one exchange is TWO of them: the cut
// taken when Revise was pressed (the ask, and whatever the reviewer had typed
// into their own draft) and the cut taken when the agent returned (the answer,
// and the changes). Both carry the same instruction — the answering round
// resolves it through `answers`, which is the whole point of that field — so
// counting versions counted the same exchange twice.
//
// A ROUND IS THE ANSWERED CUT WHERE THERE IS ONE. An asking cut that some later
// round answers is folded into that round; an asking cut nobody has answered
// yet keeps its own, because a question outstanding is exactly the thing the
// reviewer wants counted. NOTHING IS DROPPED — every ask is still represented,
// which is the property, not "each filter looks right".
export function roundCards(
  rounds: RoundView[] | null | undefined,
): RoundView[] {
  const work = workRounds(rounds);
  const folded = new Set<number>();
  for (const r of work) {
    if (r.answers > 0) {
      folded.add(r.answers);
    }
  }
  return work.filter((r) => !folded.has(r.n));
}

// ordinalOf is a round's position among the exchanges, 1-based, or 0 for a
// round that is not one of its own. An asking cut folded into the round that
// answered it takes that round's ordinal, because they are one exchange and the
// reviewer counts exchanges. Computed on every paint from the list the server
// delivered, never stored — an ordinal renumbers, and CLAUDE.md's rule that an
// ordinal is not identity is exactly why nothing persists it.
export function ordinalOf(rounds: RoundView[], n: number): number {
  const cards = roundCards(rounds);
  for (let i = 0; i < cards.length; i += 1) {
    if (cards[i].n === n || cards[i].answers === n) {
      return i + 1;
    }
  }
  return 0;
}

export interface VersionsPanelOptions {
  // TASK 8 CORRECTION: was `Promise<T>`. entry.ts constructs VersionsPanel
  // with net.ts's own `getJSON`, which returns `Promise<T | null>` for any
  // T (a failed fetch resolves null, not a rejection) — net.ts's own header
  // already named this exact mismatch as "invisible only because entry.ts
  // is not yet typechecked (Task 8)". Both real callers below (refresh,
  // the diff loader) already fold `| null` into the T they request, so this
  // widening changes nothing they do; it only makes the type honest about
  // what net.ts's getJSON can actually return.
  getJSON: <T>(path: string) => Promise<T | null>;
  docName?: string;
  onOpen?: () => void;
  onClose?: () => void;
  onCount?: (n: number) => void;
  onRestored?: (n: number, message: string) => void;
  onStage?: (panel: VersionsPanel) => void;
}

export class VersionsPanel {
  getJSON: <T>(path: string) => Promise<T | null>;
  docName: string;
  open: boolean;
  rounds: RoundView[];
  selected: number;

  // THE DOM HANDLES, ASSIGNED HERE FROM DIRECTLY WITHIN THE CONSTRUCTOR.
  //
  // What was `build()` — called once, from this constructor, and from
  // nowhere else — is inlined into it below rather than kept as a separate
  // method. `strictPropertyInitialization` only traces assignments made
  // directly in the constructor's own body; a field assigned by a method the
  // constructor calls is, to the typechecker, still possibly never assigned,
  // and the honest fix is not a definite-assignment assertion (forbidden by
  // this conversion's own rules) but putting the assignment where the
  // checker can see it.
  restoreButton: HTMLButtonElement;
  restoreIdle: HTMLElement;
  restoreArmed: HTMLElement;
  restoreBusy: HTMLElement;
  // restoring is the button's third state, held here rather than read back off
  // the DOM for the reason CLAUDE.md gives for the armed-delete flag: transient
  // control state lives on the object, so a repaint re-derives it instead of
  // finding it half-written on an element.
  restoring: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCount: (n: number) => void;
  onRestored: (n: number, message: string) => void;
  onStage: (panel: VersionsPanel) => void;
  restoreArmedAt: number;

  constructor({
    getJSON,
    docName,
    onOpen,
    onClose,
    onCount,
    onRestored,
    onStage,
  }: VersionsPanelOptions) {
    this.getJSON = getJSON;
    this.docName = docName || '';
    this.open = false;
    this.rounds = [];
    this.selected = 0;
    this.onOpen = onOpen || (() => {});
    this.onClose = onClose || (() => {});
    this.onCount = onCount || (() => {});
    this.onRestored = onRestored || (() => {});
    this.onStage = onStage || (() => {});
    this.restoreArmedAt = 0;
    this.restoring = false;

    // DESTROY WEIGHT, AND NEVER A PEER OF A VIEW CONTROL. Restoring overwrites
    // the reviewer's draft and is the one act on this surface with no undo
    // outside git; it shipped as a bordered pill in the same row-style as the
    // view toggles, which made the loudest-consequence control on the page look
    // exactly like a way of LOOKING at something. Borderless, muted, and it
    // arms — see restore(). It is appended into the sheet's eyebrow by
    // makeFrame; nothing but this class builds or repaints it.
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'gly-versions-restore';
    // BOTH LABELS, IN ONE CELL, because this one arms. `restore vN as draft`
    // becomes `replace draft?` on its own click, and writing that straight into
    // textContent resized the control under the cursor between the arming press
    // and the confirming one — the second click landing somewhere the first was
    // not, on a button that overwrites the draft. `.gly-thread-delete` solved
    // this for the other destroy-weight verb and the copy never carried across;
    // `docs/design/2026-08-08-handoff-spec.md` §4 requires it of the WEIGHT, not
    // of that one button.
    const restoreIdle = document.createElement('span');
    const restoreArmed = document.createElement('span');
    restoreArmed.textContent = RESTORE_ARMED;
    // THREE FACES IN ONE CELL, not two and a `textContent` write. `restore()`
    // used to announce itself with `this.restoreButton.textContent =
    // 'restoring…'`, which REPLACES the button's children — so it destroyed
    // both spans above, and every later `paintRestore` wrote labels and
    // toggled classes on DETACHED nodes. A failed restore therefore left a
    // button reading "restoring…" for the life of the panel: enabled, since
    // paintRestore does clear `disabled`, and permanently mislabelled, with
    // the reserve that keeps it from moving on its own click gone with the
    // spans. Both failure branches called paintRestore and neither could
    // recover, because the thing they repaint was no longer in the document.
    const restoreBusy = document.createElement('span');
    restoreBusy.textContent = RESTORE_BUSY;
    restore.append(restoreIdle, restoreArmed, restoreBusy);
    // restore()'s own chain ends in a `.catch` that reports failure through
    // onRestored (didRestore -> say), so a listener wrapping it in `void`
    // loses nothing — the rejection already has somewhere to go before it
    // would reach here.
    restore.addEventListener('click', () => {
      void this.restore();
    });
    this.restoreButton = restore;
    this.restoreIdle = restoreIdle;
    this.restoreArmed = restoreArmed;
    this.restoreBusy = restoreBusy;
  }

  show() {
    this.open = true;
    this.onOpen();
    return this.refresh();
  }

  hide() {
    this.open = false;
    this.onClose();
  }

  // refresh reads the record and, unless a version is being read, lands on the
  // newest — which is what the scrubber's own head is.
  refresh(): Promise<void> {
    // THE GENERATED ENVELOPE, not an inline restatement of it. This read was
    // typed `{ doc?: string; rounds?: RoundView[] }` — the two field names in
    // the history payload that nothing held either side to, while every type
    // NAMED INSIDE it (RoundView) was under contract. A contract with
    // a hole in the envelope is a contract about the letters and not the
    // address. `versionsView` is in wireRoots now, so `doc` and `rounds` cannot
    // be renamed on the Go side without this failing to build.
    return this.getJSON<VersionsView | null>('/_galley/versions')
      .then((view) => {
        if (!view) {
          return;
        }
        this.rounds = view.rounds || [];
        this.onCount(this.rounds.length);
        if (view.doc) {
          this.docName = view.doc;
        }
        if (!this.rounds.some((r) => r.n === this.selected)) {
          this.selected = this.rounds.length
            ? this.rounds[this.rounds.length - 1].n
            : 0;
        }
        this.onStage(this);
      })
      .catch(() => {});
  }

  selectedRound(): RoundView | null {
    return this.rounds.find((round) => round.n === this.selected) || null;
  }

  paintRestore(): void {
    const round = this.selectedRound();
    if (!round) {
      this.restoreButton.disabled = true;
      return;
    }
    this.restoreButton.disabled = this.restoring;
    const armed =
      !this.restoring && Date.now() - this.restoreArmedAt < RESTORE_ARM_MS;
    // The idle label carries the version, so it is written every paint; the
    // armed one is fixed. Whichever is not showing is `.gly-reserved` — laid
    // out and never drawn, so the cell stays as wide as the wider of the two
    // and the button cannot move on its own click.
    this.restoreIdle.textContent = `restore v${round.n} as draft`;
    this.restoreIdle.classList.toggle('gly-reserved', armed || this.restoring);
    this.restoreArmed.classList.toggle('gly-reserved', !armed);
    this.restoreBusy.classList.toggle('gly-reserved', !this.restoring);
    this.restoreButton.classList.toggle('is-armed', armed);
    this.restoreButton.title = armed
      ? 'press again to overwrite the current draft with this version'
      : 'copy this version over the current draft — the draft is not sent, and git still has it';
  }

  restore() {
    const round = this.selectedRound();
    if (!round || this.restoreButton.disabled) return;
    if (Date.now() - this.restoreArmedAt >= RESTORE_ARM_MS) {
      this.restoreArmedAt = Date.now();
      this.paintRestore();
      window.setTimeout(() => {
        // Re-derived from panel state and repainted UNCONDITIONALLY. The old
        // form guarded the repaint on `lapsed`, which is false by construction
        // at exactly the moment the timer runs — a disarm that never reached
        // the screen. See CLAUDE.md's entry on armed deletes.
        this.restoreArmedAt = 0;
        this.paintRestore();
      }, RESTORE_ARM_MS);
      return;
    }
    this.restoring = true;
    this.paintRestore();
    return fetch('/_galley/versions/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: round.n }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const message =
            (await response.text()).trim() ||
            `restore failed: ${response.status}`;
          this.didRestore(round.n, message);
          return;
        }
        this.didRestore(round.n, '');
      })
      .catch((error) => {
        this.didRestore(round.n, String(error));
      });
  }

  // didRestore is the ONE way out of a restore, success or failure. The three
  // exits above wrote the same four lines each; they disagreed once already
  // (the `restoring` face outliving a failure) and one of them is how a face
  // gets left on screen with nothing to clear it.
  didRestore(n: number, message: string): void {
    this.restoreArmedAt = 0;
    this.restoring = false;
    this.paintRestore();
    this.onRestored(n, message);
  }
}
