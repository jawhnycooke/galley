// web/pending.ts owns the poll-and-refresh loop that keeps the reviewer's
// screen matching the server's `/_galley` state: `tick` watches for a saved
// projection and a moved revision, `refreshPending` re-reads the pending view
// and repaints census/revise/hold/rail from it, `noticeArrivals` decides
// whether a fresh arrival gets a strip or an on-screen ring, and
// `refreshVersions` keeps History's own count in step. It is a MIXIN — an
// object of methods `Object.assign`ed onto `App.prototype` in entry.ts — not
// a class of its own, so every method here still reads and writes `this` on
// the live App instance exactly as it did before the move (`this.rev`,
// `this.suggestions`, `this.comments`, `this.rail`, `this.strip`,
// `this.versionsPanel`, and so on).
//
// `this` IS TYPED AGAINST `AppShell` (web/appshell.ts) — see that file's own
// header for the this-typing decision this and every other mixin now shares.

import { getJSON, postJSON } from './net.ts';
import { runFor, markElement, runTop } from './runs.ts';
import { flash } from './card.ts';
import { verdictLabel } from './verdict.ts';
import {
  diffPending,
  arrivalMessage,
  arrivalNeedsStrip,
  queueArrivals,
} from './arrivals.ts';
import { AUTHOR } from './rail.ts';
import type { SuggestionLike } from './suggestions.ts';
import type {
  AppShell,
  ArrivalItem,
  PendingView,
  RevView,
  SavedView,
  Thread,
} from './appshell.ts';
import type { InstructionView, ReviewerChange } from './wire';

// instructionsToThreads is refreshPending's wire-shape adaptation, pulled
// out because it touches no `this` — it is a pure map over exactly the
// payload it is handed.
//
// The rounds-only wire carries immutable instructions, not mutable
// conversations. Adapt them to the established rail's presentation shape
// while keeping reply/resolve/decision state absent.
function instructionsToThreads(
  instructions: InstructionView[] | null,
): Thread[] {
  return (instructions || []).map((instruction): Thread => ({
    key: instruction.key,
    heading: instruction.quote || '',
    resolved: false,
    entries: [{ author: AUTHOR, at: instruction.at, text: instruction.text }],
    run: instruction.run || '',
    anchor: instruction.anchor || '',
    anchorKey: instruction.anchorKey || '',
    blockKind: instruction.blockKind || '',
    region: instruction.region || null,
    instruction: true,
  }));
}

// makeRevertFloat builds the one `× revert` pill that follows the pointer over
// the deletion ghosts. ONE element for every ghost, moved rather than rebuilt,
// for watchLit's reason at the other end: the ghosts are widget decorations
// and ProseMirror destroys and remakes them on every redraw, so a button owned
// by a ghost is a button that will not exist in a moment. It hangs off `body`
// rather than off the paper because nothing galley draws is ever inserted into
// `.ProseMirror` by hand — see rows.ts.
function makeRevertFloat(app: AppShell): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'gly-revert-float';
  b.textContent = '× revert';
  b.title = 'revert this edit';
  b.hidden = true;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    const key = b.dataset.key || '';
    b.hidden = true;
    if (!key) {
      return;
    }
    void postJSON('/_galley/revert', { key }).then((res) => {
      if (res.ok) {
        return app.refreshPending();
      }
      // THE SERVER'S OWN SENTENCE, for revertButton's reason (cards.ts): it
      // refuses a revert it cannot do exactly, and that reason is the only
      // thing that says why the words did not come back.
      return res.text().then((said) => {
        app.say(said.trim() || 'that edit could not be put back');
      });
    });
  });
  document.body.appendChild(b);
  app.revertFloat = b;
  return b;
}

