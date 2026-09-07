// ======================= THIS GATE RUNS, AND IS LOAD-BEARING =================
//
// `node web/layers.mjs` is 263/0 as of this migration and has been one of the
// four gates guarding every extraction in it — `just verify`'s local runs and
// CI both hold it green. It drives a real chromium against a real
// `galley edit` and reads `getComputedStyle`, which is the only way to catch
// the CSS bug class this file exists for: a more-specific selector silently
// beating an intended one, so a rule ships reviewed and never applies. If this
// file goes dark again, say so here the way this note once had to — a banner
// that is wrong in the safe direction still cost four gates staying silently
// dead for weeks, once.
//
// ITS HISTORY, FOR CONTEXT ON THE FIXTURE BELOW: it once WAS dark. Measured
// 2026-08-20 on `main` at 4b5561d, the gate died in its fixture setup —
//
//     Command failed: bin/galley suggest <fixture>.md --comment ... --on ...
//     galley: unknown command "suggest"
//
// — because `galley suggest` and `galley apply` had been deleted by `1cb6937
// review: complete the rounds-only architecture` and `a052b4a feat!: remove
// galley apply`. The agent's write surface became the file itself, and the
// reviewer's surface became an instruction rail rather than a population of
// decidable proposals; this file's fixture was never carried across, so every
// one of its checks went dark with nothing shouting about it.
//
// WHAT THE PALETTE-AND-PRIMARY BRANCH THEN CHANGED UNDER IT, kept here so the
// repair did not resurrect a check for something that was already gone by the
// time it landed: `.gly-revise-trail` and its 23ch reserve were DELETED (the
// trail's clause stopped being written when the rounds-only workflow arrived,
// and the reserve outlived the words); the pending count sits in
// `.gly-revise-count` on the same button, with the same argument; and the
// `.gly-amber` state class became `.gly-on`, because the colour it was named
// for moved to `--gly-signal`. It was not that branch that broke this gate —
// it was already dark — and that branch could not use this gate to hold the
// property it is here for; `web/rounds-ux.mjs` held the nothing-moves
// property over the primary's label in the meantime, see 'the primary
// changing its label moves nothing in the bar' there.
//
// The fixture was since rebuilt against the rounds-only product (the checks
// below read the instruction rail and the sealed/reopened states it actually
// has), which is how the gate is 263/0 now rather than a rewritten claim to
// be dark less convincingly.
// ===========================================================================
//
// layers.mjs — the computed-style gate for the visual system.
//
// IT IS SEQUENCED BY STATE, NOT BY SECTION NUMBER. The blocks run §1b, §1c, §4,
// §4b, §3, §5, §5b, §1, §7, §7a–§7e, and that order is deliberate rather than
// drift: the resting bar colours have to be read BEFORE the overall handle is
// clicked (amber on an open handle is correct and would be read as a
// regression), the panel has to be OPEN before §7's dark-mode loop can read
// `.gly-overall`, and the settled region has to be opened before §4b can read a
// card in it. One instrument, driven through the states in the order the
// product reaches them; the section numbers are the handoff spec's, and they
// are not a running order. Every state a block sets, it also puts back.
//
// docs/design/2026-08-08-handoff-spec.md assigns every element to exactly one
// of three layers, and every change it asks for is PAINT. Paint is invisible to
// rounds-ux.mjs, which measures rects, and invisible to probe.mjs, which has no
// DOM at all. It is also where this stylesheet's worst class of bug lives:
// `.gly-card button` (0,1,1) silently beats `.gly-thread-delete` (0,1,0), so a
// rule can be written, reviewed, commented and shipped without ever applying.
// Reading the CSS does not catch that. getComputedStyle does.
//
// Not part of `just verify` — it drives a real chromium against a real
// `galley edit`, neither of which CI has. `just layers` is the gate any change
// to a surface, a card or a verb has to clear before it lands.

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// THE GATE READS THE APP'S OWN LIST, not a copy of it. §8's seal and reopen
// blocks are claims about SEALED_VERBS, and a check named for a claim must read
// the selector the claim is about — a hand-copied string here would have gone
// stale the moment `.gly-overall-input` joined the constant, and the reopen
// half would have kept reporting `ok` over a control it never looked at. That
// is exactly how it shipped: the reopen read was rail-scoped, and three
// elements of this list were dead on a reopened page with the gate green.
// probe.mjs already imports this module under node, so the import costs
// nothing new.
import { SEALED_VERBS, SEAL_ONLY_VERBS } from './seal.ts';
import { UNTRACKED_NOTE } from './sheet.ts';
// `GUTTER_PX` AND `unplacedSaid` WERE IMPORTED HERE, AND THE TWO BLOCKS THAT
// READ THEM ARE DELETED. They were imported rather than transcribed for the
// reason one line up: §9 read the card's reserved gutter as a literal `26`
// beside a comment naming a constant, and §10's sentence was the rail's own,
// so a transcription of either would have kept reporting `ok` about a page that
// had changed underneath it. Both questions were about the mark-anchored rail
// card — the gutter it was inset by, the sentence standing in for the ones that
// could not be placed — and a thread's one surface is a pinned row now, which
// is inset by nothing and stands in for nobody. The imports go with the checks
// rather than being left to import a module for its side effects.

const GALLEY = process.env.GALLEY || 'bin/galley';
const PORT = Number(process.env.PORT || 8252);
const WIDE = { width: 1600, height: 1100 };
// Split so §8 can say WHICH selector came back dead, and so a selector that
// matches nothing is a named failure rather than a silent subtraction from a
// group query.
const SEAL_SELECTORS = SEALED_VERBS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let failures = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`ok    ${name}`);
    return;
  }
  failures += 1;
  console.log(
    `FAIL  ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail, null, 1)}`}`,
  );
}

/** A NOTE IS NOT A CHECK, and the difference is whether it can go red.
 *
 * CLAUDE.md's rule for a surface that genuinely cannot be asserted is to print
 * the number as a note OUTSIDE the pass/fail counters rather than asserting it
 * at zero. The same rule catches the opposite failure, which this file shipped:
 * a predicate whose two sides are equal in every reachable state reports `ok`
 * against the exact bug it was written for (§8's `✓ all` sweep did, against the
 * broken tree, in the same run that turned two other checks red). Print it,
 * name why it cannot fail, and put the assertion somewhere that can. */
function note(name, detail) {
  console.log(
    `note  ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`,
  );
}

const HERE = mkdtempSync(join(tmpdir(), 'galley-layers-'));
// THE NAME IS PART OF THE FIXTURE, and `doc.md` made the widest entry in §7a's
// sweep decorative. The document's name renders in `.gly-doc` at the head of
// the bar, so it is one of the widths the bar has to fit — and at six
// characters it left 1600px with room to spare, so the bar never folded there
// and "every control can be pressed at 1600px" PASSED AGAINST THE BROKEN
// BUILD. A probe with a realistic name failed at that same width. A check that
// can only pass is not a check.
//
// Twenty-eight characters is an ordinary filename, not a stress test — this
// file's own name is twelve and the plan documents beside it are longer. It
// used to fold the bar at 1600, which is what let the sweep's top entry fail
// again; then the untracked sentence became a basis-0 bar cell and the
// whole-doc handle dropped "on the whole doc", and the boundary moved.
//
// MEASURED 2026-08-16, against the ONE readout: flat at 1248px (52.2px tall),
// folded at 1246 (91.4px). Re-measured because the previous figures here
// (flat 1240, folded 1230) were taken while the bar still had three readout
// cells and the standing sentence still had a `display: none` below 1340 —
// both gone, and the boundary went the OPPOSITE way from the arithmetic on
// gaps alone: two fewer cells is 24px less bar, but the sentence no longer
// leaves at 1340, so the fold arrives ~16px WIDER rather than narrower. Which
// is exactly why this is measured and not reasoned.
//
// The sweep's 1200/1100/1000/992 widths still walk a folded bar with it, and
// THAT IS ASSERTED NOW rather than left to this comment — see the fold checks
// after the sweep loop. Held by a filename alone it was the fixture hazard
// CLAUDE.md names, in the gate that sweeps eleven widths. 1600 walking a flat
// bar is no longer a fixture hole but the product's own new shape — an
// ordinary name is not SUPPOSED to fold 1600 any more, and rounds-ux.mjs carries
// a name long enough to fold its own wide viewport on purpose.
//
// RE-MEASURED 2026-08-20, against the instruction bar. The bar lost its
// `Instructions · N` chip to one filled primary and the whole-document handle
// to the rail, so it is narrower again and a 28-character name folded NOTHING:
// measured flat (52.2px) at every one of the sweep's widths down to 992, which
// left every check in that loop walking the shape the rename was meant to stop
// certifying — and the fold assertion after it is what said so. The walk, on
// this bar: 28 characters folds nothing, 40 folds 1100 and below, FIFTY folds
// 1200 and below while leaving 1600 flat (52.2px), 60 folds 1240 too. Fifty-one
// is what ships. Still an ordinary filename, not a stress test.
//
// One measured oddity worth knowing before anyone "fixes" it: 992 folds and
// 991 does NOT. The narrow rules land at 991 — the bar's gap drops 12px → 8px
// across eight items and `.gly-census-count` leaves entirely — and that buys
// back more than the 1px of window costs. The sweep walks both.
//
// Nothing else reads it: `.gly-doc` is the only place it renders in the bar
// (the census handle counts notes and does not name the file), and the panel
// head that does name it is full-bleed and fixed, so its width is the window's
// either way. Checked before renaming.
const DOC = join(HERE, 'the-visual-layers-handoff-and-its-computed-style.md');
writeFileSync(
  DOC,
  `# Layers

An opening paragraph mentioning the retry budget, which is worth a conversation.

A second paragraph containing the phrase alpha, which someone wants replaced.

A third paragraph naming the phrase gamma, which is also due to change.

A fourth paragraph raising the settled question, which was answered and closed.

A fifth paragraph naming the release note, which somebody has to own.

A sixth paragraph kept plain so the trail pass can strike a word in it.

A seventh paragraph holding the word omega and the word sigma, reserved for a revision.

An eighth paragraph naming the withdrawn phrase, whose highlight goes away under it.

A ninth paragraph reserved for the applied round, which the agent revises outright.

![a figure with a caption](fig.svg)
`,
);

// A figure, because "figures inherit §1 without new rules" is the third of the
// handoff's three unrendered predictions and it cannot be tested against a
// document that has no figure in it. An SVG rather than a raster: it is three
// lines of text, it has an intrinsic size so the box is a real box, and it is
// served from beside the document the way any relative src is.
writeFileSync(
  join(HERE, 'fig.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="64" viewBox="0 0 160 64">
  <rect width="160" height="64" fill="#c9cee0"/>
  <rect x="12" y="12" width="136" height="40" fill="#8b93b5"/>
</svg>
`,
);

// --- WHAT THE FIXTURE IS BUILT FROM, AND WHY IT CHANGED ----------------------
//
// This whole block used to be `galley suggest`, `galley resolve`, `galley reply`
// and `galley blocks`, run against the .md before the server was started: two
// ins/del proposals, a resolved thread, eight replies deep enough to cap a
// bubble, a block comment on the figure and a comment whose highlight was then
// taken out from under it. `galley suggest` was deleted with the proposal
// machinery (1cb6937) and `galley apply` after it (a052b4a); `resolve`, `reply`
// and `blocks` went with them. The reviewer's side of the loop is INSTRUCTIONS
// now — an immutable round of asks, sent by one press of Revise — and the agent
// writes the file directly.
//
// So the fixture is seeded over `POST /_galley/instruct`, which is the endpoint
// the composer and the whole-document input already post to (entry.ts), and
// which takes the same three shapes `galley suggest` did: `comment` with a
// plain-text `target`, `comment_block` with a block key, and
// `comment_document`. `guard` in serve.go admits a request with no Origin —
// that is the CLI's shape — so node can post it, and the seeding runs against
// the live server rather than against the file, which is the one difference
// that matters: the document is OPEN, so nothing may write the .md behind it.
//
// THREE POPULATIONS THE PRODUCT NO LONGER HAS, and every check that read them
// is deleted at the section it stood in rather than pointed at a substitute:
//
//   the two `--replace` proposals   §5 and §5b are about the substitution card,
//                                   which is a component with no data to build
//                                   it from.
//   the resolved thread             a card carries one verb, delete; there is
//                                   no resolve, so nothing settles, so §4b and
//                                   §7b' read an empty region forever.
//   the eight replies               a card carries no reply box, so §7c's cap
//                                   has nothing to overflow.
//
// The anchorless thread survives and is built differently: a comment is filed
// the ordinary way and the reviewer then deletes the text under it IN THE
// EDITOR, which is what `threadPlacement`'s first anchorless case actually is
// and what a reviewer does. That has to happen with the browser attached, so it
// is done in-page at §9 rather than here.
const galley = (...args) =>
  execFileSync(GALLEY, args, { encoding: 'utf8', stdio: 'pipe' });

// The headings the sections below look their fixtures up by. Read back from the
// server rather than transcribed, for the reason every key here always was: a
// heading is derived from what the comment is anchored to, so a hand-copied one
// stops resolving the day the sentence above it changes and leaves the fixture
// quietly empty — which is the pass-forever shape this repository has recorded
// six of.
const SETTLED_HEADING = 'the settled question';
const RETRY_HEADING = 'the retry budget';
const WITHDRAWN = 'the withdrawn phrase';
const FIGURE_LABEL = 'a figure with a caption';

// --on-revise, and it is §8's alone: handleRevise refuses a verdict outright
// (501) when there is neither a command configured nor a `galley wait` blocked,
// and §8 approves. `true` runs on a Revise PRESS, which no check here makes, so
// nothing else in this pass changes shape for it.
const server = spawn(
  GALLEY,
  ['edit', DOC, '--no-open', '--port', String(PORT), '--on-revise', 'true'],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  },
);
// THE SERVER'S OUTPUT IS DRAINED, AND SPOKEN FOR ONLY IF IT DIES. Two reasons,
// and the first is not diagnostic at all: a piped stdio nobody reads fills its
// 64KB buffer and BLOCKS the writer, which for a long run turns the server into
// a process that stops answering. The second is that when the server does go
// away, every later `page.evaluate` that fetches fails as `TypeError: Failed to
// fetch` with no hint of why — seen three times in one session, once at 2.4s
// and once at 19.7s into a run, with `code=0` and nothing on either stream,
// which is a SIGTERM from outside this process. Kept quiet on a healthy run so
// the gate's own output stays readable.
const said = [];
const startedAt = Date.now();
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (d) => said.push(String(d)));
}
server.on('exit', (code, sig) => {
  process.stderr.write(
    `\n[the server exited ${Math.round((Date.now() - startedAt) / 100) / 10}s in — code=${code} sig=${sig}]\n` +
      `${said.join('').trimEnd()}\n` +
      '[every check after this point that reads the server is reading nothing]\n',
  );
});
process.on('exit', () => {
  try {
    server.kill('SIGTERM');
  } catch {
    // Already gone; the exit code is what matters.
  }
  try {
    rmSync(HERE, { recursive: true, force: true });
  } catch {
    // ENOTEMPTY, seen once: the server is being SIGTERMed at this exact moment
    // and can write its sidecar back into the directory mid-removal. A tmpdir
    // left behind is nothing; an exit handler that THROWS turns a run where
    // every check passed into a non-zero exit, which is a gate reporting a
    // failure that did not happen.
  }
});

const { chromium } = await (async () => {
  const where = process.env.GALLEY_PW;
  if (where) {
    const { createRequire } = await import('node:module');
    return createRequire(join(where, 'noop.js'))('playwright-core');
  }
  return import('playwright-core');
})();

await new Promise((resolve, reject) => {
  const started = Date.now();
  const poll = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok) return resolve();
    } catch {
      // Not up yet.
    }
    if (Date.now() - started > 20000)
      return reject(new Error('server never came up'));
    setTimeout(poll, 250);
  };
  poll();
});

// --- the round the reviewer has already filed --------------------------------
//
// FAILURES ARE FATAL. A seeded instruction that quietly 400s is a card no
// section below ever measures, and a gate whose fixture is half there reads
// "nothing overflows", "no card is adrift" and "the region holds nothing" as
// passes.
const BASE = `http://127.0.0.1:${PORT}`;
const instruct = async (body) => {
  const res = await fetch(`${BASE}/_galley/instruct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `fixture: /_galley/instruct refused ${JSON.stringify(body)} — ` +
        `${res.status} ${(await res.text()).trim()}`,
    );
  }
};
const pending = async () =>
  await (await fetch(`${BASE}/_galley/pending`)).json();

// AND IT IS A PARAGRAPH RATHER THAN A LINE, so §7c has a card with real height
// to place. It used to be EIGHT REPLIES DEEP, filed with `galley reply`, and
// that verb is gone with the conversation it belonged to: an instruction is a
// single immutable entry, so the tallest thread this product can hold is one
// long ask. It is a plausible instruction rather than filler, which is the
// difference between a fixture and a stress string.
await instruct({
  op: 'comment',
  target: RETRY_HEADING,
  text:
    'Per host or global? The per-connection reading is what the old client did and it is ' +
    'why the numbers never matched, so say which one this is in the sentence itself rather ' +
    'than leaving it to the reader. While you are in here: the default should probably come ' +
    'down, it should be a config value rather than a constant, and it interacts with the ' +
    'backoff schedule — which is a second conversation, but keep a line about it here so it ' +
    'is not lost. Backoff itself stays exactly as it is for now.',
});
await instruct({ op: 'comment_document', text: 'a note about the whole file' });
// A SECOND HIGHLIGHT, AND IT IS FURTHER DOWN THE PAGE ON PURPOSE. §7c's flip
// case — no room below the mark, so the card goes above it — needs a mark with
// real room ABOVE it, and the retry-budget one sits ~195px from the top of the
// document at every window this file uses. The only way to give that one no
// room below was to make the whole window 260px tall, which is a window where
// the design cannot work at all: the card is floored at a height that fits
// neither side, and a check that ran there was measuring the degradation and
// calling it the rule.
await instruct({
  op: 'comment',
  target: 'the release note',
  text: 'who owns this?',
});
// The sentence the settled thread was resolved on. It carries an ordinary
// instruction now — nothing can settle — and it is kept because §4b's block
// reads the region it would have gone into, and an empty rail is a worse
// fixture than a full one for every check that is not about settling.
await instruct({
  op: 'comment',
  target: SETTLED_HEADING,
  text: 'answered, and kept',
});
// The thread whose highlight the reviewer takes away at §9 — filed here so it
// is an ordinary anchored card for everything before that point.
await instruct({
  op: 'comment',
  target: WITHDRAWN,
  text: 'does this still apply?',
});

// AND ONE CONVERSATION ON A BLOCK — the shape that has no run BY CONSTRUCTION,
// and the one this fixture would otherwise be missing.
//
// IT IS HERE TO MAKE §10's ORPHAN CHECK CAPABLE OF FAILING. That check asks
// whether an anchorless conversation is in the map, and it asked it as
// `!c.dataset.run` — the discriminator CLAUDE.md records as WRONG, because
// `threadCard` writes `dataset.run = thread.run || ''` and a block or figure
// thread has no run to write. With this thread here the old form reports the
// figure's conversation as an orphan in the map, which is exactly the "one
// wrong predicate, two symptoms" entry arriving inside a check.
//
// THE KEY IS READ BACK from the pending view's own `blocks`, which is where
// `galley blocks` used to get it and where the browser's section grip gets it:
// it is a content hash, so a transcribed one would stop resolving the day the
// caption changes and leave the fixture quietly without a block thread again.
{
  const blocks = (await pending()).blocks || [];
  const figure = blocks.find(
    (b) => b && b.kind === 'image' && (b.label || '').includes(FIGURE_LABEL),
  );
  if (!figure)
    throw new Error(
      `fixture: no image block for "${FIGURE_LABEL}" to comment on`,
    );
  await instruct({
    op: 'comment_block',
    target: figure.key,
    text: 'does this picture still match the text?',
  });
}

{
  const filed = (await pending()).instructions || [];
  if (filed.length !== 6) {
    throw new Error(
      `fixture: ${filed.length} instructions landed, wanted 6 — ` +
        JSON.stringify(filed.map((i) => i.quote)),
    );
  }
}

const browser = await chromium.launch(
  process.env.GALLEY_CHROME
    ? { executablePath: process.env.GALLEY_CHROME }
    : {},
);
const page = await browser.newPage({ viewport: WIDE });
page.on('pageerror', (e) => console.log(`      [page error] ${e.message}`));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
// THE FIXTURE'S OWN READY SIGNAL MOVED WITH THE SURFACE. This waited on the
// first card in the rail band, which was how a filed instruction announced
// itself; a mark-anchored instruction has a ROW under its block now and no card
// at all, so the band is empty by construction and this wait could only ever
// time out. `.ProseMirror .gly-row` is the same claim on the surface that
// replaced it: the six fixture instructions have landed and been painted.
await page.waitForSelector('.ProseMirror .gly-row', { timeout: 15000 });
await page.waitForTimeout(1500);

/** Every computed value this pass reads goes through here — one place that
 *  reports a missing element as null rather than throwing halfway down. */
const style = (sel, ...props) =>
  page.evaluate(
    ([s, ps]) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
    },
    [sel, props],
  );

/** The same, for every match — "the destroy weight renders EVERYWHERE a thread
 *  renders" is a claim about all of them, and one passing instance is how a
 *  regression hides. */
const styleAll = (sel, ...props) =>
  page.evaluate(
    ([s, ps]) => {
      const cs = (el) => {
        const c = getComputedStyle(el);
        return Object.fromEntries(ps.map((p) => [p, c.getPropertyValue(p)]));
      };
      return Array.from(document.querySelectorAll(s)).map(cs);
    },
    [sel, props],
  );

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const token = (name) =>
  page.evaluate(
    (n) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
const rgb = async (name) =>
  page.evaluate(
    (v) => {
      const probe = document.createElement('span');
      probe.style.color = v;
      document.body.appendChild(probe);
      const out = getComputedStyle(probe).color;
      probe.remove();
      return out;
    },
    await token(name),
  );

/* `ruleValue` IS DELETED WITH THE ONE CHECK THAT CALLED IT. It read a declared
 * value straight off a matched CSSOM rule rather than off the painted pixel —
 * the one place in this file that deliberately did not read the artifact — and
 * it existed for a single confounding: `.gly-bar button`, edit.html's inline
 * fallback, tied `.gly-census button` on specificity and won the cascade by
 * sitting in a later stylesheet, so the computed radius check passed with
 * `.gly-census button` reverted to 999px. The census strip and its rule are
 * both deleted, no second rule declares a radius on a bar control, and a
 * helper kept for a caller that no longer exists is the shape §1 below now
 * retires rather than carries. Bring it back with the check, if a second rule
 * ever ties `.gly-bar button` again — it walked TOP-LEVEL rules only and took
 * the last matching one, which is the cascade's own tiebreak among equals. */

/** The selectors declared in edit.html's inline <style> — the block that loads
 *  AFTER editor.css and so wins every specificity tie.
 *
 *  `ruleValue` above cannot answer the question this helper exists for. Once
 *  editor.css owns `.gly-bar button` too, "is there a rule with this selector"
 *  is true from either sheet, and WHICH sheet is the entire question. It is
 *  also worth saying plainly that `ruleValue` walks only top-level rules and
 *  does not recurse into `@media` or `@supports` bodies; the shell declares
 *  its button chrome at the top level and only its dark tokens inside an
 *  at-rule, so that gap does not bite here, but it is a gap.
 *
 *  The block is identified by a selector only it declares — `.gly-spacer` —
 *  rather than by "has no href", so another inline <style> (mermaid injects
 *  one when a diagram renders) cannot be mistaken for it. */
const shellSelectors = () =>
  page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = Array.from(sheet.cssRules);
      } catch {
        continue;
      }
      const sels = rules.map((r) => r.selectorText).filter(Boolean);
      if (sels.includes('.gly-spacer')) return sels;
    }
    return null;
  });

// --- §1b · the chrome layer owns its own controls -------------------------
//
// `.gly-bar button` lived in edit.html's inline <style>, which loads AFTER
// editor.css and so wins every tie. It was written as a bundle-less fallback
// for the one button in the shell's markup and silently captured every button
// the editor appends into the bar.
//
// This block runs BEFORE the `.gly-census-overall` click further down. Amber
// on that handle once it is open is correct — it means "here" — and reading
// the resting colour after the click would be reading the wrong state.

{
  const bar = await styleAll('.gly-bar button', 'font-size');
  check(
    'every bar control is chrome-sized',
    bar.length > 0 && bar.every((b) => b['font-size'] === '12px'),
    bar,
  );

  // `.gly-bar button`, not `.gly-census button`: the name says "bar control",
  // and the census strip is two of the six buttons in the bar (three of seven
  // before ✗ all retired). The other
  // four — collapse, hold, mode and revise — were 14px in the accent too, and
  // reading only the census would have left them unasserted by the very check
  // written for the task that fixed them.
  const resting = await styleAll('.gly-bar button', 'color');
  const accent = await rgb('--gly-accent');
  check(
    'no resting bar control wears amber',
    resting.length > 0 && resting.every((c) => c.color !== accent),
    resting,
  );

  // And the shell's fallback claims only the markup it actually ships. A
  // button that exists only once the bundle has run cannot need a bundle-less
  // fallback, so the correct scope is exactly `#gly-revise`.
  const shell = await shellSelectors();
  // `.includes` on each selector, not on the list: the shell wraps the id in
  // `:where()` so the fallback carries zero specificity and editor.css's own
  // `.gly-bar button` wins whenever the bundle is there. That the wrapping
  // WORKED is asserted by the 12px check above — #gly-revise is a
  // `.gly-bar button` too, and a bare id selector would have held it at 14px.
  check(
    "the shell's fallback still covers its own static button",
    shell !== null && shell.some((s) => s.includes('#gly-revise')),
    shell,
  );
  check(
    'the shell no longer claims the buttons it never met',
    shell !== null && !shell.some((s) => s.startsWith('.gly-bar button')),
    shell && shell.filter((s) => s.startsWith('.gly-bar button')),
  );
}

// --- §1c · a disabled census verb — DELETED WITH THE CENSUS STRIP -----------
//
// §1c read a control INSIDE the census strip and asserted the bar's own
// `.gly-bar button[disabled]` (0,2,1) painted it — 0.6, muted, `cursor:
// default` — rather than the strip's stale `.gly-census button[disabled]`,
// which tied on specificity and won on source order at 0.4, 1.8:1 against the
// page. Both the strip and its rule are deleted, so the tie the check existed
// to catch cannot be struck: there is no second rule over any bar button. The
// surviving half of the claim — every control in the bar is painted by the
// bar's rules — is §1b's, directly above, and it is unchanged.
//
// It is NOT repointed onto `.gly-bar-count`. That button is the BOTTOM bar's
// (`.gly-bottombar`), a different container with different rules, and pointing
// a check at an element it was never about is how a gate keeps a green tick
// while measuring nothing.

// --- §1d · the bar has ONE readout ------------------------------------------
//
// COURT READ THREE FRAGMENTS OFF THE BAR: `your edits…`, `connected …`,
// `revision r…`. Three readouts stood side by side between the census strip
// and the one flexible cell — the editor's `#gly-editor-status`
// (`connected · saved …`), `.gly-census-untracked` (the standing sentence) and
// the shell's `#gly-status` (the reply to a press) — and all three carry the
// same `flex: 100 1 0` yield, so on any bar that is not enormous they shorten
// together and none of them finishes a sentence. That is the rail's
// incoherence one surface over: several things doing one job, and the answer is
// the same one.
//
// The claim is COUNTABLE, which is why it is a check rather than a taste. The
// region between the census and the spacer is exactly the READOUT region — the
// bar's own ordering rule says so (edit.html: controls, readouts, the one
// flexible cell, controls) — so "one readout" is "one element in there".
//
// And it must carry the whole line, or consolidating would have been deletion
// wearing a better name: the session's state AND the standing sentence, out of
// one element, from the first paint.
console.log('\n--- §1d · the bar has one readout ---');
{
  const region = await page.evaluate(() => {
    const bar = document.querySelector('.gly-bar');
    if (!bar) return null;
    const kids = Array.from(bar.children);
    // THE REGION'S LEFT EDGE MOVED WHEN THE CENSUS DID. It was the strip —
    // the last thing in the bar before the readouts — and the strip is
    // deleted. `.gly-doc-path` is what the bar's own order (edit.html:300)
    // now puts immediately before `#gly-status`, so it is the same boundary
    // read off the element that holds it. The claim is untouched: what sits
    // between the last cell before the readouts and the flexible cell is
    // exactly the readout region, and there must be ONE thing in it.
    const from = kids.findIndex((el) => el.classList.contains('gly-doc-path'));
    const to = kids.findIndex((el) => el.classList.contains('gly-spacer'));
    if (from < 0 || to < 0) return null;
    return {
      from,
      to,
      // RENDERED ONLY. The seal's terminal readout is built into this region
      // too and sits `display: none` until a verdict lands — it is the bar's
      // readout on a SEALED page, where `#gly-status` carries only a reopen's
      // reason (§8 reads that state). This block is about the LIVE bar, which
      // is the one Court was looking at, so an element that is not painted is
      // not a readout the reviewer is reading.
      between: kids
        .slice(from + 1, to)
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => ({
          id: el.id,
          cls: el.className,
          text: (el.textContent || '').trim(),
          basis: getComputedStyle(el).flexBasis,
        })),
    };
  });
  check(
    'the bar orders itself doc · readout · flexible cell, so the region is the region',
    !!region && region.to > region.from,
    region,
  );
  // THE WHOLE ORDER, PRINTED. A NOTE and not a check: the ordering RULE is the
  // three checks around this one (readouts before the flexible cell, controls
  // after), and the order WITHIN the control group is not a rule — it is a
  // consequence of construction order, since `makeMode` inserts both the mode
  // toggle and hold before `#gly-revise`. It is printed because three
  // documents got the tail wrong in the same way and each reader copied the
  // last one; a run of this gate now says what the DOM actually is.
  note(
    'the bar, in DOM order',
    await page.evaluate(() =>
      Array.from(document.querySelector('.gly-bar').children).map(
        (el) => el.id || el.className.split(' ')[0] || el.tagName.toLowerCase(),
      ),
    ),
  );
  check(
    'and there is exactly ONE readout in it',
    !!region && region.between.length === 1,
    region && region.between,
  );
  check(
    "it is the shell's own #gly-status — the element that exists before the bundle does",
    !!region &&
      region.between.length === 1 &&
      region.between[0].id === 'gly-status',
    region && region.between,
  );
  // NON-VACUOUS: one EMPTY cell would satisfy every line above. The readout
  // has to be saying both of the things the three cells used to say between
  // them, on a page nobody has pressed anything on yet.
  //
  // THE STANDING SENTENCE HAS MOVED, AND THIS CHECK MOVED WITH IT RATHER THAN
  // BEING DROPPED. `UNTRACKED_NOTE` was the second clause of the bar's one
  // readout — "instructions in this round" — and it is the SHEET's head now
  // (`paintSheet`, and §7b below reads it there, once). What the bar's readout
  // carries instead is the round and the draft's state: `round 1 · draft ·
  // saved just now`, measured. The claim is unchanged in shape — one element,
  // saying more than one thing, from the first paint, on a page nobody has
  // pressed anything on — so it is asserted against what that element actually
  // says. The alternative was to keep asserting a sentence that lives
  // elsewhere, which is a check that can only fail, or to drop the clause,
  // which leaves one EMPTY cell satisfying every other line in this block.
  const line = region && region.between[0] ? region.between[0].text : '';
  check(
    "and it is saying the round and the session's state, in one line",
    /round \d+/.test(line) && /(connected|connecting|saved|draft)/.test(line),
    line,
  );
  // The yield is the readout's and nothing else in the region can be starved,
  // because there is nothing else in the region.
  check(
    'the one readout is the yielding cell — basis 0, so no text in it can fold the bar',
    !!region &&
      region.between.length === 1 &&
      region.between[0].basis === '0px',
    region && region.between,
  );
}

