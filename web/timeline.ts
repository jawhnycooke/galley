// timeline.ts — the scrubber across the bottom. Every version is a keyframe;
// t is continuous in [1, max]; dragging morphs the sheet between neighbours.
// The pure half is here and probed; the mixin (Task 6) owns the DOM.
import type { RoundView } from './wire.d.ts';

export interface Keyframe { n: number; left: number; label: string; fill: 'none' | 'accent' | 'grey'; tone: 'muted' | 'accent' | 'coral' }
export interface Scrub { near: number; frac: number; opacity: number; blur: number; atHead: boolean }

export const REASON_COULD_NOT = 'could-not';
export const REASON_LANDED = 'landed';
const HEAD_EPS = 0.01;

export function keyframesOf(rounds: RoundView[], sealed: boolean): Keyframe[] {
  const max = rounds.length;
  return rounds.map((r, i) => {
    const n = i + 1;
    const head = n === max;
    const cannot = r.reason === REASON_COULD_NOT;
    const revised = r.reason === REASON_LANDED && r.answers > 0;
    let label = `R${r.n}`;
    if (cannot) label += ' · cannot';
    else if (head && revised && !sealed) label += ' draft';
    const tone: Keyframe['tone'] = cannot ? 'coral' : head && (revised || sealed) ? 'accent' : 'muted';
    const fill: Keyframe['fill'] = cannot ? 'none' : head && revised && !sealed ? 'none' : head && sealed ? 'accent' : 'grey';
    return { n, left: max === 1 ? 0 : ((n - 1) / (max - 1)) * 100, label, fill, tone };
  });
}

export function scrubState(t: number, max: number): Scrub {
  const c = Math.min(Math.max(t, 1), Math.max(max, 1));
  const near = Math.round(c);
  const frac = Math.abs(c - near);
  const opacity = 1 - Math.min(frac * 2, 1);
  return { near, frac, opacity, blur: (1 - opacity) * 3, atHead: c >= max - HEAD_EPS };
}

export function scrubLabel(t: number, max: number, headRevised: boolean): string {
  const s = scrubState(t, max);
  if (s.atHead) return headRevised ? `v${max} · agent revised` : `v${max} → draft`;
  if (s.frac < 0.02) return `v${s.near}`;
  return `v${Math.floor(t)} → v${Math.ceil(t)}`;
}

export function appearOpacity(t: number, firstVersion: number): number {
  return Math.min(Math.max(t - (firstVersion - 1), 0), 1);
}
