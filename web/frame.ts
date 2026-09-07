// frame.ts — what sits around the sheet: the eyebrow row above it, the
// whole-document slot, the could-not banner (Task 12 fills it), the ? sheet.
//
// THE EYEBROW IS DERIVED, NEVER STORED — it reads `phase()` and the scrubber's
// own position and nothing else, so it cannot disagree with the footer or the
// readout about where the round stands. See web/phase.ts's header.
import type { AppShell } from './appshell.ts';
import { eyebrowRight, type Phase } from './phase.ts';
import { ageSaid } from './versions.ts';
import { scrubState } from './timeline.ts';

export const WHOLE_DOC_LABEL = '+ instruction on the whole document';
export const WHOLE_DOC_PLACEHOLDER = 'add an instruction on the whole doc…';
const SLOT_EMPTY =
  'Select words to instruct that block, or add an instruction on the whole document.';
export const HELP_LINES = [
  'Select words → type the instruction → ↵ pin. It waits under that block.',
  'Type in the sheet to edit by hand; your edits travel with the round.',
  '+ instruction on the whole document for tone, structure, what is missing.',
  'Revise · N hands everything pending to the agent. Approve seals the document.',
  'Drag the timeline to read any earlier version; ← → step it, Esc returns to now.',
];

export const CANNOT_FIXED =
  'This is a report, not a conversation. Answer it with a different instruction in the next round.';
export function cannotSaid(round: number): string {
  return `round ${round} · the agent could not · document unchanged`;
}

export interface FrameUI {
  root: HTMLElement;
  eyebrowL: HTMLElement;
  eyebrowR: HTMLElement;
  slot: HTMLElement;
  slotEmpty: HTMLElement;
  banner: HTMLElement;
  help: HTMLElement;
  helpBtn: HTMLButtonElement;
}

export function eyebrowLeft(
  phase: Phase,
  round: number,
  version: number,
  s: { atHead: boolean; near: number; at?: string },
): string {
  if (!s.atHead) {
    return `VIEWING V${s.near}${s.at ? ` · ${s.at.toUpperCase()}` : ''}`;
  }
  if (phase === 'review' || phase === 'approved' || phase === 'cannot') {
    return `ROUND ${round} · V${version}`;
  }
  return `WORKING DRAFT · ROUND ${round}`;
}

export function makeFrame(this: AppShell): void {
  const paper = document.querySelector<HTMLElement>('.ProseMirror');
  const mount = paper?.parentElement;
  if (!paper || !mount) {
    return;
  }
  const root = document.createElement('div');
  root.className = 'gly-frame';
  const eyebrow = document.createElement('div');
  eyebrow.className = 'gly-eyebrow';
  const eyebrowL = document.createElement('span');
  const eyebrowR = document.createElement('span');
  const helpBtn = document.createElement('button');
  helpBtn.type = 'button';
  helpBtn.className = 'gly-help-open';
  helpBtn.textContent = '?';
  helpBtn.title = 'how this page works';
  // `restore vN as draft` LIVES HERE NOW, and only while the reviewer is off
  // the head. Its old home was History's sub-bar, which is deleted with the
  // landing; the eyebrow is the one chrome that is already saying WHICH
  // version is on screen, so the one verb about that version belongs beside
  // the sentence naming it. It is the panel's own button, moved rather than
  // rebuilt — the two-click arming, the three reserved faces and the POST are
  // VersionsPanel.restore()'s, and a second copy would be a second spelling of
  // an act with no undo outside git.
  eyebrow.append(eyebrowL, eyebrowR, this.versionsPanel.restoreButton, helpBtn);
  const slot = document.createElement('div');
  slot.className = 'gly-docslot';
  const slotEmpty = document.createElement('div');
  slotEmpty.className = 'gly-docslot-empty';
  slotEmpty.textContent = SLOT_EMPTY;
  slot.append(slotEmpty);
  const banner = document.createElement('div');
  banner.className = 'gly-cannot';
  banner.hidden = true;
  const help = document.createElement('div');
  help.className = 'gly-help';
  help.hidden = true;
  help.append(
    ...HELP_LINES.map((t) => {
      const p = document.createElement('p');
      p.textContent = t;
      return p;
    }),
  );
  helpBtn.addEventListener('click', () => {
    help.hidden = !help.hidden;
  });
  root.append(eyebrow, slot, banner, help);
  mount.insertBefore(root, paper);
  this.frame = {
    root,
    eyebrowL,
    eyebrowR,
    slot,
    slotEmpty,
    banner,
    help,
    helpBtn,
  };
  this.paintFrame();
}