// --- §4 · the destroy weight ------------------------------------------------
//
// Three claims, and they fail together today for one reason: `.gly-card button`
// beats `.gly-thread-delete` on specificity, so the borderless and the muted
// are both discarded and delete renders as a pill of equal weight to resolve.
//
// READ OFF THE WHOLE-DOC SLOT, WHICH IS WHERE A THREAD CARD RENDERS NOW. This
// block read `.gly-docslot .gly-thread-delete`, and the rail's population was the
// mark-anchored card — an instruction with a place in the document has a ROW
// and no card at all now, so that selector matches nothing and
// `styleAll(...).every(...)` over an empty list is the pass-forever shape §4b
// below refuses. `threadCard` is the one component every surface wears, so the
// claim moves with the card and not one property of it changes: the
// whole-document instructions are `.gly-docslot`'s entries (paintOverall), and
// `dels.length > 0` is what keeps the move honest.

{
  // styleAll, not style: "the destroy weight renders at rest" is a claim about
  // every thread card on the surface, and reading only the first match is how a
  // regression in the second or third card hides behind a passing gate.
  const dels = await styleAll(
    '.gly-docslot .gly-thread-delete',
    'border-top-color',
    'color',
    'margin-left',
  );
  const muted = await rgb('--gly-muted');
  check(
    'delete is borderless at rest',
    dels.length > 0 && dels.every((d) => d['border-top-color'] === TRANSPARENT),
    dels,
  );
  check(
    'delete is muted at rest',
    dels.length > 0 && dels.every((d) => d.color === muted),
    {
      got: dels.map((d) => d.color),
      want: muted,
    },
  );
  check(
    'delete stands 2rem clear of resolve',
    dels.length > 0 && dels.every((d) => parseFloat(d['margin-left']) >= 32),
    dels,
  );
}