// changeKeyFor answers which reviewer change a ghost is part of, by the text
// that was removed — see ghostEl (trail.ts) for why that is the only handle a
// ghost has. Exact first, then containment: the server's diff summarises a
// whole edited run where a ghost is one keystroke's worth of it.
//
// AMBIGUITY IS A NO. Deleting the word "the" in two paragraphs gives two
// changes that both answer to the same text; picking the first would put a
// `× revert` over one ghost that undoes the OTHER edit, silently and
// destructively. Two candidates therefore behave exactly as none do — no pill
// — and the reviewer reverts from the trail instead.
function changeKeyFor(changes: ReviewerChange[], old: string): string {
  const only = (match: (before: string) => boolean): string | null => {
    const hits = changes.filter((c) => c.key && match(c.before || ''));
    return hits.length === 1 ? hits[0].key || '' : null;
  };
  return (
    only((before) => before === old) ??
    only((before) => before.includes(old)) ??
    ''
  );
}

export const pendingMethods = {
  // The `× revert` pill over a deletion ghost. Delegated on the paper for
  // makeRevertFloat's reason, and bound ONCE — the listener outlives every
  // redraw of the decorations it is about.
  watchGhosts(this: AppShell): void {
    const paper = this.editor.view.dom;
    paper.addEventListener('mouseover', (e) => {
      const ghost = (e.target as Element | null)?.closest<HTMLElement>(
        '.gly-trail-ghost[data-old]',
      );
      if (!ghost) {
        return;
      }
      const key = changeKeyFor(this.changes, ghost.dataset.old || '');
      if (!key) {
        // Nothing to revert THROUGH: the server has not diffed this keystroke
        // into a change yet. No pill rather than a pill that does nothing.
        return;
      }
      const btn = this.revertFloat ?? makeRevertFloat(this);
      const r = ghost.getBoundingClientRect();
      btn.style.top = `${r.top + window.scrollY - 22}px`;
      btn.style.left = `${r.right + window.scrollX + 4}px`;
      btn.dataset.key = key;
      btn.hidden = false;
    });
    paper.addEventListener('mouseleave', (e) => {
      // Unless the pointer went TO the pill — it is a `body` child sitting
      // over the paper's own edge, so reaching for it leaves the paper, and
      // hiding it there would be a button that cannot be pressed.
      if (!this.revertFloat || e.relatedTarget === this.revertFloat) {
        return;
      }
      this.revertFloat.hidden = true;
    });
  },

  // tick watches the two things the server can tell us that the websocket
  // cannot: when the projection last reached DISK, and when something rewrote
  // the file underneath us.
  //
  // Deliberately no location.reload() on a rev change, unlike the review
  // page's overlay: in edit mode /rev is the document's own mtime and the
  // editor's own typing moves it every time the export debounce fires.
  // Reloading on that would throw away the reviewer's cursor mid-sentence.
  // The rev is used only as a cue that the pending list is worth re-reading —
  // which is also exactly when an agent's fresh suggestions have landed.
  tick(this: AppShell) {
    // A revision can be asked for from a terminal (`galley revise`) or from a
    // tab that has since been closed, so the counter is read on every poll
    // rather than only after this page's own button was pressed.
    this.readRevise();
    getJSON<SavedView>('/_galley/saved')
      .then((d) => {
        if (d && d.saved && d.saved !== this.savedMs) {
          this.savedMs = d.saved;
          this.paintReadout();
        }
      })
      .catch(() => {});
    getJSON<RevView>('/_galley/rev')
      .then((d) => {
        if (!d) {
          return;
        }
        // A restart builds a new document in a new room, and our websocket is
        // already being refused because the room we hold no longer exists. Only
        // a reload can reach the running document. Nothing is lost: every
        // mutation is projected to disk as it happens, so the file this run
        // parsed already contains our work.
        if (d.room && d.room !== this.room) {
          location.reload();
          return;
        }
        if (d.rev === this.rev) {
          return;
        }
        this.rev = d.rev;
        return this.refreshPending();
      })
      .catch(() => {});
  },

  refreshPending(this: AppShell): Promise<void> {
    return getJSON<PendingView>('/_galley/pending')
      .then((view) => {
        if (!view) {
          return;
        }
        const next: SuggestionLike[] = [];
        // NOTHING HERE MOVES THE CARET OR THE SCROLL. A refresh renders: it
        // repaints the census, rebuilds the rail, rings marks that are already
        // on screen and puts a sentence in a strip. The only code in this file
        // that scrolls is reveal(), and the only things that call reveal() are
        // a click, a keypress and the strip's `show me` button.
        const seen = this.prevSuggestions;
        // The binding carries the type rather than the empty literals
        // asserting it: `[]` infers `never[]`, which does not match the other
        // branch, and `as` is forbidden here. Annotating the const is the
        // narrowing-free way to say the same thing — diffPending's own return
        // type, named once at the place both branches have to satisfy.
        const change: ReturnType<typeof diffPending> =
          seen === null
            ? { arrived: [], resolved: [] }
            : diffPending(seen, next);
        this.prevSuggestions = next;

        this.suggestions = next;
        this.comments = instructionsToThreads(view.instructions);
        // `|| []` is load-bearing rather than defensive: `changes` is
        // `omitempty` on the Go side, so a round with no hand edits arrives
        // with the key ABSENT rather than as an empty array.
        this.changes = view.changes || [];
        this.blocks = view.blocks || [];
        // NO TRAIL IS ADOPTED FROM THIS PAYLOAD, because the payload has none:
        // `pendingView` is `{instructions, blocks}`. `adoptTrail` and
        // `applyServerTrail` are deleted with the save that was their only
        // reason for existing.
        // Withholding happens BEFORE the rail is painted, or a held card would
        // flash onto the screen and be removed on the next poll.
        const arrived = this.holding
          ? this.withhold(change.arrived)
          : change.arrived;
        this.reconcileRunSets(arrived, change.resolved);
        // Before the rail, not after: the count is not waiting on the rail to
        // render, because it does not come from the rail. It counts the
        // SERVER's projection, so it keeps telling the truth about held
        // arrivals while the rail is holding its tongue.
        //
        // The verdict reads the VIEW, not the rail, for the same reason: a
        // held arrival is markup pending whatever the rail shows, and the
        // server would refuse an approve over it with 409. paintRevise flips
        // the label here rather than on its own 1s beat, so the button and the
        // census it reads can never disagree for a tick.
        this.verdict = verdictLabel(view);
        this.pendingCount = (view.instructions || []).length;
        this.paintCensus();
        this.paintRevise();
        this.paintHold();
        this.paintRail();
        // The rows are the anchored half of that same list, pinned inside the
        // paper instead of beside it — see web/rows.ts. After paintRail for
        // one reason only: they are painted from the same three fields it was
        // (`comments`, `blocks`, the phase), so a single order keeps the rail
        // and the rows from ever disagreeing about one poll.
        this.paintRows();
        // An OPEN conversation is redrawn from the same fresh list every other
        // surface was just painted from — otherwise a reply the reviewer sent
        // from the bubble lands in the file and never appears in the only copy
        // of that conversation on screen. It declines to touch a card being
        // typed into; see SuggestionUI.restage.
        this.bubble.restage();
        // After the rail, because an on-screen arrival announces itself with
        // its own card, and the card has to exist to be measured.
        if (arrived.length) {
          this.noticeArrivals(arrived);
        }
        // LAST, BECAUSE IT COUNTS WHAT THE RAIL JUST DREW. The eyebrow's right
        // half is the pending count and the slot's empty line is asked whether
        // any whole-doc row exists — both are answers about the paint above.
        this.paintFrame();
      })
      .catch(() => {});
  },

  // reconcileRunSets is refreshPending's held-arrival bookkeeping, pulled out
  // because it is `this`-bound (`this.newRuns`, `this.held`,
  // `this.heldArrivals`) rather than because it is a second component: the
  // same two loops, called from the one place that ever called them, now
  // named for what they do together.
  reconcileRunSets(
    this: AppShell,
    arrived: ArrivalItem[],
    resolved: (string | undefined)[],
  ) {
    for (const a of arrived) {
      // A held/arrived entry always carries a run in practice (arrivals
      // are mark-derived and the run is minted server-side); the guard is
      // the honest narrowing the field's own optionality asks for, same
      // reasoning as stepOrder's.
      if (!a.run) {
        continue;
      }
      this.newRuns.add(a.run);
    }
    for (const run of resolved) {
      // diffPending's own declared return type says `resolved` may carry
      // `undefined` (a resolved run read off an entry whose `run` field
      // was itself optional) — a real case its signature already admits,
      // narrowed here rather than trusted.
      if (run === undefined) {
        continue;
      }
      this.newRuns.delete(run);
      // A held arrival decided from the CLI is no longer waiting for a
      // card, so it must leave the queue too — otherwise release would
      // announce work that is already gone.
      this.held.delete(run);
      this.heldArrivals = this.heldArrivals.filter((a) => a.run !== run);
    }
  },

  // --- the arrival strip ---
  //
  // AN ARRIVAL IS ANNOUNCED, NEVER NAVIGATED TO. This is the constraint the
  // whole surface exists to protect: the caret and the scroll never move on
  // their own, and only a `show me` click scrolls. That is the entire
  // difference between a co-author and an interruption.
  //
  // It runs in BOTH modes. Live mode is about whether the agent is woken
  // without being asked; an arrival is an arrival either way — `galley suggest`
  // from another terminal, or the results of a Revise — and a reviewer who was
  // not told what landed is in the same position regardless of how it got
  // there.
  noticeArrivals(this: AppShell, arrived: ArrivalItem[]) {
    const runs = this.runsNow();
    const viewport = {
      height: window.innerHeight || document.documentElement.clientHeight || 0,
      railVisible: !this.rail.root.hidden,
    };

    const unseen: ArrivalItem[] = [];
    for (const a of arrived) {
      // `a` is the loose arrival shape, not a full SuggestionLike (it carries
      // no `text`) — runFor only ever reads `kind`/`author` off it through
      // sameSuggestion, which is exactly what this reconstructs, so nothing
      // about the match changes.
      const suggestion: SuggestionLike = {
        kind: a.kind || '',
        run: a.run,
        author: a.author,
      };
      const run = runFor(runs, { run: a.run, suggestion });
      if (arrivalNeedsStrip({ top: runTop(this.editor.view, run) }, viewport)) {
        unseen.push({ ...a, section: this.sectionFor(run) });
        continue;
      }
      // On screen: its card is already amber and badged, so ring the text and
      // let the two meet in the reader's eye. NO SCROLL — by definition the
      // mark is already where they are looking.
      const mark = markElement(this.editor.view, run);
      if (mark) {
        flash(mark);
      }
    }

    // The census pulses for EVERY arrival, on screen or not. It is the durable
    // record — the strip fades, the count does not — so a reviewer who looked
    // away has one place that still knows something happened.
    this.pulseCensus();
    this.clearNewLater();
    if (unseen.length === 0) {
      return;
    }
    this.arrivalQueue = queueArrivals(this.arrivalQueue, unseen);
    this.stripBatch = this.strip.root.hidden
      ? unseen
      : this.stripBatch.concat(unseen);
    this.showStrip(arrivalMessage(this.stripBatch));
  },

  // Refreshing History also refreshes the count on its peer view control. It is
  // event-driven (send/arrival/verdict), not a background poll.
  //
  // Fire-and-forget: `refreshVersions` is declared `void` in AppShell (every
  // caller is a paint-and-move-on after send/arrival/verdict), and
  // `refresh()`'s own bare `.catch(() => {})` (versions.ts) already absorbs
  // whatever this would otherwise fail to report — a stale peer count until
  // the next event fires one of these three call sites again.
  refreshVersions(this: AppShell) {
    void this.versionsPanel.refresh();
  },
};
