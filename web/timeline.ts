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

// --- the mixin: the DOM half ---
//
// Everything below owns elements. The pure half above is what the probe reads;
// this half is what the footer draws, and the two are kept apart so a keyframe's
// geometry can be checked without a browser.
import type { AppShell } from './appshell.ts';
import { getJSON } from './net.ts';
import type { DiffView } from './wire.d.ts';

export interface TimelineUI {
  root: HTMLElement;
  keys: HTMLElement;
  track: HTMLElement;
  fill: HTMLElement;
  handle: HTMLElement;
  label: HTMLElement;
  papers: [HTMLElement, HTMLElement];
}

export function makeTimeline(this: AppShell): void {
  const host = this.timelineLeft;
  if (!host) {
    return;
  }
  const root = document.createElement('div');
  root.className = 'gly-scrub';
  const keys = document.createElement('div');
  keys.className = 'gly-scrub-keys';
  const track = document.createElement('div');
  track.className = 'gly-scrub-track';
  const rail = document.createElement('div');
  rail.className = 'gly-scrub-rail';
  const fill = document.createElement('div');
  fill.className = 'gly-scrub-fill';
  const handle = document.createElement('div');
  handle.className = 'gly-scrub-handle';
  track.append(rail, fill, handle);
  const labels = document.createElement('div');
  labels.className = 'gly-scrub-labels';
  const first = document.createElement('span');
  first.textContent = 'v1 · starting version';
  const label = document.createElement('span');
  label.className = 'gly-scrub-now';
  const last = document.createElement('span');
  last.textContent = 'now';
  labels.append(first, label, last);
  root.append(keys, track, labels);
  host.append(root);

  let dragging = false;
  const at = (e: PointerEvent) => {
    const b = track.getBoundingClientRect();
    const f = Math.min(Math.max((e.clientX - b.left) / b.width, 0), 1);
    this.scrubTo(1 + f * (this.scrubMax() - 1));
  };
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    at(e);
  });
  track.addEventListener('pointermove', (e) => {
    if (dragging) {
      at(e);
    }
  });
  track.addEventListener('pointerup', () => {
    dragging = false;
  });
  track.addEventListener('pointercancel', () => {
    dragging = false;
  });

  // TWO PAPERS FOR THE CROSSFADE, mounted beside the one History already has
  // and hidden with it (`body.gly-scrubbing`, editor.css) rather than in place
  // of it. Replacing the panel's paper outright — which is what this started
  // as — detaches the element `VersionsPanel.load` writes into, and with it
  // the History landing that Task 14, not this one, is the task that retires.
  const a = document.createElement('div');
  a.className = 'gly-versions-paper gly-scrub-paper';
  const b = document.createElement('div');
  b.className = 'gly-versions-paper gly-scrub-paper';
  const stage = document.createElement('div');
  stage.className = 'gly-scrub-stage';
  stage.append(a, b);
  this.versionsPanel.paper.after(stage);
  this.timeline = { root, keys, track, fill, handle, label, papers: [a, b] };
  this.scrubT = this.scrubMax();
  this.paintTimeline();
}

export function scrubMax(this: AppShell): number {
  return Math.max(1, (this.versionsPanel.rounds ?? []).length);
}

export function paintTimeline(this: AppShell): void {
  const ui = this.timeline;
  if (!ui) {
    return;
  }
  const rounds = this.versionsPanel.rounds ?? [];
  const max = this.scrubMax();
  // THE HEAD MOVES WHEN A ROUND LANDS, and `now` has to move with it. Off the
  // head this is the reviewer's own position and nothing may touch it; at the
  // head it is not a position at all, it is the live editor — so it follows
  // the new maximum rather than being left pointing one version behind it.
  if (!document.body.classList.contains('gly-scrubbing')) {
    this.scrubT = max;
  }
  const frames = keyframesOf(rounds, this.sealed);
  ui.keys.replaceChildren(
    ...frames.map((k) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gly-scrub-key';
      btn.style.left = `${k.left}%`;
      btn.dataset.tone = k.tone;
      btn.dataset.fill = k.fill;
      btn.classList.toggle('is-near', Math.round(this.scrubT) === k.n);
      const text = document.createElement('span');
      text.textContent = k.label;
      const dot = document.createElement('span');
      dot.className = 'gly-scrub-dot';
      btn.append(text, dot);
      btn.addEventListener('click', () => this.scrubTo(k.n));
      return btn;
    }),
  );
  const pct = max === 1 ? 100 : ((this.scrubT - 1) / (max - 1)) * 100;
  ui.fill.style.width = `${pct}%`;
  ui.handle.style.left = `${pct}%`;
  const head = rounds[rounds.length - 1];
  ui.label.textContent = scrubLabel(
    this.scrubT,
    max,
    !!head && head.reason === REASON_LANDED && head.answers > 0,
  );
}

