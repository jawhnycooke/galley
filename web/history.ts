// web/history.ts owns History: entering and leaving the reading mode the
// scrubber reads in, and restoring a version as a fresh draft.
//
// It is a MIXIN — an object of methods `Object.assign`ed onto `App.prototype`
// in entry.ts — not a class of its own, so every method here still reads and
// writes `this` on the live App instance exactly as it did before the move
// (`this.editor`, `this.versionsPanel`, `this.bar`, and so on).
// `this` IS TYPED AGAINST `AppShell` (web/appshell.ts) — see that file's own
// header for the this-typing decision.
//
// THIS WAS THE PARTITION'S SINGLE BIGGEST OPEN CALL. Several of these methods'
// DOM writes land on bar-owned elements, so a partition by pixels would file
// them under the bar. They are not bar chrome. web/versions.ts's own header
// states History "is a READING MODE and not a second application," and a
// reading mode filed under a module named for the bar buries that distinction
// exactly where the next reader will not look.
//
// readArrival is driven from readRevise, which lives in web/verdict.ts now. A
// method here being called from a method in another mixin is fine — same
// prototype, same `this`.

import { arrivalSaid } from './versions.ts';
import type { AppShell, ReviseView } from './appshell.ts';
import type { DiffView } from './wire';
import { getJSON } from './net.ts';
import { matchBlocks, dedupeWas } from './rows.ts';
import { forgetVersionHTML } from './timeline.ts';
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
    const dead = !!this.sealed || !this.atHead();
    this.captureBtn.disabled = dead;
    this.captureBtn.title = dead
      ? 'this is a version being read, not the draft being written'
      : 'write an instruction about the document as a whole';
  },

  // THE INSTRUCTIONS DOOR OPENS THE SHEET, AT EVERY WIDTH. It used to open the
  // rail above the breakpoint and the sheet below it, and for a whole phase
  // below the breakpoint it opened nothing at all — the paragraphs below are
  // that defect's record. The rail is deleted; the sheet is the review's whole
  // list at every width, so there is one surface for this door to open.
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
  // The cause was a `sheetOpen = false` on a width whose only surface was the
  // sheet. There is no width test left to get wrong: this door opens the sheet
  // and `railSurfaces` decides, once, whether the bottom bar renders under it.
  openInstructions(this: AppShell) {
    if (this.versionsPanel.open) {
      this.versionsPanel.hide();
    }
    this.sheetOpen = true;
    this.paintSheet();
    this.paintSurfaces();
  },

  enterHistory(this: AppShell) {
    this.historyScroll = window.scrollY;
    this.editor.setEditable(false);
    this.closeSheet();
    this.closeCapture();
    this.paintSurfaces();
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
    // LEAVING IS RETURNING TO THE HEAD. Escape closes the panel directly
    // (keys.ts), which reaches here without going through scrubTo — so the
    // scrubber's own position is settled here rather than left pointing at a
    // version nothing is showing any more.
    document.body.classList.remove('gly-scrubbing');
    this.scrubT = this.scrubMax();
    this.paintTimeline();
    this.editor.setEditable(!this.sealed);
    this.paintSurfaces();
    this.paintRevise();
    this.paintReadout();
    // ESC RETURNS WITH THE SCROLL PRESERVED, which is the whole reason this is
    // a mode and not a page: the sentence the reviewer was reading is still
    // under the cursor when they come back to it.
    //
    // AND IT IS WHY THE TWO PAPERS DECLINE TO BE SCROLL ANCHORS. An earlier
    // version is usually a SHORTER document than the draft, so the browser
    // clamps the scroll while it is on screen (measured: 228 -> 0 on a
    // three-round fixture); the draft coming back then grows the page above the
    // viewport, and Chrome's scroll anchoring adjusts the offset AFTER this
    // line to keep its chosen anchor still — landing at 330 where this asked
    // for 228. `overflow-anchor: none` on the root (editor.css) is what leaves
    // this line the last word — the docslot returning above the paper on this
    // same path anchored just the same once the papers alone were opted out.
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
  // the phase. What this does is note the round and read it in place:
  // `readArrivalInline` below, which is what replaced `VersionsPanel.showRound`
  // when History's landing was deleted (the class has no such method).
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
      this.paintFrame();
      this.readArrivalInline(n);
    });
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
      // THE CONTEXT IS THE REGION AS IT READS NOW: everything but the deleted
      // words. It is what places a change whose inserted words are too short
      // to probe with (`rows.ts`, matchBlocks). Read from a clone so the
      // `.gly-del` text is still there for `del` beside it. A region that IS
      // a deleted block has no surviving words, and says so.
      const surviving = (r: Element) => {
        const c = r.cloneNode(true) as Element;
        c.querySelectorAll('.gly-del').forEach((d) => d.remove());
        return c.textContent ?? '';
      };
      const regions = [...doc.querySelectorAll('[data-gly-region]')];
      const changes = regions.map((r) => ({
        k: Number(r.getAttribute('data-gly-region')),
        ins: text(r, '.gly-ins'),
        del: text(r, '.gly-del'),
        ctx: r.matches('.gly-del') ? '' : surviving(r),
      }));
      // THE BLOCKS, AND NOTHING GALLEY PINNED BETWEEN THEM. A widget decoration
      // is placed at a top-level position, so a pinned row and a WAS strip are
      // DIRECT CHILDREN of `.ProseMirror` — indistinguishable from a paragraph
      // to `> *`. `matchBlocks` returns an index into this list and `rows.ts`
      // uses it as a ProseMirror CHILD index, so every row already on the page
      // shifted every WAS strip below it onto the wrong paragraph, and off the
      // end of the document entirely once there were enough of them. It was
      // latent only because rows were emptied by the press that produced the
      // arrival; they survive it now (sentRows), which is what made it real.
      const blocks = [
        ...document.querySelectorAll<HTMLElement>('.ProseMirror > *'),
      ]
        .filter((b) => !b.classList.contains('gly-row'))
        .filter((b) => !b.classList.contains('gly-was-wrap'))
        .map((b) => b.textContent ?? '');
      const at = matchBlocks(changes, blocks);
      const round = this.versionsPanel.rounds?.find((r) => r.n === n);
      // THE ROUND'S OWN SENTENCE IS THE FALLBACK NOTE. `ChangeView.note` is the
      // agent's per-change remark and it is usually absent — most agents answer
      // a round with one sentence, not one per edit — which left every WAS strip
      // on the page silent about WHY. `RoundView.instruction` is that sentence
      // (the ack), so it stands in, ONCE per landed round: repeated under three
      // strips it would read as three separate remarks about three separate
      // changes, which is the opposite of what it is. `answers > 0` is the test
      // because a round the agent answered nothing in has no sentence to lend.
      const ack = round && round.answers > 0 ? round.instruction : '';
      let lent = false;
      const was = dedupeWas(
        changes.flatMap((c, i) => {
          const index = at[i];
          // A change that only ADDED words gets no WAS strip — nothing "was"
          // there — but it still names its block: the block wears the revised
          // wash, and an ask the change claimed can be pinned under it.
          return index === null
            ? []
            : [
                {
                  index,
                  was: c.del,
                  added: c.del ? undefined : c.ins,
                  note: diff.changes?.[c.k]?.note,
                  asks: diff.changes?.[c.k]?.asks,
                },
              ];
        }),
      );
      for (const w of was) {
        if (!w.note && ack && !lent) {
          w.note = ack;
          lent = true;
        }
      }
      this.arrivalWas = was;
      this.paintRows();
      this.paintFrame();
    });
  },
};