// The armed label must not move the button under the cursor: the second click
// has to land where the first one did, and this is the one control where
// getting that wrong is irreversible outside git.
{
  const before = await page
    .locator('.gly-docslot .gly-thread-delete')
    .first()
    .boundingBox();
  await page.locator('.gly-docslot .gly-thread-delete').first().click();
  await page.waitForTimeout(400);
  const after = await page
    .locator('.gly-docslot .gly-thread-delete')
    .first()
    .boundingBox();
  check(
    'delete keeps its box when it arms',
    before &&
      after &&
      Math.abs(before.width - after.width) < 0.5 &&
      Math.abs(before.x - after.x) < 0.5,
    { before, after },
  );
  const armed = await style(
    '.gly-docslot .gly-thread-delete.gly-armed',
    'color',
  );
  check(
    'armed delete is the one resting-adjacent red',
    armed && armed.color === (await rgb('--gly-del')),
    armed,
  );

  // AND IT DISARMS ON SCREEN, which it did not. `DELETE_ARM_MS` is 4000 and the
  // state really did expire; the PAINT did not follow it. The click handler
  // repainted the rail (correctly — a real mouse click blurs the editor first
  // and detaches the card the handler is holding), so the timeout's closure was
  // left holding a button nobody can see, and its guarded repaint was
  // `lapsed = armedNow()` read AT exactly 4000ms, which is false by
  // construction. Dead code, and a button reading `delete?` forever.
  //
  // Measured red against the tracked build: at +5s the label was still
  // `delete?`, `.gly-armed` still on the button, and the armed note still under
  // the card. Read from the SCREEN — the label the reviewer sees and the note
  // beside it — rather than from `app.armedDelete`, which was already correct
  // through the whole defect and is exactly the internal a check here must not
  // believe.
  await page.waitForTimeout(4600);
  const disarmed = await page.evaluate(() => {
    const b = document.querySelector('.gly-docslot .gly-thread-delete');
    if (!b) return null;
    const shown = Array.from(b.querySelectorAll('span'))
      .filter((s) => !s.classList.contains('gly-reserved'))
      .map((s) => s.textContent);
    const card = b.closest('.gly-card');
    return {
      shown,
      armedClass: b.classList.contains('gly-armed'),
      note: card ? card.querySelector('.gly-card-note')?.textContent || '' : '',
      state: window.galleyEdit.app.armedDelete,
    };
  });
  check(
    'the armed delete disarms ON SCREEN when its window lapses',
    disarmed &&
      disarmed.shown.join('') === 'delete' &&
      disarmed.armedClass === false,
    disarmed,
  );
  check(
    'and the armed warning goes with it — the card stops asking a question nobody can answer',
    disarmed && !disarmed.note.includes('click again'),
    disarmed,
  );
  check(
    'the app state and the paint agree, which is the whole of this defect',
    disarmed && disarmed.state === null,
    disarmed,
  );

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// --- §4b · the settled list — DELETED, WITH THE POPULATION IT READ -----------
//
// §6 asks for the destroy weight in rail, panel, sheet and settled list alike,
// and this block was the settled list's coverage: it pressed `.gly-census-count`
// to open the sheet on a wide screen, opened the settled region inside it, and
// read six properties off a settled card — that it is a full card, that it
// carries its 3px kind edge, that its head speaks the chrome's mono voice, that
// its delete wears the destroy weight, that it is dimmed to §2's 0.8 rather
// than to resolve's 0.55, and that it offers `↺ reopen`, the only way back from
// a mis-clicked `✓ resolve`. Every one of them was measured red first: the card
// painted 0.55 while the stylesheet said 0.8 in two places, because
// `.gly-card.gly-resolved` (0,2,0) out-specified `.gly-settled-card` (0,1,0).
//
// NOTHING CAN SETTLE ANY MORE. `threadCard` builds one verb — delete — because
// an instruction is immutable work for the next round rather than a
// conversation to answer and settle; there is no `✓ resolve` to press, no
// `↺ reopen` to press it back, and `galley resolve` went with them. So the
// settled region is `hidden` on every run, exactly as it was before this block
// was written, and the trap it was written to escape has closed again from the
// other side: a check reading `.gly-sheet-settled-list .gly-card` would report
// zero matches forever, and `styleAll(...).every(...)` over an empty list is
// `true`. That is the pass-forever shape, and it is why this is a deletion
// rather than a re-point.
//
// AND THE DOOR IT PRESSED IS A DIFFERENT DOOR. `.gly-census-count` was made a
// button so a desktop reviewer could reach the sheet at all; it is the
// INSTRUCTIONS VIEW control now (`openInstructions`, which sets
// `sheetOpen = false` and returns the page to the document), so the press this
// block opened with does the opposite of what it was written to do. Measured:
// `{sheet: false, rail: "block", width: 1600}`.
//
// The destroy weight itself is still read on every surface that renders a card
// — §4 above over the rail, §7b over the sheet — so §6's claim is not
// unasserted; it is asserted over three surfaces instead of four, because there
// are three.

// --- §8 · the trail: the reviewer's hand paints as ghost and highlight ------
//
// The trail (2026-08-15 spec) is three new painted surfaces: the deletion
// ghost, the insertion highlight, and the changed region at the rail's foot.
// Paint is what rects cannot see, so each is read from a real browser — and
// each check below was SHOWN FAILING against the pre-trail bundle before it
// was believed (the doctrine: a check must be shown failing first).

{
  // A real reviewer edit: strike one word and type another in its place, so
  // the merged entry carries BOTH halves and every surface below exists.
  //
  // WAIT FOR THE WORD, don't assume it. The document arrives over the websocket
  // and every server-side mutation replaces the whole fragment, so "the editor
  // exists" and "the editor holds the fixture" are two facts and only the second
  // one lets this block do anything. Read as an assumption, this threw
  // `fixture: no "plain" to strike` — a gate that dies on a race rather than
  // reporting a colour, and it dies EVERY time on a loaded machine, which is
  // how it was caught. The predicate is the one the evaluate below computes, so
  // there is no interval here anybody had to guess at.
  await page.click('.ProseMirror');
  await page.waitForFunction(
    () =>
      !!window.galleyEdit?.editor?.state?.doc?.textContent?.includes('plain'),
  );
  await page.evaluate(() => {
    const editor = window.galleyEdit.editor;
    const doc = editor.state.doc;
    let at = null;
    doc.descendants((node, pos) => {
      if (at !== null || !node.isTextblock) {
        return at === null;
      }
      const i = node.textContent.indexOf('plain');
      if (i !== -1) {
        at = pos + 1 + i;
      }
      return false;
    });
    if (at === null) {
      throw new Error('fixture: no "plain" to strike');
    }
    editor.commands.focus();
    editor.commands.setTextSelection({ from: at, to: at + 'plain'.length });
    editor.view.focus();
  });
  await page.keyboard.press('Backspace');
  await page.keyboard.type('bare');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);

  // THE ONE CLAIM THIS FILE COULD NOT MAKE, AND THE PRODUCT'S CENTRAL ONE.
  // `.gly-trail-ghost` differed from `.gly-del` by `opacity: 0.75` and nothing
  // else — same colour, same wash, same solid strike — so the reviewer's own
  // applied edit and the agent's pending proposal were the same red
  // strikethrough in the same sentence. Measured on the fixture: a paragraph
  // carrying one agent substitution and one hand edit read as three pending
  // deletions.
  //
  // The two must be apart AT A GLANCE AND WITHOUT A LEGEND, so this reads them
  // both, in one place, and requires them to differ in COLOUR and in SHAPE.
  // Against the tracked build it reports the pair equal on both.
  //
  // Both marks must EXIST for this to mean anything: the fixture's replaces
  // put a `.gly-del` in the prose and the strike above puts a ghost beside it,
  // and a null on either side is a failure rather than a vacuous pass — the
  // null-tolerant guard is the exact shape CLAUDE.md records six of.
  // THE SECOND POPULATION IS NOT IN THE PROSE ANY MORE, AND THE FOUR CHECKS
  // THAT COMPARED THEM ARE DELETED.
  //
  // They read `.gly-trail-ghost` and `.gly-del` from the SAME paragraph and
  // required them to differ in colour, in wash and in shape — because the two
  // had differed by `opacity: 0.75` and nothing else, so the reviewer's own
  // applied edit and the agent's pending proposal were the same red
  // strikethrough in the same sentence, and one paragraph read as three pending
  // deletions.
  //
  // There are no agent marks in the prose. The agent does not propose against
  // the document; it edits the file, its edits arrive as ordinary text, and the
  // before/after lives in History's own paper. `.gly-del` in the live prose has
  // no writer, so `style('.ProseMirror .gly-del', …)` is `null` on every run and
  // every one of those inequalities would be comparing against nothing — which
  // is the null-tolerant guard CLAUDE.md records six of, arriving from the far
  // side. The pair check ("both populations are on screen to be told apart")
  // was the guard against exactly this and it is the one that went red first,
  // which is the guard working.
  //
  // WHAT SURVIVES IS THE GHOST'S OWN VOCABULARY, stated positively — the record
  // grey, the strike, the aria-hidden, and the dotted rule under inserted text —
  // because those are claims about what the reviewer sees rather than about a
  // contrast with something that is not there.
  const ghost = await style(
    '.ProseMirror .gly-trail-ghost',
    'text-decoration-line',
    'text-decoration-style',
    'color',
    'background-color',
    'user-select',
  );
  check(
    "the reviewer's ghost is on screen at all, so what follows is not read off null",
    ghost !== null,
    { ghost },
  );
  note(
    'and no agent mark is in the prose beside it — the agent edits the file',
    await page.evaluate(() => ({
      del: document.querySelectorAll('.ProseMirror .gly-del').length,
      ins: document.querySelectorAll('.ProseMirror .gly-ins').length,
    })),
  );
  // ONE REMOVAL VOCABULARY, AND THE TWO POPULATIONS ARE APART BY SHAPE.
  //
  // This asserted the ghost was `--gly-muted` — the record grey — under
  // CLAUDE.md's "RED IS RESERVED FOR WAITING ON YOU". That entry is SUPERSEDED
  // on the colour and standing on the shape (2026-08-20), and the argument is
  // worth carrying here because the reversal reads as a regression otherwise:
  // the grey existed to keep the reviewer's own edits apart from the agent's
  // undecided PROPOSALS interleaved in the same prose, so that a red strike was
  // genuinely ambiguous about whether it was asking the reviewer for something.
  // The agent's changes are applied now. There are no pending deletions in the
  // draft to be confused with, the only red strike in the prose is the
  // reviewer's own, and a colour reserved against a population that does not
  // exist is a colour spent on nothing — while grey cost the ghost the one
  // thing every reader already knows, which is that removed text is red.
  //
  // So: colour says WHAT HAPPENED to the text, shape says WHETHER IT HAS
  // HAPPENED YET. The outgoing ghost is `--gly-del`, DOTTED, with no wash; a
  // settled diff in History is `--gly-del`, SOLID, on the del wash — and that
  // contrast is asserted in §12, where a real diff is on screen to be read
  // against this one. Here is the ghost's own half, all three properties
  // together, because any one of them alone is satisfied by the design this
  // check used to state.
  check(
    'the ghost is red — there is one vocabulary for removal, and this is it',
    ghost !== null && ghost.color === (await rgb('--gly-del')),
    { ghost, want: await rgb('--gly-del') },
  );
  check(
    'and it is DOTTED and unwashed — shape is what says it has not happened yet',
    ghost !== null &&
      ghost['text-decoration-style'] === 'dotted' &&
      ghost['background-color'] === TRANSPARENT,
    ghost,
  );
  check(
    'it is still struck through — a deletion still reads as one',
    ghost !== null && ghost['text-decoration-line'].includes('line-through'),
    ghost,
  );
  check(
    'and the ghost is aria-hidden — a readout, never content',
    await page.evaluate(() => {
      const el = document.querySelector('.ProseMirror .gly-trail-ghost');
      return !!el && el.getAttribute('aria-hidden') === 'true';
    }),
  );
  const trailIns = await style(
    '.ProseMirror .gly-trail-ins',
    'background-color',
    'border-bottom-color',
    'border-bottom-style',
  );
  // The ins half of the same deletion, for the same reason: `.gly-ins` has no
  // writer in the prose either, so the inequality that used to stand here
  // ("the reviewer's own typing does not wear the agent's ins wash") had
  // nothing on its right-hand side. The positive claim is what is left.
  check(
    "the reviewer's own typing is marked in the prose at all",
    trailIns !== null,
    { trailIns },
  );
  check(
    'it is marked by a record rule instead',
    trailIns !== null &&
      trailIns['border-bottom-style'] === 'dotted' &&
      trailIns['border-bottom-color'] === (await rgb('--gly-muted')),
    { trailIns, want: await rgb('--gly-muted') },
  );

  // THE LOG IS GONE FROM EVERY SURFACE, AND WHAT IT PAINTED IS ASSERTED AS AN
  // ABSENCE. Two checks stood here and each is answered rather than dropped:
  //
  //   `the changed region's head paints as chrome — muted, 11px, clickable`.
  //   Its subject was a disclosure at the rail's foot. The trail is an outgoing
  //   message to the agent, not a history — nobody browses it, so it has no
  //   head to paint. The chrome-voice claim it was one of several instances of
  //   is still asserted on `.gly-settled-head` in §4b.
  //
  //   `a log row quotes old→new in the prose's own red/green`. This was the ONE
  //   declared exemption to "red is reserved for waiting on you": red was legal
  //   in those rows because they sat under a head that said whose hand they
  //   were. With no rows there is nothing to excuse, and the vocabulary itself
  //   is still read on the replace card (§5), which is where the reviewer
  //   learned it. The exemption's own premise — that the GHOST must not borrow
  //   that red — is the inequality asserted directly above, which is the check
  //   that matters and the one that was missing for a whole phase.
  //
  // Asserted here rather than left to probe's bundle strings, because a region
  // can be re-added in the source and a string check only sees the artifact.
  const logged = await page.evaluate(() => ({
    railChanged: document.querySelectorAll(
      '.gly-rail-changed, .gly-changed-head',
    ).length,
    sheetChanged: document.querySelectorAll(
      '.gly-sheet-changed, .gly-changed-list',
    ).length,
    // THE LOG'S OWN ROWS, AND `.gly-change` IS STILL ONE OF THEM.
    //
    // This read 1 for a pass, and the fix taken then was to stop counting
    // `.gly-change` — `changeCard` drew ONE EDIT THE REVIEWER MADE BY HAND and
    // `paintRailCards` filed those under `.gly-rail-changes`, so the class was
    // held to belong to the ROUND rather than to the log. That narrowed the
    // check to cover the surface that was there instead of the surface the spec
    // has, which is a weakened assertion however the element got built:
    // 02-states-and-behavior.md §1 gives a hand edit page-only ghost and
    // insertion marks, cleared on send, and ONE count — the footer trail. It is
    // not a card on any surface. Both builders are deleted (cards.ts) and the
    // selector is back to what it measured: every element that says the
    // reviewer's hand was recorded in a LIST beside the prose.
    rows: document.querySelectorAll('.gly-change, .gly-change-adrift').length,
  }));
  check(
    'and the reviewer\u2019s hand is recorded in the prose alone — no log, no list, on any surface',
    logged.railChanged === 0 && logged.sheetChanged === 0 && logged.rows === 0,
    logged,
  );

  // THE TRAIL CLAUSE ON THE VERDICT BUTTON IS GONE, AND FIVE CHECKS GO WITH IT.
  //
  // They read `.gly-revise-trail` for `n edits, m replies`, asserted that the
  // count was the hand edit just made rather than zero, and then measured the
  // SEPARATOR as paint — a Range over the one leading space, because
  // `.gly-revise-trail` is `display: inline-block` and an inline-block starts
  // its own line box, where leading collapsible white space is REMOVED. Every
  // string gate over that label was green while the button printed
  // `Finish ▾· 3 edits, 3 replies`, and this was the pass that could see it.
  //
  // `paintRevise` writes `''` into the element unconditionally, on every tick.
  // The counts came from `outgoingCounts`, which reduces `view.changes` and
  // `view.comments` — two fields the pending payload stopped carrying when it
  // became a list of instructions — so the clause is empty in every reachable
  // state. `printed` returns `null` (there is no text node to take a Range
  // over) and all three separator checks reported `— null`, which is a gate
  // reading nothing and saying so. Printed as a note instead: the number is on
  // the record and outside the pass/fail counters, which is CLAUDE.md's rule
  // for a surface that genuinely cannot be asserted.
  note(
    'the trail clause on the verdict button',
    await page.evaluate(() => ({
      label: (document.querySelector('#gly-revise')?.textContent || '').trim(),
      clause: document.querySelector('.gly-revise-trail')?.textContent || '',
    })),
  );

  // --- STRUCK AND INSERTED ARE TWO WORDS, AND TWO WORDS DO NOT TOUCH --------
  //
  // Measured in a real browser on the shipped build: `alphabeta`, `gammadelta`,
  // `keptleft`, `nothingnobody` — a deletion and the text that replaces it
  // rendered with 0px between them, so each pair reads as one malformed
  // compound. Both populations have it and neither is a diff bug:
  //
  //   THE AGENT'S. The file holds `{~~alpha~>beta~~}` — ONE CriticMarkup span
  //   at ONE position, which is the whole of "one span in the file is one
  //   decision everywhere". There is no space between the halves in the
  //   document and there must never be one: accept writes `beta` into the
  //   author's prose and reject writes `alpha`, and a space put there to make
  //   the pair legible would survive both.
  //
  //   THE REVIEWER'S. The ghost is a WIDGET decoration — ProseMirror's own
  //   "this is not in the document" — drawn at the position the new word now
  //   occupies. `trimAffixes` narrows the stored entry to the changed span, and
  //   on the fixture's own edit that span is `kep`→`lef`: strictly INSIDE one
  //   word, with no space at either end to have been trimmed. The gap is not
  //   something the diff lost; it is a box the document does not contain,
  //   needing its own separation from the text it was inserted before.
  //
  // So the gap belongs to the mark's own box in both cases, and it is read here
  // as GEOMETRY against the width of a real space in the same prose — the one
  // measurement that says "these read as two words" rather than "some rule
  // declares some margin".
  const spacing = await page.evaluate(() => {
    const gap = (a, b) =>
      +(
        b.getBoundingClientRect().left - a.getBoundingClientRect().right
      ).toFixed(2);
    const agent = [];
    for (const del of document.querySelectorAll('.ProseMirror .gly-del')) {
      const next = del.nextElementSibling;
      if (!next || !next.classList.contains('gly-ins')) continue;
      agent.push({
        reads: del.textContent + next.textContent,
        gap: gap(del, next),
      });
    }
    const hand = [];
    for (const ghost of document.querySelectorAll(
      '.ProseMirror .gly-trail-ghost',
    )) {
      const next = ghost.nextElementSibling;
      if (!next || !next.classList.contains('gly-trail-ins')) continue;
      hand.push({
        reads: ghost.textContent + next.textContent,
        gap: gap(ghost, next),
      });
    }
    // A SPACE IN THE SAME PROSE, at the same size and in the same family, so
    // the bound is the reader's own and not a number somebody picked.
    let space = null;
    for (const p of document.querySelectorAll('.ProseMirror p')) {
      const t = p.firstChild;
      if (!t || t.nodeType !== 3) continue;
      const i = t.data.indexOf(' ');
      if (i === -1) continue;
      const r = document.createRange();
      r.setStart(t, i);
      r.setEnd(t, i + 1);
      space = +r.getBoundingClientRect().width.toFixed(2);
      break;
    }
    return { agent, hand, space };
  });
  // ONE POPULATION, FOR THE REASON THE FOUR CHECKS ABOVE WERE DELETED: there
  // are no `.gly-del`/`.gly-ins` pairs in the prose, so `spacing.agent` is empty
  // on every run and `[].every(...)` is `true` — the agent half of this claim
  // would report `ok` about nothing at all. The reviewer's own ghost-beside-its
  // -replacement is a real pair and is asserted; the agent's is named as absent
  // in the same breath, so the deletion is on the record and not a silence.
  check(
    'the reviewer’s ghost and its replacement are both rendered, so the gap is a real gap',
    spacing.hand.length > 0 && spacing.space > 0,
    spacing,
  );
  check(
    'and they read as two words, not one',
    spacing.hand.every((h) => h.gap >= spacing.space),
    spacing,
  );
  note(
    'agent substitution pairs in the prose (none: the agent edits the file)',
    spacing.agent.length,
  );

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

// --- §11 · clicking marked-up text, above the breakpoint --------------------
//
// THE MOST NATURAL GESTURE IN THE PRODUCT. Everything this file already asserts
// about the bubble is asserted at 900px; this block is the same gesture at a
// desktop width, which used to be a DIFFERENT surface — the rail was on screen
// there and `threadFor` answered null. The rail is deleted, so the bubble is
// the answer at every width and this block is what proves the two agree.
//
// Two clicks, measured against a real server:
//
//   a COMMENT highlight opened `COMMENT · AGENT · JUST NOW` with `✓ accept` /
//   `✗ reject` and nothing else — no comment text, no conversation, no reply
//   box — and accept posted `{"run":"…","id":"c2"}` for a 404 the bubble then
//   reported as "that suggestion has moved — reopen it";
//
//   the GREEN half of a substitution opened `INSERTION · AGENT · JUST NOW`,
//   "the server has not seen this one yet", and no verbs at all, about `s1`,
//   one of the pending, whose card was on screen with a working ✓.
{
  await page.evaluate(() => window.scrollTo(0, 0));
  // The premise this block used to open with — `surfaces().rail === true` —
  // is retired with `railSurfaces`' `rail` key. What replaces it is the claim
  // that actually matters for the gesture below: this is a width ABOVE the
  // breakpoint, where the bottom bar is not the surface answering.
  const wide = await page.evaluate(() => window.galleyEdit.app.surfaces());
  check(
    '§11 runs above the breakpoint — the footer carries the controls here',
    wide.bar === false,
    wide,
  );

  // --- the comment highlight ---
  const hl = page.locator('.ProseMirror .gly-hl').first();
  check('the fixture has a comment highlight to click', (await hl.count()) > 0);
  await hl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await hl.click();
  await page.waitForTimeout(400);
  const onComment = await page.evaluate(() => {
    const el = document.querySelector('.gly-bubble');
    return {
      bubbleOpen: !!el && !el.hidden,
      verbs: el
        ? el.querySelectorAll('.gly-bubble-accept, .gly-bubble-reject').length
        : 0,
      text: el && !el.hidden ? el.textContent : '',
    };
  });
  // ONE CONVERSATION, ONE PLACE — AND THE BUBBLE IS NOW THAT PLACE AT EVERY
  // WIDTH. This check read `bubbleOpen === false` and was right while the rail
  // drew the same thread beside the prose: a bubble would have been two reply
  // boxes and two deletes for one conversation, so the click took the reviewer
  // to the card instead. There is no rail and no card, so refusing the bubble
  // here would leave the most instinctive click in the product doing nothing.
  // The claim is unchanged — ONE copy — and the direction is what flipped.
  check(
    'clicking a comment highlight opens its conversation, at this width too',
    onComment.bubbleOpen === true,
    onComment,
  );
  // `it takes the reviewer to the card the rail is carrying` — RETIRED WITH THE
  // MARK-ANCHORED RAIL CARD. It read `.gly-rail .gly-thread.gly-flash`: the
  // reveal() flash on the card the band drew beside the mark. There is no rail,
  // so there is nowhere for a reveal to take anybody and no card to flash.
  // THE ASSERTION THE AUDIT ASKED FOR, and it holds however the surface
  // question is answered: no comment bubble anywhere carries a decide verb.
  check(
    'no comment bubble carries an accept or a reject',
    onComment.verbs === 0,
    onComment,
  );

  // --- the green half of a substitution — DELETED WITH THE SUBSTITUTION ---
  //
  // Ten checks stood here and they were about one defect: clicking the GREEN
  // half of a replace opened a bubble that read `INSERTION` beside a card
  // saying REPLACE, diagnosed the span as something the server had never heard
  // of, and posted the clicked mark's run — an id the server answers 404 to —
  // instead of the decision's own, the deleted half's. The pass intercepted
  // `POST /_galley/accept` and read what was posted, because that is where the
  // defect actually landed.
  //
  // A replace is a PROPOSAL and there are none: `galley suggest --replace` is
  // gone, `.gly-ins` has no writer in the prose, `app.suggestions` is empty on
  // every payload, and there is no accept to intercept. Every line of it would
  // have read off null — `green.count()` is 0, `wanted` is null, `posted` stays
  // null — so the two guards at the top ("the fixture has the added half of a
  // substitution to click", "the server reports the substitution as ONE
  // decidable replace") are the checks that went red, which is those guards
  // doing exactly what they were put there for. The rest is deleted rather than
  // pointed at some other span, because there is no other span that carries a
  // decision.

  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

// --- §3 · a conversation lives on a card, in the margin ----------------------
//
// The panel is chrome that must hold a conversation, and the law is that it
// does not become the margin — it summons a piece of it. So the head stays
// chrome and everything under it is a full card from §2's deck.

// THERE IS NO HANDLE IN THE RAIL ANY MORE, AND THAT IS THE RULING THIS BLOCK
// WAS WAITING FOR.
//
// Its history: `.gly-census-overall` was a bar control opening a panel that
// floated off the bar's measured height; then the whole-document card became
// the FIRST ITEM OF THE INSTRUCTION RAIL (`.gly-overall-rail`), opened by its
// own `.gly-overall-toggle`, and this press was re-pointed at that. The press
// is DELETED now: the rail holds live work only — *here is what needs you,
// beside the text it is about* — and a `+ add` button needs nothing and is
// beside nothing, so the toggle was chrome standing in the work column. Its
// placement caused both of the defects Court reported from live use (it
// scrolled out of reach; opening it slid every anchored card 39.29px off its
// mark), and no better place in the rail existed to move it to.
//
// The cards it used to disclose are simply THERE — filed whole-document
// instructions are live work and were never the thing that had to leave — so
// "the panel does not become the margin, it summons a piece of it" is checked
// below on a list that needs no opening.
await page.waitForSelector('.gly-overall-entries .gly-card');
await page.waitForTimeout(300);

{
  // THE THREE FLOAT CHECKS STAND, AND WHAT THEY ARE ABOUT HAS NARROWED.
  //
  // They were written against a floating panel, inverted when the panel became
  // a card of the rail, and kept in the new direction *"so a future re-float is
  // a red check rather than a discovery"*. That is exactly what happened: a fix
  // for the 39.29px slide was measured green, tripped this and rounds-ux.mjs,
  // and was BACKED OUT. THE RULING IS THAT THE SPLIT WAS THE ANSWER — the box
  // a reviewer TYPES IN floats (see the `.gly-capture` block below, which is
  // the new contract stated in full), and the instructions already FILED stay
  // in the rail's own flow, because they are the map. So `.gly-overall` is
  // still `static`, still unpainted, still claiming no stacking context, and it
  // now means only the list.
  const panel = await style(
    '.gly-overall',
    'background-color',
    'box-shadow',
    'z-index',
    'position',
  );
  check(
    'the filed whole-document instructions are IN the rail, not floating over it',
    panel && panel.position === 'static' && panel['box-shadow'] === 'none',
    panel,
  );
  check(
    'and they carry no ground of their own — the rail is what they sit on',
    panel && panel['background-color'] === TRANSPARENT,
    panel,
  );
  check(
    'so they claim no stacking context above the map they are part of',
    panel && panel['z-index'] === 'auto',
    panel,
  );
  // AND NO CAPTURE CONTROL IS LEFT IN THE COLUMN. Stated as its own check, in
  // the place the old press stood, so putting a `+ add` back into the rail is a
  // red check rather than a rediscovery of the same two defects.
  //
  // THE DOOR HAS MOVED ONCE MORE, AND THE CHECK MOVES WITH IT. It was a bar
  // control; it is the whole-doc slot's dashed last row now
  // (`.gly-docslot-add`, history.ts) — the verb kept at the foot of the
  // instructions already made. The half of this claim that is load-bearing is
  // unchanged and is asserted the same way: the rail holds NONE of it. Where
  // the door does live is asserted positively so this cannot pass on a page
  // that has simply lost it.
  // THE `.gly-rail` CLAUSES ARE RETIRED, NOT WEAKENED. `.gly-overall-toggle`
  // and `.gly-capture-open` inside `.gly-rail` were two counts of zero inside a
  // container that is not in the DOM — they could not fail. The toggle is
  // deleted outright, so its ABSENCE FROM THE PAGE is what is asserted; the
  // door exists and its place is asserted positively, which is the clause that
  // can go red if it is ever lost.
  const railChrome = await page.evaluate(() => ({
    toggle: document.querySelectorAll('.gly-overall-toggle').length,
    railGone: document.querySelector('.gly-rail') === null,
    bar: document.querySelectorAll('.gly-bar .gly-capture-open').length,
    doors: document.querySelectorAll('.gly-capture-open').length,
    slot: document.querySelectorAll('.gly-docslot .gly-capture-open').length,
  }));
  check(
    'capture is chrome — one door, in the doc slot, and nowhere else',
    railChrome.toggle === 0 &&
      railChrome.railGone &&
      railChrome.bar === 0 &&
      railChrome.doors === 1 &&
      railChrome.slot === 1,
    railChrome,
  );

  // --- THE CAPTURE CARD: A CARD IN THE FLOW, NOT A DISCLOSURE OVER IT ---
  //
  // The box the reviewer types a whole-document instruction into is a card in
  // the whole-document panel's flow now, and every property below is one clause
  // of that sentence. It is read here rather than as a new section because this
  // is where the whole-document surface's paint has always been read, and one
  // instrument driven through the states in the order the product reaches them
  // is this file's own discipline. The slide an in-flow composer used to cause
  // is answered in the script (openCapture calls scheduleAnchors), which
  // rounds-ux.mjs measures; here it is the paint that is read.
  await page.locator('.gly-docslot .gly-capture-open').click();
  await page.waitForSelector('.gly-capture:not([hidden])');
  await page.waitForTimeout(400);
  const capture = await style('.gly-capture', 'position', 'z-index');
  check(
    'the capture card is in the rail’s flow — it sits with the cards, not over them',
    capture && capture.position === 'static' && capture['z-index'] === 'auto',
    { capture },
  );
  // A CARD'S GROUND, AND NO SHADOW. It used to float over live cards and wore
  // the one shadow in the rail to say so; it is part of the map now, so it
  // wears the card ground and drops the shadow — the property that said it was
  // over the others is exactly the one that would now lie.
  const captureGround = await style(
    '.gly-capture',
    'background-color',
    'box-shadow',
  );
  const card = await rgb('--gly-card');
  check(
    'and it wears the card ground with no shadow — it is part of the map',
    captureGround &&
      captureGround['background-color'] === card &&
      captureGround['box-shadow'] === 'none',
    { captureGround, card },
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // --- THE RIGHT-CLICK MENU, AS PAINT ---
  //
  // ONE CLAIM ONLY, AND IT IS THIS FILE'S. `contextmenu` was unclaimed before
  // this, so the menu arrives with two things that have to be true: it must
  // never be a child of `.ProseMirror` (a surface appended into the editable
  // subtree is parsed as prose and written to the author's file — a fixture
  // went from 1 pending suggestion to 81), and it must be drawn over the chrome
  // it was summoned from. The FIRST is a DOM-structure fact and belongs where
  // behaviour is read: web/rounds-ux.mjs asserts it, on the same gesture. This
  // file reads computed style, so it asks the stacking question and only that
  // — the bar is 10 and the rail is 5, and a menu drawn under either is the
  // covered-control defect arriving through a third door.
  await page.locator('.ProseMirror p').first().click({ button: 'right' });
  await page.waitForSelector('.gly-menu:not([hidden])');
  const menuPaint = await style('.gly-menu', 'position', 'z-index');
  const barZ = await style('.gly-bar', 'z-index');
  check(
    'and it is drawn over the chrome it was summoned from',
    menuPaint &&
      menuPaint.position === 'absolute' &&
      barZ &&
      Number(menuPaint['z-index']) > Number(barZ['z-index']),
    { menuPaint, barZ },
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

{
  const cards = await styleAll(
    '.gly-overall-entries .gly-card',
    'border-left-width',
    'border-top-width',
  );
  check(
    'the panel renders full cards, not a bare variant',
    cards.length > 0 &&
      cards.every((c) => parseFloat(c['border-top-width']) > 0),
    cards,
  );
  check(
    'every panel card carries its 3px kind edge',
    cards.length > 0 &&
      cards.every((c) => parseFloat(c['border-left-width']) === 3),
    cards,
  );

  // Family, not a count — the same repair §4b's version already carries. "Mono
  // head" is a claim about the VOICE, and counting elements never reads a font:
  // the weak form passes on a head rendered in the document's own serif. The
  // comparison is against the CHROME's own computed family — it was the census
  // strip's until the strip was deleted, and `.gly-bottombar` is the chrome
  // element carrying the same `--gly-mono` voice — so the claim stays "the same
  // voice as the chrome" rather than "this font list".
  const heads = await styleAll(
    '.gly-overall-entries .gly-card-head',
    'font-family',
  );
  const chrome = await style('.gly-bottombar', 'font-family');
  check(
    'every panel card carries its mono head',
    heads.length === cards.length &&
      cards.length > 0 &&
      chrome &&
      heads.every((h) => h['font-family'] === chrome['font-family']),
    { heads, cards: cards.length, chrome },
  );

  // styleAll, not style: same reasoning as the rail's destroy-weight check
  // above — the panel can hold more than one thread, and the claim is that the
  // destroy weight renders correctly on all of them, not just the first.
  //
  // ALL THREE PROPERTIES, because §6's destroy weight IS the three together:
  // borderless, muted, 2rem clear. Reading only the border let this surface
  // lose the muted colour and still report `ok`, while the rail, the settled
  // list and the bubble all read every one.
  const dels = await styleAll(
    '.gly-overall .gly-thread-delete',
    'border-top-color',
    'color',
    'margin-left',
  );
  const muted = await rgb('--gly-muted');
  check(
    'the destroy weight renders in the panel too',
    dels.length > 0 &&
      dels.every(
        (d) =>
          d['border-top-color'] === TRANSPARENT &&
          d.color === muted &&
          parseFloat(d['margin-left']) >= 32,
      ),
    { dels, muted },
  );
}

// --- §5 · the substitution card — DELETED WITH THE SUBSTITUTION -------------
// --- §5b · a replace card is still a card in the band — DELETED WITH IT ------
//
// §5 read the replace card's paint: no `border-image` (a gradient border was
// the mockup's, and it painted OVER the kind edge), the top/right/bottom
// borders the ordinary line, and a left edge that is one 3px rule carrying BOTH
// the deletion and the insertion — the two-colour edge that says at a glance
// that a substitution is one decision and not two. Then it read the body,
// which has to QUOTE the document in the order the change reads: struck text
// first, replacement after it.
//
// §5b was the placement half. Two `--replace`s were in the fixture on purpose,
// because a layout bug that takes replace cards out of the band's absolute
// placement puts the FIRST one at very nearly the right place anyway — it is
// the second and third that land 92px and 185px below their marks — so one
// replace in the fixture was a gate that could not see displacement at all.
//
// There is no replace. `galley suggest --replace` is gone, nothing in the
// product proposes a substitution against the document, and `.gly-card-replace`
// has no writer. Every read here returned `null` and every `styleAll(...)`
// returned `[]`, which is why the fixture guard §5b opens with ("enough replace
// cards to see displacement at all") is the line that went red — the guard
// working, one more time.
//
// THE PLACEMENT CLAIM ITSELF IS NOT UNASSERTED. "Every card in the band is
// placed by the band, not by normal flow, and measures the same as every other
// card in it" is §9's question and §9 asks it over the cards that exist. What
// is gone is the two-colour edge and the old→new body, because a component with
// no data to build it from cannot be read off a screen.

// --- §1 · radius is a caste mark --------------------------------------------
//
// Full pills belong to verbs on cards and to passive chips. Every chrome
// control is 6px. This is the cheapest signal in the system and the one that
// tells a reviewer, without a word, which things converse and which count.
//
// TWO checks read the radius here once, and one of them is retired below: the
// census strip carried a rule of its own (`.gly-census button`), so the CSSOM
// had to be read directly to tell 6px from a reverted 999px that edit.html's
// inline `.gly-bar button` fallback would have masked. The strip and its rule
// are deleted; `.gly-bar button` is the only rule left declaring a radius on a
// bar control, so the COMPUTED check reads it unconfounded and is the whole of
// the caste mark.
{
  // `.gly-bar button` for the COMPUTED check, because "every chrome control" is
  // every control the bar renders.
  const chrome = await styleAll('.gly-bar button', 'border-radius');
  check(
    'every chrome control is 6px (computed)',
    chrome.length > 0 && chrome.every((c) => c['border-radius'] === '6px'),
    chrome,
  );

  // THE RULE CHECK IS RETIRED WITH THE RULE. It read `.gly-census button`'s
  // own declared `border-radius` off the CSSOM, independent of what won the
  // paint, because edit.html's inline `.gly-bar button` fallback tied it and
  // could mask a reverted 999px. The census strip and its rule are both
  // deleted, so `ruleValue` returns null forever and the tie it guarded
  // against cannot be struck — no rule in either stylesheet declares a radius
  // on a bar button but `.gly-bar button` itself. The computed check above is
  // the whole of §1's caste mark now, and `card verbs stay pills` below is
  // what keeps it discriminating.

  // READ OFF THE VERB THAT EXISTS. This asked `.gly-card-accept` and
  // `.gly-thread-resolve`, and neither is built any more — an instruction is
  // immutable work for the next round, so a card carries delete and nothing
  // else. The CLAIM is §1's caste mark and is unchanged: a verb ON A CARD is a
  // pill, and 6px is the chrome's mark alone. `.gly-thread-delete` inherits the
  // 999px from `.gly-card button` and overrides only its colour and its border,
  // so this is exactly the tie `.gly-card button` (0,1,1) wins that this file
  // exists to catch — a chrome rule reaching a card verb would show up here as
  // 6px and nowhere else.
  const verbs = await styleAll(
    '.gly-docslot .gly-thread-delete',
    'border-radius',
  );
  check(
    'card verbs stay pills',
    verbs.length > 0 &&
      verbs.every((v) => parseFloat(v['border-radius']) > 100),
    verbs,
  );
}

// --- §7 · the three surfaces the mockup never rendered -----------------------
//
// The handoff's own closing note says dark mode, the narrow/sheet layout and
// figures "inherit their layer assignments and need no new rules". That is a
// PREDICTION, not an observation — it rendered none of the three — and the
// panel's own background was a hardcoded chrome token until this week. So it
// is tested here rather than believed.
//
// Read through getComputedStyle under emulateMedia, deliberately, and NOT
// through ruleValue: the dark tokens live inside
// `@media (prefers-color-scheme: dark)` and ruleValue walks TOP-LEVEL rules
// only, so it would answer null for every one of them — which is
// indistinguishable from "no such declaration". The browser honours the media
// query for free, and the question here is what a reader sees anyway.
//
// `.gly-overall` NEEDS NO OPENING NOW, and that is what makes it present here.
// It used to be disclosed by a toggle §3 pressed; the toggle is deleted (see
// §3), the list of filed whole-document instructions is simply the rail's, and
// the fixture files one at the top of this run. What §3 leaves shut behind it
// is the CAPTURE card, which is a different element and is read there.

/** Channel distance between two computed colours.
 *
 *  Every other colour check in this file compares a painted value against
 *  `rgb('--some-token')`, which is the right question — "is this painted from
 *  the token" — and CANNOT see a token that is itself wrong. Measured: setting
 *  `--gly-card: #ffffff` inside the dark block put white cards on a near-black
 *  page and every token-relative check still read `ok`, because the probe
 *  resolves the same broken token both sides.
 *
 *  Dark mode is exactly where that gap bites, since the dark block is the only
 *  place a token is re-declared at all. So one check below is absolute rather
 *  than relative: the card stock has to be a NEIGHBOURING SHADE of the page it
 *  sits on (#fff on #f4f5f8, #1a1d27 on #14161d — both inside 12 per channel),
 *  not an inversion of it. 40 is loose enough to leave real design room and
 *  tight enough that a light stock on a dark page cannot pass. */
const near = (a, b, tol = 40) => {
  const chan = (s) =>
    (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const [x, y] = [chan(a), chan(b)];
  return (
    x.length === 3 &&
    y.length === 3 &&
    x.every((v, i) => Math.abs(v - y[i]) <= tol)
  );
};

/** Is this computed `box-shadow` the same shadow as this token's declaration?
 *
 *  They are the same value written two ways: a stylesheet declares
 *  `0 20px 50px rgba(20, 22, 28, 0.18)` and `getComputedStyle` answers
 *  `rgba(20, 22, 28, 0.18) 0px 20px 50px 0px` — colour moved to the front, `0`
 *  spelled `0px`, and the spread written out. So neither string can be compared
 *  to the other, and comparing the computed value to a LITERAL is what put the
 *  one check that did so red the moment the palette moved underneath it.
 *
 *  Compared as (colour channels, offsets) instead: the colour is pulled out
 *  wherever it sits and the remaining lengths are read as numbers, with
 *  trailing zeros dropped so an omitted spread and an explicit `0px` are one
 *  shadow. A DIFFERENT shadow — a second one invented for a state, another
 *  token, a changed offset — differs in one of those two and is caught. */
const shadowSame = (computed, declared) => {
  const parts = (s) => {
    const colour = (String(s).match(/rgba?\([^)]*\)/) || [''])[0];
    const nums = (
      String(s)
        .replace(colour, '')
        .match(/-?[\d.]+/g) || []
    ).map(Number);
    while (nums.length > 1 && nums[nums.length - 1] === 0) {
      nums.pop();
    }
    return {
      colour: (colour.match(/[\d.]+/g) || []).join(','),
      nums: nums.join(','),
    };
  };
  const [a, b] = [parts(computed), parts(declared)];
  return !!a.colour && a.colour === b.colour && a.nums === b.nums;
};

for (const scheme of ['dark', 'light']) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.waitForTimeout(300);

  const panel = await style('.gly-overall', 'background-color');
  const body = await style('body', 'background-color');
  // THE SAME CLAIM, THROUGH A TRANSPARENT BOX. This asserted the panel's own
  // background EQUAL to the page's, which is what a floating chrome panel had
  // to do to look like it was on the page rather than on a band. The
  // whole-document card is in the rail now and declares no ground at all
  // (`.gly-overall.gly-overall-rail { background: transparent }`), so the paper
  // the reviewer sees behind it is literally the page's — a stronger version of
  // the same fact, and one that cannot drift the way two colours that must stay
  // equal can. Read as `transparent` in BOTH schemes, because a rule that
  // painted a ground in only one is exactly the dark-mode gap this loop exists
  // for.
  check(
    `the whole-document card shows the page's own paper through it in ${scheme}`,
    panel && panel['background-color'] === TRANSPARENT && !!body,
    { scheme, panel, body },
  );

  // The cards ON the panel, not only the panel under them. A surface that
  // repaints its own background while the deck on it stays light is exactly
  // the shape "it all inherits from §1" fails in — and it is the shape the
  // panel was in a week ago, in the other direction.
  const cards = await styleAll(
    '.gly-overall-entries .gly-card',
    'background-color',
    'border-left-width',
  );
  // RE-POINTED FROM `--gly-card` TO `--gly-panel-bg`, AND THE CLAIM IS THE SAME
  // ONE. A whole-document instruction is not a card any more: it is the doc
  // slot's own PILL (`.gly-row-doc`, cards.ts:527), and the spec paints a pill
  // on the panel token. The property this check exists for is untouched — every
  // entry in the slot is painted from ONE token, and a surface that repaints
  // its own ground while the entries on it stay light is still what goes red —
  // so only the token it names moves. `.gly-overall-entries .gly-card` still
  // finds them: `threadCard` builds the card and `paintOverall` adds
  // `.gly-row-doc` on top, which is why the 3px kind edge below reads on the
  // same list.
  const stock = await rgb('--gly-panel-bg');
  check(
    `every panel card is on the slot's pill stock in ${scheme}`,
    cards.length > 0 && cards.every((c) => c['background-color'] === stock),
    { scheme, got: cards.map((c) => c['background-color']), want: stock },
  );
  check(
    `every panel card keeps its 3px kind edge in ${scheme}`,
    cards.length > 0 &&
      cards.every((c) => parseFloat(c['border-left-width']) === 3),
    { scheme, cards },
  );
  check(
    `the card stock is a shade of the page in ${scheme}, not an inversion of it`,
    cards.length > 0 &&
      body &&
      cards.every((c) => near(c['background-color'], body['background-color'])),
    {
      scheme,
      card: cards[0] && cards[0]['background-color'],
      page: body && body['background-color'],
    },
  );

  // FIGURES — the third prediction, and the one with no assertion anywhere in
  // this file until now. The `read-only` chip is the passive half of the
  // refusal voice and it is CHROME wherever it renders: the same mono voice as
  // the bottom bar, the muted colour, the panel token behind it. Compared
  // against the chrome's own computed font-family rather than against a string,
  // because the claim is "the same voice as the chrome", not "this font list".
  const chip = await style(
    '.gly-figure > .gly-chip',
    'font-family',
    'color',
    'background-color',
  );
  const chrome = await style('.gly-bottombar', 'font-family');
  const muted = await rgb('--gly-muted');
  const panelBg = await rgb('--gly-panel-bg');
  check(
    `the figure's read-only chip speaks the chrome voice in ${scheme}`,
    chip &&
      chrome &&
      chip['font-family'] === chrome['font-family'] &&
      chip.color === muted &&
      chip['background-color'] === panelBg,
    { scheme, chip, chrome, muted, panelBg },
  );

  // And the figure box itself is a §1 container: 6px, on the line colour — the
  // same two values a fence and a table carry.
  //
  // THE GROUND IS THE MARKED WASH, NOT `--gly-fence`, AND THAT IS THE FIXTURE
  // BEING HONEST RATHER THAN PAINT DRIFT. The fixture files a `comment_block`
  // on this figure (the seed, above), so rows.ts hangs `.gly-marked` on the
  // node and `.ProseMirror > .gly-marked` (0,2,1) paints `--gly-coral-fill`
  // over `.ProseMirror .gly-figure`'s (0,1,1) `--gly-fence`. A marked block
  // wearing the coral wash is the whole of Task 1's mark vocabulary; a figure
  // that stayed on the fence token WHILE an instruction was filed on it would
  // be the regression. So the wash is asserted, and asserted TOGETHER with the
  // class that earns it — otherwise this reads "coral" off a figure nobody
  // marked, which is the drift the check would exist to catch.
  const fig = await style(
    '.gly-figure',
    'border-radius',
    'border-top-color',
    'background-color',
  );
  const figMarked = await page.evaluate(() => {
    const el = document.querySelector('.gly-figure');
    return !!el && el.classList.contains('gly-marked');
  });
  check(
    `the figure box is a 6px container on the line colour in ${scheme}`,
    fig &&
      fig['border-radius'] === '6px' &&
      fig['border-top-color'] === (await rgb('--gly-line')) &&
      figMarked &&
      fig['background-color'] === (await rgb('--gly-coral-fill')),
    { scheme, fig, figMarked },
  );
}
await page.emulateMedia({ colorScheme: 'light' });

// --- §7a · every control in the bar can be pressed, at any width -------------
//
// THE PROPERTY IS "NO CONTROL IS UNREACHABLE", NOT "REVISE IS IN THE BOTTOM
// BAR". A check named after the instance passes in the broken state: the bar is
// a flex row and whatever ends up LAST in source order is what goes first, so a
// check that watched only `#gly-revise` would go quiet the moment a control was
// appended after it — with the same defect one item to the left.
//
// AND "REACHABLE" IS NOT "INSIDE THE WINDOW". This block asserted the rect
// first — `x >= 0 && x + width <= innerWidth` — and that predicate PASSED on a
// button nobody could click: the bar folds, and above the breakpoint its second
// row landed underneath `.gly-rail`, which is `position: fixed` at `z-index:
// 20` over a bar at 10. Measured at 1000px before the rail was taught the bar's
// height: `#gly-revise` at `{x: 834.4, y: 49.2, right: 980}` — wholly inside a
// 1000px window — with `elementFromPoint` at its centre returning
// `.gly-rail-band` and a real click timing out. A rect fully inside the
// viewport underneath an opaque fixed panel satisfies "on screen" and fails
// "the reviewer can press it", and those are two different claims.
//
// So the sweep reads `document.elementFromPoint` back at each control's centre
// and requires that control or a descendant of it. There is precedent one file
// over: rounds-ux.mjs reads elementFromPoint back at the coordinate it clicked,
// on the argument that "nothing moved" and "what you clicked is still under
// your finger" are separate facts. This is that distinction, standing still.
//
// The rect check stays. It is cheap, it runs first, and it names something
// real — a control past the right edge with no horizontal scroll is gone
// whatever is or is not painted over where it used to be.
//
// AND IT SWEEPS, because the failure is width-dependent and a single viewport
// is how the previous gap was missed — twice now. Measured on this fixture:
// the bar's content is 1159px wide with the rail on screen and 1066px without
// it, so `#gly-revise` left the window at 1100 and at 1000 — both ABOVE the
// 992px rail breakpoint — and by 900 `.gly-hold` had gone with it, by 768
// `.gly-mode`, by 600 the whole census strip. "Move it to the bottom bar below
// 992" would have left every width between 992 and 1159 exactly as broken.
//
// ONE HEIGHT, AND THAT IS A KNOWN LIMIT. "No control is unreachable" is a
// two-dimensional claim and this sweep varies one dimension. 900px is tall
// enough that nothing in the bar has ever been clipped vertically, and §7c
// below drives 844×390 and 900×260 — the short windows where vertical room is
// the scarce thing — so the gap is covered by a different block rather than
// left open. A control lost to a SHORT window would be missed here.
//
// 1400 and 1450 are in the list because the OVERLAP band is not the overflow
// band. At those widths the bar never spilled — the folded row was created by
// a longer document name, and the rail then covered it. The first ten widths
// this block swept all missed it, and 1400–1450 was the one place where the
// fold made things WORSE than the overflow it replaced: a clipped button still
// had a clickable centre, and a covered one has nothing.
{
  const WIDTHS = [
    1600, 1450, 1400, 1200, 1100, 1000, 992, 991, 900, 768, 600, 390,
  ];
  // Every child of the bar and every button anywhere in it — the same landmark
  // set rounds-ux.mjs snapshots, for the same reason: the claim is about the bar,
  // not about one button in it.
  const barProbe = () =>
    page.evaluate(() => {
      // `.gly-census > *` was the third clause and is deleted with the strip.
      const sel = '.gly-bar > *, .gly-bar button';
      const seen = new Set();
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        // ZERO-AREA ITEMS ARE SKIPPED, AND THE EXEMPTION IS STRUCTURAL RATHER
        // THAN INCIDENTAL. What it actually covers is SMALLER than an earlier
        // version of this comment claimed, and the difference matters: the
        // spacer draws nothing by definition, so it measures 0px here — and it
        // is now the ONLY silence. `#gly-status` used to be the second one:
        // it was empty until Revise was pressed, because the reassurance lived
        // in a separate `#gly-editor-status` beside it. The three readouts are
        // one now, and that one prints from the first paint
        // (`connected · your edits apply — the agent proposes`), so it is swept
        // at every width like any other item. `flex: 100 1 0` with
        // `max-width: max-content` takes the readout out of the bar's
        // LINE-BREAKING arithmetic; it does not make it zero-area. A later
        // reader must not mistake a silence here for a pass — there is exactly
        // one genuinely empty box left.
        if (r.width <= 0 || r.height <= 0) continue;
        // AND A RESERVED BOX IS NOT A BUTTON — the product's own words. `.gly-
        // hold` keeps its box on ask so that flipping the switch moves nothing,
        // and `.gly-reserved` is `visibility: hidden`, which takes it out of
        // hit testing and the tab order on purpose (it is `disabled` too). It
        // is unreachable BY DESIGN, so counting it as covered would make this
        // check fail at every width for the one reason that is not a bug. The
        // test is computed visibility rather than the class name, because the
        // claim is about what the browser will do with a click, not about
        // which spelling of "reserved" a control happens to use.
        if (getComputedStyle(el).visibility !== 'visible') continue;
        const what = el.id
          ? `#${el.id}`
          : `.${el.classList[0] || el.tagName.toLowerCase()}`;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const at = document.elementFromPoint(cx, cy);
        out.push({
          what,
          x: +r.x.toFixed(1),
          y: +r.y.toFixed(1),
          right: +(r.x + r.width).toFixed(1),
          // `el.contains(at)` rather than `at === el`: a control's centre lands
          // on the label span inside it, which is the button as far as a click
          // is concerned. Anything else — a rail band, a panel, another
          // control — is something in the way.
          hitBy: at ? at.id || at.className || at.tagName : 'nothing',
          reachable: !!(at && el.contains(at)),
        });
      }
      const bar = document.querySelector('.gly-bar');
      return {
        w: window.innerWidth,
        items: out,
        // The companion statement of the same fact, read off the bar itself:
        // content wider than the box is what "spills out of the window" IS,
        // and it holds even for a bar whose overflow was hidden rather than
        // fixed — an escapee clipped is still an escapee.
        spill: +(bar.scrollWidth - bar.clientWidth).toFixed(1),
        // THE BAR'S OWN HEIGHT, so this sweep can say which shape it walked.
        // See the fold assertions after the loop.
        barH: +bar.getBoundingClientRect().height.toFixed(1),
      };
    });

  const heights = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    const { w, items, spill, barH } = await barProbe();
    heights.push({ width, barH });
    const escaped = items.filter((i) => i.x < 0 || i.right > w + 0.5);
    check(
      `every control in the bar is inside the window at ${width}px`,
      escaped.length === 0,
      { innerWidth: w, escaped },
    );
    const covered = items.filter((i) => !i.reachable);
    check(
      `every control in the bar can be pressed at ${width}px — nothing is over it`,
      covered.length === 0,
      { innerWidth: w, covered },
    );
    check(`the bar's content fits its own box at ${width}px`, spill <= 0.5, {
      innerWidth: w,
      spill,
    });
  }

  // THE FOLD WAS THE PREMISE, AND THE BAR DOES NOT FOLD ANY MORE.
  //
  // Two checks stood here and their subject is gone rather than merely
  // unreached. They asserted that this sweep walked a FOLDED bar at the widths
  // below ~1240 and a flat one at 1600 — a real fixture guard while the bar
  // carried three readout cells and the census strip, because every OTHER check
  // in this loop passes identically on a flat bar and the file's fixture name
  // was the only thing holding the shape. The census strip is deleted (§1c) and
  // the readouts are one yielding cell (§1d), so the row cannot spill: measured
  // 58px at all twelve swept widths, 1600 down to 390. "The sweep walks a
  // folded bar" is now unmeetable by construction and `flatWidths.includes(1600)`
  // is satisfied by every possible build — a check that cannot fail, which is
  // the shape this file deletes rather than keeps.
  //
  // WHAT REPLACES THEM IS THE INVARIANT THAT IS NOW TRUE AND CAN STILL GO RED:
  // ONE row, the SAME row, everywhere — and nothing clipped out of it. That is
  // strictly stronger than the pair it replaces over the shape the product
  // actually has: a bar that grew a second row at any swept width, or that
  // changed height between two of them, fails here, and so does one that kept
  // its 58px by pushing a control out of its own box (the per-width `spill`
  // check above, which this reads alongside rather than restates).
  note("the bar's height at every swept width", heights);
  const ONE_ROW_MAX = 60;
  const tall = heights.filter((h) => h.barH > ONE_ROW_MAX);
  const distinct = [...new Set(heights.map((h) => h.barH))];
  check(
    'the bar is ONE row at every swept width — 1600px down to 390px, it does not fold',
    heights.length > 1 && tall.length === 0,
    { tall, heights },
  );
  check(
    'and it is the SAME one row at all of them — the height never changes with width',
    distinct.length === 1,
    { distinct, heights },
  );
}

// --- §7b · the narrow layout ------------------------------------------------
//
// 900px is below the 991px breakpoint, which is where the rail is replaced by a
// bottom bar and a sheet. Both are surfaces the mockup never drew.

await page.setViewportSize({ width: 900, height: 1000 });
await page.waitForTimeout(800);
{
  // FIRST, that we are actually in the narrow layout. Every assertion below is
  // about the sheet, and a sheet measured on the wide layout is a measurement
  // of nothing. The `.gly-rail` half of this is RETIRED WITH THE RAIL: it read
  // `display: none` on the margin column, which is not in the DOM on any page —
  // and an absent selector is not a pass, so the claim is made of the element
  // that IS the narrow layout's own.
  const bottombar = await page.locator('.gly-bottombar').isVisible();
  const railGone = await page.evaluate(
    () => document.querySelector('.gly-rail') === null,
  );
  check(
    'the narrow layout is the one on screen — bottom bar up, and no rail anywhere',
    bottombar && railGone,
    { bottombar, railGone },
  );

  // THE COUNT IS PRINTED ONCE, AND THERE IS ONLY ONE PRINTER LEFT. The same
  // string used to render in the census strip at the head of the window and
  // again in `.gly-bar-count` at its foot, ~850px apart on a phone; the strip
  // is deleted and the foot's copy is the one that earned it — it is also the
  // BUTTON that opens the sheet, and the sheet is the only list there is here.
  // The check is kept in its stronger form ("exactly one is painted") rather
  // than reduced to "the bar has one", because a SECOND printer coming back
  // anywhere in the window is the defect it names, and the query below is over
  // the whole document.
  const counts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.gly-bar-count'))
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({
        what: el.className,
        text: (el.textContent || '').trim(),
      })),
  );
  check(
    'the pending count is printed once below the breakpoint, not twice',
    counts.length === 1 && /Instructions · \d+/.test(counts[0].text),
    counts,
  );

  // Chrome is chrome at every width: the bottom bar's controls carry the 6px
  // caste mark, exactly as the census strip's do at the top of a wide window.
  const barButtons = await styleAll('.gly-bottombar button', 'border-radius');
  check(
    'every narrow-bar control is 6px chrome',
    barButtons.length > 0 &&
      barButtons.every((b) => b['border-radius'] === '6px'),
    barButtons,
  );

  // §4's armed-delete test (above) arms the retry-budget thread's delete —
  // and armedDelete lives on the app, keyed by thread.key, precisely so a
  // rebuilt card renders itself already armed (see deleteButton's comment).
  // The sheet renders that SAME thread again, so without this it would read
  // armed or not depending on how much wall-clock time this file happened to
  // spend between there and here — a check whose answer depends on how many
  // `check()` calls ran before it is not a check on the product.
  await page.evaluate(() => {
    window.galleyEdit.app.armedDelete = null;
  });

  // OPEN IT. The sheet holds cards only once opened, and a check written to
  // tolerate zero matches is a check that passes loudest when the layout
  // renders nothing at all.
  //
  // THROUGH THE APP, BECAUSE THE BUTTON THAT USED TO DO IT IS GONE. `▤`
  // (`.gly-bar-list`) was the narrow bar's third control and the sheet's own
  // door; the bar carries the Instructions count, the History chip and one
  // stepper now, and `.gly-bar-count` posts `openInstructions()`, which sets
  // `sheetOpen = false` — the opposite of what this line needs. The only
  // remaining opener in the product is `flashThreadCard`, reached by tapping a
  // figure's pin, and driving a pin here would make every check below depend on
  // the figure being on screen at this scroll position.
  //
  // SO THIS IS A GATE DRIVING A STATE THE PRODUCT CAN REACH BUT NO LONGER
  // OFFERS A BUTTON FOR, and that is worth saying rather than hiding behind a
  // helper: everything below reads the sheet's PAINT, which is a real surface
  // with real cards in it either way, but "the reviewer can get here at this
  // width" is a claim this file can no longer make and does not pretend to.
  await page.evaluate(() => window.galleyEdit.app.openSheet());
  await page.waitForTimeout(600);
  check(
    'the sheet really opened, so the paint below is read off a surface that exists',
    await page.locator('.gly-sheet').isVisible(),
  );

  // AND THE STANDING SENTENCE IS PRINTED ONCE TOO — the count's own defect, one
  // cell over, and it arrived with the bar's consolidation. `.gly-census-untracked`
  // used to be a bar cell with a `display: none` below 1340px, and the sheet's
  // head was written to be where the sentence went instead ("the census strip
  // drops this sentence below the breakpoint — the sheet's head carries it
  // instead"). Composing it into the one readout dropped the hide with the cell,
  // so at every width under 992 the sentence renders in the bar AND in the head
  // of the sheet covering it — two things doing one job, at the one width Court
  // would see it.
  //
  // Below the breakpoint the SHEET'S copy is the one that earns it, for the
  // count's reason: it is on a line of its own and prints whole, where the bar's
  // readout is a single ellipsizing cell whose last clause it is — an illegible
  // sliver of the sentence is what the 1340 hide existed to prevent.
  //
  // Stated as "exactly one is painted", like the count, so reversing the design
  // decision means re-running this rather than rewriting it. Matched on the
  // app's own constant, not a copy of the string.
  const sentences = await page.evaluate(
    (sentence) =>
      Array.from(document.querySelectorAll('#gly-status, .gly-sheet-untracked'))
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => (el.textContent || '').includes(sentence))
        .map((el) => ({
          what: el.id || el.className,
          text: (el.textContent || '').trim(),
        })),
    UNTRACKED_NOTE,
  );
  check(
    'the standing sentence is printed once below the breakpoint, not twice',
    sentences.length === 1,
    sentences,
  );

  // `.gly-sheet-body > .gly-card`, not `.gly-sheet .gly-card`: the sheet has a
  // settled region at its foot now (§7b′ below) and its cards are `.gly-card`
  // too, nested inside it. Every check in THIS block is about the sheet's open
  // list — what the bar counts — so it reads the open list's own children.
  const cards = await styleAll(
    '.gly-sheet-body > .gly-card',
    'border-left-width',
    'border-top-width',
    'background-color',
    'border-radius',
    'width',
  );
  const stock = await rgb('--gly-card');
  check('the sheet actually holds cards once opened', cards.length > 0, {
    cards: cards.length,
  });
  check(
    'sheet cards carry the same kind edge as rail cards',
    cards.length > 0 &&
      cards.every((c) => parseFloat(c['border-left-width']) === 3),
    cards,
  );
  check(
    'sheet cards are full cards from the same deck, not a bare narrow variant',
    cards.length > 0 &&
      cards.every(
        (c) =>
          parseFloat(c['border-top-width']) > 0 &&
          c['background-color'] === stock &&
          c['border-radius'] === '6px',
      ),
    { cards, want: stock },
  );

  // Family, not a count. §4b established the stronger form — compare each
  // head's computed `font-family` against the chrome's own (the census strip's
  // until it was deleted; `.gly-bottombar` carries the same voice), so the claim is
  // "the same voice as the chrome" — and this surface was given the weaker one
  // AFTERWARDS. Counting elements never reads a font: a head rendered in the
  // document's serif satisfies it exactly as well as a mono one does.
  const heads = await styleAll(
    '.gly-sheet-body > .gly-card .gly-card-head',
    'font-family',
  );
  const chrome = await style('.gly-bottombar', 'font-family');
  check(
    'every sheet card carries its mono head',
    heads.length === cards.length &&
      cards.length > 0 &&
      chrome &&
      heads.every((h) => h['font-family'] === chrome['font-family']),
    { heads, cards: cards.length, chrome },
  );

  // THE COUNT NEVER LIES. Below the breakpoint the sheet is the only list
  // there is, so what it holds has to equal what the bar itself claims — read
  // from the bar's OWN TEXT, not the fixture, because the claim under test is
  // "the product's count matches what the product shows", not "the fixture has
  // N threads". paintSheet used to skip every kind === 'comment' suggestion,
  // which made this bar text a promise the sheet could not keep.
  //
  // THERE IS ONE NUMBER NOW, AND THE SUM IS GONE WITH THE SECOND ONE.
  //
  // The bar used to print `5 pending · 3 threads` and carry the whole-document
  // conversation on a THIRD readout, the `1 doc note` handle beside the strip —
  // and the repair this block records is that the doc note must appear in
  // exactly one of them. It read `barPending + barThreads` while the tally
  // counted the doc note too and the handle counted it AGAIN, so the bar
  // advertised four conversations over three and the arithmetic was satisfied
  // by the double count as happily as by the truth.
  //
  // The bar says `Instructions · N` and nothing else. There is no second number
  // to disagree with, no handle to count anything twice, and the whole-document
  // instruction is one of the N like any other. So the disjointness checks are
  // deleted — a claim that two numbers do not overlap needs two numbers — and
  // what survives is the half that was always the point: THE COUNT NEVER LIES.
  // The sheet is the only list there is below the breakpoint, so what it holds
  // has to equal what the bar itself claims, read from the bar's OWN TEXT
  // rather than from the fixture, because the claim under test is "the
  // product's count matches what the product shows".
  const barText = (await page.locator('.gly-bar-count').textContent()) || '';
  const barCount = Number(barText.match(/Instructions · (\d+)/)?.[1] ?? NaN);
  check(
    'the bar prints a number at all, so the sum below is a sum of something',
    Number.isFinite(barCount) && barCount > 0,
    { barText, barCount },
  );
  check(
    'the sheet holds exactly what the bar counts — no more, no less',
    cards.length === barCount,
    { barText, barCount, cards: cards.length },
  );
  // AND THE WHOLE-DOCUMENT CONVERSATION IS ONE OF THEM, which is what keeps the
  // equality from being satisfied by a fixture with nothing awkward in it. It
  // has no mark, so it is exactly the instruction a list built from the marks
  // would drop — `paintSheet` used to skip a whole kind of pending item, which
  // made this bar text a promise the sheet could not keep.
  const docOpen = await page.evaluate(
    () =>
      (window.galleyEdit.app.comments || []).filter(
        (t) => t.anchor === 'document',
      ).length,
  );
  check(
    'the fixture has a whole-document instruction, so the sheet is not a list of marks',
    docOpen > 0,
    { docOpen },
  );
  check(
    'and the sheet is carrying it — the count includes what has no mark',
    cards.length >= docOpen + 1,
    { docOpen, cards: cards.length },
  );

  // A card designed for a 300px rail should not be stretched to the width of
  // the whole window. "the document's measure" is read off the document
  // itself (.ProseMirror), not off a token, so this asserts what a card
  // actually sits beside rather than what a stylesheet claims it should.
  const measure = await style('.ProseMirror', 'width');
  check(
    "a sheet card is no wider than the document's own measure",
    cards.length > 0 &&
      measure &&
      cards.every((c) => parseFloat(c.width) <= parseFloat(measure.width) + 1),
    { cards: cards.map((c) => c.width), measure: measure && measure.width },
  );

  // AND IT SITS WHERE THE PROSE SITS — the check for the padding fix, which
  // shipped with none that could fail. `.gly-sheet`'s `12px 12px 52px` became
  // `12px 0 52px` because below ~704px `.gly-sheet-body`'s max-width stopped
  // binding and the sheet's own 12px squeeze showed up as cards sitting
  // narrower and INBOARD of the prose. The `<=` above passed in exactly that
  // state — narrower IS no wider — and nothing read `left` at all. So: EQUAL,
  // in left and in width, and at more than one width, because the defect was
  // width-dependent and the state it was broken in is the one below the point
  // where the max-width binds.
  const ALIGN = [900, 704, 640, 500, 390];
  for (const w of ALIGN) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(350);
    const box = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      const card = document.querySelector('.gly-sheet-body > .gly-card');
      if (!pm || !card) return null;
      const p = pm.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      return {
        pm: { l: +p.left.toFixed(1), w: +p.width.toFixed(1) },
        card: { l: +c.left.toFixed(1), w: +c.width.toFixed(1) },
      };
    });
    check(
      `a sheet card's left edge and width are the prose's own at ${w}px`,
      !!box &&
        Math.abs(box.card.l - box.pm.l) <= 0.5 &&
        Math.abs(box.card.w - box.pm.w) <= 0.5,
      box,
    );
  }
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.waitForTimeout(400);

  // §6 asks for the destroy weight in rail, panel, sheet and settled list
  // alike — this is the sheet's turn. Comments now render as threadCard, so
  // `.gly-thread-delete` exists here to have an opinion about.
  //
  // ALL THREE PROPERTIES, as everywhere else: §6's destroy weight is
  // borderless AND muted AND 2rem clear, and a check reading one of the three
  // reports `ok` on a surface that has lost the other two.
  const dels = await styleAll(
    '.gly-sheet-body > .gly-card .gly-thread-delete',
    'border-top-color',
    'color',
    'margin-left',
  );
  const sheetMuted = await rgb('--gly-muted');
  check(
    'the destroy weight renders in the sheet too',
    dels.length > 0 &&
      dels.every(
        (d) =>
          d['border-top-color'] === TRANSPARENT &&
          d.color === sheetMuted &&
          parseFloat(d['margin-left']) >= 32,
      ),
    { dels, muted: sheetMuted },
  );

  // A card whose thread carries a run IS tied to a mark — threadCard sets
  // dataset.run from thread.run itself, independent of whatever placement it
  // was handed, so this reads what is TRUE rather than what the sheet claims.
  // A hardcoded anchorless placement draws such a card exactly like the settled
  // list draws a genuinely-gone one: dashed, and captioned "not tied to a
  // mark". Neither is true of a thread the rail would draw anchored.
  const anchoredInSheet = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.gly-sheet-body > .gly-thread'))
      .filter((el) => el.dataset.run)
      .map((el) => ({
        run: el.dataset.run,
        adrift: el.classList.contains('gly-adrift'),
        unplaced: !!el.closest('.gly-rail-unplaced'),
        note: el.querySelector('.gly-card-head')?.textContent || '',
      })),
  );
  // READ STRUCTURALLY. The second clause used to match the card's own
  // explanatory sentence — `/not tied to a mark/` — and copy is the wrong thing
  // to pin: it goes red on a rewording and, worse, goes GREEN and stops finding
  // anything the day the sentence is dropped. `.gly-adrift` is the class
  // `threadCard` writes from `threadLabel`'s own verdict and is what the dashed
  // border is drawn from; the card being in the BAND rather than the unplaced
  // region is the same fact from the other side, and together they say what the
  // sentence said without depending on a word of it.
  check(
    'no sheet thread card with a run is drawn adrift or filed as unplaced',
    anchoredInSheet.length > 0 &&
      anchoredInSheet.every((t) => !t.adrift && !t.unplaced),
    anchoredInSheet,
  );

  // The same cause, the other symptom: threadCard sets the title and the
  // reveal click handler ONLY when it was handed an anchored placement — a
  // hardcoded anchorless placement never reaches that code. A conversation in the sheet has
  // to be jumpable exactly like a suggestion card beside it; a sheet you
  // cannot jump from is the "list you have to dismiss by hand" paintSheet's
  // own comment says this surface must never be.
  const titles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.gly-sheet-body > .gly-thread'))
      .filter((el) => el.dataset.run)
      .map((el) => el.title),
  );
  check(
    'every anchored sheet thread card can be jumped from, same as its rail counterpart',
    titles.length > 0 && titles.every((t) => t === 'show me where this is'),
    titles,
  );
}

