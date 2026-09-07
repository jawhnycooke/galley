// web/history.ts owns History: the versions door, entering and leaving the
// reading mode, restoring a version as a fresh draft, and the arrival strip
// that says a round came back.
//
// It is a MIXIN — an object of methods `Object.assign`ed onto `App.prototype`
// in entry.ts — not a class of its own, so every method here still reads and
// writes `this` on the live App instance exactly as it did before the move
// (`this.editor`, `this.census`, `this.versionsPanel`, `this.bar`, and so on).
// `this` IS TYPED AGAINST `AppShell` (web/appshell.ts) — see that file's own
// header for the this-typing decision.
//
// THIS WAS THE PARTITION'S SINGLE BIGGEST OPEN CALL. Most of these methods'
// DOM writes land on bar-owned elements — the versions chip, the census strip
// — so a partition by pixels would file them under the bar. They are not bar
// chrome. web/versions.ts's own header states History "is a READING MODE and
// not a second application," and a reading mode filed under a module named
// for the bar buries that distinction exactly where the next reader will not
// look.
//
// paintVersionsButton also paints `this.bar.versions`, the narrow bottom-bar
// chip owned by web/sheet.ts. That cross-group write is expected: mixins all
// land on one shared prototype, so writing another module's element here is
// ordinary, not a boundary violation.
//
// readArrival is driven from readRevise, which lives in web/verdict.ts now. A
// method here being called from a method in another mixin is fine — same
// prototype, same `this`.

import {
  arrivalSaid,
  STAGE_ROUNDS,
  VERSIONS_LABEL,
  VERSIONS_NAME,
} from './versions.ts';
import type { AppShell, ReviseView } from './appshell.ts';
import type { DiffView } from './wire';
import { getJSON } from './net.ts';
import { matchBlocks } from './rows.ts';
import { forgetVersionHTML, scrubState } from './timeline.ts';
import { WHOLE_DOC_LABEL } from './frame.ts';

// CAPTURE_LABEL is the visible door to writing an instruction about the
// document as a whole. It said `+ Instruction` while the door was a chip in
// the bar and had a bar's width to live inside; the door is the dashed
// full-width row at the head of the sheet now (the whole-doc slot), which has
// the room to name its scope outright — so the label IS the slot's label, one
// string, imported rather than copied.
//
// It never changes on its own click — see makeCaptureButton — so it cannot
// slide its neighbours out from under the cursor that pressed it.
export const CAPTURE_LABEL = WHOLE_DOC_LABEL;

