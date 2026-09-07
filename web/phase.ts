// phase.ts — the page has one phase and it is DERIVED, never stored. Every
// surface (readout dot, eyebrow, footer primary, timeline) reads this and
// nothing else, so they cannot disagree about where the round stands.
import type { AppShell } from './appshell.ts';

export type Phase = 'markup' | 'revising' | 'review' | 'cannot' | 'approved';
export type Tone = 'muted' | 'coral' | 'accent';

export interface PhaseInput {
  sealed: boolean; running: boolean; waiting: boolean; handoff: boolean;
  cannot: string; landed: number; pendingCount: number; edits: number;
}

export function phaseOf(s: PhaseInput): Phase {
  if (s.sealed) return 'approved';
  if (s.running || s.waiting || s.handoff) return 'revising';
  if (s.cannot) return 'cannot';
  if (s.landed > 0 && s.pendingCount === 0 && s.edits === 0) return 'review';
  return 'markup';
}

export function dotFor(phase: Phase, pending: number): 'green' | 'coral' | 'accent' {
  if (phase === 'cannot') return 'coral';
  if (phase === 'revising' || phase === 'review' || phase === 'approved') return 'accent';
  return pending > 0 ? 'coral' : 'green';
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

export function trailSaid(edits: number, instructions: number): string {
  if (edits + instructions === 0) return '';
  return `${plural(edits, 'edit')}, ${plural(instructions, 'instruction')} →`;
}

export function eyebrowRight(phase: Phase, pending: number, edits: number): { text: string; tone: Tone } {
  switch (phase) {
    case 'approved': return { text: 'SETTLED', tone: 'accent' };
    case 'review': return { text: 'NEEDS YOUR APPROVAL', tone: 'accent' };
    case 'revising': return { text: 'WITH THE AGENT', tone: 'accent' };
    case 'cannot': return { text: 'UNCHANGED', tone: 'coral' };
    default: return pending + edits > 0 ? { text: 'DRAFT · MARKED UP', tone: 'coral' } : { text: 'DRAFT', tone: 'muted' };
  }
}

export function phase(this: AppShell): Phase {
  return phaseOf({
    sealed: this.sealed, running: this.reviseRunning, waiting: this.reviseWaiting, handoff: this.handoff,
    cannot: this.seenCannot, landed: this.arrival ? this.arrival.n : 0,
    pendingCount: this.pendingCount, edits: this.changes.length,
  });
}