// --- §7b‴ · the narrow bar is still a bar with the sheet open ----------------
//
// A RECT INSIDE THE WINDOW IS NOT A CONTROL THE REVIEWER CAN PRESS, and this is
// that rule in the one state no gate walked: narrow, with the sheet open.
// Measured at 430×900 on the shipped build — `.gly-bottombar` painted, not
// `hidden`, `getBoundingClientRect` at `{y: 860, height: 40}`, `isVisible()`
// true — and `document.elementFromPoint` at each of its four controls' centres
// answering `gly-thread-who` and `gly-thread-entry`: the sheet (z-index 45)
// over the bar (25). All four unreachable, including the two the narrow layout
// has no other spelling of.
//
// THE BAR IS CLAIMED IN THIS STATE BY THREE SEPARATE PIECES OF THE PRODUCT,
// which is what decides the fix rather than taste. `railSurfaces` answers
// `bar: true` below the breakpoint WHETHER OR NOT the sheet is open — the one
// accessor that decides what a width means, and it says the bar renders here,
// where at 992 and above it says `bar: false`. `.gly-sheet` reserves
// `padding-bottom: 52px`, which is the bar's 40px and the sheet's own 12px:
// the sheet's layout was written for a bar painted over it. And `step()` — the
// ↑/↓ this bar is the only home of — carries a branch for exactly this state
// ("the sheet's cards too: with the sheet open it is the surface showing the
// list"). Hiding the bar would contradict all three and take the count, the
// step and the list away at once; making the sheet stop short of it would need
// the bar's height as a second constant in a layout where it is `bar: false`
// above the breakpoint. The bar goes ABOVE the sheet, which is what the 52px
// already assumes, and the sheet's list scrolls under it exactly as the prose
// scrolls under the sticky bar at the top of the page.
//
// THE SIBLING STATE IS ASKED TOO. At and above the breakpoint the sheet is the
// review's whole list and the bottom bar is not painted at all, so the same
// invariant is stated as an implication — a bar that is HIDDEN makes no claim
// — and the wide-with-sheet-open case is recorded as a note beneath it.
{
  const readBar = () =>
    page.evaluate(() => {
      const bar = document.querySelector('.gly-bottombar');
      if (!bar) return null;
      return {
        hidden: bar.hidden || getComputedStyle(bar).display === 'none',
        z: getComputedStyle(bar).zIndex,
        controls: Array.from(bar.querySelectorAll('button')).map((b) => {
          const r = b.getBoundingClientRect();
          const at = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          );
          return {
            what: b.className,
            inside:
              r.width > 0 &&
              r.height > 0 &&
              r.left >= 0 &&
              r.right <= window.innerWidth + 0.5 &&
              r.bottom <= window.innerHeight + 0.5,
            reachable: !!(at && b.contains(at)),
            hitBy: at ? at.id || at.className || at.tagName : 'nothing',
          };
        }),
      };
    });
  const setSheet = async (open) => {
    await page.evaluate((want) => {
      const app = window.galleyEdit.app;
      if (want) app.openSheet();
      else app.closeSheet();
    }, open);
    await page.waitForTimeout(400);
  };

  for (const width of [900, 640, 430, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    for (const open of [false, true]) {
      await setSheet(open);
      const bar = await readBar();
      const state = `${width}px, sheet ${open ? 'open' : 'shut'}`;
      // NON-VACUITY, and it is the whole reason this is not one loop: below the
      // breakpoint the bar has to BE there with controls on it, or "every
      // control is reachable" is a claim about an empty list.
      if (width < 992) {
        check(
          `the narrow bar is painted at ${state} — it is the layout's whole chrome`,
          !!bar && !bar.hidden && bar.controls.length > 0,
          bar,
        );
      } else {
        check(
          `and above the breakpoint it is not painted at all at ${state} — railSurfaces says bar: false`,
          !!bar && bar.hidden,
          bar,
        );
      }
      check(
        `every control the narrow bar paints can be pressed at ${state}`,
        !!bar &&
          (bar.hidden || bar.controls.every((c) => c.inside && c.reachable)),
        bar && bar.controls.filter((c) => !c.inside || !c.reachable),
      );
    }
  }

  // THE WIDE SIBLING, RECORDED RATHER THAN ASSERTED. With the sheet open at
  // 1200px the top bar is under it too — same z-index arithmetic, different
  // meaning: nothing claims the bar renders in that state (no bottom bar is
  // painted, `paintSurfaces` gives the sheet the page), the sheet is opaque and
  // full-bleed so no control is on screen LOOKING pressable, and Esc and the
  // sheet's own ✕ are the way out. It is a takeover rather than a covered
  // control. The number is printed so the next reader has it rather than
  // re-measuring, and a permanently-red check for a deliberate design is what
  // trains people to ignore this gate.
  await page.setViewportSize({ width: 1200, height: 900 });
  await setSheet(true);
  note(
    'with the sheet open above the breakpoint the top bar is covered by it — a takeover, not a covered control (Esc and ✕ are the exits)',
    await page.evaluate(() => {
      const el = document.getElementById('gly-revise');
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return {
        revise: at ? at.id || at.className : 'nothing',
        sheetOpen: !!window.galleyEdit.app.sheetOpen,
      };
    }),
  );

  // Put §7b″'s state back: 900px, sheet open, which is where §7b left it.
  await page.setViewportSize({ width: 900, height: 1000 });
  await setSheet(true);
  await page.waitForTimeout(400);
}

// --- §7b″ · the draft carry — DELETED WITH THE REPLY BOX ---------------------
// --- §7b′ · a settled thread reachable here too — DELETED WITH THE RESOLVE ---
//
// §7b″ was the draft-carry block. `paintRail` destroys and rebuilds every card
// on every poll, and `carryDrafts`/`captureDrafts`/`restoreDrafts` existed so a
// half-written reply survived that; `draftRoots()` is the list of surfaces they
// walk, and it is a LIST, so it went stale the moment `threadCard`'s
// `data-draft` reply box was rendered on a FOURTH surface — the rail's band,
// the whole-document panel, the settled list, then the SHEET. Measured before
// the fix at 900x1000: thirty-five characters became `''` with focus on `BODY`,
// while the identical gesture in the rail survived in the same run.
//
// There is no `data-draft` in the page. `threadCard` builds no reply box —
// an instruction is not a conversation to answer — and the one line that still
// writes `dataset.draft` (`reply:${s.run}`) is on the proposal reply, which has
// no proposals to hang off. So `captureDrafts` walks three roots and finds
// nothing, on every poll, in every state: the mechanism is unreachable rather
// than broken, and a check over it would be measuring an empty `Map`. The
// fixture guard this block opens with ("the sheet has a thread reply box to
// half-write into") is the line that went red, which is the guard working.
//
// §7b′ was the settled thread at narrow. `↺ reopen` is the only way back from a
// mis-tapped `✓ resolve` and CLAUDE.md says it is what makes "settles it and
// KEEPS the history" true — so the block opened the sheet's settled region on a
// phone and read the reopen verb, the dim and the head off a card in it. There
// is no resolve verb on a card and `galley resolve` is gone, so nothing settles,
// so the region is `hidden` on every run and its list is empty. Same deletion,
// same reason, as §4b above — and said twice on purpose, because the two blocks
// were each other's cross-reference and a reader arriving at either one should
// not have to find the other to learn why the surface is unasserted.