export const historyMethods = {
  // --- the rounds ---
  //
  // ONE LABEL, ONE WIDTH. A control whose label changes on its own click slides
  // its neighbours out from under the cursor that just pressed it — measured
  // three separate times on this bar — so this one says the same thing open or
  // shut, and reports its state through aria-expanded and a class.
  makeVersionsButton(this: AppShell): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gly-versions-open';
    b.textContent = VERSIONS_LABEL;
    // The visible label and accessible name deliberately agree. A glyph used
    // here survived implementation but failed discovery in the first real
    // review: the four views and history existed behind a symbol nobody read.
    b.setAttribute('aria-label', VERSIONS_NAME);
    b.title = `${VERSIONS_NAME} — every round of this document, and what was asked for`;
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => this.toggleVersions());
    // Instructions and History are peers, so they live in one group and read
    // as view switches rather than unrelated controls at opposite ends.
    this.census.root.appendChild(b);
    return b;
  },

  // --- capture ---
  //
  // WHERE THE `+ INSTRUCTION` BUTTON WENT, AND WHY IT IS HERE. It stood in the
  // rail, as the whole-document card's own toggle. The rail holds live work
  // only — *here is what needs you, beside the text it is about* — and a
  // `+ add` button needs nothing and is beside nothing, so it was chrome in the
  // work column, and that placement caused both of the defects Court reported:
  // it scrolled out of reach, and opening it slid every anchored card 39.29px
  // off its mark. This bar is where every other document-level action already
  // lives (`Instructions`, `History`, `Revise`), and it is sticky, so the
  // control is reachable at any scroll position by the bar's own nature rather
  // than by anything this button does.
  //
  // ONE LABEL, ONE WIDTH, same as its neighbour above: it says the same thing
  // whether the capture card is open or shut, so pressing it never slides the
  // controls beside it. NOTHING IN THE BAR MOVES WHEN THE BAR IS CLICKED.
  //
  // BESIDE THE CENSUS STRIP AND NOT INSIDE IT, AND THE FIRST CUT GOT THAT
  // WRONG. `makeVersionsButton` appends to `this.census.root` because
  // *"Instructions and History are peers, so they live in one group and read as
  // view switches rather than unrelated controls at opposite ends"* — the strip
  // is a group of DOORS. This is a VERB: it switches no view, it makes a new
  // object. Dropping it into that group made the group say two things, and
  // `web/rounds-ux.mjs` said so — `History is the bar's one view chip` read
  // `["History","+ Instruction"]`. The check was right and the placement was
  // wrong, so the button moved out rather than the check being widened.
  //
  // BEFORE THE STRIP, WHICH IS THE BAR'S OWN ORDERING RULE READ EXACTLY.
  // The rule is *controls, the ONE readout, the one flexible cell, controls*,
  // and the second cut of this read it as "anywhere upstream of the spacer" and
  // put the button between the census and `#gly-status`. That region is not
  // spare space — it IS the readout region, and `web/layers.mjs` §1d counts it:
  // *there is exactly ONE readout in it*, which is the answer to Court reading
  // three truncated fragments off this bar. A control parked in there is a
  // second thing in a region whose whole claim is that it holds one thing, and
  // the gate said so in four checks at once.
  //
  // AND THEN IT LEFT THE BAR ALTOGETHER, WHICH IS THE SAME ARGUMENT ARRIVING
  // AT ITS END. Everything above is about where in the bar a verb about the
  // WHOLE DOCUMENT could stand without moving its neighbours; the answer the
  // frame gives is that it does not belong in a strip of chrome at all. It is
  // the head of the sheet now — a dashed full-width row in `.gly-docslot`,
  // directly above the paper it is about, where the instructions it makes are
  // also filed. Reachability is the frame's (the slot scrolls with the sheet
  // the reviewer is reading), and the bar's motion arithmetic no longer has
  // this control in it at all, which is stronger than placing it carefully
  // inside that arithmetic.
  makeCaptureButton(this: AppShell): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gly-capture-open gly-docslot-add';
    b.textContent = CAPTURE_LABEL;
    b.setAttribute('aria-label', 'add an instruction on the whole document');
    b.addEventListener('click', () => this.openCapture());
    // makeFrame runs before this in init(), so the slot is there. A shell with
    // no `.ProseMirror` builds no frame; the button is still made and wired,
    // it simply has nowhere to hang — the same tolerance every other surface
    // here has for a page that never got a document.
    this.frame?.slot.appendChild(b);
    return b;
  },

  // paintCaptureVerb is the button's one state, and it is a DISABLE rather than
  // a hide: a control that vanishes takes its width with it and slides every
  // neighbour, which is the defect this bar records more than any other. The
  // space is reserved and the control is dimmed in place.
  //
  // THE STATES IT IS DEAD IN ARE THE STATES THE DOCUMENT CANNOT BE WRITTEN ON.
  // It used to be `this.rail.root.hidden` — the card lived in the rail, so the
  // verb followed the rail's own visibility. The card is in the frame's
  // whole-doc slot now, which is on screen at every width, so that test says
  // nothing about this control any more. What is left is the two states where
  // there is no instruction to make: a sealed review, and reading an earlier
  // version off the scrubber, where the page is a record rather than a draft.
  paintCaptureVerb(this: AppShell) {
    if (!this.captureBtn) {
      return;
    }
    const dead =
      !!this.sealed || !scrubState(this.scrubT, this.scrubMax()).atHead;
    this.captureBtn.disabled = dead;
    this.captureBtn.title = dead
      ? 'this is a version being read, not the draft being written'
      : 'write an instruction about the document as a whole';
  },

  // THE INSTRUCTIONS DOOR OPENS THE SURFACE THAT EXISTS AT THIS WIDTH, and for
  // a whole phase below the breakpoint it opened nothing at all.
  //
  // Measured on the built binary at 620×900, before this line existed: the
  // click was DELIVERED (`elementFromPoint` at the control's centre returned
  // `.gly-bar-count`, playwright's click resolved in 9ms with no timeout) and
  // this method RAN (instrumented, `openInstructions called 1 time(s)`) — and
  // afterwards `.gly-rail`, `.gly-sheet` and `.gly-versions` were all still
  // `hidden`. Not a harness artefact: a door that answers the press and shows
  // nothing, which is worse than one that refuses, because the reviewer
  // concludes there is nothing behind it.
  //
  // The cause is these two lines read against `railSurfaces`. Below
  // RAIL_MIN_WIDTH there IS no rail — the sheet is the review's whole list down
  // there — and `sheetOpen = false` is precisely the state in which nothing is
  // painted. The old shape was correct while `▤` was the narrow door to the
  // sheet and this was the door to the rail; retiring the icon (makeBottomBar)
  // makes this the only door, so it has to open whichever surface the width
  // actually has.
  //
  // ONE WIDTH TEST, ASKED THROUGH THE ONE ACCESSOR. `this.surfaces()` is
  // `railSurfaces` with the state as it now stands, so `rail` here means
  // exactly "is this a width with a rail" — a second `window.innerWidth >=`
  // spelled in this method is how the two would come to disagree about which
  // surface owns the instructions.
  openInstructions(this: AppShell) {
    if (this.versionsPanel.open) {
      this.versionsPanel.hide();
    }
    this.sheetOpen = false;
    this.sheetOpen = !this.surfaces().rail;
    this.paintSheet();
    this.paintSurfaces();
    this.paintVersionsButton();
    this.census.count.classList.add('is-open');
  },

  enterHistory(this: AppShell) {
    this.historyScroll = window.scrollY;
    // THE NOTICE GOES WHEN THE READING BEGINS. An announcement that a round
    // arrived, still standing over the surface that round is being read on, is
    // a surface telling the reviewer about the thing they are looking at.
    this.hideStrip();
    document.body.classList.add('gly-history-mode');
    this.editor.setEditable(false);
    this.closeSheet();
    this.closeCapture();
    this.paintSurfaces();
    this.census.count.classList.remove('is-open');
    // The primary becomes the way out and the readout says where you are, and
    // both have to be true BEFORE the first frame of the new surface — a bar
    // that still offers Revise over a reading mode is a bar offering a verb the
    // page cannot take.
    this.paintRevise();
    this.paintReadout();
    // NO SCROLL TO THE TOP. History is the scrubber's reading stage now, and
    // the scrubber enters it mid-drag — a jump to the top on the first frame
    // would throw the sentence the reviewer is scrubbing off the screen. The
    // scroll position is still recorded above, and leaveHistory still restores
    // it, so a drag out to the right edge comes back where it started.
  },

  leaveHistory(this: AppShell) {
    document.body.classList.remove('gly-history-mode');
    // LEAVING IS RETURNING TO THE HEAD. Escape closes the panel directly
    // (keys.ts), which reaches here without going through scrubTo — so the
    // scrubber's own position is settled here rather than left pointing at a
    // version nothing is showing any more.
    document.body.classList.remove('gly-scrubbing');
    this.scrubT = this.scrubMax();
    this.paintTimeline();
    this.editor.setEditable(!this.sealed);
    this.paintSurfaces();
    this.paintVersionsButton();
    this.paintRevise();
    this.paintReadout();
    this.census.count.classList.add('is-open');
    // ESC RETURNS WITH THE SCROLL PRESERVED, which is the whole reason History
    // is a mode and not a page: the sentence the reviewer was reading is still
    // under the cursor when they come back to it.
    window.scrollTo({ top: this.historyScroll });
  },

  didRestore(this: AppShell, version: number, error: string) {
    if (error) {
      this.say(`restore failed: ${error}`);
      return;
    }
    this.say(`restored from v${version} · not sent`);
    this.openInstructions();
    // Fire-and-forget: a failure here leaves the rail showing pre-restore
    // work for one poll cycle. `tick`'s own `/_galley/rev` check (pending.ts)
    // picks the same change up moments later and repaints correctly, and the
    // reviewer has already been told the restore itself landed — there is
    // nothing a failure here could say that the next poll doesn't say better.
    void this.refreshPending();
  },

  // readArrival is HOW THE REVIEWER FINDS OUT A ROUND CAME BACK.
  //
  // It rides the revise poll the page already makes, and it compares a NUMBER
  // rather than reading a flag the server would have to clear: the server holds
  // no per-reader state, and a second tab is told the same thing independently.
  //
  // THE DEFAULT VIEW IS STILL THE DOCUMENT. Nothing opens over the prose here —
  // the revision is already in the words under the cursor, which is the point of
  // the phase. What this does is mark the door and, when it is pressed, land on
  // THAT round `in place`. See VersionsPanel.showRound.
  readArrival(this: AppShell, d: ReviseView) {
    const n = Number(d.landed || 0);
    const why = d.cannot || '';
    if (this.seenRound === null) {
      this.seenRound = n;
      this.seenCannot = why;
      return;
    }
    if (n === this.seenRound) {
      return;
    }
    const exception = why !== '' && why !== this.seenCannot;
    this.seenRound = n;
    this.seenCannot = why;
    this.arrival = { n, exception, why };
    this.say(arrivalSaid(this.arrival));
    // THE HEAD'S HTML JUST CHANGED. The scrubber caches one fetch per version
    // for the life of the tab (timeline.ts); the round that just landed is the
    // one version whose rendering is no longer what was cached.
    forgetVersionHTML(n);
    // THE STRIP IS RAISED FROM THE RECORD, NOT FROM THIS PAYLOAD. `/_galley/revise`
    // carries the number that landed and nothing about what it did; the counts
    // the strip prints — the round's ordinal and its `k changes` — are the
    // server's, off `/_galley/versions`, which this refresh is already
    // fetching. THE COUNT NEVER LIES, and a strip that guessed one from what
    // the browser had drawn would be a count derived from a render.
    //
    // It is raised on the refresh's promise rather than beside it, because the
    // record is what the sentence is composed from and the fetch is where it
    // arrives. A refresh that fails says nothing: the readout and the amber
    // door have already told the reviewer a round came back, and a strip with
    // a blank number in it would be worse than no strip. `refresh` itself
    // ends in a bare `.catch(() => {})` (versions.ts), so this chain cannot
    // reject in practice; `void` records the same "fails silently, on
    // purpose" intent this comment already states.
    void this.versionsPanel.refresh().then(() => {
      this.showArrival();
      this.readArrivalInline(n);
    });
    this.paintVersionsButton();
  },

  // readArrivalInline PUTS THE ROUND INSIDE THE PAPER. The strip used to say
  // "round N changed k blocks" beside the prose; what a reviewer actually asks
  // is "which words moved, and what did they say before" — and both answers are
  // on the page already, one block apart. So the round is drawn where it
  // happened: the changed block tints, the WAS strip under it carries the old
  // wording struck through, the agent's own sentence about that change sits
  // below it, and the instruction's row reads `applied`.
  //
  // THE DIFF IS THE SOURCE FOR THE WORDS AND THE RECORD IS THE SOURCE FOR THE
  // VERDICT, because they are different questions. `view=inplace` renders
  // v(n-1) against v(n) and is the only place the OLD text still exists; which
  // instructions the agent actually answered is the round's own `asks[].answered`,
  // which the panel has just refreshed. Neither is guessed from the other.
  //
  // It runs after `refresh()` for that reason — `versionsPanel.rounds` has to
  // be the list that includes round n — and it fails silently by design: the
  // readout and the amber door have already said a round came back, and an
  // inline strip is an enrichment of a page that is already correct without it.
  readArrivalInline(this: AppShell, n: number) {
    void getJSON<DiffView>(
      `/_galley/versions/view?from=${n - 1}&to=${n}&view=inplace`,
    ).then((diff) => {
      if (!diff) {
        return;
      }
      const doc = new DOMParser().parseFromString(diff.html, 'text/html');
      // A REGION IS STAMPED ON THE ELEMENT IT ALREADY RENDERS AS rather than
      // wrapped in one (internal/diff/render.go, `mark`), so the region element
      // can BE the `.gly-ins` — hence `matches` beside `querySelectorAll`. The
      // ordinal is read off the attribute, not off document order, because it
      // is what indexes `changes`.
      const text = (r: Element, sel: string) =>
        [...(r.matches(sel) ? [r] : []), ...r.querySelectorAll(sel)]
          .map((e) => e.textContent ?? '')
          .join(' ');
      const regions = [...doc.querySelectorAll('[data-gly-region]')];
      const changes = regions.map((r) => ({
        k: Number(r.getAttribute('data-gly-region')),
        ins: text(r, '.gly-ins'),
        del: text(r, '.gly-del'),
      }));
      const blocks = [...document.querySelectorAll('.ProseMirror > *')].map(
        (b) => b.textContent ?? '',
      );
      const at = matchBlocks(changes, blocks);
      this.arrivalWas = changes.flatMap((c, i) => {
        const index = at[i];
        return index === null || !c.del
          ? []
          : [{ index, was: c.del, note: diff.changes?.[c.k]?.note }];
      });
      const round = this.versionsPanel.rounds?.find((r) => r.n === n);
      this.appliedKeys = new Set(
        (round?.asks ?? []).filter((a) => a.answered).map((a) => a.key),
      );
      this.paintRows();
      this.paintFrame();
    });
  },

  // showArrival USED TO COMPOSE THE STRIP'S SENTENCE and no longer does: the
  // strip said "round N · k changes" over the top of the prose, and the round
  // now says both of those things where it happened — the tinted block, the WAS
  // text under it, the eyebrow's `NEEDS YOUR APPROVAL` (frame.ts). A banner
  // repeating a count for changes the reviewer can see is one more surface to
  // dismiss before reading the document. The frame paint is what is left; the
  // method survives this task only so its callers still resolve, and Task 14
  // deletes it with the strip itself.
  showArrival(this: AppShell) {
    if (!this.arrival) {
      return;
    }
    this.paintFrame();
  },

  toggleVersions(this: AppShell) {
    const panel = this.versionsPanel;
    // Two full surfaces stacked is one surface nobody can reach. The sheet is
    // the review's list and this is the record; opening one puts the other
    // away rather than drawing them over each other.
    if (!panel.open && this.sheetOpen) {
      this.closeSheet();
    }
    // AN ARRIVAL LANDS ON ITSELF, IN PLACE. Opening the record cold is still the
    // document (DEFAULT_VIEW); opening it because something arrived answers the
    // question that made you open it.
    if (!panel.open && this.arrival) {
      const { n } = this.arrival;
      this.arrival = null;
      // showRound's own promise bottoms out in load()'s bare `.catch(() =>
      // {})` (versions.ts) — a fetch failure is already absorbed there and
      // never reaches here to be reported. `void` names that as intentional
      // rather than leaving the click's own promise unmarked.
      void panel.showRound(n, 'inplace');
      this.paintVersionsButton();
      return;
    }
    // OPENING IT COLD IS THE LANDING. The record's two stages answer two
    // different questions — "what has happened to this document" and "what did
    // round N do" — and a door pressed with no news behind it is the first
    // question. A reviewer who left History mid-round and comes back to a
    // reading state they did not ask for would be reading somebody else's
    // answer to a question they had not put.
    if (!panel.open) {
      panel.stage = STAGE_ROUNDS;
    }
    // Same absorption as showRound above: toggle()'s show() path runs
    // through refresh()'s own bare `.catch(() => {})`, so there is nothing
    // left for a handler here to report.
    void panel.toggle();
    this.paintVersionsButton();
  },

  paintVersionsButton(this: AppShell) {
    const open = !!this.versionsPanel.open;
    // THE CHIP IS A DOOR, NOT A READOUT. It carried `History · 3`, and the
    // number was the one thing on it that changed on somebody else's event —
    // a round landing — in the bar whose oldest rule is that nothing may move
    // under the cursor. The record's size is inside the record; what belongs
    // out here is the way in, and whether there is something new behind it
    // (`is-new`, which is paint and takes no width). historyCount is kept and
    // still read — the readout's `round N` is it (paintReadout).
    //
    // AND IT IS TWO ELEMENTS NOW, PAINTED HERE AND ONLY HERE. The narrow bar
    // carries its own History chip beside its own Instructions door (board 1i),
    // and only one of the two bars is ever on screen. A second painter for the
    // second chip would be two answers to "has something arrived" — this
    // repository's most-repeated defect, on the one signal that tells a
    // reviewer the agent came back.
    // PAINT ONLY. A class on either control may never change its BOX: the wide
    // one sits in a full bar between the mode switch and Revise, and a control
    // that grows on somebody else's event slides the neighbour the cursor is
    // resting on. See the bar's own entry in CLAUDE.md — the reserve is a
    // rule, not a habit.
    const arrival = this.arrival;
    const waiting = !open && !!arrival;
    // `waiting && arrival` rather than the bare `waiting` this used to read:
    // `waiting` is a boolean already computed FROM `arrival`, and narrowing
    // does not travel backward through that computation — TypeScript only
    // narrows a value that is itself part of the condition it is guarded by.
    // Naming `arrival` again here is that, and nothing about which branch
    // runs changes.
    const title =
      waiting && arrival
        ? `${VERSIONS_NAME} — v${arrival.n} just arrived; this opens its changes`
        : `${VERSIONS_NAME} — every version of this document, and what was asked for`;
    for (const chip of [this.versionsButton, this.bar.versions]) {
      if (!chip) {
        continue;
      }
      chip.textContent = VERSIONS_LABEL;
      chip.setAttribute('aria-expanded', open ? 'true' : 'false');
      chip.classList.toggle('is-open', open);
      chip.classList.toggle('is-new', waiting);
      chip.title = title;
    }
  },
};
