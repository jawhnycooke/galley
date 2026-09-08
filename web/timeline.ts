// timeline.ts — the scrubber across the bottom. Every version is a keyframe;
// t is continuous in [1, max]; dragging morphs the sheet between neighbours.
// The pure half is here and probed; the mixin (Task 6) owns the DOM.
import type { RoundView } from './wire.d.ts';

export interface Keyframe {
  n: number;
  left: number;
  label: string;
  /** The label plus the state the label no longer spells (` draft`, ` · cannot`). */
  title: string;
  fill: 'none' | 'accent' | 'grey';
  tone: 'muted' | 'accent' | 'coral';
}
export interface Scrub {
  near: number;
  frac: number;
  opacity: number;
  blur: number;
  atHead: boolean;
}

const REASON_COULD_NOT = 'could-not';
const REASON_LANDED = 'landed';
const HEAD_EPS = 0.01;

// THE LABELS THIN BEFORE THEY COLLIDE. A keyframe label is ~3ch of mono (`R12`)
// and the track is a fixed share of the window, so past a dozen rounds the
// labels overprint. Every stride-th label stays, plus the first, the last and
// the one nearest the handle; the dots all stay, and hovering the row shows
// every label. 44px is one label and a breath at 11px mono.
const LABEL_GAP_PX = 44;
export function labelStride(
  trackWidth: number,
  count: number,
  gap = LABEL_GAP_PX,
): number {
  if (count < 2 || trackWidth <= 0) return 1;
  return Math.max(1, Math.ceil(gap / (trackWidth / (count - 1))));
}
export function showLabel(
  i: number,
  count: number,
  stride: number,
  near: number,
): boolean {
  return i === 0 || i === count - 1 || i === near || i % stride === 0;
}

// THE HEAD SNAPS IN PIXELS, NOT VERSIONS. HEAD_EPS is a hundredth of a version,
// which on a long track is under a pixel: "let go near the right end" landed a
// hair short of `now` and the page stayed read-only. The last few pixels of
// the track ARE the head.
const HEAD_SNAP_PX = 8;
export function trackToT(
  x: number,
  width: number,
  max: number,
  snapPx = HEAD_SNAP_PX,
): number {
  if (width <= 0 || max <= 1) return max;
  if (width - x <= snapPx) return max;
  const f = Math.min(Math.max(x / width, 0), 1);
  return 1 + f * (max - 1);
}

export function keyframesOf(rounds: RoundView[], sealed: boolean): Keyframe[] {
  return rounds.map((r, i) => keyframeAt(r, i + 1, rounds.length, sealed));
}

// ONE KEYFRAME, AND ITS THREE FACES ARE ONE QUESTION EACH. This was the body of
// the map above, where the same two booleans were re-asked inside three nested
// ternaries — `head && revised && !sealed` written out three times, once per
// property, with nothing holding the three spellings together. DRAFT is that
// state named: the head, unsealed, carrying work the agent did. It is the only
// keyframe that is hollow AND accent, which is the whole reason it needs a name.
function keyframeAt(
  r: RoundView,
  n: number,
  max: number,
  sealed: boolean,
): Keyframe {
  const head = n === max;
  const cannot = r.reason === REASON_COULD_NOT;
  const draft = head && !sealed && r.reason === REASON_LANDED && r.answers > 0;
  return {
    n,
    left: max === 1 ? 0 : ((n - 1) / (max - 1)) * 100,
    // ONE SPELLING PER KEYFRAME. `R15 draft` and `R4 · cannot` were wider than
    // their neighbours and overprinted them; the hollow dot, the coral, and the
    // readout under the track (`v15 · agent revised`) already say the state.
    label: `R${r.n}`,
    title: `R${r.n}${cannot ? ' · cannot' : draft ? ' draft' : ''}`,
    fill: cannot || draft ? 'none' : head && sealed ? 'accent' : 'grey',
    tone: cannot ? 'coral' : head && (draft || sealed) ? 'accent' : 'muted',
  };
}

export function scrubState(t: number, max: number): Scrub {
  const c = Math.min(Math.max(t, 1), Math.max(max, 1));
  const near = Math.round(c);
  const frac = Math.abs(c - near);
  const opacity = 1 - Math.min(frac * 2, 1);
  return {
    near,
    frac,
    opacity,
    blur: (1 - opacity) * 3,
    atHead: c >= max - HEAD_EPS,
  };
}