// --- §7c · below the breakpoint, the mark opens its conversation -------------
//
// The sheet is a LIST — it answers "what is outstanding". It does not answer
// "what is this highlight about", and below 992px nothing else did: the rail
// that carries conversations at wide is gone, and a tap on a highlight opened a
// three-line bubble offering accept and reject on a thing that is resolved,
// never accepted.
//
// So a comment highlight now opens its whole thread, on the same card the rail,
// the panel, the settled list and the sheet draw. Four claims, and the third is
// the one that would be quietly wrong: a conversation COVERS the prose, it does
// not push it.

/** Every top-level block of the document, by rect. The unit the displacement
 *  check compares — see below for why it is the whole list rather than one. */
const blockRects = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.ProseMirror > *')).map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    }),
  );

{
  // §3 opened the whole-document card, and the reason this check exists is
  // unchanged: a surface still over the prose would make every measurement
  // below a measurement of the wrong thing. WHAT PUTS IT AWAY IS DIFFERENT.
  // It was chrome, fixed over the top of the document, and Esc was the
  // product's own way to dismiss it; it is the first item of the instruction
  // RAIL now, and the rail is `display: none` below the breakpoint — this
  // block runs at narrow, so the whole map including that card is off screen
  // by the layout rather than by a keypress.
  //
  // Read off the RAIL, not off the card. `getComputedStyle` answers about the
  // element's own `display`, so a card inside a hidden rail still reports
  // `block` — which is what the first re-point of this line reported, green
  // reasoning over a red read. Esc is still pressed, because it is what closes
  // the bubble a previous block may have left open.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  //
  // AND THE CARD IS NO LONGER IN THE RAIL, SO THE SECOND HALF IS RE-POINTED.
  // Task 14 moved the whole-document instructions into the frame's own DOC
  // SLOT, which is in the sheet's flow at every width — so `cardWidth === 0` is
  // a claim about a layout this branch deleted, and it read 640 on a card that
  // is behaving exactly as designed. What this check is FOR is unchanged and is
  // what is asserted instead: nothing is OVER the prose before the tap, so
  // every rect below is a rect of the thing it names. A card in flow above the
  // prose cannot be over it; a card that grew a `position: fixed`/`absolute` or
  // a stacking context could be, and that is the regression this now catches.
  const panelGone = await page.evaluate(() => {
    const card = document.querySelector('.gly-overall');
    const cs = card ? getComputedStyle(card) : null;
    return {
      // The rail is deleted, so this is `true` and not a `display` reading —
      // see the narrow-layout check above for why an absent selector cannot be
      // asked about a computed style.
      railGone: document.querySelector('.gly-rail') === null,
      cardWidth: card ? +card.getBoundingClientRect().width.toFixed(2) : null,
      cardPosition: cs ? cs.position : null,
      cardZ: cs ? cs.zIndex : null,
    };
  });
  check(
    'the whole-document card is in the sheet’s flow before the prose is tapped, never over it',
    panelGone.railGone &&
      panelGone.cardPosition === 'static' &&
      panelGone.cardZ === 'auto',
    panelGone,
  );

  const mark = page.locator('.gly-hl').first();
  check(
    'the fixture has a comment highlight in the prose to tap',
    (await mark.count()) > 0,
  );

  // Scrolled into view and settled BEFORE the rects are read, because
  // Playwright's own click would scroll to reach the mark and every rect in the
  // page would move for a reason that has nothing to do with the bubble.
  //
  // AND IT IS PLACED, NOT MERELY BROUGHT INTO VIEW. `scrollIntoViewIfNeeded`
  // stops the moment the mark is anywhere in the window, so where it lands
  // depends on how far the page happened to be scrolled when this block
  // started — and `the conversation hangs BELOW its mark` is a claim that only
  // MEANS anything when there is room below to hang in. Measured: the mark
  // landed at y 593 in a 1000px window whose readable band ends at 960, with a
  // 342px card, so `topFor` correctly flipped to the above placement and the
  // check read the fallback as the rule. That is the same fixture hazard the
  // 844×390 and 900×260 blocks below were taught, in the block above them. So
  // the mark is put just under the bar, which is where a reviewer reading down
  // the page meets one, and the room below it is the rest of the band.
  await mark.evaluate((el) => {
    const frame = window.galleyEdit.app.chromeFrame();
    window.scrollBy(0, el.getBoundingClientRect().top - (frame.top + 24));
  });
  await page.waitForTimeout(400);
  const before = await blockRects();
  await mark.click();
  await page.waitForTimeout(400);
  const after = await blockRects();

  // THE ASSERTION THIS WHOLE SECTION IS FOR. A conversation that opens in flow
  // pushes every block below it down the page, and the sentence the reviewer
  // was reading walks out from under their eyes — the same defect CLAUDE.md
  // records for the chrome, arriving through a new door. Verified failing
  // against a deliberately-pushing implementation (a bubble appended after the
  // clicked span's block instead of positioned): 4 of the 6 blocks moved by
  // 132px and this read FAIL while every other check in this block still
  // passed.
  //
  // EVERY block, not the one that was clicked: a pushing implementation leaves
  // the blocks ABOVE it exactly where they were, so reading one rect is how
  // that regression hides.
  const moved = before
    .map((b, i) => ({ i, before: b, after: after[i] }))
    .filter(
      ({ before: b, after: a }) =>
        !a ||
        Math.abs(a.top - b.top) > 0.5 ||
        Math.abs(a.left - b.left) > 0.5 ||
        Math.abs(a.height - b.height) > 0.5,
    );
  check(
    'opening a conversation moves no block of the document — it covers, it does not displace',
    before.length > 0 && after.length === before.length && moved.length === 0,
    moved,
  );

  // It is the ONE card, with everything a conversation has. A bubble that
  // rendered a bare list of replies would pass a "there is text here" check and
  // fail the reviewer at the moment they wanted to answer.
  const bubble = await page.evaluate(() => {
    const el = document.querySelector('.gly-bubble');
    if (!el || el.hidden) return null;
    const card = el.querySelector('.gly-card.gly-thread');
    if (!card) return { card: false };
    return {
      card: true,
      entries: card.querySelectorAll('.gly-thread-entry').length,
      reply: !!card.querySelector('textarea.gly-thread-reply'),
      resolve: !!card.querySelector('.gly-thread-resolve'),
      destroy: !!card.querySelector('.gly-thread-delete'),
      accept: !!el.querySelector('.gly-bubble-accept, .gly-bubble-reject'),
      adrift: card.classList.contains('gly-adrift'),
      note: card.querySelector('.gly-card-note')?.textContent || '',
      run: card.dataset.run,
    };
  });
  check(
    'tapping a comment highlight opens that thread on the one card',
    bubble && bubble.card,
    bubble,
  );
  // THE SAME CARD THE RAIL SHOWS, WHICH IS THE CLAIM — and it carries what a
  // card carries NOW. This asked for a reply box and both thread verbs, and the
  // component builds neither: an instruction is immutable work for the next
  // round, so there is no reply to type and nothing to resolve, and the one verb
  // is delete. The names are re-pointed, the claim is not: whatever the rail
  // renders on a card, the bubble renders too, or the reviewer who taps a
  // highlight on a phone gets a lesser card than the reviewer who reads the rail
  // on a desk.
  check(
    'the card in the bubble carries its entries and the one thread verb the rail gives it',
    bubble &&
      bubble.entries > 0 &&
      bubble.destroy &&
      !bubble.reply &&
      !bubble.resolve,
    bubble,
  );
  // A thread is resolved, never accepted. The verbs that used to be here are
  // the whole reason this task exists.
  check(
    'and offers no accept or reject — a conversation is not an edit to approve',
    bubble && bubble.accept === false,
    bubble,
  );
  // Task 1's hazard, arriving at the fifth surface: a hardcoded `{ where:
  // 'anchorless' }` draws a
  // live on-a-mark conversation dashed and captions it "not tied to a mark" —
  // while the reviewer is looking straight at the mark they just tapped.
  // Structural, for the reason the sheet's version above is: `.gly-adrift` is
  // the one class the "cannot point" verdict is written to, and the card's
  // sentence about it is copy.
  check(
    'a thread reached BY its mark is never drawn adrift',
    bubble && !!bubble.run && !bubble.adrift,
    bubble,
  );

  // §6's destroy weight, on the fifth surface. `.gly-bubble button` (0,1,1)
  // beats a bare `.gly-thread-delete` (0,1,0) exactly as `.gly-card button`
  // does — the specificity trap this whole file exists for, in a new place.
  const dels = await styleAll(
    '.gly-bubble .gly-thread-delete',
    'border-top-color',
    'color',
    'margin-left',
  );
  const muted = await rgb('--gly-muted');
  check(
    'the destroy weight renders in the bubble too',
    dels.length > 0 &&
      dels.every(
        (d) =>
          d['border-top-color'] === TRANSPARENT &&
          d.color === muted &&
          parseFloat(d['margin-left']) >= 32,
      ),
    { dels, muted },
  );

  // Elevation is orthogonal: the bubble is the floating thing whether it holds
  // two verbs or a whole conversation, so it carries the ONE elevation token
  // and not a second one invented for this state.
  // READ AGAINST THE TOKEN, NOT AGAINST ITS VALUE. Two literals stood here —
  // `rgba(0, 0, 0, 0.16)` and `6px 22px` — and they were the elevation token's
  // value at the time. The palette work on this branch re-declared
  // `--gly-menu-shadow` (`--gly-lift` is an alias of it, editor.css:132), so
  // the bubble is on the one token and the check went red on the transcription
  // rather than on the claim. Transcribing a token's value is the exact hazard
  // the head of this file records for the arithmetic constants; the fix is the
  // same one, and it makes the check STRONGER: comparing the painted shadow to
  // `--gly-lift`'s own computed value still catches a second shadow invented
  // for this state, and now also catches the bubble being moved onto a
  // different token, which two literals could not tell from a re-palette.
  const float = await style('.gly-bubble', 'box-shadow', 'z-index');
  const lift = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--gly-lift')
      .trim(),
  );
  check(
    'the bubble carrying a thread still floats on the one elevation token',
    float && !!lift && shadowSame(float['box-shadow'], lift),
    { float, lift },
  );

  // IT HANGS BELOW THE MARK. Above the mark a card this tall covers the
  // sentence the conversation is about, which is the one sentence the reviewer
  // needs while they answer it. The two-verb bubble still sits above, and
  // topFor says at length why the two differ.
  const hang = await page.evaluate(() => {
    const el = document.querySelector('.gly-bubble');
    const mark = document.querySelector('.gly-hl');
    const b = el.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    const head = document.querySelector('.gly-bar').getBoundingClientRect();
    const foot = document
      .querySelector('.gly-bottombar')
      .getBoundingClientRect();
    return {
      bubbleTop: b.top,
      bubbleBottom: b.bottom,
      markTop: m.top,
      markBottom: m.bottom,
      barBottom: head.bottom,
      footTop: foot.top,
      viewport: document.documentElement.clientHeight,
    };
  });
  check(
    'the conversation hangs BELOW its mark, leaving the sentence readable',
    hang.bubbleTop >= hang.markBottom - 0.5,
    hang,
  );
  // The READABLE BAND, not the window: the top bar is sticky over the head of
  // the page and the bottom bar is fixed over its foot, and a card clamped to
  // the window is drawn over one of them — measured, with a conversation
  // covering `✓ all`, the since-retired `✗ all` and the whole-doc handle.
  check(
    'and sits inside the band the prose is readable in, over neither bar',
    hang.bubbleTop >= hang.barBottom - 0.5 &&
      hang.bubbleBottom <= hang.footTop + 0.5,
    hang,
  );

  // READING IT MUST NOT CLOSE IT. threadCard makes every anchored card a
  // jump-to-its-mark control, which is right in the rail and wrong here: the
  // jump scrolls, a scroll dismisses the bubble, and most of this card's area
  // is prose the reviewer's eye and finger land on while reading. Measured
  // closing on a tap before the capture listener in SuggestionUI's constructor
  // was added.
  const stillOpen = await page.evaluate(() => {
    const el = document.querySelector('.gly-bubble');
    const said = el.querySelector('.gly-thread-entry p');
    said.click();
    return { open: !el.hidden, title: el.querySelector('.gly-card').title };
  });
  check(
    'tapping the conversation to read it does not dismiss it',
    stillOpen.open === true,
    stillOpen,
  );
  check(
    'and it makes no jump-to-mark promise it no longer keeps',
    stillOpen.title === '',
    stillOpen,
  );
}

/** What the card is actually SHOWING, measured against the bubble's own box.
 *
 *  Written as one helper because every viewport below asks the same three
 *  questions and the first of them is the one four rounds of checks kept not
 *  asking: is any of the conversation ON SCREEN. `.gly-bubble-said` is the only
 *  region of the card that can give, so when the cap is smaller than the pinned
 *  chrome it gives all the way to ZERO — a card headed `THREAD · …`, with a
 *  reply box and both verbs, and not one word of what was said. Every other
 *  check in this file passes in that state, which is exactly why it is measured
 *  here as a height and not as a selector match. */
const cardShows = () =>
  page.evaluate(() => {
    const el = document.querySelector('.gly-bubble');
    if (!el || el.hidden) return null;
    const card = el.querySelector('.gly-card.gly-thread');
    if (!card) return { thread: false };
    const b = el.getBoundingClientRect();
    // Visible means inside the bubble's box AND with a height of its own. Right
    // for the PINNED rows, which are never clipped by anything but the bubble.
    const visible = (node) => {
      if (!node) return false;
      const r = node.getBoundingClientRect();
      return (
        r.height > 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5
      );
    };
    const said = card.querySelector('.gly-bubble-said');
    const entries = Array.from(card.querySelectorAll('.gly-thread-entry'));
    // And PAINTED, for the entries, which is a different question: an entry
    // inside a region squeezed to 1px has a full-height rect of its own and is
    // clipped to nothing. Its rect intersected with the region's is what a
    // reviewer can actually read, so that is what is measured. Reading the
    // rect alone is how "at least one entry is visible" passes on a card
    // showing a sliver.
    const box = said ? said.getBoundingClientRect() : null;
    const painted = (node) => {
      if (!box) return 0;
      const r = node.getBoundingClientRect();
      return Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
    };
    const first = entries[0];
    return {
      thread: true,
      saidHeight: box ? box.height : -1,
      saidScroll: said ? said.scrollHeight : -1,
      entriesShown: entries.filter((e) => painted(e) > 0.5).length,
      entriesTotal: entries.length,
      firstHeight: first ? first.getBoundingClientRect().height : -1,
      firstPainted: first ? painted(first) : -1,
      // ONE VERB, NOT TWO. `.gly-thread-resolve` is not built any more — an
      // instruction is not a conversation to settle — so the pair this helper
      // reported is a pair with one dead half, and a dead half reads as
      // `visible(null) === false` forever. Delete is the verb a card carries,
      // and it is the one that must survive the cap: it is pinned chrome, and
      // the cap gives out of `.gly-bubble-said` before it takes from the row
      // the verb is in.
      deleteInView: visible(card.querySelector('.gly-thread-delete')),
      cardOverflow: Math.round(card.scrollHeight - card.clientHeight),
      height: b.height,
    };
  });

// A REAL PHONE, AND A CONVERSATION LONGER THAN ITS WINDOW. This is where the
// cap actually bites for a reviewer, so it is where the three claims capping
// makes are asserted — not at a contrived height where the design cannot work
// at all and the measurements are of its degradation.
{
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.locator('.gly-hl').first().click();
  await page.waitForTimeout(400);

  const phone = await cardShows();
  check(
    'on a phone, a comment highlight opens its conversation',
    phone && phone.thread === true,
    phone,
  );
  // THE CAPPED-AND-SCROLLING STATE IS UNREACHABLE NOW, AND THE PREMISE CHECK IS
  // WHAT SAID SO.
  //
  // It stood here as the guard: a thread that fits needs no cap, and a check
  // written for the capped state that runs uncapped passes for the wrong reason
  // forever. It is deleted because the state it guards has no way in, not
  // because the guard was wrong — and the arithmetic is worth writing down,
  // because the obvious repair (make the fixture thread longer) does not work
  // and somebody will try it.
  //
  // `.gly-bubble-said` is the only region of the card that can give, and the
  // FLOOR under it guarantees room for the first thing anybody said, ENTIRE
  // (that is the check directly below, and it is the one that matters). With
  // eight replies the region could clamp to the room the mark left and let
  // replies two-through-eight scroll. An instruction is a SINGLE immutable
  // entry, so "the first thing anybody said" is the whole thread: the floor and
  // the cap are the same number, and there is no rest to scroll to.
  //
  // Measured while trying: a 665px single entry gives a 756px card that is
  // placed, not capped — at 900x1000 it flips above its mark rather than
  // clamping, and at 390x844 `saidScroll` (672) equals `saidHeight` (671.78),
  // which is a check reporting "nothing overflows" about a card that overflows
  // the window. Lengthening it further only moves the flip. The two constraints
  // are contradictory for one thread — hang BELOW the mark at 900x1000 wants
  // height <= ~697, cap at 390x844 wants > ~713 — and the bubble has a fixed
  // max-width, so the same text is the same height at both.
  //
  // The scroll check below it goes for the same reason and says so there.

  // THE ONE THE PINNING BROKE. .gly-bubble-said is the only part of the card
  // that can give, and it gave to zero — measured at 844×390 and at 390×430,
  // ordinary phone states (a rotation; the software keyboard opening under a
  // tapped reply box), with clientHeight 0 against scrollHeight 336 and no
  // gesture that could recover it. A card that shows a conversation with none
  // of the conversation in it is not a conversation.
  // WHOLLY, not by a sliver. `entriesShown > 0` is satisfied by a region 1px
  // tall — which is what the cap leaves when it is smaller than the pinned
  // chrome — and that is the same shape of check as the three this round is
  // fixing: it asserts the thing it names rather than the thing it means. The
  // property is the one the floor guarantees: room for the first thing anybody
  // said, entire.
  check(
    'and the conversation is actually on screen, not squeezed to nothing',
    phone &&
      phone.entriesShown > 0 &&
      phone.firstPainted >= phone.firstHeight - 0.5,
    phone,
  );

  check(
    'the card’s verb is reachable without scrolling at all',
    phone && phone.deleteInView === true,
    phone,
  );
  check(
    'and the card does not overflow its own box',
    phone && phone.cardOverflow <= 0,
    phone,
  );

  // AND THE SCROLL-INSIDE-THE-BUBBLE CHECK GOES WITH THE CAP. The gesture that
  // reaches the rest of the thread must not close the surface holding it —
  // `scroll` is listened for in the CAPTURE phase on `window`, so a scroll
  // raised on any descendant reaches it, including the bubble's own region the
  // moment overflow made it one. With one entry per thread nothing in the
  // bubble ever overflows, so the probe below finds no scrollable box and
  // reports `{scrollable: false}` on every run: there is no gesture to make and
  // no dismissal to catch. The window-scroll half of the same rule IS still
  // asserted — "tapping the conversation to read it does not dismiss it", above
  // — and it is the half a reviewer can still perform.
  //
  // Kept as a NOTE rather than deleted outright, because the day a thread grows
  // a second entry this line is the one that will say the state came back.
  const scrolled = await page.evaluate(() => {
    const el = document.querySelector('.gly-bubble');
    const box = [el, ...el.querySelectorAll('*')].find(
      (n) => n.scrollHeight > n.clientHeight + 1,
    );
    if (!box) return { scrollable: false };
    box.scrollTop = box.scrollHeight;
    return new Promise((r) =>
      setTimeout(
        () => r({ scrollable: true, open: !el.hidden, at: box.scrollTop }),
        250,
      ),
    );
  });
  note(
    'nothing in the bubble overflows — one entry a thread, so no cap to scroll',
    scrolled,
  );
}

// NO ROOM BELOW IS THE CASE HANGING-BELOW GETS WRONG, and it is invisible in a
// tall window. With nothing under the mark, a `below` clamped up into the
// viewport is drawn OVER the mark — the one outcome both placements exist to
// avoid — so topFor falls back to the two-verb placement and the sentence stays
// visible either way.
//
// The SECOND highlight, the short one in the fifth paragraph: it has real room
// above it, which is what makes the flip a placement decision rather than a
// measurement of a window too small to place anything in. The premises are read
// back below for the same reason.
{
  await page.setViewportSize({ width: 900, height: 520 });
  await page.waitForTimeout(700);
  const marks = page.locator('.gly-hl');
  const low = marks.nth((await marks.count()) - 1);
  // PUT IT AT THE FOOT, don't hope it lands there. `scrollIntoViewIfNeeded`
  // only scrolls when the element is off screen and stops as soon as it is in
  // it, so where the mark ends up depends on how far the page happened to be
  // scrolled when this block started — and this block's whole premise is that
  // there is no room BELOW the mark. It used to land low enough by accident
  // (the last highlight in the fixture was two paragraphs from the end); the
  // fixture's marks moved, and the premise check went red reading
  // `roomBelow: true`, which is that guard doing its job. `block: 'end'` aligns
  // the mark's bottom with the window's, which is the state the check is about.
  // PUT THE MARK JUST ABOVE THE BOTTOM BAR, and compute where that is rather
  // than hoping. `scrollIntoViewIfNeeded` — what stood here — only scrolls when
  // the element is off screen and stops the moment it is in it, so where the
  // mark lands depends on how far the page happened to be scrolled when this
  // block started; it used to land low enough by accident (the last highlight
  // in the fixture was two paragraphs from the end), the fixture's marks moved,
  // and the premise check went red reading `roomBelow: true`. That is the guard
  // working, and this is the fixture answering it.
  //
  // `block: 'end'` alone is not the answer either: it aligns the mark's bottom
  // with the WINDOW's, which is UNDER the fixed `.gly-bottombar`, so the click
  // lands on the bar and every read below returns null. The target is the bar's
  // own measured top, less one line, which is a mark on screen with too little
  // room under it for a card — the state this block is about.
  //
  // AND THE FOOT IS THE READABLE BAND'S, NOT `.gly-bottombar`'s. The timeline
  // is fixed at the foot too and is taller than the bar, so a mark aligned 24px
  // above the BAR is 40-odd pixels UNDER the timeline: measured, the click
  // landed on `.gly-timeline`, the bubble never opened and all five reads below
  // came back null. `App.chromeFrame` is the product's own answer to "where
  // does the prose stop being readable" and it now counts both fixed surfaces
  // (entry.ts), so it is what this asks — the same number the bubble places
  // against, which is what makes the premise below and the placement above one
  // fact rather than two.
  await low.evaluate((el) => {
    const foot = window.galleyEdit.app.chromeFrame().bottom;
    const want = el.getBoundingClientRect().bottom - (foot - 24);
    window.scrollBy(0, want);
  });
  await page.waitForTimeout(500);
  await low.click({ force: true });
  await page.waitForTimeout(400);

  const tight = await page.evaluate(() => {
    const el = document.querySelector('.gly-bubble');
    const all = document.querySelectorAll('.gly-hl');
    const m = all[all.length - 1];
    if (!el || el.hidden) return null;
    const b = el.getBoundingClientRect();
    const r = m.getBoundingClientRect();
    const head = document.querySelector('.gly-bar').getBoundingClientRect();
    const foot = document
      .querySelector('.gly-bottombar')
      .getBoundingClientRect();
    return {
      thread: !!el.querySelector('.gly-card.gly-thread'),
      top: b.top,
      bottom: b.bottom,
      height: b.height,
      markTop: r.top,
      markBottom: r.bottom,
      barBottom: head.bottom,
      footTop: foot.top,
      // BOTH premises, read back rather than assumed. Without the first this
      // measures the ordinary below-placement and passes for the wrong reason;
      // without the second it measures a window too short for the card at all,
      // where covering the mark is the honest outcome and not a defect.
      roomBelow: foot.top - 4 - (r.bottom + 8) >= b.height,
      roomAbove: r.top - 8 - (head.bottom + 4) >= b.height,
      overlapsMark: b.top < r.bottom && b.bottom > r.top,
    };
  });
  check(
    'a mark with nothing under it still opens its conversation',
    tight && tight.thread,
    tight,
  );
  check(
    'there really is no room below it — otherwise this proves nothing',
    tight && tight.roomBelow === false,
    tight,
  );
  check(
    'and there really is room above it — otherwise this measures a window, not a placement',
    tight && tight.roomAbove === true,
    tight,
  );
  check(
    'with no room below, the card goes above rather than over the mark',
    tight && !tight.overlapsMark,
    tight,
  );
  check(
    'and still sits inside the band the prose is readable in',
    tight &&
      tight.top >= tight.barBottom - 0.5 &&
      tight.bottom <= tight.footTop + 0.5,
    tight,
  );
}

// AND WHEN THE WINDOW IS TOO SHORT FOR THE DESIGN AT ALL. 844×390 is a phone in
// landscape and 900×260 is the contrived case the checks above used to run in;
// in both, the room the mark leaves is smaller than the card's own floor, so
// something has to give and the choice of WHAT is the whole content of this
// block. It is not the conversation. The card overflows the room instead —
// topFor's clamps have always said a card can be taller than its window — and
// covering a little more prose is a degradation a reviewer can work around,
// where a card with nothing in it is not.
for (const size of [
  { width: 844, height: 390 },
  { width: 900, height: 260 },
]) {
  await page.setViewportSize(size);
  await page.waitForTimeout(700);
  // THE MARK HAS TO BE SOMEWHERE THE REVIEWER COULD PRESS IT, and `scrollTo(0,
  // 0)` is not that statement — it was only ever a way to get a mark near the
  // top of a short window, and it held by luck. The narrow layout puts a fixed
  // bar across the FOOT of the window and a sticky one across its head, so the
  // reachable band is neither the document nor the window. When the top bar
  // grew a row (it folds rather than pushing controls off screen — see §7a),
  // everything under it moved down 40px and the first mark landed beneath the
  // bottom bar at 260px tall: `elementFromPoint` read `.gly-bar-count`, the
  // click never reached the prose, and all four assertions below failed on a
  // premise rather than on the thing they measure.
  //
  // So the mark is put in the middle of the band the product ITSELF calls
  // readable — App.chromeFrame, the same number the bubble places against —
  // and that it arrived is asserted rather than assumed. A precondition that
  // silently stops holding is how a block like this comes to measure nothing.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const frame = window.galleyEdit.app.chromeFrame();
    const r = document.querySelector('.gly-hl').getBoundingClientRect();
    window.scrollBy(0, r.top + r.height / 2 - (frame.top + frame.bottom) / 2);
  });
  await page.waitForTimeout(300);
  const where = `${size.width}×${size.height}`;
  const pressable = await page.evaluate(() => {
    const r = document.querySelector('.gly-hl').getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      hit: at ? at.className || at.tagName : 'none',
      ok: !!(at && at.closest('.gly-hl')),
    };
  });
  check(
    `at ${where} the mark can be pressed at all — no chrome is over it`,
    pressable.ok,
    pressable,
  );
  await page.locator('.gly-hl').first().click();
  await page.waitForTimeout(400);

  const shown = await cardShows();
  check(
    `at ${where} the conversation still opens`,
    shown && shown.thread === true,
    shown,
  );
  check(
    `at ${where} the first thing that was said is on screen, whole`,
    shown &&
      shown.entriesShown > 0 &&
      shown.firstPainted >= shown.firstHeight - 0.5,
    shown,
  );
  check(
    `at ${where} the card’s verb is still reachable`,
    shown && shown.deleteInView === true,
    shown,
  );
  // `overflow: hidden` replaced `overflow-y: auto` when the entries became the
  // one region that scrolls, so anything overflowing the CARD now has no
  // scrollbar to recover it. Measured at 3px in these two windows before the
  // floor — absorbed by the bubble's padding, and invisible right up until it
  // is not.
  check(
    `at ${where} the card does not overflow its own box`,
    shown && shown.cardOverflow <= 0,
    shown,
  );
}

