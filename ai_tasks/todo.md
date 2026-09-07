# Timeline Draft — tracker

Plan: `ai_tasks/plans/2026-09-06-timeline-draft.md` (spec: `../handoff/timeline-draft/`).
Branch: `feat/timeline-draft`. Decision 2026-09-06: re-value the existing `--gly-*` tokens under their names (dark-first + `[data-theme]`), not a parallel namespace.

| # | Task | Depends on | Status |
|---|---|---|---|
| 0 | Branch + clean baseline | — | [x] |
| 1 | Tokens, theme switch, white sheet | 0 | [x] 76e6e36 |
| 2 | Self-hosted fonts | 1 | [x] f98fb10 |
| 3 | Phase (pure) + header readout | 1 | [x] ae6343a |
| 4 | Footer: primary, trail, verdict menu, cancel | 3 | [x] 7f19bd6 |
| 5 | Timeline pure functions | — | [x] ce21283 |
| 6 | Timeline track, drag, crossfade, History replaced | 4, 5 | [x] 06879d2 |
| 7 | Frame: eyebrow, whole-doc slot, onboarding, `?` | 3, 6 | [x] 3920695 |
| 8 | Inline composer: eyebrow, bar, chips, dimming | 1 | [x] fb89472 |
| 9 | Pinned rows as decorations, ghost revert, fence grip | 3, 7 | [x] 643796a |
| 10 | Wire: per-round `asks[].answered` (Go) | — | [x] 1185c69 |
| 11 | Arrival inline: WAS strip, agent note, applied rows | 9, 10 | [x] c374e43 |
| 12 | cannot banner | 7 | [x] 3b615ec |
| 13 | Keys: ←/→, Esc, j/k over rows | 6, 9 | [x] dd37bee |
| 14 | Delete retired surfaces | 6, 7, 9, 11, 13 | [x] 0670ed4 |
| 15 | HTML page-mode pill | 7, 14 | [x] d024308 |
| 16 | Streaming polish (optional) | 9 | [x] d8c22d5 |
| 18 | Rows for selection-anchored instructions (added) | 9, 13 | [x] 0da9572 |
| 17 | Final verification (local only, no PR) | all | [x] d6f1618 — verify + layers green; six-state walk done; editor serving learn-anything.md on :4417 |
| — | Final fix wave (review C1–C2, I3–I10, the browser walk's A–N) | all | [x] 671bd91 |

Parallel-safe waves: {1} → {2, 3, 5, 8, 10} → {4} → {6} → {7} → {9, 12} → {11, 13} → {14} → {15, 16} → {17}.

## Review

### What shipped

The branch replaces the instruction rail and History with a page whose record
is a timeline in the footer and whose instructions are pinned rows inside the
paper. Tasks 1–16 and 18 landed as tracked above; a final fix wave then closed
the whole-branch review (C1–C2, I3–I10, the Minor list) and the controller's
browser walk (A–N). What that wave changed, in the order the defects mattered:

1. **The primary's reservation.** `#gly-revise.gly-revise { display:
   inline-flex; gap: 10px }` is (1,1,0) and beat the one-cell grid the
   four-face mechanism rests on, so the button rendered ~425px wide with its
   live label off to one side of a blank field. Restored, and with it the
   `← back to draft` and disabled faces (which had stopped matching when the
   button left `.gly-bar`), the handoff cancel's `visibility` reserve (which a
   `display:none` had replaced, sliding the primary on a handoff), and spec §5's
   approved primary, which stays on screen reading `approved`.
2. **Rows for a sent round.** Rows were built from the pending list, which the
   press empties — so spec §2–§4's `writing…`, `applied` and `not applied` were
   unreachable, Task 10's Go addition had no consumer, and the repo's own
   invariant (*nothing the reviewer sent may ever disappear*) had no surface at
   all. Rows come off the round's immutable `asks` now, resolved to their block
   by the quote they were on.
3. **The rail is really deleted** — the root, the band, the placement pass and
   its listeners, `railSurfaces`' `rail` key, the `.gly-rail*` CSS and the two
   tokens that lost their last consumer. The anchorless group renders in the
   sheet's dashed slot as `.gly-docslot-unplaced`.
4. **The frame's own defects**: the readout dot never rendered (every paint
   replaced it), three surfaces declared a `display` that beat `[hidden]`, the
   phase class and the banner shared one name, `.gly-doc-path` printed `..`, and
   `color-scheme` did not follow the theme button.
5. **The composer opens on the selection** (spec §1) without taking the caret —
   a box that stole focus would type the reviewer's own correction into an
   instruction to the agent.
6. **One predicate for "am I off the head"** — `AppShell.atHead()` — with
   `versionsPanel.open` and `body.gly-scrubbing` as renders of it (I9), and the
   seal edge repainting the timeline so the head keyframe fills on Approve (I10).
7. **The gates.** Three inverted or hardcoded assertions fixed, five vacuous
   clauses re-pointed at claims that can fail, one swallowed timeout named, one
   retirement note corrected (`gly-lit` was never read in rounds-ux), and §14 in
   `layers.mjs` added: the theme button, the `?` sheet, `.gly-verdict-explain`,
   the could-not banner, a scrubber DRAG, `.gly-row` geometry, the readout dot
   and the 13ch/9ch/23ch reserves as computed pixels. Two real defects fell out
   of writing them (widget rows shifted every WAS strip onto the wrong
   paragraph; the theme button moved on its own press).
8. **The reviewer-facing docs** (`docs/reviewing.md`, the reviewing-a-document
   SKILL) rewritten wherever they described the deleted product.

### Decisions taken

- **`railSurfaces` keeps its name and loses its `rail` key.** A `false` a caller
  can still branch on is how a deleted surface stays alive in the code that used
  to paint it. `collapsed` is unconditional now: nothing is beside the paper at
  any width.
- **The approved primary is disabled, not hidden.** `.gly-seal-off` stays the
  marker seal.ts writes; only `.gly-bar` acts on it. Spec §5 wants the last
  thing the reviewer looks at to say what they decided.
- **A quote resolves a sent ask by UNIQUENESS, not by length.** `retry budget`
  is twelve characters and an ordinary anchor; what makes a short quote
  dangerous is being in two blocks, and that is checkable directly. The
  deletion-probe floor in `matchBlocks` stays at 20, because there the words are
  gone from the document and any match is a match on something else.
- **An open composer is not dismissed by a blur, and a selection-driven open
  does not take the caret.** Together these keep hand editing (select, type)
  working while the box is on screen, which is the contract the product is
  built on.
- **`ordinalOf` is kept with its probes** and its missing caller recorded, not
  deleted: the exchange-folding rule it encodes is the record's own grammar and
  `roundCards` beside it is live.

### Deferred, with owners

- **Gap #2, the per-block morph** (a landed change animating in place rather
  than appearing on the next paint) is not implemented. The arrival is drawn
  where it happened — the block tints, the WAS strip carries the old wording —
  which is the substance; the motion is not. Needs a task.
- **`HEAD_EPS = 0.01` and keyframe-label crowding** (#48, #105). The scrubber is
  the only door to the record now, and at 1440px the keyframe labels overlap
  from about ten rounds on — visible in `.superpowers/sdd/shots/6-cannot.png`.
  Both deserve one task together: the track needs a label policy (thin out, or
  show on hover) and a head tolerance that is not sub-pixel.
- **The acid/coral trail ink vocabulary** (#56/#59) is owned by no task. Someone
  has to decide whether the spec's two inks are one vocabulary with the
  removal/insertion pair the prose already uses, or a third.
- **Task 17** stays open by instruction: the controller closes it.