// ONE FETCH PER VERSION FOR THE LIFE OF THE TAB. A drag crosses the same two
// neighbours dozens of times a second; refetching each frame would put the
// network between the handle and the sheet. The head's HTML is the one that can
// change under us — a landed round rewrites it — so readArrival forgets it.
const htmlCache = new Map<number, Promise<string | null>>();

// ONLY A SUCCESS IS WORTH KEEPING. The cache is for the life of the tab, so a
// failed fetch cached here would be a blank sheet for that version forever —
// with no path back short of a landed round forgetting it. A miss drops itself
// out of the map so the next visit to that version tries the network again, and
// resolves null so the caller leaves the paper as it is.
function versionHTML(n: number): Promise<string | null> {
  let p = htmlCache.get(n);
  if (!p) {
    p = getJSON<DiffView | null>(
      `/_galley/versions/view?to=${n}&from=0&view=inplace`,
    ).then(
      (d) => {
        if (!d) {
          htmlCache.delete(n);
          return null;
        }
        return d.html;
      },
      (err: unknown) => {
        htmlCache.delete(n);
        throw err;
      },
    );
    htmlCache.set(n, p);
  }
  return p;
}

export function forgetVersionHTML(n: number): void {
  htmlCache.delete(n);
}

// The ticket every scrubTo takes, so a late fetch can tell whether the handle
// has moved on since it was asked for.
let scrubSeq = 0;

export function scrubTo(this: AppShell, t: number): void {
  const max = this.scrubMax();
  const s = scrubState(t, max);
  this.scrubT = Math.min(Math.max(t, 1), max);
  const ui = this.timeline;
  if (!ui) {
    return;
  }
  // THE PANEL IS THE STAGE, so the panel is what is opened and closed — not
  // `gly-history-mode` directly. `show`/`hide` are what un-hide `.gly-versions`
  // and fire onOpen/onClose, which is where enterHistory and leaveHistory hang;
  // setting the body class alone would enter the mode over a hidden surface.
  if (s.atHead) {
    if (this.versionsPanel.open) {
      this.versionsPanel.hide();
    }
    document.body.classList.remove('gly-scrubbing');
    this.paintTimeline();
    this.paintFrame?.();
    return;
  }
  if (!this.versionsPanel.open) {
    void this.versionsPanel.show();
  }
  document.body.classList.add('gly-scrubbing');
  const lo = Math.floor(this.scrubT);
  const hi = Math.min(Math.ceil(this.scrubT), max);
  const [pa, pb] = ui.papers;
  // THE LAST MOVE WINS, NOT THE LAST FETCH. A drag fires scrubTo dozens of
  // times and each uncached version is its own request; they resolve in
  // whatever order the network hands them back. Guarding only on the paper's
  // own `data-v` lets a fetch started three moves ago land last and paint a
  // version the handle, the label and the opacities have all moved off. Every
  // call takes a ticket and a resolution that is no longer the current one is
  // dropped.
  const seq = ++scrubSeq;
  // innerHTML, and the server is what makes it safe: internal/diff escapes
  // every character of the document before it draws anything. Same reasoning,
  // and the same endpoint, as VersionsPanel.load.
  // A network hiccup degrades to "the sheet that is already there", never to a
  // blank one: nothing is painted unless the fetch came back with HTML, and the
  // rejection is swallowed the way versions.ts swallows refresh's.
  void versionHTML(lo)
    .then((h) => {
      if (h !== null && seq === scrubSeq && pa.dataset.v !== String(lo)) {
        pa.innerHTML = h;
        pa.dataset.v = String(lo);
      }
    })
    .catch(() => {});
  if (hi !== lo) {
    void versionHTML(hi)
      .then((h) => {
        if (h !== null && seq === scrubSeq && pb.dataset.v !== String(hi)) {
          pb.innerHTML = h;
          pb.dataset.v = String(hi);
        }
      })
      .catch(() => {});
  }
  const f = this.scrubT - lo; // 0 at lo, 1 at hi
  pa.style.opacity = String(1 - f);
  pa.style.filter = `blur(${(f * 3).toFixed(1)}px)`;
  pb.style.opacity = String(f);
  pb.style.filter = `blur(${((1 - f) * 3).toFixed(1)}px)`;
  pb.hidden = hi === lo;
  this.paintTimeline();
  this.paintFrame?.();
}

export function scrubStep(this: AppShell, delta: -1 | 1): void {
  this.scrubTo(Math.round(this.scrubT) + delta);
}

export function scrubHome(this: AppShell): void {
  this.scrubTo(this.scrubMax());
}