export function paintFrame(this: AppShell): void {
  const f = this.frame;
  if (!f) {
    return;
  }
  const rounds = this.versionsPanel.rounds ?? [];
  const max = Math.max(1, rounds.length);
  // NOT SCRUBBING IS BEING AT THE HEAD, and asking `scrubT` before the scrubber
  // exists is how this frame told itself otherwise. `scrubT` is set to the
  // maximum when the timeline is BUILT, which waits on the record's own fetch —
  // so every paint before that answered `scrubState(1, max)`, which is "reading
  // v1" on any document with more than one version: the whole-doc slot went
  // `is-off` and the restore verb appeared, and both flipped back a fetch later,
  // moving 119px of prose under the cursor. `body.gly-scrubbing` is the one
  // place that knows whether the reviewer has left the head, and it is the same
  // invariant paintTimeline enforces from the other side.
  const s = document.body.classList.contains('gly-scrubbing')
    ? scrubState(this.scrubT, max)
    : scrubState(max, max);
  const round = rounds.length ? rounds[rounds.length - 1].n : 1;
  // ageSaid already returns the chrome's own uppercase shorthand (versions.ts)
  // and an unparseable `at` returns '', which eyebrowLeft reads as no age.
  const at = s.atHead
    ? undefined
    : ageSaid(rounds[s.near - 1]?.at ?? '', Date.now());
  const phase = this.phase();
  f.eyebrowL.textContent = eyebrowLeft(phase, round, max, {
    atHead: s.atHead,
    near: s.near,
    at,
  });
  const right = s.atHead
    ? eyebrowRight(phase, this.pendingCount, this.changes.length)
    : { text: 'READ ONLY', tone: 'muted' as const };
  f.eyebrowR.textContent = right.text;
  f.eyebrowR.dataset.tone = right.tone;
  // The restore verb names the version the scrubber is ON, so the panel's
  // selection follows the handle rather than a click that no longer exists.
  // Hidden at the head: there is nothing to restore the draft FROM there, and
  // a disabled control in the eyebrow would reserve width for a verb that is
  // never offered at the one position the page spends its life in.
  const restore = this.versionsPanel.restoreButton;
  restore.hidden = s.atHead || rounds.length === 0;
  if (!restore.hidden) {
    this.versionsPanel.selected = rounds[s.near - 1]?.n ?? 0;
    this.versionsPanel.paintRestore();
  }
  const wholeDocRows = f.slot.querySelectorAll('.gly-row-doc').length;
  f.slotEmpty.hidden = wholeDocRows > 0 || phase !== 'markup';
  f.slot.classList.toggle(
    'is-off',
    !s.atHead || phase === 'revising' || phase === 'approved',
  );
  const cannot = phase === 'cannot' && s.atHead;
  f.banner.hidden = !cannot;
  if (cannot) {
    f.banner.replaceChildren();
    const label = document.createElement('span');
    label.className = 'gly-cannot-label';
    label.textContent = 'COULD NOT';
    const body = document.createElement('div');
    body.className = 'gly-cannot-body';
    const head = document.createElement('div');
    head.textContent = cannotSaid(round);
    const why = document.createElement('div');
    why.className = 'gly-cannot-why';
    why.textContent = this.seenCannot;
    const fixed = document.createElement('div');
    fixed.className = 'gly-cannot-fixed';
    fixed.textContent = CANNOT_FIXED;
    body.append(head, why, fixed);
    f.banner.append(label, body);
  }
}