await page.setViewportSize(WIDE);
await page.waitForTimeout(500);

// --- §7d · and at wide, the bubble keeps the conversation too ----------------
//
// A RULE ASSERTED ON ONE SIDE OF A BREAKPOINT IS HALF A RULE, and this is the
// wide half. It used to say the OPPOSITE — no bubble above the breakpoint,
// because the rail already drew every open thread and a bubble would have been
// one conversation rendered twice, each copy with its own reply box and its own
// delete. The rail is deleted; there is no second copy for the bubble to be, so
// refusing it here would leave the most instinctive click in the product doing
// nothing at the width most reviewers use.
//
// WHAT THE CLICK DOES IS STILL NOT "NOTHING", WHICH IS WHAT THIS CHECK HAS
// ALWAYS BEEN ABOUT. Its first form accepted an OPEN, thread-less bubble —
// `COMMENT · AGENT · JUST NOW` with an accept and a reject that 404, no comment
// text, no conversation, no reply box — and called the rule upheld. The verbs
// clause is what outlived that, and it is unchanged: a conversation is not an
// edit to approve.
{
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const mark = page.locator('.gly-hl').first();
  await mark.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await mark.click();
  await page.waitForTimeout(400);
  const wide = await page.evaluate(() => {
    const el = document.querySelector('.gly-bubble');
    return {
      open: !!el && !el.hidden,
      // SHOWING, not merely holding. A hidden bubble keeps its last render in
      // the DOM — `hide()` sets `hidden` and nothing else — so a bare
      // querySelector here reports a conversation the reviewer cannot see, and
      // the claim is about what is on screen.
      thread: !!el && !el.hidden && !!el.querySelector('.gly-card.gly-thread'),
      verbs:
        el && !el.hidden
          ? el.querySelectorAll('.gly-bubble-accept, .gly-bubble-reject').length
          : 0,
    };
  });
  // `at wide the bubble does not draw the conversation — the rail already has
  // it` — RETIRED WITH THE MARK-ANCHORED RAIL CARD. Its right-hand clause was
  // `railThreads > 0` — the RAIL has the conversation — and the rail has
  // nothing to have: `.gly-rail .gly-card.gly-thread` is empty by construction
  // now that a mark's thread is a pinned row. Its left-hand clause, that the
  // bubble draws no conversation at wide, is the check directly below, which
  // asserts it more strictly: no bubble at all, rather than a bubble with no
  // thread in it.
  check(
    'it draws the whole conversation at wide too — one copy, and no decide verbs',
    wide.open === true && wide.thread === true && wide.verbs === 0,
    wide,
  );
  // `the click goes to the card instead, which is reveal() in the other
  // direction` — RETIRED WITH THE MARK-ANCHORED RAIL CARD. It polled for
  // `.gly-rail .gly-thread.gly-flash`. There is no card in the rail to reveal
  // and no flash to catch: a thread reached BY its mark is a pinned row under
  // its own block now (rows.ts), which is already at the place this check was
  // measuring the journey to.
}

// --- §7e · the collapsed rail — DELETED WITH THE COLLAPSE CONTROL ------------
//
// THE RULE IT GUARDED IS STILL GUARDED, and that is why this is a deletion and
// not a hole. §7e's subject was a STATE, not a claim: collapsed at 1600px,
// `railSurfaces` rendered no rail, no bar and no sheet, so a width test left a
// comment highlight opening a two-verb bubble with the conversation rendered
// NOWHERE — and it was not a corner, because `writeCollapsed` persisted per
// document, so a reviewer who collapsed the rail once opened every later
// session in that state. The block pressed `.gly-collapse`, asserted the rail
// really had gone, and then read the bubble.
//
// There is no collapse control. `makeCollapse` was called from nowhere and
// has since been deleted from entry.ts entirely, along with `toggleCollapse`
// and the rest of the feature: Instructions and History are the two document
// views now, and an arrow-only collapse made the primary view disappear
// behind a glyph. The state was unreachable from the product before the
// deletion too — a `locator('.gly-collapse').click()` simply hung, which is
// how this was found, thirty seconds of waiting for a button nobody built.
//
// The RULE — "is the rail on screen", not "is the window narrow", answered by
// `railSurfaces` and never by a width test — is what §7c and §7d assert
// between them, on the two sides of the breakpoint that the product can still
// reach.

// --- §9 · the rail speaks ONE card language — DELETED WITH THE RAIL CARD -----
// --- §10 · the rail scrolls with the document — DELETED WITH IT --------------
// --- §10a · the rail begins BELOW the bar — DELETED WITH IT ------------------
//
// THREE BLOCKS AND ROUGHLY FORTY CHECKS, AND THEY HAD ONE POPULATION BETWEEN
// THEM: `.gly-rail-band .gly-card` — the card the rail drew BESIDE the mark it
// was about. Task 14 deletes that card. A thread reached by its mark is a
// PINNED ROW under its own block now (`web/rows.ts`), drawn as a decoration in
// the document itself, and a whole-document instruction is a pill in the
// frame's doc slot. There is no band, no column of placed cards, and nothing
// for any of the three questions below to be asked about.
//
// EACH IS WRITTEN OUT RATHER THAN LISTED, because the reason each one is moot
// is different and one of them is a claim that moved rather than a claim that
// went:
//
//   §9 asked whether the rail spoke ONE card language: no revision receipt, no
//   unearned dashed edge, one left edge and one width across every card, the
//   three history sections gone, the flow sections beginning after the map
//   ends. It was a geometry claim about a column of cards, and the column is
//   gone. What it was really defending — that an arrival is not drawn as a
//   second kind of object — is defended by construction now: an instruction has
//   exactly one surface, and rows.ts's own header is where that is argued.
//
//   §10 asked whether the rail scrolled with the document, and lit the words a
//   card was about. The scrolling half is answered by the row being AT the
//   block: a decoration on the node scrolls with the node, and the words a row
//   is about are the words it is pinned under.
//
//   THE LIGHT'S OWN HALF WAS RETIRED ON A FALSE PREMISE, and this is the
//   correction. The note here read "the light survives as a mechanism and is
//   read in `web/rounds-ux.mjs`" — `grep -c gly-lit web/rounds-ux.mjs` is 0,
//   and it always was. `web/lit.ts` and entry.ts's hover/focus wiring are live
//   and resolve from a PROSE MARK (`.ProseMirror [data-run]`), not from a card:
//   the card end of the pairing went with the rail, the prose end did not. So
//   the prose half is asserted here, in §10b below, over the three claims that
//   are still true of it — it lights on hover, it is a different wash from the
//   highlight underneath it, and it SURVIVES A SERVER MUTATION, which is the
//   whole reason it is a decoration rather than a class.
//
//   §10a asked whether the rail began BELOW the bar, and its subject was the
//   rail's `position: absolute` with `top: 0` — an element out of flow whose
//   containing block was the initial one, landing under the sticky bar
//   whenever the anchor pass placed nothing. Nothing is placed by hand any
//   more, so the state cannot be built: both of its two ways in (a settled
//   document, every card adrift) were ways of emptying the BAND.
//
// WHAT IS KEPT IS FIXTURE STATE, NOT ASSERTIONS. Three of these blocks' steps
// are read by the sections BELOW them and would be silently missing if the
// blocks were simply cut: the Revise press and the agent's `cannot` that closes
// its handoff window (§8a and §8 both need a review that has been asked for and
// handed back, and a sealed server refuses this press, which is why it has
// always run here); the instructions filed from outside the page, which are the
// pending set §8's seal sweeps; and the reviewer taking a highlight out from
// under a conversation, which is the anchorless case the file seeds in-page
// rather than in the .md. They are kept exactly where they were, in the order
// they were, with the two checks among them that are claims about the SERVER
// and the EDITOR rather than about the rail.
console.log('\n--- §9/§10/§10a · the rail — DELETED, fixture state only ---');
{
  // THE REVISION IS ASKED FOR THROUGH THE ENDPOINT, NOT THE BUTTON. With work
  // pending the button DISCLOSES a two-exit menu rather than posting (see
  // askRevise) — web/rounds-ux.mjs drives that menu. What matters here is the
  // state the page ends up in.
  const asked = await page.evaluate(async () => {
    const res = await fetch('/_galley/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return res.status;
  });
  // The page polls `/_galley/revise` every 1500ms; two beats is the window in
  // which it learns a revision is outstanding.
  await page.waitForTimeout(3500);

  // AND THE AGENT HANDS THE FILE BACK. A press of Revise SENDS the round: it
  // captures every pending instruction, clears the list and opens a handoff
  // window in which the document is read-only — `/_galley/instruct` answers
  // `409 the agent is revising` until the window closes. `galley ack` is what
  // closes it, and it is the agent's own verb. `cannot`, not
  // `ack --state answered`: an answered round has to have CHANGED the file and
  // this changes nothing, so `galley ack` refuses outright ("nothing has
  // changed since the round was handed over") — the server keeping the agent
  // honest. An unchanged round reported as an exception is the truth here and
  // closes the window the same way.
  galley(
    'cannot',
    DOC,
    '--why',
    'this round is the geometry fixture, not work to do',
  );
  await page.waitForTimeout(3000);
  // A CLAIM ABOUT THE SERVER, AND IT SURVIVES THE RAIL. Every section below
  // reads a review that has been asked for; a press that did not land leaves
  // them measuring a draft nobody revised, which is the pass-forever shape.
  check(
    'the round the sections below read was really asked for',
    asked === 204,
    { asked },
  );

  // AND MORE WORK LANDS FROM OUTSIDE THIS PAGE, the way it does when a second
  // reviewer or a tool writes to the same document. This is the pending set
  // §8's seal sweeps, and it is filed here because §9's Revise consumed the
  // seed's six.
  await instruct({
    op: 'comment',
    target: 'A seventh paragraph',
    text: 'is this the right word?',
  });
  await instruct({
    op: 'comment',
    target: 'the word omega',
    text: 'omega is not the word this wants',
  });
  await instruct({
    op: 'comment',
    target: 'the word sigma',
    text: 'and neither is sigma',
  });
  await instruct({
    op: 'comment',
    target: 'A sixth paragraph',
    text: 'a mutation while the light is on',
  });
  await instruct({
    op: 'comment',
    target: WITHDRAWN,
    text: 'does this still apply?',
  });
  // AND THE FIGURE'S CONVERSATION, in the same breath: the Revise above took
  // the seed's copy of that one too, and §7's figure checks read a figure that
  // an instruction has been filed on.
  {
    const blocks = (await pending()).blocks || [];
    const figure = blocks.find(
      (b) => b && b.kind === 'image' && (b.label || '').includes(FIGURE_LABEL),
    );
    if (!figure)
      throw new Error(
        `fixture: no image block for "${FIGURE_LABEL}" to comment on`,
      );
    await instruct({
      op: 'comment_block',
      target: figure.key,
      text: 'does this picture still match the text?',
    });
  }
  // WAITED ON THE ROW IN THE PROSE, not on a card in a band. The instruction's
  // one surface is the pinned row, and this is what replaced a wait for
  // `.gly-rail .gly-card.gly-thread` carrying the phrase — a selector that can
  // now only time out.
  await page.waitForFunction(
    () => document.querySelectorAll('.ProseMirror .gly-row').length > 0,
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(1500);

  // THE HIGHLIGHT COMES OUT FROM UNDER A CONVERSATION, performed the way the
  // product performs it — select the marked words in the editor and delete
  // them, which is `threadPlacement`'s own first anchorless case and the
  // gesture rounds-ux drives for the same state. Asserted rather than assumed:
  // an editor that could not find the phrase would leave this fixture quietly
  // without an unplaced instruction.
  const withdrawn = await page.evaluate((phrase) => {
    const editor = window.galleyEdit.editor;
    let at = null;
    editor.state.doc.descendants((node, pos) => {
      if (at !== null || !node.isTextblock) return at === null;
      const i = node.textContent.indexOf(phrase);
      if (i !== -1) at = pos + 1 + i;
      return false;
    });
    if (at === null) return false;
    editor.commands.focus();
    editor.commands.setTextSelection({ from: at, to: at + phrase.length });
    editor.commands.deleteSelection();
    return true;
  }, WITHDRAWN);
  check(
    'the fixture could take the highlight out from under a conversation',
    withdrawn === true,
    { WITHDRAWN, withdrawn },
  );
  await page.waitForTimeout(5000);

  await page.setViewportSize(WIDE);
  await page.waitForTimeout(700);
}

// --- §8a · the seal's sweep may not touch a LIVE page's flags ----------------
//
// BEFORE §8, and that ordering is the whole check: it asserts what a page that
// has NOT been sealed looks like, and §8 below ends the review for good.
//
// `applySealedVerbs` walks SEALED_VERBS and writes `disabled`. It used to write
// it unconditionally — `el.disabled = !!this.sealed` — so on an ordinary live
// review it wrote `false` over every flag another owner had set. It runs at the
// FOOT of `paintRail`, so it was the last thing every pending refresh did.
//
// THE FLAG IS INSTALLED BY HAND HERE, AND THAT IS A CHANGE FORCED BY THE RAIL.
// The original version of this block read a REAL flag: a short viewport put
// several marks off screen, `paintFold` → `dimCard(card, true)` disabled the
// accept, reject, resolve and delete of every card past the fold, and this read
// them back after a full `refreshPending`. The rail scrolls with the document
// now, there is no fold and no `dimCard`, and that flag cannot be produced at
// all — which is the deletion working, not a hole.
//
// The rule is not the instance, and the surviving owners are real: `paintCensus`
// keeps `✓ all` disabled on a document the sweep would leave untouched, and
// every box that posts disables itself for the flight. NEITHER IS REACHABLE
// HERE WITHOUT DESTROYING THE FIXTURE — the census one needs a review with
// nothing pending and nothing answered, i.e. a swept review, which would leave
// §8 below with no verbs to read and its coverage assertion red; the in-flight
// one is a window of one POST. So the flag is written onto a real, live control
// and a real `refreshPending` is run over it. What is asserted is exactly what
// the invariant says: a pending refresh does not hand back a flag it did not
// set. Shown red by restoring `el.disabled = !!this.sealed` in
// `applySealedVerbs` — the sweep then writes `false` over the line below and
// every one of these controls comes back live.
console.log('\n--- §8a · a live page owns its own disabled flags ---');
{
  const sealed = await page.evaluate(() => {
    const el = document.querySelector('#gly-seal');
    return !!el && getComputedStyle(el).display !== 'none';
  });
  check(
    'the review under this check is LIVE — §8 has not run yet',
    sealed === false,
    { sealed },
  );

  // THE ELEMENTS READ ARE THE ONES WITH NO PAINTER, and that is what makes the
  // read discriminating rather than tautological. `.gly-census-accept` cannot
  // carry this claim — `refreshPending` runs `paintCensus`, its rightful owner,
  // which re-derives the flag from the counts on every refresh, so a `false`
  // there says nothing about who wrote it (§8 below records the same fact from
  // the other end). `.gly-overall-input` and `.gly-composer-text` have no
  // painter at all: the whole-document form is built once and only its entries
  // are rebuilt, and the composer's box is placed by GESTURES — the reason
  // `.gly-composer-text` is in SEAL_ONLY_VERBS at all.
  //
  // THE SECOND SELECTOR WAS `.gly-census-overall`, which is not built any
  // more: the whole-document handle was a bar control opening a floating
  // panel, and the composer is the rail's first card now. It is replaced by
  // another entry from the SAME list rather than dropped, because the claim
  // needs two and needs both of them painter-less. The input's own in-flight
  // `disabled` — set for the flight of its POST — is a REAL live-page flag of
  // exactly this shape, and re-enabling a box mid-POST is the harm; writing it
  // by hand is standing in for the timing, not for the state.
  const marked = await page.evaluate(() => {
    const sels = ['.gly-overall-input', '.gly-composer-text'];
    const out = [];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) {
        out.push({ sel, found: false });
        continue;
      }
      el.disabled = true;
      out.push({ sel, found: true, before: !!el.disabled });
    }
    return out;
  });
  check(
    'every control this reads exists on the fixture — a check with nothing to read is not a check',
    marked.length === 2 && marked.every((m) => m.found && m.before),
    marked,
  );

  // THE EVENT IS A PENDING REFRESH, not a repaint: `applySealedVerbs` is the
  // tail of `paintRail`, and `refreshPending` is what every poll, every
  // mutation and every verdict runs.
  await page.evaluate(() => window.galleyEdit.app.refreshPending());
  await page.waitForTimeout(800);

  const after = await page.evaluate(() => {
    const sels = ['.gly-overall-input', '.gly-composer-text'];
    return sels.map((sel) => {
      const el = document.querySelector(sel);
      return { sel, present: !!el, disabled: !!(el && el.disabled) };
    });
  });
  check(
    'a live pending refresh does not hand back a flag it did not set',
    after.length === 2 && after.every((a) => a.present && a.disabled),
    after,
  );

  // PUT THEM BACK, or §8 reads two controls this block killed rather than two
  // the seal did — and the reopen half of §8 would then pass over them for the
  // wrong reason. `releaseSealOnlyVerbs` is the seal's own edge and not
  // available here, so they are restored the same way they were written.
  //
  // FROM THE APP'S OWN LIST, not from a pair of selectors written down here.
  // `.gly-census-overall` was one of the two and it is not built any more, so
  // the restore threw on `null.disabled` — a gate dying on a control that left
  // the product. `SEAL_ONLY_VERBS` is the constant this file already imports
  // for exactly this reason, and reading it here means the restore covers
  // whatever the seal's own edge covers, forever.
  const sealOnly = SEAL_ONLY_VERBS.split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  await page.evaluate((sels) => {
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) el.disabled = false;
    }
  }, sealOnly);
  const restored = await page.evaluate(
    (sels) =>
      sels.every((sel) => {
        const found = Array.from(document.querySelectorAll(sel));
        return found.length > 0 && found.every((el) => el.disabled === false);
      }),
    sealOnly,
  );
  check(
    'and every seal-only verb is live again before §8 runs',
    restored,
    sealOnly,
  );
}

// --- §12 · reading an earlier version ---------------------------------------
//
// THE SURFACE THE RECORD LIVES ON, read at the two states that can be wrong.
//
// EVERY CHECK HERE USED TO BE ABOUT `.gly-versions`, THE HISTORY PANEL, and
// that panel is deleted (Task 14): the landing, the reading stage, the views
// picker, the change rail and the `<section>` they were drawn into. An earlier
// version is read ON THE SHEET now — the scrubber's two papers sit in the frame
// where the draft's paper does — so the surface whose two states can be wrong is
// the STAGE, and the same two questions are asked of it.
//
// A HIDDEN FULL-SCREEN SURFACE THAT IS NOT ACTUALLY HIDDEN COVERS THE DOCUMENT,
// and `[hidden] { display: none }` is a USER-AGENT rule that ANY author
// `display` beats — the old panel needed `display: flex` for its own layout, so
// the first cut of it painted over the whole page from load with `hidden` set.
// Nine checks passed over that: a rect is a rect under an overlay, and every bar
// control still answered `elementFromPoint` because the bar sits above it. The
// first thing to notice was a drag across the prose that selected nothing. So
// the check is not "the attribute is set" — that is the proxy this file records
// six failures of — it is what the browser does with a click over the prose.
//
// And when it IS on screen, the claim is the other half of the same sentence:
// the version stands IN the sheet and does NOT cover the way back. The bottom
// bar carries the count, the step and the way out at narrow widths, and a
// version drawn over them is the covered-control defect wearing a new coat.
console.log('\n--- §14 · the surfaces this redesign added ---');
//
// EVERY ONE OF THESE WAS UNGATED IN A BROWSER. The theme button, the `?` sheet,
// the verdict menu's explanatory lines, the scrubber's own drag, the readout's
// dot, the pinned row's geometry and the three width reserves were argued in
// comments and asserted, at most, as strings in the bundle — which proves a
// rule was AUTHORED, not that it APPLIES. That is the exact failure the primary
// button shipped with: `#gly-revise.gly-revise { display: inline-flex }` beat
// the one-cell grid the whole reserve mechanism rests on, and a text search for
// the grid rule stayed green through it.
{
  // --- the theme button: one press, two writes ---
  const themeBefore = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    label: document.querySelector('.gly-theme-label')?.textContent ?? null,
    stored: window.localStorage.getItem('galley-theme'),
  }));
  check(
    'the theme button is on the page and says which theme is on',
    themeBefore.label !== null,
    themeBefore,
  );
  await page.click('.gly-theme');
  await page.waitForTimeout(200);
  const themeAfter = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    label: document.querySelector('.gly-theme-label')?.textContent ?? null,
    stored: window.localStorage.getItem('galley-theme'),
    // The palette really moved: `--gly-bg` is what every surface is drawn on.
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  check(
    'pressing it writes data-theme, repaints, and remembers the choice',
    themeAfter.label !== themeBefore.label &&
      themeAfter.stored !== null &&
      themeAfter.stored === themeAfter.attr,
    { before: themeBefore, after: themeAfter },
  );
  // AND ITS BOX DOES NOT MOVE — the bar rule, on a control whose label changes
  // on its own press (`dark` / `light` / `auto`). 9ch is the reserve.
  //
  // A `ch` RESERVE IS READ IN PIXELS, because that is what the browser resolves
  // it to and what the reviewer's eye is measuring. The button's own `9ch` is
  // compared against a probe of nine `0` glyphs in the same font, so the check
  // fails when the RULE stops applying — which is the failure mode this file
  // exists for — and not when the font stack changes.
  const themeBox = await page.evaluate(() => {
    const b = document.querySelector('.gly-theme');
    const probe = document.createElement('span');
    probe.style.font = getComputedStyle(b).font;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.textContent = '000000000';
    document.body.appendChild(probe);
    const nine = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      width: Math.round(b.getBoundingClientRect().width),
      reserve: Math.round(parseFloat(getComputedStyle(b).minWidth)),
      nine: Math.round(nine),
    };
  });
  //
  // MEASURED ACROSS THE WHOLE CYCLE, not across one press. `auto`, `light` and
  // `dark` are three different words and the box has to be the same width under
  // all three; two of them happened to be equal, so a single press could pass
  // over a button that moves.
  const widths = [themeBox.width];
  // Two more presses: with the one above they close the three-step cycle, and
  // `widths` then holds one measurement per label.
  for (let i = 0; i < 2; i += 1) {
    await page.click('.gly-theme');
    await page.waitForTimeout(200);
    widths.push(
      await page.evaluate(() =>
        Math.round(
          document.querySelector('.gly-theme').getBoundingClientRect().width,
        ),
      ),
    );
  }
  check(
    'the theme button reserves its label, so its own press never moves it',
    Math.abs(themeBox.reserve - themeBox.nine) <= 2 &&
      widths.every((w) => w === widths[0]),
    { themeBox, widths },
  );
  // The loop above closed the auto → light → dark → auto cycle, so the palette
  // is back where this section found it and nothing below reads one the rest of
  // the file did not measure against. NOT a reload: this fixture carries a hand
  // edit and a placed composer that §12 and §13 read.
  await page.evaluate(() => {
    window.localStorage.removeItem('galley-theme');
  });
  check(
    'and the cycle comes back to where it started',
    (await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    )) === themeBefore.attr,
  );

  // --- the ? sheet: a toggle, and it is really hidden when it is shut ---
  const helpShut = await page.evaluate(() => {
    const el = document.querySelector('.gly-help');
    return {
      present: !!el,
      hidden: el?.hidden ?? null,
      display: el ? getComputedStyle(el).display : null,
      lines: el ? el.querySelectorAll('p').length : 0,
    };
  });
  check(
    'the help sheet is shut at rest, and `hidden` really hides it',
    helpShut.present && helpShut.hidden === true && helpShut.display === 'none',
    helpShut,
  );
  await page.click('.gly-help-open');
  await page.waitForTimeout(200);
  const helpOpen = await page.evaluate(() => {
    const el = document.querySelector('.gly-help');
    return {
      hidden: el.hidden,
      display: getComputedStyle(el).display,
      lines: el.querySelectorAll('p').length,
      overProse: (() => {
        const p = document.querySelector('.ProseMirror p');
        return (
          el.getBoundingClientRect().bottom <= p.getBoundingClientRect().top
        );
      })(),
    };
  });
  check(
    'pressing ? opens it, with the five gestures, above the paper and not over it',
    helpOpen.hidden === false &&
      helpOpen.display !== 'none' &&
      helpOpen.lines === 5 &&
      helpOpen.overProse,
    helpOpen,
  );
  await page.click('.gly-help-open');
  await page.waitForTimeout(200);
  check(
    'and pressing it again shuts it — it is a toggle, not a door',
    (await page.evaluate(() => document.querySelector('.gly-help').hidden)) ===
      true,
  );

  // --- the readout's dot ---
  //
  // IT NEVER RENDERED. `makeReadoutDot` inserted it into `#gly-status` and every
  // branch of `paintReadout` then wrote `textContent`, which replaces every
  // child — so the App re-tinted a detached node on every poll and the reviewer
  // saw no dot at all. Read off the page, with its tone, because "the element
  // exists" was true the whole time it was invisible.
  const dot = await page.evaluate(() => {
    const el = document.querySelector('#gly-status .gly-dot');
    if (!el) {
      return { present: false };
    }
    const r = el.getBoundingClientRect();
    return {
      present: true,
      tone: el.dataset.tone ?? null,
      w: Math.round(r.width),
      h: Math.round(r.height),
      colour: getComputedStyle(el).backgroundColor,
      first: document.querySelector('#gly-status').firstElementChild === el,
      said: document.querySelector('#gly-status').innerText.trim(),
    };
  });
  check(
    'the readout paints a dot, and it survives the sentence being rewritten',
    dot.present &&
      dot.first === true &&
      dot.w > 0 &&
      dot.h > 0 &&
      !!dot.tone &&
      dot.said.length > 0,
    dot,
  );

  // --- the row pinned under its block ---
  const row = await page.evaluate(() => {
    const el = document.querySelector('.ProseMirror .gly-row');
    if (!el) {
      return { present: false };
    }
    const marked = document.querySelector('.ProseMirror .gly-marked');
    const paper = document.querySelector('.ProseMirror');
    const r = el.getBoundingClientRect();
    const b = marked ? marked.getBoundingClientRect() : null;
    const p = paper.getBoundingClientRect();
    return {
      present: true,
      belowItsBlock: b ? Math.round(r.top) >= Math.round(b.top) : null,
      insidePaper:
        Math.round(r.left) >= Math.round(p.left) &&
        Math.round(r.right) <= Math.round(p.right),
      state: el.querySelector('.gly-row-state')?.textContent ?? '',
      tone: el.dataset.tone ?? null,
    };
  });
  check(
    'a pinned row sits below the block it is about, inside the sheet',
    row.present &&
      row.belowItsBlock !== false &&
      row.insidePaper &&
      !!row.state &&
      !!row.tone,
    row,
  );

  // --- the primary's own two reserves ---
  //
  // 13ch (the counting face) and 23ch (the trail) are the two magic numbers the
  // bar rule is spelled in, and NEITHER had a gate anywhere. Read as computed
  // widths on the real elements, because a `min-width` in a rule that does not
  // apply reserves nothing — which is precisely how the primary shipped 425px
  // wide with its four faces in a row.
  const reserves = await page.evaluate(() => {
    const b = document.getElementById('gly-revise');
    const trail = document.querySelector('.gly-revise-trail');
    const chIn = (el, n) => {
      const probe = document.createElement('span');
      probe.style.font = getComputedStyle(el).font;
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.textContent = '0'.repeat(n);
      document.body.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return Math.round(w);
    };
    return {
      // `display` comes back BLOCKIFIED — the primary is a flex item of
      // `.gly-timeline-right`, so `inline-grid` computes as `grid`. The claim
      // is the grid and its single named area, which is what makes the four
      // faces one cell; `inline` is not part of it.
      display: getComputedStyle(b).display,
      areas: getComputedStyle(b).gridTemplateAreas,
      trail: trail
        ? Math.round(parseFloat(getComputedStyle(trail).minWidth))
        : null,
      trail23: trail ? chIn(trail, 23) : null,
      trailPx: trail ? Math.round(trail.getBoundingClientRect().width) : null,
    };
  });
  check(
    'the primary is a ONE-CELL GRID — the reservation the four faces rest on',
    /grid/.test(reserves.display) && /label/.test(reserves.areas),
    reserves,
  );
  check(
    'the footer trail reserves 23ch, in pixels, on the element that has it',
    reserves.trail !== null &&
      Math.abs(reserves.trail - reserves.trail23) <= 2 &&
      reserves.trailPx >= reserves.trail,
    reserves,
  );
}

