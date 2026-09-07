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
export const SLOT_EMPTY =
  'Select words to instruct that block, or add an instruction on the whole document.';
export const HELP_LINES = [
  'Select words → type the instruction → ↵ pin. It waits under that block.',
  'Type in the sheet to edit by hand; your edits travel with the round.',
  '+ instruction on the whole document for tone, structure, what is missing.',
  'Revise · N hands everything pending to the agent. Approve seals the document.',
  'Drag the timeline to read any earlier version; ← → step it, Esc returns to now.',
];

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
  eyebrow.append(eyebrowL, eyebrowR, helpBtn);
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
  const s = scrubState(this.scrubT, max);
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
  const wholeDocRows = f.slot.querySelectorAll('.gly-row-doc').length;
  f.slotEmpty.hidden = wholeDocRows > 0 || phase !== 'markup';
  f.slot.classList.toggle(
    'is-off',
    !s.atHead || phase === 'revising' || phase === 'approved',
  );
}