export function scrubLabel(
  t: number,
  max: number,
  headRevised: boolean,
  sealed = false,
): string {
  const s = scrubState(t, max);
  // A SEALED HEAD IS NOT A DRAFT. `v6 → draft` over an approved document
  // promised a draft to go back to, and the return landed on `approved`.
  if (s.atHead && sealed) return `v${max} · approved`;
  if (s.atHead)
    return headRevised ? `v${max} · agent revised` : `v${max} → draft`;
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
  // The maximum this footer was last DRAWN with. Not a second copy of
  // `scrubMax()` — it is what lets paintTimeline tell "the reviewer is parked
  // on the last round" from "a new round just landed under a reviewer who was
  // at the head", which is the one question `scrubState` alone cannot answer
  // because both read `scrubT === the old max`.
  max: number;
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
  // The keys live INSIDE the track so the handle can sit above them (z-index)
  // where they meet at the head; a press on a key still bubbles to the track.
  track.append(keys);
  root.append(track, labels);
  host.append(root);

  let dragging = false;
  const at = (e: PointerEvent) => {
    const b = track.getBoundingClientRect();
    this.scrubTo(trackToT(e.clientX - b.left, b.width, this.scrubMax()));
  };
  window.addEventListener('resize', () => this.paintTimeline());
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

  // TWO PAPERS FOR THE CROSSFADE, AND THEY GO WHERE THE DRAFT'S PAPER IS.
  // History's panel — a second document body drawn while `main` was hidden —
  // is deleted (Task 14), so an earlier version is read on THE SHEET: same
  // column, same measure, same scroll, under the same eyebrow, which is what
  // lets that eyebrow carry `restore vN as draft` while the handle is off the
  // head. The editor's own paper is hidden under `body.gly-scrubbing`.
  const a = document.createElement('div');
  a.className = 'gly-versions-paper gly-scrub-paper';
  const b = document.createElement('div');
  b.className = 'gly-versions-paper gly-scrub-paper';
  const stage = document.createElement('div');
  stage.className = 'gly-scrub-stage';
  stage.append(a, b);
  const paper = document.querySelector('.ProseMirror');
  paper?.after(stage);
  this.timeline = {
    root,
    keys,
    track,
    fill,
    handle,
    label,
    papers: [a, b],
    max: this.scrubMax(),
  };
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
  if (this.scrubT >= ui.max) {
    this.scrubT = max;
  }
  ui.max = max;
  const frames = keyframesOf(rounds, this.sealed);
  const near = Math.round(this.scrubT) - 1;
  // Past ten rounds every fifth label is enough even where they would fit:
  // a row of R1…R15 is noise, and the nearest one is always shown.
  const stride = Math.max(
    labelStride(ui.track.getBoundingClientRect().width, frames.length),
    frames.length > 10 ? 5 : 1,
  );
  ui.keys.replaceChildren(
    ...frames.map((k, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gly-scrub-key';
      btn.style.left = `${k.left}%`;
      btn.dataset.tone = k.tone;
      btn.dataset.fill = k.fill;
      btn.title = k.title;
      if (!showLabel(i, frames.length, stride, near)) btn.dataset.thin = '';
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
    !!this.sealed,
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

// ONE PREDICATE FOR "AM I OFF THE HEAD", AND EVERY SURFACE ASKS IT.
//
// This question used to be spelled three ways in five files —
// `versionsPanel.open`, `body.gly-scrubbing`, and `scrubState(...).atHead` —
// with the panel and the body class as PEERS of the derived truth rather than
// renders of it. They can disagree, and one of them already had: frame.ts
// records a 119px layout jump from asking `scrubT` before the timeline was
// built, and fixed it by picking a different one of the three.
//
// The position is the truth: `scrubT` at `scrubMax()` is the live draft, and
// anything below it is a version being read. `versionsPanel.show()/hide()` and
// `body.gly-scrubbing` are what scrubTo WRITES from that answer, one place.
//
// A page with no scrubber is at the head by construction, and saying so here is
// what retires the 119px jump at its source: before makeTimeline runs `scrubT`
// is still 1 while `scrubMax()` already answers the record's length, so the
// arithmetic alone reads "reading v1" on any document with more than one round.
// AND IT IS ASKED AGAINST THE MAXIMUM THE FOOTER WAS DRAWN WITH, not only the
// live one. A round landing moves the head: `scrubMax()` answers 4 the instant
// the versions poll returns, while `scrubT` still holds the 3 that WAS the head
// until `paintTimeline` runs — so for one tick every surface would have read
// "the reviewer is reading v3" over a page showing the draft, and the readout
// did: `2 rounds · draft is untouched` where the arrival line belonged.
// `ui.max` is the same memory `paintTimeline` follows the head by, so the two
// cannot disagree; the `scrubState` clause is what answers a drag mid-track,
// where `scrubT` is fractional.
export function atHead(this: AppShell): boolean {
  const ui = this.timeline;
  if (!ui) {
    return true;
  }
  return (
    this.scrubT >= ui.max || scrubState(this.scrubT, this.scrubMax()).atHead
  );
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
  // `body.gly-scrubbing` directly. `show`/`hide` are what un-hide
  // `.gly-versions` and fire onOpen/onClose, which is where enterHistory and
  // leaveHistory hang; setting the body class alone would enter the mode over a
  // hidden surface. Both are RENDERS of `atHead()` (see it), written here and
  // nowhere else.
  if (s.atHead) {
    // THE SCROLL IS RESTORED LAST. `hide()` ends in leaveHistory's
    // `scrollTo(historyScroll)`; everything that changes the height of what
    // sits ABOVE the paper — the slot returning, the eyebrow's words — has to
    // be laid out before it, or the browser's scroll anchoring follows that
    // growth and Esc lands the reviewer a slot's height below where they were.
    document.body.classList.remove('gly-scrubbing');
    this.paintFrame();
    this.paintTimeline();
    if (this.versionsPanel.open) {
      this.versionsPanel.hide();
    }
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
  this.paintFrame();
}

export function scrubStep(this: AppShell, delta: -1 | 1): void {
  this.scrubTo(Math.round(this.scrubT) + delta);
}

export function scrubHome(this: AppShell): void {
  this.scrubTo(this.scrubMax());
}