console.log('\n--- §12 · reading an earlier version ---');
{
  await page.setViewportSize({ width: WIDE.width, height: WIDE.height });
  await page.waitForTimeout(400);

  const shut = await page.evaluate(() => {
    const el = document.querySelector('.gly-scrub-stage');
    if (!el) return null;
    const p = document.querySelector('.ProseMirror p');
    const r = p.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + 8, r.y + 8);
    return {
      display: getComputedStyle(el).display,
      scrubbing: document.body.classList.contains('gly-scrubbing'),
      overProse: at ? at.className || at.tagName : null,
      reachesStage: !!(at && at.closest && at.closest('.gly-scrub-stage')),
    };
  });
  check('the record has a surface to be read on at all', !!shut, shut);
  check(
    'at the head that surface is DISPLAYED nowhere, not merely empty',
    !!shut && shut.scrubbing === false && shut.display === 'none',
    shut,
  );
  check(
    'and the prose answers a click, which is the claim the attribute is only a proxy for',
    !!shut && shut.reachesStage === false,
    shut,
  );

  await page.click('.gly-scrub-key');
  await page.waitForTimeout(600);

  const open = await page.evaluate(() => {
    const el = document.querySelector('.gly-scrub-stage');
    const cs = getComputedStyle(el);
    const bar = document.querySelector('.gly-bar');
    const paper = document.querySelector('.gly-scrub-paper[data-v]');
    const prose = document.querySelector('.ProseMirror');
    const scrollers = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') scrollers.push(n.className);
    }
    return {
      position: cs.position,
      display: cs.display,
      proseDisplay: getComputedStyle(prose).display,
      mainDisplay: getComputedStyle(document.querySelector('main')).display,
      barDisplay: getComputedStyle(bar).display,
      eyebrow: (document.querySelector('.gly-eyebrow')?.innerText || '').trim(),
      paper: paper ? (paper.textContent || '').trim().length : 0,
      scrollers,
      pageScrolls:
        document.documentElement.scrollHeight > window.innerHeight - 1,
    };
  });
  // IT IS THE SHEET, NOT A PANEL OVER ONE, AND NOT A PANEL INSTEAD OF ONE.
  // This asserted `position: fixed` when the record was a full-screen surface
  // laid over the document, then `main { display: none }` when it was a section
  // drawn in its place. It is neither: `main` and the frame — the eyebrow that
  // says WHICH version, and the verb that would restore it — stay exactly where
  // they were, and only the draft's own paper steps aside.
  check(
    'a version stands in the sheet: the frame and the bar stay, the draft’s paper steps aside',
    open.display !== 'none' &&
      open.position === 'relative' &&
      open.proseDisplay === 'none' &&
      open.mainDisplay !== 'none' &&
      open.barDisplay !== 'none',
    open,
  );
  // AND THE EYEBROW SAYS WHICH ONE. A sheet showing something other than the
  // draft, with nothing on screen saying so, is the one failure this mode can
  // have that a reviewer would not notice until they typed into it.
  check(
    'and the eyebrow says which version is being read, and that it is read-only',
    /VIEWING V\d+/.test(open.eyebrow) && /READ ONLY/.test(open.eyebrow),
    open.eyebrow,
  );
  check(
    'and the version is rendered into that paper',
    open.paper > 0,
    open.paper,
  );
  // ONE SCROLLER, COUNTED FROM THE PAPER OUTWARDS. The claim was never about
  // which element scrolls: it is that a version is read in ONE scroller,
  // because nested scrollers are how a reviewer loses their place. The answer
  // is zero — the scroll that reaches the end of the version is the WINDOW's,
  // the same gesture that reaches the end of the draft — and the page's own
  // scrollability is asserted beside it, or "no scroller anywhere" is satisfied
  // by a sheet nobody can read past the fold.
  check(
    "one scroller — the page's own, not a scroller inside a scroller",
    open.scrollers.length === 0 && open.pageScrolls === true,
    { scrollers: open.scrollers, pageScrolls: open.pageScrolls },
  );

  // The narrow state is where the way back lives. The version must not cover it.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const narrow = await page.evaluate(() => {
    const bottom = document.querySelector('.gly-bottombar');
    if (!bottom || bottom.hidden) return { bar: false };
    const r = bottom.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      bar: true,
      reaches: !!(at && at.closest && at.closest('.gly-bottombar')),
    };
  });
  if (narrow.bar) {
    check(
      'the version never covers the way back — the bottom bar is still what a click there reaches',
      narrow.reaches,
      narrow,
    );
  } else {
    note(
      'no bottom bar at 390px in this state, so the way-back claim has nothing to be asked of',
    );
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const escaped = await page.evaluate(() => ({
    scrubbing: document.body.classList.contains('gly-scrubbing'),
    display: getComputedStyle(document.querySelector('.gly-scrub-stage'))
      .display,
    prose: getComputedStyle(document.querySelector('.ProseMirror')).display,
  }));
  check(
    'Esc returns to the head, like every other surface on this page',
    escaped.scrubbing === false &&
      escaped.display === 'none' &&
      escaped.prose !== 'none',
    escaped,
  );
  // THE HANDLE IS DRAGGED, AND NOT ONLY THE KEYFRAME PRESSED. `.gly-scrub-handle`
  // is the scrubber's own gesture and the record's only continuous door, and
  // nothing anywhere drove it: every check here and in rounds-ux clicks a
  // keyframe, which is a different code path (`scrubTo(k.n)` against the
  // pointer arithmetic on the track). A drag is also the case the last-move-wins
  // ticket in `scrubTo` exists for — dozens of calls, one paint.
  {
    const track = await page.locator('.gly-scrub-track').boundingBox();
    const handle = await page.locator('.gly-scrub-handle').boundingBox();
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    // Left across the track in steps, the way a pointer actually arrives.
    for (let i = 1; i <= 8; i += 1) {
      await page.mouse.move(
        track.x + track.width * (1 - i / 8) * 0.9,
        handle.y + handle.height / 2,
      );
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
    await page.waitForSelector('body.gly-scrubbing .gly-scrub-paper[data-v]', {
      timeout: 8000,
    });
    const dragged = await page.evaluate(() => {
      const paper = document.querySelector('.gly-scrub-paper[data-v]');
      return {
        scrubbing: document.body.classList.contains('gly-scrubbing'),
        at: paper ? Number(paper.dataset.v) : null,
        max: window.galleyEdit.app.scrubMax(),
        atHead: window.galleyEdit.app.atHead(),
        text: (paper?.innerText ?? '').trim().length,
        eyebrow: document.querySelector('.gly-eyebrow')?.innerText ?? '',
      };
    });
    check(
      'dragging the handle reads an earlier version — one paint, off the head',
      dragged.scrubbing === true &&
        dragged.atHead === false &&
        dragged.at !== null &&
        dragged.at < dragged.max &&
        dragged.text > 0 &&
        /VIEWING V/.test(dragged.eyebrow),
      dragged,
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.body.classList.contains('gly-scrubbing'),
      undefined,
      { timeout: 5000 },
    );
    check(
      'and Esc puts the draft back — one predicate, and every surface reads it',
      (await page.evaluate(() => window.galleyEdit.app.atHead())) === true,
    );
  }

  await page.setViewportSize({ width: WIDE.width, height: WIDE.height });
  await page.waitForTimeout(300);
}

// §13 · A ROUND THAT WAS APPLIED, NOT PROPOSED — phase 2's whole claim, driven
// against a real server from another terminal while the page is open.
//
// IT IS HERE AND NOT IN `verify` BECAUSE EVERY ONE OF ITS CLAIMS IS ABOUT WHAT
// THE REVIEWER SEES. The Go side can prove the round was cut and the bytes
// changed; it cannot see that the words moved on screen with nothing left to
// accept, that the door was marked without its box moving, or that pressing the
// door lands on `in place`. Those are the three things a reviewer actually
// experiences and the three a proxy check would go green over.
console.log('\n--- §13 · an applied round ---');
{
  await page.setViewportSize({ width: WIDE.width, height: WIDE.height });
  await page.waitForTimeout(400);

  const before = await page.evaluate(() => ({
    prose: document.querySelector('.ProseMirror').innerText,
    cards: document.querySelectorAll('.gly-rail .gly-card.gly-thread').length,
    keys: document.querySelectorAll('.gly-scrub-key').length,
    keyLabels: Array.from(document.querySelectorAll('.gly-scrub-key')).map(
      (el) => (el.textContent || '').trim(),
    ),
  }));

  // The reviewer asks, and the agent revises — through the real write surface,
  // from a process that is not this page.
  //
  // AND THE WRITE SURFACE IS THE FILE. This ran `galley apply --replace … --with
  // …`, which is deleted (a052b4a: "the file is the agent's write surface").
  // The loop it is replaced by is the product's own and the shape of this block
  // is unchanged by it: `galley revise` hands the round over and opens the
  // window in which the document is read-only to the browser, the agent edits
  // the .md DIRECTLY — which is legal in that window and ONLY in that window,
  // because the live document owns the file at every other moment and its next
  // projection would overwrite an outside write — and `galley ack` hands it
  // back. Reading the file, replacing one phrase in it and writing it back is
  // exactly what the agent does; doing it with `readFileSync`/`writeFileSync`
  // rather than through a verb is what makes this a test of the LOOP rather
  // than of a CLI.
  // AND THE ROUND HAS AN ASK IN IT. A round is an ask ANSWERED — the record
  // pairs the reviewer's instruction with the agent's word for what it did
  // about it — so a revise pressed over an empty pending set produces a round
  // with nothing to pair and a requests pane with nothing in it. §9's revise
  // consumed everything the fixture had, so the ask is filed here.
  await instruct({
    op: 'comment',
    target: 'which the agent revises outright',
    text: 'rewrite this paragraph rather than proposing against it',
  });
  await page.waitForTimeout(1200);
  galley('revise', DOC);
  {
    const was = readFileSync(DOC, 'utf8');
    const now = was.replace(
      'which the agent revises outright',
      'which the agent HAS ALREADY REVISED',
    );
    if (now === was) {
      throw new Error(
        'fixture: the ninth paragraph did not carry the phrase the agent rewrites',
      );
    }
    writeFileSync(DOC, now);
  }
  // `--changes`, NOT `--note` ALONE, AND THAT IS WHAT THE PAIRING CHECK NEEDS.
  // `--note` is the ROUND's sentence — the agent's word about the whole
  // handover — and `.gly-agent-note` under a WAS strip is the agent's word
  // about THIS CHANGE: `changeView.Note` comes from the ack manifest's own
  // per-change entries (internal/serve/versions.go:860, `note[k] = c.Note`),
  // matched onto the region by the quote. With only a round note the fixture
  // produced no per-change testimony at all and `and the agent's own word about
  // the change is beside the change` read an element that had correctly not
  // been built — the server's stated rule that an absent note is absent, doing
  // exactly what it says. The round note is kept: `#gly-status` reads it, and
  // the two are different sentences on purpose.
  galley(
    'ack',
    DOC,
    '--state',
    'answered',
    '--note',
    'renamed the reserved word',
    '--changes',
    JSON.stringify([
      {
        quote: 'which the agent HAS ALREADY REVISED',
        note: 'renamed the reserved word',
      },
    ]),
  );
  await page.waitForTimeout(2600);

  // THE PROSE, WITHOUT THE STRIPS THAT QUOTE WHAT IT NO LONGER SAYS. `innerText`
  // over `.ProseMirror` now includes the WAS strip Task 11 pins under a revised
  // block — a widget whose whole content is the sentence the agent took out —
  // so `!prose.includes('revises outright')` read the record of the removal as
  // the removal not having happened. The strips are decorations, not the
  // document, and `.gly-was-wrap` is what carries them; the check below is
  // about what the DOCUMENT says, so they come out of the text it reads. The
  // strips are asserted positively a few checks down, where they are the
  // subject rather than the noise.
  const after = await page.evaluate(() => ({
    prose: (() => {
      const pm = document.querySelector('.ProseMirror').cloneNode(true);
      pm.querySelectorAll('.gly-was-wrap').forEach((n) => n.remove());
      return pm.innerText === undefined ? pm.textContent : pm.innerText;
    })(),
    cards: document.querySelectorAll('.gly-rail .gly-card.gly-thread').length,
    marks: document.querySelectorAll(
      '.ProseMirror .gly-ins, .ProseMirror .gly-del',
    ).length,
    keys: document.querySelectorAll('.gly-scrub-key').length,
    keyLabels: Array.from(document.querySelectorAll('.gly-scrub-key')).map(
      (el) => (el.textContent || '').trim(),
    ),
    was: document.querySelectorAll('.ProseMirror .gly-was').length,
    said: (document.querySelector('#gly-status') || {}).innerText || '',
  }));

  // THE WORDS MOVED, ON SCREEN, WITH NOBODY PRESSING ANYTHING. This is the rule
  // CLAUDE.md states about Apply, asked of the biggest write it has ever
  // carried: a revision written straight to the document would be correct on
  // disk and invisible here.
  check(
    'the agent’s revision is in the prose the reviewer is reading',
    after.prose.includes('HAS ALREADY REVISED') &&
      !after.prose.includes('revises outright'),
    {
      had: before.prose.includes('revises outright'),
      has: after.prose.includes('HAS ALREADY REVISED'),
    },
  );
  // AND THERE IS NOTHING TO ACCEPT. The rail is the map of live work; an applied
  // revision adds none, which is the difference between this phase and the last.
  // COUNTED OVER THREAD CARDS, AND EXPECTED TO FALL TO ZERO. This compared the
  // two counts for EQUALITY, because a revision used to arrive on top of a
  // pending set that stayed exactly where it was. The press that starts this
  // block SENDS the round — every instruction is handed over and the list is
  // cleared — so the map correctly empties, and equality would now be asserting
  // that it did not. What has not changed is the half that matters: the
  // agent's revision adds NO decidable card and NO mark to the prose, which is
  // the whole difference between this phase and the last. Scoped to
  // `.gly-card.gly-thread` so the whole-document composer's own pinned card,
  // which is a box to type into rather than work to decide, is not counted as
  // either.
  check(
    'and it left no card and no mark to be decided',
    after.cards === 0 && after.marks === 0,
    { cards: [before.cards, after.cards], marks: after.marks },
  );
  // THE ARRIVAL REACHES THE RECORD, AND THE RECORD IS THE TIMELINE. `the
  // arrival marks the bar's door` and `marking it moved nothing — same box,
  // different paint` both read the amber ring on the History chip, and the chip
  // is deleted. What arrives instead is a KEYFRAME: the round the agent just
  // landed is on the track, and the track is where the reviewer goes to read
  // it. Nothing moves under the cursor because the track is in the footer and
  // grows along itself.
  // COUNTED AS A GROWTH AND NAMED, RATHER THAN AS `+1`. The constant was wrong
  // about this fixture and in a way that hid what the check is for: the ask,
  // the agent's write to the .md and the ack that closes the round put TWO
  // keyframes on the track between the two reads (measured: `["R1","R2",
  // "R3 · cannot"]` before, `["R1","R2","R3 · cannot","R4","R5 draft"]` after),
  // and an arithmetic identity over a fixture's round bookkeeping is not the
  // claim. The claim is that THE ARRIVAL REACHED THE RECORD, so the track is
  // asserted to have grown AND its head to be the round that just landed —
  // `keyframesOf` labels exactly that one `draft` (timeline.ts:43: the head,
  // unsealed, landed, with answers). A revision that changed the document and
  // left no keyframe, or left one that is not the head, fails here; a fixture
  // that files one extra round does not.
  check(
    'the arrival reaches the record — the round is a keyframe on the timeline',
    after.keys > before.keys &&
      /^R\d+ draft$/.test(after.keyLabels[after.keyLabels.length - 1]),
    { before: before.keyLabels, after: after.keyLabels },
  );
  // THE SENTENCE IS THE REVIEWER'S ONLY NOTICE, so it is read off the screen and
  // not off a field: a string check on the bundle is green through a readout
  // that renders nothing.
  // AND IT FITS: innerText is the RENDERED text, so an ellipsis here is the cell
  // having eaten the clause that says where to read it — which is exactly what
  // the first draft of this sentence did, measured at this very width.
  check(
    'and the readout says which round arrived and where to read it, without being cut',
    /v\d+/.test(after.said) &&
      /timeline|rounds/.test(after.said) &&
      !after.said.includes('…'),
    after.said,
  );

  // AND THE ROUND IS READ WHERE IT HAPPENED. `the door opens on the round that
  // arrived, read in place` and `the diff is painted` pressed the History chip
  // and read the reading state's sub-head and its marks. Both are deleted, and
  // what replaced them is not a smaller version of the same thing: Task 11 put
  // the round INSIDE the paper — the changed block tints, and the WAS strip
  // under it carries what the sentence said before, struck through in the
  // removal colour. So the claim is asked of the sheet the reviewer is already
  // reading, which is a stronger form of it: nothing had to be pressed at all.
  const landed = await page.evaluate(() => {
    const was = document.querySelector('.ProseMirror .gly-was');
    return {
      was: document.querySelectorAll('.ProseMirror .gly-was').length,
      revised: document.querySelectorAll('.ProseMirror .gly-revised').length,
      said: was ? (was.textContent || '').trim() : '',
      keys: document.querySelectorAll('.gly-scrub-key').length,
    };
  });
  check(
    'the round is read where it happened — the block that moved carries what it WAS',
    landed.was > 0 && landed.revised > 0 && /WAS/.test(landed.said),
    landed,
  );

  // AND HERE IS THE OTHER HALF OF §8's REMOVAL VOCABULARY, read where both
  // populations are finally on screen at once.
  //
  // There is ONE colour for removal product-wide and the two are told apart by
  // SHAPE: the reviewer's outgoing ghost is `--gly-del`, DOTTED, with no wash;
  // a settled diff in this paper is `--gly-del`, SOLID, on the del wash.
  // Colour says what happened to the text, shape says whether it has happened
  // yet. Asserted as an EQUALITY on hue and an INEQUALITY on style and
  // background, with both marks required to have been found — a null-tolerant
  // read on a surface where one of them is absent is the pass-forever shape
  // this file records six of, and it is the shape the old grey-vs-red check
  // was rescued from in the other direction.
  const vocabulary = await page.evaluate(() => {
    const of = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        color: cs.color,
        // THE REMOVAL COLOUR IS THE STRIKE'S, NOT THE INK'S — which is what the
        // check below always SAID it was reading and did not. The WAS strip's
        // own ink is `--gly-was-ink` (muted, because the strip is a record and
        // not the document) while `s` inside it is struck in `--gly-coral`,
        // which is `--gly-del`; reading `color` compared a muted grey against
        // the ghost's red and reported two vocabularies where there is one.
        // `text-decoration-color` is the property the removal is actually
        // painted with on both sides.
        strike: cs.textDecorationColor,
        style: cs.textDecorationStyle,
        line: cs.textDecorationLine,
        bg: cs.backgroundColor,
      };
    };
    // THE SETTLED REMOVAL IS THE WAS STRIP'S NOW. It was `.gly-versions-paper
    // .gly-del`, the del mark inside History's reading state; a settled round
    // is read inline at the head instead, and what carries the words it took
    // out is the `<s>` inside the WAS strip under the block that moved.
    return {
      settled: of('.ProseMirror .gly-was s'),
      outgoing: of('.ProseMirror .gly-trail-ghost'),
    };
  });
  check(
    'both removals are on screen at once — the settled one and the outgoing one',
    !!vocabulary.settled && !!vocabulary.outgoing,
    vocabulary,
  );
  check(
    'they are the SAME red — one vocabulary for removal, whoever did it',
    !!vocabulary.settled &&
      !!vocabulary.outgoing &&
      // The strip's own ink is muted; the removal it carries is struck in the
      // removal colour, which is what `text-decoration-color` reports.
      vocabulary.settled.strike === vocabulary.outgoing.strike,
    vocabulary,
  );
  // THE WASH CLAUSE WENT WITH THE PAPER THAT PAINTED IT. `solid ON THE WASH` was
  // History's reading state: `.gly-versions-paper .gly-del` sat on `--gly-del-bg`
  // because it was a diff rendered into a page of its own, and that page is
  // deleted. A settled removal is read inline now, in the WAS strip, which says
  // "this is a record and not the document" with a coral rule down its side and
  // an eyebrow reading WAS — both asserted directly above — rather than with a
  // wash behind the words. So the SHAPE claim is what survives, and it is the
  // half that carried the meaning: solid is done, dotted is not yet. The
  // outgoing ghost being bare is kept, because that is the ghost's own half of
  // the rule and nothing about it moved.
  check(
    'and they are apart by SHAPE — solid is done, dotted and bare is not yet',
    !!vocabulary.settled &&
      !!vocabulary.outgoing &&
      vocabulary.settled.style === 'solid' &&
      vocabulary.outgoing.style === 'dotted' &&
      vocabulary.outgoing.bg === TRANSPARENT,
    vocabulary,
  );
  // THE PAIRING, on the surface. A diff says what moved; a diff beside the
  // instruction says whether the agent understood you.
  //
  // THREE CHECKS HERE READ HISTORY AND ARE RETIRED WITH IT: the panel's whole
  // text printed as a note, `it says which round, between which two versions`
  // off the reading state's sub-head, and `the door stops being marked once it
  // has been read` off the chip's amber ring. The pairing is drawn inline now —
  // the agent's own sentence about a change sits under the WAS strip it goes
  // with — so that is what is read, on the sheet, with nothing pressed.
  const paired = await page.evaluate(() => {
    const note = document.querySelector('.ProseMirror .gly-agent-note');
    return {
      label: (
        note?.querySelector('.gly-agent-note-label')?.textContent || ''
      ).trim(),
      said: (note?.textContent || '').trim(),
    };
  });
  check(
    'and the agent’s own word about the change is beside the change',
    /agent/i.test(paired.label) && paired.said.length > paired.label.length,
    paired,
  );

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // THE EXCEPTION. It is a round in which nothing happened, in a list where
  // every other entry is a diff — so it is apart by SHAPE as well as by word,
  // the discipline the moved-sentence rule and the trail ghost are drawn with.
  galley('revise', DOC);
  galley(
    'cannot',
    DOC,
    '--why',
    'the schema this paragraph describes is not in the branch I have',
  );
  await page.waitForTimeout(2600);
  const exception = await page.evaluate(() => ({
    said: (document.querySelector('#gly-status') || {}).innerText || '',
    keys: [...document.querySelectorAll('.gly-scrub-key')].map((k) => ({
      label: (k.innerText || '').trim(),
      tone: k.dataset.tone,
      fill: k.dataset.fill,
      colour: getComputedStyle(k).color,
    })),
  }));
  // READ OFF THE SCREEN WITH innerText, which is defined over the RENDERED text
  // — the cell ellipsises, and a check on textContent is green over a sentence
  // whose informative half was never drawn.
  check(
    'an exception reaches the reviewer as a sentence carrying its reason',
    exception.said.includes('could not') &&
      exception.said.includes('schema') &&
      !exception.said.includes('…'),
    exception.said,
  );
  // AND IT IS ON THE RECORD, APART BY SHAPE. `it marks the same door the
  // revision does`, `the exception is in the history as a round of its own`,
  // `drawn apart from an ordinary round by shape` and the selected-exception
  // cascade check all read History's round cards and the chip's amber ring;
  // both are deleted. The record is the timeline, and the exception is a
  // keyframe there: HOLLOW where an ordinary round is filled, CORAL where an
  // ordinary round is muted or accent, and labelled `· cannot`. Apart by shape
  // AND by colour, asserted as the inequality rather than as one treatment —
  // reading one pins it and goes green the day another replaces it.
  const cannotKey = exception.keys.find((k) => /· cannot$/.test(k.label));
  const ordinary = exception.keys.find((k) => !/· cannot$/.test(k.label));
  check(
    'the exception is on the record as a round of its own',
    !!cannotKey,
    exception.keys,
  );
  check(
    'and it is drawn apart from an ordinary round by shape, not only by word',
    !!cannotKey &&
      !!ordinary &&
      cannotKey.fill === 'none' &&
      cannotKey.tone === 'coral' &&
      cannotKey.tone !== ordinary.tone &&
      cannotKey.colour !== ordinary.colour,
    { cannot: cannotKey, ordinary },
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// --- §8 · the terminal bar — RUN LAST, AND THAT IS NEW ----------------------
//
// It always said "LAST, because it ends the review: every section above needs a
// live one", and it was not last: §12 (the rounds) and §13 (an applied round)
// stood after it, and they ran on a live page because §8 finished by pressing
// `↺ reopen` and handing the review back.
//
// There is no reopen. `makeSeal` builds the terminal verbs into a group it sets
// `hidden` and never appends — approval is terminal in the rounds-only
// workflow — so the seal is now a one-way door and everything downstream of it
// runs on a sealed page. Measured: §12's first click on History's door hung for
// thirty seconds and threw, because that door lived inside the census strip and
// `sealHides` takes the whole strip off a sealed bar. Both the door and the
// strip are deleted now; the ordering they bought is kept, because a sealed
// page is still the last state this document reaches.
//
// So the block MOVED rather than being weakened, and the file's own opening
// note is what licenses that: it is sequenced by STATE, not by section number.
// §8's state is the last one this document reaches.

// --- §8 · the terminal bar: what a sealed review PAINTS ----------------------
//
// LAST, because it ends the review: every section above needs a live one.
//
// PAINT IS INVISIBLE TO EVERY OTHER GATE, and the seal adds a whole bar nobody
// else looks at. `just verify` never opens a browser; rounds-ux.mjs holds rects
// across a click and a stably-wrong colour survives it untouched; probe.mjs has
// no DOM. Two claims live here and nowhere else. The terminal bar is CHROME —
// it must not paint at the document's size or in the document's colour, which
// is the exact regression the shell's `.gly-bar button` rule shipped once
// already (seven controls at 14px in the accent). And a sealed review's verbs
// must LOOK dead as well as being dead: `disabled` alone is a fact about the
// DOM, and a control that reads live and does nothing is the failure the seal
// exists to remove, moved one layer down.
console.log('\n--- §8 · the terminal bar ---');
await page.setViewportSize(WIDE);
await page.waitForTimeout(400);

/** placeComposer makes a real prose selection in the nth qualifying paragraph,
 *  which is the ONLY thing that runs `placeComposerButton` — the composer has
 *  no painter on any beat. §8 drives it twice, on either side of the seal, and
 *  the two drives ask different questions: before the seal it puts the page
 *  into the state the reviewer is actually in when a verdict lands, and after
 *  it, it proves an ordinary gesture still works.
 *
 *  A DIFFERENT PARAGRAPH EACH TIME, and that is not tidiness. `setTextSelection`
 *  to the range the editor is already on dispatches a transaction that changes
 *  no selection, so NO `selectionUpdate` fires and `placeComposerButton` never
 *  runs — the second drive would silently do nothing and the check below it
 *  would be reading the first drive's leftovers. Measured: with both drives on
 *  paragraph 0, "a selection still places the composer" went red on a page
 *  where a real reviewer's click would have placed it. */
const placeComposer = (nth = 0) =>
  page.evaluate((want) => {
    const editor = window.galleyEdit.editor;
    const doc = editor.state.doc;
    let seen = -1;
    let at = null;
    doc.descendants((node, pos) => {
      if (at !== null) return false;
      if (
        node.type.name === 'paragraph' &&
        node.textContent.trim().length > 6
      ) {
        seen += 1;
        if (seen === want) at = pos + 1;
      }
      return at === null;
    });
    if (at === null) {
      throw new Error(
        `fixture: no paragraph #${want} to select — the composer cannot be placed`,
      );
    }
    editor.commands.focus();
    editor.commands.setTextSelection({ from: at, to: at + 5 });
    editor.view.focus();
  }, nth);
{
  // THE COMPOSER IS PLACED BEFORE THE VERDICT, because that is the state a
  // reviewer is in when one lands — a selection made, the comment affordance
  // showing — and it is the state the reopen read below cannot fail without.
  //
  // `.gly-composer-send` is in SEALED_VERBS through `.gly-composer button`, so
  // the seal kills it; what it does NOT have is anything that hands it back on
  // the unseal edge. Its writers are all GESTURES — `placeComposerButton` on a
  // selectionUpdate, `hideComposer`, `openSectionComposer` — and the edge runs
  // none of them. The gate could not see that because the only drive it made
  // came AFTER the reopen and moved the selection, which yields
  // `composerPlacement`'s `place` and re-enables the control on the way past;
  // `keep`, the verdict for a selection that has not moved, writes no flag at
  // all. So the flag is read here BEFORE any gesture.
  //
  // IT WAS `.gly-comment-button` UNTIL THE COMPOSER LOST ITS INTERMEDIATE
  // PRESS. The selection opens the box directly now (spec §1), so the control
  // that has to survive a reopen is the one that FILES — read below.
  await placeComposer(0);
  await page.waitForTimeout(400);
  const placed = await page.evaluate(() => {
    const c = document.querySelector('.gly-composer');
    const b = document.querySelector('.gly-composer-send');
    return { open: !!c && !c.hidden, live: !!b && !b.disabled };
  });
  check(
    'the composer is placed and live BEFORE the seal — a fixture that never placed it cannot fail below',
    placed.open && placed.live,
    placed,
  );

  // AND AN INSTRUCTION IS PUT INTO EDIT, for the same reason one line up.
  // `.gly-thread-edit-text` and `.gly-thread-edit-save` are in SEALED_VERBS,
  // and they exist only while a card's edit form is OPEN — the card renders
  // `edit` and `delete` at rest and swaps in the box and its save on the
  // press. Sealed with no card in edit, the coverage assertion below reports
  // `found: 0` for both, which is the check saying it has nothing to check
  // rather than the product having nothing to kill.
  //
  // AND THE CARD HAS TO EXIST FIRST. §13's revise sent the last round, so the
  // map is empty by the time this block runs — measured, `editing: false` on a
  // page that was behaving correctly. One instruction, filed the way the
  // composer files one, is the card this opens.
  //
  // AND IT IS A WHOLE-DOCUMENT INSTRUCTION, WHICH IS WHERE `edit` STILL LIVES.
  // This filed a `comment` on a phrase and waited for `.gly-rail
  // .gly-thread-edit` — the mark-anchored rail card's edit verb. That card is
  // deleted: a thread on a phrase is a pinned ROW under its block now, and the
  // spec's row offers `×` and nothing else, so the wait could only time out.
  // The verb itself is NOT deleted — the doc slot still renders a full card per
  // whole-document instruction, `edit` and `delete` both — and SEALED_VERBS
  // still names its two boxes, so the coverage assertion below still has a
  // subject. `comment_document` is the op that puts one there.
  await instruct({
    op: 'comment_document',
    text: 'still worth a sentence',
  });
  await page.waitForSelector('.gly-docslot .gly-thread-edit', {
    state: 'attached',
    timeout: 15000,
  });
  await page.waitForTimeout(600);
  const editing = await page.evaluate(() => {
    const b = document.querySelector('.gly-docslot .gly-thread-edit');
    if (!b) return false;
    b.click();
    return true;
  });
  await page.waitForTimeout(500);
  const editOpen = await page.evaluate(() => ({
    text: document.querySelectorAll('.gly-thread-edit-text').length,
    save: document.querySelectorAll('.gly-thread-edit-save').length,
  }));
  check(
    'an instruction is open for editing BEFORE the seal, so the seal has both edit boxes to kill',
    editing && editOpen.text > 0 && editOpen.save > 0,
    { editing, editOpen },
  );

  // AND THE VERDICT IS GIVEN SOMETHING TO ENTRUST. Without this the trust
  // exit sweeps a fixture clean, seals as a plain `approved`, and every claim
  // about the HANDOFF below takes its else branch forever — the shape CLAUDE.md
  // calls a fixture that certifies the bug. One unanswered document note is the
  // trust exit's own first case: the reviewer's remaining word, handed over.
  // It is filed HERE, in the last section, because it changes what the rail
  // holds and nothing after §8 reads that.
  // `/_galley/instruct`, NOT `/_galley/suggest`: the endpoint was renamed with
  // the mechanism, and the old path 404s — measured, `{filed: 404}`, on a
  // fixture that then sealed with nothing entrusted and took every else branch
  // below for the rest of the run.
  const filed = await page.evaluate(() =>
    fetch('/_galley/instruct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op: 'comment_document',
        text: 'tighten the closing paragraph',
        author: 'court',
      }),
    }).then((r) => r.status),
  );
  check(
    'a note the verdict can entrust was filed',
    filed === 200 || filed === 204,
    { filed },
  );
  await page.waitForTimeout(600);

  // AND WHAT EVERY ONE OF THEM PAINTS WHILE THE PAGE IS STILL LIVE, so the
  // seal's own claim can be read as a DIFFERENCE rather than as a flag. See
  // the check below the verdict for what this is for.
  const paintOfSealed = () =>
    page.evaluate(
      (sels) =>
        sels.map((sel) => {
          const el = document.querySelector(sel);
          if (!el) return { sel, found: false };
          const cs = getComputedStyle(el);
          return {
            sel,
            found: true,
            // PAINT AND NOT `cursor`: a disabled form control is handed `default`
            // by the user agent for free, and the check next door already excludes
            // the reply box from the pointer rule for exactly that reason. A
            // cursor is also nothing at all on a phone. What a reviewer LOOKS at is
            // the ink and the box, so that is what is read.
            paint: [
              cs.opacity,
              cs.color,
              cs.backgroundColor,
              cs.borderTopColor,
              cs.textDecorationLine,
            ].join(' | '),
          };
        }),
      SEAL_SELECTORS,
    );
  const livePaint = await paintOfSealed();

  await page.evaluate(() =>
    fetch('/_galley/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict: 'approve', trust: true }),
    }),
  );
  await page.waitForTimeout(3000); // one poll of the editor's own beat, plus room

  const readout = await page.evaluate(() => {
    const el = document.querySelector('#gly-seal');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      text: (el.textContent || '').trim(),
      display: cs.display,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      color: cs.color,
    };
  });
  check(
    'the verdict landed and the terminal readout is painted',
    !!readout &&
      readout.display !== 'none' &&
      /^(Approved|Discarded)/.test(readout.text),
    readout,
  );
  // THE TRUST EXIT'S READOUT SAYS WHERE THE WORK HAS GOT TO, and it is read
  // back against the SERVER'S own number rather than against a shape — the
  // page's whole remaining job under this verdict is to show the handoff land,
  // and a sentence that merely looks right while disagreeing with the server
  // is the same lie as no sentence at all.
  //
  // This verdict is `trust: true`, so the seal is `approved-entrusted` and the
  // clause is not optional: `N outstanding` while entrusted work is travelling,
  // `all applied` once it has landed. Written red-first — before the handoff
  // existed the readout stopped at "· 2 notes entrusted" and never moved again,
  // and this check found neither clause.
  //
  // AND THE NUMBER IS BOUNDED BY THE ONE BESIDE IT. `outstanding` was
  // pending+open, so the agent's own work in flight counted as more entrusted
  // work and the readout rendered `2 notes entrusted · 3 outstanding` — a
  // countdown counting up, past the number it counts down from. The server
  // reports the second population as `landing` now; both are read here, and
  // the bound is asserted rather than assumed.
  const handoff = await page.evaluate(async () => {
    const st = await fetch('/_galley/revise').then((r) => r.json());
    return {
      verdict: st.verdict,
      entrusted: st.entrusted,
      outstanding: st.outstanding,
      landing: st.landing,
    };
  });
  if (handoff.verdict === 'approved-entrusted') {
    const said =
      handoff.outstanding > 0
        ? `${handoff.outstanding} outstanding`
        : handoff.landing > 0
          ? `${handoff.landing} still landing`
          : 'all applied';
    check(
      "the terminal readout names the entrusted handoff, in the server's own numbers",
      !!readout &&
        readout.text.includes(`${handoff.entrusted} note`) &&
        readout.text.includes(said),
      { readout: readout && readout.text, handoff },
    );
    check(
      'and never reports more outstanding than was entrusted — the line counts DOWN',
      handoff.outstanding <= handoff.entrusted,
      { readout: readout && readout.text, handoff },
    );
  } else {
    check(
      'the terminal readout closes a review that entrusted nothing',
      !!readout && readout.text.includes('review closed'),
      { readout: readout && readout.text, handoff },
    );
  }
  // CHROME SPEAKS IN MONO AND AT THE CHROME SIZE — the palette rule the whole
  // bar follows. The document renders at 16px in the sans stack; a readout
  // that inherited either would read as part of the prose.
  check(
    'the readout is chrome, not prose — mono, and below the document size',
    !!readout &&
      readout.fontFamily.toLowerCase().includes('mono') &&
      parseFloat(readout.fontSize) < 16,
    readout,
  );

  // THE TWO TERMINAL VERBS ARE NOT PAINTED, SO THE FOUR CHECKS ON THEIR PAINT
  // ARE DELETED — and what is asserted instead is their ABSENCE, which is a
  // claim that can go red.
  //
  // They read `.gly-seal-reopen, .gly-seal-done` for four things: that both are
  // painted, in mono, below the document size; that each wears the bar's own
  // 1px edge (a seal rule overriding `border` would leave two words floating in
  // a bar, which is the cascade trap this stylesheet has a documented history
  // with); and that neither shouts at rest — Reopen shipped wearing the accent
  // and §1b caught it in the same run, because amber means ON, ARRIVED or HERE
  // and a terminal bar is a RECORD with two exits rather than a recommendation.
  //
  // `makeSeal` builds the group, sets it `hidden` and never appends it to the
  // bar: "approval is terminal in the rounds-only workflow", so there is no
  // reopen and no way to stop the editor from the page. `styleAll` over a
  // group that is not in the document returns `[]`, and `[].every(...)` is
  // `true` — every one of those four would have reported `ok` about paint
  // nobody can see, which is the pass-forever shape this file has recorded six
  // of. So the population is asserted at zero, deliberately and by name.
  const verbs = await styleAll('.gly-seal-reopen, .gly-seal-done', 'display');
  check(
    'the terminal bar renders no verbs — a sealed review is a record, with nothing to press',
    verbs.length === 0 || verbs.every((v) => v.display === 'none'),
    verbs,
  );
  check(
    'and the terminal readout is what the bar has instead, saying which ending it was',
    !!readout && readout.text.length > 0,
    readout,
  );

  // THE LIVE CONTROLS ARE GONE, and `display: none` is what that means. A
  // reserved box (`visibility: hidden`) would be the wrong mechanism here: it
  // holds space for a control that is coming back on the next click, and none
  // of these are.
  //
  // `#gly-editor-status` used to be in this list and is not, because it no
  // longer exists to retire: the bar has ONE readout now (`#gly-status`, the
  // shell's own), and a selector kept here for an element the bundle never
  // appends would report `absent` and pass forever — the dead-selector shape.
  // What replaces it is the claim that actually matters on a sealed page, and
  // it is asserted rather than dropped, below.
  //
  // THE SAFEGUARD AGAINST THAT SHAPE IS THE PREDICATE, NOT A SECOND CHECK.
  // `display === 'none'` is what runs, and it was written `=== 'none' ||
  // === 'absent'` — which is the form a selector matching nothing passes. The
  // tightening is the whole fix: a dead selector reports `absent`, and `absent`
  // is not `none`. The line below it was presented for a while as the guard
  // that catches a dead selector, and it cannot be: `none` already implies
  // `not absent`, so it can only go red in runs where the check above it is
  // already red. It is a NOTE now, which is what this file's own rule says to
  // do with a claim whose two sides are equal in every reachable state — it
  // still names WHICH selector went dead, which is worth reading when the
  // check above fails, and it no longer reports `ok` as though it had proved
  // something.
  //
  // AND `#gly-revise` IS NOT ONE OF THEM ANY MORE. It was, while the primary
  // stood in the bar; spec §5 keeps it on screen in the footer reading
  // `approved` — panel colours, muted, no glow, and genuinely `disabled` — so
  // the last thing the reviewer looks at says what they decided. Hiding it is
  // the one thing that would take that away, so it is checked as PRESENT and
  // DEAD below rather than as gone.
  const retired = await page.evaluate(() =>
    // `.gly-census` was the fourth and is deleted; a dead selector here would
    // report `absent`, which this check is sharpened to refuse.
    ['.gly-mode', '.gly-hold'].map((sel) => {
      const el = document.querySelector(sel);
      return { sel, display: el ? getComputedStyle(el).display : 'absent' };
    }),
  );
  check(
    'the live controls are off the bar entirely — this bar is a record, and an absent selector is not a pass',
    retired.every((r) => r.display === 'none'),
    retired,
  );
  // THE PRIMARY STAYS, AND IT SAYS WHAT WAS DECIDED (spec §5). Present, laid
  // out, reading `approved`, disabled, and painted in the panel's own muted
  // colours rather than the accent fill it wears while a review is live —
  // "dead" must not read as "pressable but dim" on the one control that hands
  // the document to somebody else.
  const sealedPrimary = await page.evaluate(() => {
    const el = document.querySelector('#gly-revise');
    if (!el) {
      return { present: false };
    }
    const cs = getComputedStyle(el);
    return {
      present: true,
      display: cs.display,
      text: el.innerText.trim(),
      disabled: el.disabled === true,
      shadow: cs.boxShadow,
      cursor: cs.cursor,
      width: +el.getBoundingClientRect().width.toFixed(2),
    };
  });
  check(
    'the primary is still on screen at the end, reading `approved` and dead',
    sealedPrimary.present &&
      sealedPrimary.display !== 'none' &&
      sealedPrimary.text === 'approved' &&
      sealedPrimary.disabled &&
      sealedPrimary.shadow === 'none' &&
      sealedPrimary.cursor === 'default',
    sealedPrimary,
  );
  note(
    'which of them the page actually had to retire — subsumed by the check above (none implies not-absent), kept to name the culprit when it goes red',
    retired.filter((r) => r.display === 'absent').map((r) => r.sel),
  );

  // THE ONE READOUT SURVIVES THE SEAL, AND SAYS LESS. It is where a reopen's
  // reason lands, so hiding it would take the agent's only channel to a
  // reviewer sitting on a sealed page. What it must NOT still say is the
  // standing sentence: `your edits apply — the agent proposes` is false of a
  // page whose editor is not editable, and printing it there would be the
  // chrome contradicting the document.
  const sealedReadout = await page.evaluate(() => {
    const el = document.querySelector('#gly-status');
    if (!el) return null;
    return { display: getComputedStyle(el).display, text: el.textContent };
  });
  check(
    'the readout is still on the sealed bar — a reopen has to land somewhere',
    !!sealedReadout && sealedReadout.display !== 'none',
    sealedReadout,
  );
  check(
    "and it no longer claims the reviewer's edits apply, because they do not",
    !!sealedReadout && !sealedReadout.text.includes('your edits apply'),
    sealedReadout,
  );

  // REACHABILITY, on the same terms §7a sweeps the live bar. It swept
  // `.gly-seal-reopen` and `.gly-seal-done` at six widths — a rect inside the
  // window is not a control the reviewer can press — and there are no terminal
  // verbs to press, so the sweep is deleted with them. THE READOUT IS SWEPT IN
  // THEIR PLACE, because the claim the sweep was making about the terminal bar
  // survives the verbs leaving it: whatever this bar carries has to be inside
  // the window at every width, and a record nobody can read at 390px is the
  // same defect wearing a quieter coat.
  for (const width of [1600, 1200, 992, 900, 600, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    const probe = await page.evaluate(() => {
      const el = document.querySelector('#gly-seal');
      if (!el) return { missing: true };
      const r = el.getBoundingClientRect();
      const bar = document.querySelector('.gly-bar');
      const b = bar.getBoundingClientRect();
      return {
        inside:
          r.x >= 0 && r.x + r.width <= window.innerWidth + 0.5 && r.width > 0,
        clipped: el.scrollWidth > el.clientWidth + 1,
        x: +r.x.toFixed(1),
        right: +r.right.toFixed(1),
        w: +r.width.toFixed(1),
        win: window.innerWidth,
        barSpill: +(bar.scrollWidth - bar.clientWidth).toFixed(1),
        barH: +b.height.toFixed(1),
        text: (el.textContent || '').trim().slice(0, 40),
      };
    });
    check(
      `the terminal readout is inside the window at ${width}px`,
      !probe.missing && probe.inside,
      probe,
    );
  }
  await page.setViewportSize(WIDE);
  await page.waitForTimeout(600);

  // AND A CARD'S VERBS LOOK AS DEAD AS THEY ARE. `.gly-bar button[disabled]`
  // dims and un-points the bar's own controls; a card's verbs get the same
  // treatment from their own container rule, and this reads it back off a real
  // card rather than trusting either declaration.
  //
  // IT WAS RAIL-SCOPED AND COULD NOT STAY THAT WAY. This section's approve
  // leaves the document SETTLED — `0 pending`, every thread resolved — and the
  // rail holds live work only, so on the page this check actually runs against
  // the rail is one notice and no cards at all. It used to find verbs there
  // because the rail carried the settled region, and every settled card wears
  // `↺ reopen`, `delete` and a reply box. Those cards are the SHEET's now.
  //
  // So the scope is every surface a card renders on, which is what the claim
  // was always about — and the non-vacuity guard below is what stops that from
  // being a widening that quietly reads nothing. The sheet keeps its last
  // render while hidden, which is why it answers here at all.
  //
  // WHAT A SEALED PAGE CANNOT DO IS OPEN IT, and that is a real cost of the
  // move, stated rather than smoothed over: the seal hides the census strip, so
  // the count — the door to the sheet — goes with it, and a sealed review's
  // settled conversations are not browsable until Reopen. It is coherent
  // rather than merely tolerable: every verb on such a card is dead while
  // sealed (this check is that fact), so there is nothing to do with one, and
  // the single press that changes that is the press that brings the door back.
  //
  // THE MITIGATION COVERS NOTES, AND ONLY NOTES — stated narrowly because the
  // first version of this paragraph said "nothing is invisible-but-present" and
  // that is wider than the evidence. `paintNoteState` marks a settled NOTE as
  // settled in the prose, so a `{>>…<<}` still has a visible trace on a sealed
  // page. A settled RANGE comment has none: resolving lifts its highlight — the
  // asymmetry CLAUDE.md's two-verbs entry is about — so while the page is
  // sealed that conversation has no surface at all. Nothing is LOST (the
  // sidecar holds it whole, and `galley pending` prints it), and Reopen brings
  // the door back; but on this page, for that population, the honest word is
  // "notes" rather than "nothing".
  // THE SELECTORS ARE THE ONES THE PRODUCT BUILDS, AND ONLY THOSE. This list
  // named six controls that no longer exist — `.gly-card-accept` and
  // `.gly-card-reject` (the proposal card's pair), `.gly-thread-resolve` and
  // `.gly-thread-reply` (the two conversation verbs), on both surfaces — and a
  // group query silently drops what it cannot match, so `dead.length > 0` and
  // `dead.every(disabled)` below were being satisfied by the two verbs that DO
  // exist while reading as coverage of six. That is the vacuous shape this file
  // records six of, in the very block whose job is to catch it: an instruction
  // is immutable work for the next round, so `threadCard` builds edit and
  // delete and nothing else.
  const dead = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        '.gly-rail .gly-thread-edit, .gly-docslot .gly-thread-delete, ' +
          '.gly-sheet .gly-thread-edit, .gly-sheet .gly-thread-delete',
      ),
    ).map((el) => ({
      cls: el.classList[0],
      where: el.closest('.gly-sheet') ? 'sheet' : 'rail',
      disabled: !!el.disabled,
      cursor: getComputedStyle(el).cursor,
    })),
  );
  check(
    'a sealed review still has card verbs to look at',
    dead.length > 0,
    dead.length,
  );
  check(
    'and every one of them is dead — a sealed review shows its record and takes no input',
    dead.every((d) => d.disabled),
    dead.filter((d) => !d.disabled),
  );
  // THE WHOLE LIST, ON BOTH EDGES. The reads above and below are rail-scoped
  // on purpose — the pointer rule is a card rule — but the seal's claim is
  // about SEALED_VERBS entire, so it is read entire, off the app's own
  // constant. A selector that matches nothing on this fixture is reported as a
  // failure rather than passing vacuously: a check with nothing to read is not
  // a check, and this is the fixture where a missing surface would hide the
  // reopen failure below.
  const sealedAll = await page.evaluate(
    (sels) =>
      sels.map((sel) => ({
        sel,
        found: document.querySelectorAll(sel).length,
        live: Array.from(document.querySelectorAll(sel))
          .filter((el) => !el.disabled)
          .map((el) => el.className),
      })),
    SEAL_SELECTORS,
  );
  check(
    'every selector a sealed review must kill has something to kill on this fixture',
    sealedAll.every((s) => s.found > 0),
    sealedAll.filter((s) => !s.found),
  );
  // THE BOOKKEEPING HALF OF THE INVARIANT. `SEAL_ONLY_VERBS` names the
  // elements the seal owns in both directions; an entry in it that no longer
  // matches anything the seal kills is an element being re-enabled by a
  // function that never disabled it, and the pair would have quietly drifted.
  const orphanCover = await page.evaluate(
    (only) =>
      only.map((sel) => ({
        sel,
        found: document.querySelectorAll(sel).length,
        killed: Array.from(document.querySelectorAll(sel)).every(
          (el) => !!el.disabled,
        ),
      })),
    SEAL_ONLY_VERBS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  check(
    'and each verb the seal owns outright is present and killed by it',
    orphanCover.every((o) => o.found > 0 && o.killed),
    orphanCover,
  );
  check(
    'and the seal killed all of them, census strip and composer included',
    sealedAll.every((s) => s.live.length === 0),
    sealedAll.filter((s) => s.live.length),
  );
  // NO EXEMPTION LEFT TO MAKE. `.gly-thread-reply` was excluded here because a
  // textarea's cursor is `text` and not `pointer`; the reply box is deleted with
  // the conversation verbs, and every control this now reads is a button.
  check(
    'and none of them still offers a pointer, which would say otherwise',
    dead.every((d) => d.cursor !== 'pointer'),
    dead.filter((d) => d.cursor === 'pointer'),
  );

  // AND THE ONE CONTROL THAT INVITES TYPING HAS TO LOOK AS DEAD AS THE REST.
  //
  // THE EXCLUSION DIRECTLY ABOVE IS THE HOLE. `.gly-thread-reply` is exempted
  // from the pointer rule because a textarea's cursor is `text` and not
  // `pointer` — correct as far as it goes, and it left the reply box read by no
  // appearance check at all. Every other claim on this page reads the `disabled`
  // FLAG, which the box has always carried. Measured on a real sealed page:
  // `disabled: true`, `opacity: 1`, `background: rgba(0,0,0,0)`, `border:
  // rgb(227,229,236)`, `placeholder: "reply…"` — pixel-identical to the live
  // one two seconds earlier, while `✓ resolve` and `delete` beside it dimmed
  // correctly. A closed review went on asking for a reply.
  //
  // It is three elements and not one, which is why this reads the constant
  // whole rather than the box that was reported: `.gly-bubble/.gly-card/
  // .gly-composer button[disabled]` covers every BUTTON in SEALED_VERBS and
  // nothing covered the three text boxes — `.gly-thread-reply`,
  // `.gly-overall-input` and `.gly-composer-text`. Fixing the reported one and
  // missing the other two is this repository's own pattern.
  //
  // THE CLAIM IS A DIFFERENCE, not a value: whatever the dead vocabulary is,
  // a reviewer must be able to see that the control changed. Reading it as
  // "opacity is 0.55" would pin one treatment and go green the day some other
  // one replaced it; reading it as live-versus-sealed cannot. Both edges are
  // required to have found the element, so a selector that matches nothing
  // fails here rather than passing with two undefineds that happen to be equal.
  const sealedPaint = await paintOfSealed();
  const paintPairs = sealedPaint.map((s, i) => ({
    sel: s.sel,
    found: s.found && livePaint[i].found,
    live: livePaint[i].paint,
    sealed: s.paint,
    changed: s.found && livePaint[i].found && s.paint !== livePaint[i].paint,
  }));
  check(
    'every selector the seal kills was on screen both live and sealed, so this can fail',
    paintPairs.every((p) => p.found),
    paintPairs.filter((p) => !p.found),
  );
  check(
    'and every one of them PAINTS differently once it is dead — including the boxes that invite typing',
    paintPairs.every((p) => p.changed),
    paintPairs.filter((p) => !p.changed),
  );

  // AND THE REOPEN HALF OF §8 IS DELETED WITH THE BUTTON THAT DROVE IT.
  //
  // Everything from here to the end of this section pressed `.gly-seal-reopen`
  // and read the page it handed back: that the whole live bar returned, that
  // every selector in SEALED_VERBS was enabled again on every surface, that a
  // reopened page could still open the whole-document panel and still place the
  // composer, and — the sharpest of them — that the unseal EDGE itself ran the
  // painters, with the 1500ms tick stubbed out so a `refreshPending` a second
  // later could not rescue the page and be mistaken for the press doing it.
  // That last one was the whole reason §8a exists, and it was shown red by
  // deleting the two `applySeal` repaint calls.
  //
  // `makeSeal` builds `.gly-seal-reopen` and `.gly-seal-done` into a group it
  // sets `hidden` and never appends to the bar: "approval is terminal in the
  // rounds-only workflow", so there is no reopen to press and no editor to stop
  // from the page. A `locator('.gly-seal-reopen').click()` waits thirty seconds
  // for actionability and then throws — an error, not a failing check, which is
  // how this was found.
  //
  // WHAT THE DELETION COSTS IS ON THE RECORD. The invariant SEAL_ONLY_VERBS
  // states — every selector in SEALED_VERBS either has a painter the unseal
  // edge runs, or is in SEAL_ONLY_VERBS and is re-enabled explicitly on that
  // edge — is now asserted on ONE side only: §8 above still reads the whole
  // constant on the SEALED page, so a control the seal fails to kill is still
  // caught, and §8a still holds the live page's own flags. The unseal edge has
  // no gate at all, because the product has no unseal. If a reopen ever
  // returns, this block is what has to return with it, and it is written out
  // here rather than deleted silently so that whoever adds the button can find
  // the four checks it owes.
  await page.evaluate(() => {
    const app = window.galleyEdit.app;
    if (app.__tick) app.tick = app.__tick;
    if (app.__paintCensus) app.paintCensus = app.__paintCensus;
  });
}

await browser.close();
server.kill('SIGTERM');

console.log(failures ? `\n${failures} failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
