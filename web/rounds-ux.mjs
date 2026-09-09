import { spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
// THE GATE READS THE APP'S OWN CONSTANTS, not a copy of them — the discipline
// web/layers.mjs already states for SEALED_VERBS. A hand-copied label here goes
// stale the moment the button is renamed, and the check keeps reporting `ok`
// about a control it can no longer find.
import { CAPTURE_LABEL } from './history.ts';

const GALLEY = process.env.GALLEY || 'bin/galley';
const PORT = Number(process.env.PORT || 8258);
const dir = mkdtempSync(join(tmpdir(), 'galley-history-ux-'));
const doc = join(dir, 'history-ux.md');
// THE SECOND PARAGRAPH EXISTS FOR THE GHOST, AND ITS PUNCTUATION IS THE POINT.
// A ghost sitting mid-sentence has an inserted word or an ordinary space on
// its right, and the trail's one-sided `margin-right` reads correctly there —
// which is why the orphan-space defect survived every fixture this repository
// had. The clause that ENDS a sentence is the shape that fails: strike it and
// the full stop is all that is left to the ghost's right, so the margin meant
// to separate two words becomes a space before a full stop. `is told, .`
writeFileSync(
  doc,
  '# A careful review\n\nThe retry budget should stay explicit and readable.\n\n' +
    'Nothing else in the pipeline is told, which is a gap worth closing.\n',
);

const server = spawn(
  GALLEY,
  ['edit', doc, '--no-open', '--port', String(PORT), '--on-revise', 'true'],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let serverOutput = '';
server.stdout.on('data', (d) => {
  serverOutput += d;
});
server.stderr.on('data', (d) => {
  serverOutput += d;
});

let browser;
let childURL = '';
let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`ok    ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// A SELECTION SET THROUGH THE DOM IS A RACE, AND ESC IS WHAT MAKES IT ONE.
// onKey's Escape hands focus back to the page on purpose ("the way out of the
// field and into the stepper"), so a phrase selected straight afterwards lands
// in a contenteditable that is not focused: ProseMirror re-reads the DOM
// selection on the way back in, sometimes sees the EMPTY one the blur left
// behind, and `composerPlacement` correctly answers `hide` — after this helper
// had already seen the composer visible. Measured 3 runs in 5 with the composer
// root back to `hidden` and the phrase still selected in the window. Focusing
// the element first did not fix it; the two reads still interleave.
//
// So the selection is made THROUGH THE EDITOR, which is `web/layers.mjs`'s own
// pattern for exactly this reason: a `setTextSelection` is one transaction, and
// there is no second reading of the DOM for it to lose to. The DOM selection is
// still what a reviewer's mouse would leave — ProseMirror writes it back — so
// `selectionBox` reads the same rectangle it always did.
//
// And the wait is for the state the callers actually use — the affordance on
// screen — rather than for the container merely not being hidden. Waiting on a
// proxy for the thing you are about to click is how a gate reports green over a
// surface that is not there yet.
async function selectPhrase(page, phrase) {
  await page.waitForFunction(
    (want) =>
      !!window.galleyEdit?.editor?.state?.doc?.textContent?.includes(want),
    phrase,
  );
  await page.evaluate((want) => {
    const editor = window.galleyEdit.editor;
    let at = null;
    editor.state.doc.descendants((node, pos) => {
      if (at !== null || !node.isTextblock) {
        return at === null;
      }
      const i = node.textContent.indexOf(want);
      if (i !== -1) {
        at = pos + 1 + i;
      }
      return false;
    });
    if (at === null) {
      throw new Error(`fixture text not found: ${want}`);
    }
    editor.commands.focus();
    editor.commands.setTextSelection({ from: at, to: at + want.length });
    editor.view.focus();
  }, phrase);
  // THE FORM IS WHAT A SELECTION OPENS NOW (spec §1) — there is no
  // `Add instruction` press between the two — so the box the reviewer types
  // into is what says the composer is ready.
  //
  // AND THE ANCHOR IS READ OFF THE EDITOR, NOT OFF `window.getSelection()`.
  // Opening the box focuses the textarea, which takes the DOM selection with
  // it — so that clause went permanently false the moment the box appeared,
  // which is the harness measuring a side effect of its own success. The
  // editor's own selection is the anchor the composer was placed from and the
  // one `sendComment` posts.
  await page.waitForFunction((want) => {
    const root = document.querySelector('.gly-composer');
    const form = document.querySelector('.gly-composer-form');
    const st = window.galleyEdit?.editor?.state;
    const sel = st
      ? st.doc.textBetween(st.selection.from, st.selection.to, ' ')
      : '';
    return (
      !!root &&
      !root.hidden &&
      !!form &&
      form.offsetParent !== null &&
      sel === want
    );
  }, phrase);
}

async function selectRetryBudget(page) {
  return selectPhrase(page, 'retry budget');
}

// The RENDERED text of a selector, or null where nothing matches. A missing
// element must FAIL a check and not throw the run away: a gate that dies on the
// first absence reports one red where there are several, and the several are
// what say whether the diagnosis is right.
async function textOf(page, selector) {
  if ((await page.locator(selector).count()) === 0) {
    return null;
  }
  return (await page.locator(selector).innerText()).trim();
}

// The selection's own box, read the way the reviewer sees it: the range the
// composer is about to be placed against, in viewport coordinates.
function selectionBox(page) {
  return page.evaluate(() => {
    const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left };
  });
}

// Every top-level block of the prose, keyed by position. THE PROSE MAY NOT
// REFLOW when the composer opens — the composer is `position: absolute` on
// `document.body` precisely so it cannot, and this is what keeps it that way.
function proseRects(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.ProseMirror > *')].map((el, i) => {
        const r = el.getBoundingClientRect();
        return [
          `${i}:${el.tagName}`,
          [
            +r.x.toFixed(2),
            +r.y.toFixed(2),
            +r.width.toFixed(2),
            +r.height.toFixed(2),
          ],
        ];
      }),
    ),
  );
}

// THE GESTURE IS MADE AGAIN IF THE BOX GOES, and that is a fact about the
// product rather than about this harness. A selection opens the box directly
// now (spec §1), and a selection is something the page can lose without the
// reviewer doing anything: the document is rebuilt whenever a projection or a
// remote edit lands, and a rebuilt document has no selection in it. galley
// keeps a box the reviewer is IN or has WRITTEN in (composer.ts's hide branch,
// and the editor's blur timer) — an empty one it has just opened is not worth
// defending, and reopening it is the same one gesture. So this loop is what a
// reviewer does: select the words again. Each attempt is bounded so a box that
// never opens fails as a timeout rather than hanging the run.
async function addRangeInstruction(page, text) {
  let filed = false;
  for (let attempt = 0; attempt < 6 && !filed; attempt += 1) {
    await selectRetryBudget(page);
    try {
      await page.fill('.gly-composer-text', text, { timeout: 3000 });
      await page.click('.gly-composer-send', { timeout: 3000 });
      filed = true;
    } catch {
      // The box closed under us between the wait and the write. Select again.
    }
  }
  if (!filed) {
    throw new Error('the composer never stayed open long enough to file');
  }
  await page.waitForFunction(
    async () =>
      (await (await fetch('/_galley/pending')).json()).instructions.length ===
      1,
  );
}

// THE HANDLE IS THE SHEET'S OWN SLOT NOW, AND IT DOES NOT TOGGLE. It was the
// rail's first card and it toggled — so a second unconditional click on an
// already-open form shut it and the fill that followed landed on a hidden
// textarea, which is why every site that files one goes through here. It went
// to the bar, and then (Task 7) to `.gly-docslot-add`, the dashed row at the
// head of the sheet; through all three placements it only ever OPENS, so
// pressing it twice is idempotent rather than destructive. The visibility guard
// is kept as a guard against pressing a control that is already doing its job,
// not against undoing it.
async function addOverallInstruction(page, text, want) {
  if (!(await page.locator('.gly-capture').isVisible())) {
    await page.click('.gly-docslot-add');
  }
  await page.fill('.gly-overall-input', text);
  await page.locator('.gly-overall-input').press('Enter');
  await page.waitForFunction(
    async (n) =>
      (await (await fetch('/_galley/pending')).json()).instructions.length ===
      n,
    want,
  );
}

// What the right-click menu is offering, as the labels a reviewer reads. One
// reader because the check is made twice — once with nothing selected and once
// with a passage selected — and the whole claim is that the SAME gesture reads
// differently, which two spellings of the read could quietly stop being.
async function menuRows(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.gly-menu-item')].map((b) =>
      b.querySelector('.gly-menu-label').textContent.trim(),
    ),
  );
}

// THE FILE IS THE RECORD, AND THIS READS IT OFF DISK RATHER THAN OFF THE WIRE.
// A projection is debounced, so the bytes arrive a moment after the mutation
// that caused them; polling the real path is the only way to assert about what
// the author's editor would open.
async function waitForDisk(re, ms = 6000) {
  const until = Date.now() + ms;
  let last = '';
  for (;;) {
    try {
      last = readFileSync(doc, 'utf8');
    } catch {
      last = '';
    }
    if (re.test(last)) return last;
    if (Date.now() > until) return last;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function ack(page, state, note = '') {
  return page.evaluate(
    async ({ ackState, ackNote }) => {
      const response = await fetch('/_galley/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: ackState, note: ackNote }),
      });
      return response.status;
    },
    { ackState: state, ackNote: note },
  );
}

try {
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  browser = await chromium.launch(
    process.env.GALLEY_CHROME
      ? { executablePath: process.env.GALLEY_CHROME }
      : {},
  );
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  let dialogs = 0;
  page.on('dialog', async (dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ProseMirror');
  // The bar's readout is the fixed grammar now, so waiting for it is waiting
  // for the first round count to have landed — which is what this used to do
  // by watching the History chip's count, before the count left the chip.
  await page.waitForFunction(() =>
    /(v1|round \d+) · (draft|with the agent|settled)/.test(
      document.querySelector('#gly-status')?.innerText || '',
    ),
  );

  // THE CHIP FOLLOWED THE COUNT OUT OF THE BAR, AND THE STRIP WENT WITH IT.
  // `Instructions · N` left first — the count now sits on the verb it is a
  // count of — and `History` has followed: the record is reached by scrubbing
  // the timeline, at every width, so the bar's group of view doors has nothing
  // left in it and `.gly-census` is deleted. Three checks are retired with it
  // and named rather than dropped silently: `History is the bar's one view
  // chip`, `the Instructions chip is gone at wide widths`, and, earlier,
  // `Instructions remains usable at zero`. What replaces them is the claim
  // underneath all three — the bar carries readouts and verbs and no doors —
  // asserted directly, plus the scrubber's own reachability in §5 below.
  const barControls = await page.evaluate(() =>
    [...document.querySelectorAll('.gly-bar button')]
      .filter((b) => getComputedStyle(b).display !== 'none')
      .map((b) => b.className),
  );
  check(
    'the bar carries no view door at all — the census strip is gone',
    !(await page.$('.gly-census')) &&
      barControls.every((c) => !/census|versions/.test(c)),
    JSON.stringify(barControls),
  );

  // --- the drawer: neighbours, the palette, and a child editor ---
  //
  // Three claims the server-side tests cannot make in a browser: the path in
  // the bar opens the listing, Cmd+K is the same listing with the filter
  // focused, and choosing a row lands on a SECOND editor this one started —
  // which then dies with it.
  writeFileSync(join(dir, 'sibling.md'), '# Sibling\n\nA neighbour.\n');
  mkdirSync(join(dir, 'sub'), { recursive: true });
  writeFileSync(
    join(dir, 'sub', 'page.html'),
    '<!doctype html><html><body><p>A page.</p></body></html>\n',
  );
  const ws = await (await fetch(`${base}/_galley/workspace`)).json();
  check(
    'the workspace lists the fixture and its two neighbours, and knows which is current',
    ws.docs.length === 3 &&
      ws.current === 'history-ux.md' &&
      ws.docs.filter((d) => d.current).length === 1 &&
      ws.docs.some((d) => d.path === 'sub/page.html' && d.kind === 'html'),
    ws,
  );
  await page.click('.gly-doc-path');
  await page.waitForSelector('.gly-drawer:not([hidden])');
  await page.waitForFunction(
    () => document.querySelectorAll('.gly-drawer-row').length === 3,
  );
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.gly-drawer-row')).map((r) => ({
      path: r.dataset.path,
      state: r.querySelector('.gly-drawer-state').textContent,
      current: r.classList.contains('is-current'),
    })),
  );
  check(
    'the path in the bar opens the drawer, with one row per document and the states read off the rounds',
    rows.length === 3 &&
      rows.find((r) => r.path === 'sibling.md')?.state === 'untouched' &&
      rows.find((r) => r.path === 'history-ux.md')?.current === true,
    JSON.stringify(rows),
  );
  const drawerBarBefore = await page.evaluate(
    () => document.querySelector('.gly-doc-path').getBoundingClientRect().width,
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector('.gly-drawer[hidden]', { state: 'attached' });
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+k' : 'Control+k',
  );
  await page.waitForSelector('.gly-drawer:not([hidden])');
  await page.waitForFunction(
    () => document.querySelectorAll('.gly-drawer-row').length === 3,
  );
  const focused = await page.evaluate(() => document.activeElement?.className);
  await page.keyboard.type('sib');
  const filtered = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.gly-drawer-row')).map(
      (r) => r.dataset.path,
    ),
  );
  check(
    'Cmd+K opens the drawer with the filter focused, and typing narrows the rows',
    focused === 'gly-drawer-filter' && filtered.join() === 'sibling.md',
    JSON.stringify({ focused, filtered }),
  );
  const drawerBarAfter = await page.evaluate(
    () => document.querySelector('.gly-doc-path').getBoundingClientRect().width,
  );
  check(
    'and the toggle kept its box while it opened and closed',
    Math.abs(drawerBarBefore - drawerBarAfter) <= 1,
    { drawerBarBefore, drawerBarAfter },
  );
  const opened = await (
    await fetch(`${base}/_galley/workspace/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'sibling.md' }),
    })
  ).json();
  const childOk = opened.url && (await fetch(opened.url)).ok;
  check(
    'opening a neighbour starts a child editor that answers',
    !!childOk,
    opened,
  );
  const ws2 = await (await fetch(`${base}/_galley/workspace`)).json();
  check(
    'and the listing now shows it live',
    ws2.docs.find((d) => d.path === 'sibling.md')?.url === opened.url,
    ws2,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.gly-drawer[hidden]', { state: 'attached' });
  childURL = opened.url;

  // At load nothing is pending, so the verdict on offer is Approve, and the
  // footer's `.gly-approve-zero` face is fg-on-bg with no glow — see
  // paintRevise's face-class toggle and editor.css's `/* --- the footer
  // --- */` section. The filled-with-the-signal-colour face belongs to the
  // Revise state (a pending instruction), asserted where the count first
  // appears below.
  const primaryPaint = await page.evaluate(() => {
    const el = document.getElementById('gly-revise');
    const s = getComputedStyle(el);
    const fg = getComputedStyle(document.documentElement)
      .getPropertyValue('--gly-fg')
      .trim();
    const probe = document.createElement('span');
    probe.style.color = fg;
    document.body.appendChild(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return { bg: s.backgroundColor, radius: s.borderTopLeftRadius, want };
  });
  check(
    'the primary is filled with fg-on-bg at zero pending, 8px',
    primaryPaint.bg === primaryPaint.want && primaryPaint.radius === '8px',
    JSON.stringify(primaryPaint),
  );
  // --- WHERE CAPTURE LIVES, AND IT IS THE SHEET'S OWN HEAD ---
  //
  // THIS CHECK HAS BEEN INVERTED TWICE AND EACH INVERSION IS A RULING. It read
  // `the whole-document affordance is in the instruction rail` and was green
  // over both of the defects Court reported: the affordance scrolled out of
  // reach, and opening it slid every anchored card 39.29px off its mark. It
  // then read `the door is in the bar, beside History`, which fixed both by
  // making capture chrome. Task 7's frame gives the third and last answer: a
  // dashed full-width row in `.gly-docslot`, ABOVE THE PAPER, where the
  // instructions it makes are also filed — document-level and beside the thing
  // it is about at the same time, which neither of the first two placements
  // was. It says that now, in the same shape and in the same place, so a
  // regression to either earlier placement is a red check rather than a
  // discovery.
  const slotDoor = await page.evaluate(() => {
    const b = document.querySelector('.gly-docslot-add');
    if (!b) return null;
    const paper = document.querySelector('.ProseMirror');
    return {
      label: b.textContent,
      inSlot: !!b.closest('.gly-frame .gly-docslot'),
      inBar: !!b.closest('.gly-bar'),
      abovePaper:
        b.getBoundingClientRect().bottom <= paper.getBoundingClientRect().top,
    };
  });
  check(
    'capture is the sheet’s own head — a dashed row in the whole-doc slot, above the paper',
    !!slotDoor &&
      slotDoor.label === CAPTURE_LABEL &&
      slotDoor.inSlot &&
      !slotDoor.inBar &&
      slotDoor.abovePaper,
    JSON.stringify(slotDoor),
  );
  // The two `.gly-rail …` clauses that stood here were counts of zero inside a
  // container the branch deleted, so they could not fail. What survives is the
  // claim that can: there is exactly ONE capture door on the page, and the bar
  // is not where it is.
  check(
    'and there is exactly one capture control, and the bar does not carry it',
    (await page.locator('.gly-capture-open').count()) === 1 &&
      (await page.locator('.gly-bar .gly-capture-open').count()) === 0 &&
      (await page.locator('.gly-overall-toggle').count()) === 0,
  );
  // AND AT THE FOOT OF THE DOCUMENT IT IS THE RIGHT-CLICK THAT ANSWERS. §13's
  // "reachable at any scroll position" was a claim about the BAR, which is
  // sticky; the slot is not, and asserting it visible from the bottom of a long
  // document would be asserting something false. The gesture that is available
  // everywhere is the context menu (web/menu.ts), so that is what is checked
  // from down there — and the slot itself is checked to come back with the
  // document rather than to follow the viewport.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  await page.click('.ProseMirror p', { button: 'right' });
  await page.waitForSelector('.gly-menu:not([hidden])');
  check(
    'at the foot of the document the right-click still offers the whole-file instruction',
    await page.isVisible(
      '.gly-menu-item:has-text("Instruction on the whole document")',
    ),
  );
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  check(
    'and the slot comes back with the document',
    await page.isVisible('.gly-docslot-add'),
  );

  // `the empty rail teaches instead of repeating what the primary already says`
  // — RETIRED WITH THE TEACH CARD. It read `HOW THIS WORKS — select any words
  // in the document to ask for a change` off a dashed card in the rail's
  // margin, and the rail is deleted: the card was the last thing it drew, at
  // the right of a page whose design has no right-hand column. What it said is
  // on screen without it, and both halves are asserted where they now live —
  // the slot's own empty line (`the whole-doc slot says where an instruction
  // goes`, layers.mjs §14) and the `?` sheet's five gestures (probe.mjs,
  // `help has the five gestures`).

  // --- ONE NOUN, ONE VERB, NO SYSTEM RING ---
  //
  // The surface is called Instructions, the card it makes says INSTRUCTION,
  // and the button that made one said `comment`: two nouns and a third verb
  // for one object, on the FIRST gesture a reviewer makes. Every check here
  // reads the reviewer-visible string off a real page rather than the constant
  // behind it, for the reason CLAUDE.md records — a check that reads a proxy is
  // green through every defect that lives in the words.
  await selectRetryBudget(page);
  const selBox = await selectionBox(page);
  const proseBefore = await proseRects(page);
  // `the affordance that opens the composer says what it makes` — RETIRED WITH
  // THE AFFORDANCE. It read `Add instruction` off `.gly-comment-button`, the
  // press that stood between selecting words and getting a box. Spec §1 gives
  // the selection itself that job, so there is no label to read: what the
  // gesture makes is said by the composer's HEAD (`INSTRUCTION · ON "…"`,
  // checked a few lines down) and by the verb that files it, below.
  const openedOnSelection = await page.evaluate(() => {
    const form = document.querySelector('.gly-composer-form');
    return !!form && !form.hidden && form.offsetParent !== null;
  });
  check(
    'selecting words opens the box itself — no press in between',
    openedOnSelection === true,
  );
  const send = await textOf(page, '.gly-composer-send');
  check(
    // Task 8 restyles the send verb to a keyboard-shaped whisper — Enter
    // already pins the instruction (submitOnEnter), and the button now says
    // so rather than repeating the popover's own affordance label.
    'the button names what it makes',
    send === '↵ pin',
    JSON.stringify(send),
  );
  check(
    'the composer offers a visible cancel',
    (await page.locator('.gly-composer-cancel').count()) > 0 &&
      (await page.isVisible('.gly-composer-cancel')),
  );
  const esc = await textOf(page, '.gly-composer-esc');
  check(
    'and whispers the key that does the same thing',
    esc === 'esc cancels',
    JSON.stringify(esc),
  );
  // innerText and not textContent: the head is uppercased in CSS, so the
  // rendered string is the only one a reviewer ever reads, and asserting the
  // source string would pass with the transform deleted.
  const head = await textOf(page, '.gly-composer-head');
  check(
    'the head quotes the anchor the instruction is about',
    head === 'INSTRUCTION \u00b7 ON "RETRY BUDGET"',
    JSON.stringify(head),
  );

  // A PER-ELEMENT CLASS LOSES TO ITS OWN CONTAINER. `.gly-composer button`
  // dictates the border, background, colour and radius of everything in here,
  // so `Add instruction` written as a bare class renders as an ordinary grey
  // pill beside `cancel` — which is what `.gly-thread-delete` did for a whole
  // phase, in this same stylesheet, and is why the paint is read off a real
  // page rather than trusted to the declaration.
  const verbs = await page.evaluate(() => {
    const send = getComputedStyle(document.querySelector('.gly-composer-send'));
    const cancel = getComputedStyle(
      document.querySelector('.gly-composer-cancel'),
    );
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement)
      .getPropertyValue('--gly-accent')
      .trim();
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return {
      sendBg: send.backgroundColor,
      sendWeight: send.fontWeight,
      cancelBg: cancel.backgroundColor,
      cancelBorder: cancel.borderTopColor,
      accent,
    };
  });
  check(
    // Task 8 moves the send verb off the instruction colour (coral, `--gly-hl`)
    // and onto the acid accent — the bar's own `↳` and the eyebrow already
    // read as instruction chrome, so the loud fill is free to be the product's
    // one action colour instead.
    'the verb that makes the instruction is filled with the accent colour',
    verbs.sendBg === verbs.accent && Number(verbs.sendWeight) >= 600,
    JSON.stringify(verbs),
  );
  check(
    'and the way out is not a second one — borderless, unfilled',
    verbs.cancelBg === 'rgba(0, 0, 0, 0)' &&
      verbs.cancelBorder === 'rgba(0, 0, 0, 0)',
    JSON.stringify(verbs),
  );

  // THE COMPOSER MAY NOT COVER THE WORDS IT IS ABOUT. It was anchored 40px
  // ABOVE the selection's start, which at every ordinary line height puts the
  // popover straight over the phrase being commented on — the reviewer types
  // an instruction about text the composer has hidden.
  const placement = await page.evaluate(() => {
    const el = document.querySelector('.gly-composer');
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      top: r.top,
      bottom: r.bottom,
      position: s.position,
      transition: s.transitionDuration,
      animation: s.animationName,
      parent: el.parentElement.tagName,
    };
  });
  check(
    'the composer opens below the words, never over them',
    placement.top >= selBox.bottom - 0.5,
    JSON.stringify({
      composerTop: placement.top,
      selectionBottom: selBox.bottom,
    }),
  );
  check(
    // Task 8 gives the composer a one-shot rise-in (`gly-rise`, 0.25s) on
    // open — the earlier claim was that opening it moves nothing ELSE
    // (no transition, no reflow of the prose it floats over), which the two
    // checks either side of this one still cover.
    'it floats on the body and rises in without moving anything else',
    placement.parent === 'BODY' &&
      placement.position === 'absolute' &&
      placement.transition === '0s' &&
      placement.animation === 'gly-rise',
    JSON.stringify(placement),
  );
  const proseAfter = await proseRects(page);
  check(
    'and opening it reflows no prose',
    JSON.stringify(proseBefore) === JSON.stringify(proseAfter),
    JSON.stringify({ before: proseBefore, after: proseAfter }),
  );

  await page.focus('.gly-composer-text');
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.gly-composer-text'));
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement)
      .getPropertyValue('--gly-hl')
      .trim();
    document.body.appendChild(probe);
    const hl = getComputedStyle(probe).color;
    probe.remove();
    return {
      outline: s.outlineStyle,
      color: s.outlineColor,
      border: s.borderColor,
      hl,
    };
  });
  check(
    "focus is violet, not the user agent's blue",
    ring.outline === 'none' ||
      !/rgb\(0,\s*9[0-9]|rgb\(0,\s*10[0-9]/.test(ring.color),
    JSON.stringify(ring),
  );
  // Stated positively as well, for the reason the trail's colour check is:
  // an inequality alone goes green the day the ring becomes some OTHER colour
  // that merely is not the user agent's blue.
  check(
    'and it is the instruction colour, the same ring the whole-doc box got',
    ring.outline === 'solid' && ring.color === ring.hl,
    JSON.stringify(ring),
  );

  // The whisper is only honest if the key does it. Esc already reaches
  // hideComposer through onKey's topmost-first chain; this is what keeps it
  // reaching it from inside the field.
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.querySelector('.gly-composer')?.hidden === true,
  );
  check(
    'esc really does cancel, from inside the field',
    !(await page.isVisible('.gly-composer')),
  );

  // THE BOUND AND THE BOX ARE ONE PAIR, so they are read together. A quote
  // bounded to a length the head cannot draw is ellipsized twice — once by the
  // bound and again by the CSS — and the reviewer is shown an anchor they
  // cannot check against the prose the popover is covering. The phrase here is
  // longer than the bound on purpose: with a short one this check is
  // arithmetic, not evidence.
  await selectPhrase(page, 'budget should stay explicit and readable');
  const longHead = await page.evaluate(() => {
    const el = document.querySelector('.gly-composer-head');
    return {
      text: el.innerText,
      scroll: el.scrollWidth,
      client: el.clientWidth,
    };
  });
  check(
    'a long anchor is bounded, and the bound fits the box it is drawn in',
    longHead.text.endsWith('\u2026"') && longHead.scroll <= longHead.client + 1,
    JSON.stringify(longHead),
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.querySelector('.gly-composer')?.hidden === true,
  );

  // --- THE GHOST IS A MESSAGE, IN THE REMOVAL VOCABULARY ---
  //
  // One vocabulary product-wide: removed text is red. The reviewer's outgoing
  // ghost and a settled diff are told apart by SHAPE — dotted with no wash
  // against solid on a wash — which is the colour-AND-shape discipline every
  // other mark on this page is drawn with, and the only one a reader who does
  // not see the colours can use.
  await selectPhrase(page, 'which is a gap worth closing');
  await page.keyboard.press('Backspace');
  await page.waitForSelector('.ProseMirror .gly-trail-ghost');
  const ghost = await page.evaluate(() => {
    const g = document.querySelector('.ProseMirror .gly-trail-ghost');
    if (!g) return null;
    const s = getComputedStyle(g);
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement)
      .getPropertyValue('--gly-del')
      .trim();
    document.body.appendChild(probe);
    const del = getComputedStyle(probe).color;
    probe.remove();
    // THE GAP IS READ AS GEOMETRY, against the width of a real space in the
    // same prose — the one measurement that says "this reads as a space before
    // a full stop" rather than "some rule declares some margin".
    let gap = null;
    let space = null;
    const next = g.nextSibling;
    if (next && next.nodeType === 3 && next.data) {
      const r = document.createRange();
      r.setStart(next, 0);
      r.setEnd(next, 1);
      gap = +(
        r.getBoundingClientRect().left - g.getBoundingClientRect().right
      ).toFixed(2);
    }
    const first = document.querySelector('.ProseMirror p').firstChild;
    if (first && first.nodeType === 3) {
      const i = first.data.indexOf(' ');
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(first, i);
        r.setEnd(first, i + 1);
        space = +r.getBoundingClientRect().width.toFixed(2);
      }
    }
    return {
      color: s.color,
      style: s.textDecorationStyle,
      line: s.textDecorationLine,
      bg: s.backgroundColor,
      del,
      gap,
      space,
      after: next && next.data,
    };
  });
  check(
    'the ghost speaks in the removal colour, dotted',
    ghost &&
      ghost.style === 'dotted' &&
      ghost.line.includes('line-through') &&
      ghost.color === ghost.del,
    JSON.stringify(ghost),
  );
  check(
    "and wears no wash — the tint is a settled diff's half of the shape",
    ghost && ghost.bg === 'rgba(0, 0, 0, 0)',
    JSON.stringify(ghost),
  );
  check(
    'a ghost against a full stop leaves no space before it',
    ghost &&
      ghost.after === '.' &&
      ghost.gap !== null &&
      ghost.space > 0 &&
      ghost.gap < ghost.space / 2,
    JSON.stringify(ghost),
  );
  await addRangeInstruction(page, 'Make the retry policy concrete.');
  // THE INSTRUCTION'S ONE SURFACE IS ITS ROW under the block it is about. The
  // rail card a mark-anchored instruction also had is deleted, so waiting on
  // `.gly-rail-band .gly-thread` would be waiting for a surface nothing builds.
  await page.waitForSelector('.ProseMirror .gly-row');
  await page.waitForFunction(() =>
    /Revise/.test(document.getElementById('gly-revise').innerText),
  );
  // §6.1b — THE STEPPER MOVES SOMETHING. `j`/`k` and the bottom bar's `↓ next`
  // both call `step`, whose `stepOrder` was `this.suggestions.filter(decidable)`
  // over a wire that carries no suggestions — an empty list, so `stepPending`
  // returned nothing and the handler returned before touching the page. Two
  // keys and a labelled button advertised a way through the review and
  // delivered none of it. §6.1 above proves the button is there, labelled and
  // pressable; that is exactly the state it was in while doing nothing.
  //
  // IT READS THE PAGE AND NOT `stepOrder`. The dead version satisfies any check
  // that asks the app what it intends to walk; only the class the step actually
  // writes can tell the two apart.
  //
  // RUN WHERE THE PAGE ACTUALLY HOLDS AN INSTRUCTION. The first placing of
  // this check sat after the narrow section and reported the stepper dead over
  // a rail whose only two cards were the whole-document composer and the
  // capture card — chrome, not work. A check whose precondition is measured on
  // the wrong selector fails for a reason that has nothing to do with its
  // claim. The precondition is the ROW now: rail cards for anchored
  // instructions are deleted, and `stepOrder` walks the pinned rows.
  const stepped = await page.evaluate(() => {
    // HISTORY MUST BE SHUT, and that is the switch's own rule rather than a
    // harness convenience: History is a READING mode, so `j`/`k` are inert
    // there deliberately. A check run with the panel up would report the
    // stepper dead and be reading the guard, not the stepper.
    const panel = document.querySelector('.gly-versions');
    // AND FOCUS MUST BE OUT OF EVERY BOX, for the same class of reason: `j` is
    // a LETTER inside a textarea, and onKey returns early when focus is in one
    // (keyTargetIsEditable). The composer opens its box on a selection now
    // (spec §1), so a box holding focus is the ordinary state after any
    // instruction is filed rather than a rare one — and a check that dispatches
    // `j` into it reads the guard, not the stepper. This is the reviewer
    // pressing Esc, which is the gesture the guard is there to respect.
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    const before = document.querySelectorAll('.gly-stepped').length;
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'j', bubbles: true }),
    );
    return {
      historyShut: panel ? panel.hidden === true : true,
      before,
      after: document.querySelectorAll('.gly-stepped').length,
      rows: document.querySelectorAll('.ProseMirror .gly-row').length,
      classes: [...document.querySelectorAll('.gly-rail .gly-card')].map(
        (c) => c.className,
      ),
    };
  });
  check(
    'j steps to a real instruction instead of walking an empty list',
    stepped.historyShut &&
      stepped.rows > 0 &&
      stepped.before === 0 &&
      stepped.after === 1,
    JSON.stringify(stepped),
  );

  check(
    'the primary carries the pending count',
    (await page.locator('#gly-revise').innerText()).includes('Revise · 1'),
    await page.locator('#gly-revise').innerText(),
  );

  // --- one card each, and the whole-document instruction lives here once ---
  //
  // TWO INSTRUCTIONS ON THE PAGE AT ONCE IS THE STATE THE GLUED-CARD BUG NEEDS.
  // With one there is nothing for a missing border to run into, and every
  // reading of the rail is arithmetic rather than evidence.
  // TYPED ACROSS TWO LINES ON PURPOSE. A whole-document note is stored inline
  // as `{>>@document …<<}` and CriticMarkup cannot hold a newline, so the
  // composer flattens runs of whitespace to a single space before filing (see
  // web/cards.ts fileNote). The line break here is where a space belongs, so
  // the flattened form is the one-line sentence the disk read further down
  // already asserts — and `addOverallInstruction` waits for the pending count,
  // which never reaches 2 if the server rejects the note, so this filing IS the
  // flatten contract's end-to-end proof.
  await addOverallInstruction(
    page,
    'Open with the decision,\nnot the background.',
    2,
  );
  await page.waitForSelector('.gly-overall-entries .gly-thread');
  check(
    'a multi-line whole-document instruction files — newlines flattened, not rejected',
    (
      await waitForDisk(/Open with the decision, not the background\./)
    ).includes('Open with the decision, not the background.'),
  );
  // TWO SURFACES, ONE ANATOMY (Task 7). The whole-document instructions are
  // filed in the frame's `.gly-docslot` now — above the paper, beside the verb
  // that makes them — and the rail holds the instructions that are ANCHORED to
  // a passage. So the cards are read from both and the anatomy is required of
  // both; the per-surface box checks stay per-surface, because the slot is the
  // sheet's measure and the rail is the rail's, and requiring one width across
  // both would be asserting a layout neither surface has.
  const readAnatomy = (root) =>
    page.evaluate((sel) => {
      const cards = [...document.querySelectorAll(sel)];
      return cards.map((c) => {
        const s = getComputedStyle(c);
        const r = c.getBoundingClientRect();
        return {
          heads: c.querySelectorAll('.gly-card-head').length,
          head: (c.querySelector('.gly-card-head') || {}).innerText || '',
          bordered:
            s.borderTopWidth !== '0px' &&
            s.borderLeftWidth !== '0px' &&
            s.borderTopStyle !== 'none',
          edge: s.borderLeftWidth,
          // Rendered verbs only: the pill paints `edit` away (display: none),
          // and innerText of an unrendered node falls back to its textContent.
          verbs: [...c.querySelectorAll('.gly-card-actions button')]
            .filter((b) => getComputedStyle(b).display !== 'none')
            .map((b) => (b.innerText || '').trim().split('\n')[0]),
          box: [Math.round(r.left), Math.round(r.width)],
        };
      });
    }, root);
  // ONE SURFACE, NOT TWO. The rail half of this check is RETIRED with the rail
  // card for an anchored instruction: that instruction is a row under its own
  // block now (`.gly-row`), and a row is not a card and owns none of a card's
  // anatomy. What is left holding the anatomy is the whole-document
  // instruction, which is still a card and still in the slot.
  const slotAnatomy = await readAnatomy('.gly-docslot .gly-card.gly-thread');
  const anatomy = slotAnatomy;
  // THE SLOT'S ROW IS A PILL, NOT A CARD (spec §1, 2026-09-07): panel ground,
  // no kind edge, no head line on screen, one verb — the rail's anatomy
  // (3px edge, `edit`) is hidden by paint; the head stays in the DOM for the
  // anchor's name, read below through textContent.
  const wellFormed = (a) =>
    a.heads === 1 &&
    !a.bordered &&
    a.edge === '0px' &&
    a.verbs.filter(Boolean).length === 1 &&
    a.verbs.filter(Boolean)[0] === 'delete';
  check(
    'the whole-document instruction card owns one head, its own border and its own verbs',
    slotAnatomy.length === 1 && anatomy.every(wellFormed),
    JSON.stringify(anatomy),
  );
  // AND THE ANCHORED INSTRUCTION SPEAKS THE ROW'S LANGUAGE. `one rail, one
  // left edge, one width` measured the anchored cards against each other and
  // its population is deleted; the row's equivalent claim is that the
  // instruction is drawn under the block it is about, in the paper, with the
  // one verb the spec gives it.
  const anchoredRow = await page.evaluate(() => {
    const el = document.querySelector('.ProseMirror .gly-row');
    if (!el) return null;
    return {
      inProse: !!el.closest('.ProseMirror'),
      verbs: [...el.querySelectorAll('button')].map((b) =>
        (b.textContent || '').trim(),
      ),
    };
  });
  check(
    'and an anchored instruction is a row under its block, offering × and nothing else',
    !!anchoredRow &&
      anchoredRow.inProse &&
      JSON.stringify(anchoredRow.verbs) === JSON.stringify(['×']),
    JSON.stringify(anchoredRow),
  );

  // §2.2 — IT APPEARS IN THE RAIL AND NOWHERE ELSE. It used to render three
  // times: a rail card, an amber block in the prose, and the panel.
  // IT DOES NOT PAINT, AND IT IS STILL THERE — which are two claims and the
  // check has to make both. Counting DOM nodes and asserting zero would be the
  // wrong test of the right idea: y-prosemirror DELETES a node this schema
  // cannot build, and the projection writes that deletion to the author's file,
  // so a rail branch that got its zero by dropping `note` from the schema would
  // pass while destroying the document. The node is present, built, and drawn
  // as nothing: no box, no room taken.
  const inProse = await page.evaluate(() => {
    const notes = [
      ...document.querySelectorAll(
        '.ProseMirror .gly-note[data-anchor="document"]',
      ),
    ];
    return {
      present: notes.length,
      painted: notes.filter((n) => n.getClientRects().length > 0).length,
      area: notes.reduce((a, n) => a + n.getBoundingClientRect().height, 0),
    };
  });
  check(
    'a whole-document instruction does not paint in the prose, and is still in the document',
    inProse.present === 1 && inProse.painted === 0 && inProse.area === 0,
    JSON.stringify(inProse),
  );
  // AND IT IS THE SLOT'S FIRST ROW (Task 7), not the rail's first card. A note
  // about the whole file has no coordinates, so it never belonged in a map of
  // the passages; the whole-doc slot at the head of the sheet is where it is
  // written and where it is filed, and `.gly-row-doc` is the class `paintFrame`
  // counts to know the slot has something in it.
  // textContent, not innerText: the head line is painted away in the pill
  // and innerText is defined over what is rendered.
  const firstCard = await page
    .locator('.gly-docslot .gly-card.gly-thread .gly-card-head')
    .first()
    .evaluate((el) => el.textContent || '');
  check(
    'and the row wears the slot\u2019s own pill class',
    (await page.locator('.gly-docslot .gly-row-doc').count()) === 1,
  );
  check(
    'it is the whole-doc slot\u2019s first row, and its head names the anchor',
    /INSTRUCTION · WHOLE DOCUMENT ·/i.test(firstCard),
    firstCard,
  );
  // THE FILED WORK IS IN ITS SURFACE'S OWN FLOW, and this is the half of the
  // old check that survived both rulings unchanged. `.gly-overall` is the list
  // of whole-document instructions already written, and `position: static` is
  // what says it is IN the surface rather than floating over it. What moved is
  // WHICH surface: the rail's map, and now the sheet's own head.
  check(
    'the filed whole-document instructions are in the slot’s flow, not floating over it',
    (await page.evaluate(
      () => getComputedStyle(document.querySelector('.gly-overall')).position,
    )) === 'static',
    await page.evaluate(
      () => getComputedStyle(document.querySelector('.gly-overall')).position,
    ),
  );

  // --- §2.2b · THE CAPTURE CARD IS ONE OF THE CARDS, AND THE OTHERS RE-FLOOR
  // CLEAR OF IT ---
  //
  // THE FOURTH CONTRACT, IN THE PLACE THREE STOOD. `.gly-overall` was asserted
  // `static`; the capture card was in-flow (the 39.29px slide), then an
  // absolute overlay drawn OVER the band `"so a future re-float is a red check
  // rather than a discovery"`. Court's reading of that overlay is the ruling
  // this check is saved for: a shadowed box floating over the cards does not
  // read as one of them. So it is a card in the whole-document panel's flow
  // again — and the slide it used to cause is answered by a REPAINT
  // (`openCapture` calls `scheduleAnchors`) rather than by leaving the flow.
  //
  // What has to be true is stated rather than assumed:
  //   · it is `static` and a child of `.gly-overall` — in the flow, sitting
  //     with the filed whole-document cards, not placed over them;
  //   · opening it pushes the band DOWN and the anchored cards RE-FLOOR clear
  //     of it: every band card ends up at or below the composer's own foot,
  //     none left stale behind it;
  //   · and the re-floor is NOT stale — the positions `openCapture` left match
  //     what a fresh `paintAnchors` produces. That last one is the 39.29px
  //     defect turned inside out: a stale in-flow card is placed against a band
  //     that moved, so a forced repaint would SNAP it, and this comparison is
  //     the only form that catches it.
  await page.click('.gly-docslot-add');
  await page.waitForSelector('.gly-capture:not([hidden])');
  await page.waitForTimeout(400);
  const openState = await page.evaluate(() => {
    const el = document.querySelector('.gly-capture');
    const s = getComputedStyle(el);
    return {
      position: s.position,
      inPanel: !!el.closest('.gly-overall'),
      captureBottom: Math.round(el.getBoundingClientRect().bottom),
      cards: [...document.querySelectorAll('.gly-rail-band .gly-card')].map(
        (c) => Math.round(c.getBoundingClientRect().top),
      ),
    };
  });
  check(
    'the capture card sits in the whole-document panel\u2019s flow, not over the band',
    openState.position === 'static' && openState.inPanel,
    JSON.stringify(openState),
  );
  // THE RE-FLOOR CHECKS ARE RETIRED WITH THE CARDS THEY MEASURED. `opening
  // capture re-floors the anchored cards clear of it` and `the re-floor is not
  // stale` both read `.gly-rail-band .gly-card` — the anchored instruction
  // cards, which are deleted. There is nothing left in the band for the capture
  // card to displace or to cover, so the claim has no population; what survives
  // of it is the check above, that the capture card is in the flow rather than
  // floating over the surface it sits in.
  // REACHABLE AT ANY SCROLL POSITION — §13 for the card as well as the door.
  // The composer is in the rail's flow at the top of the whole-document panel,
  // so scrolled far enough down it would be off-screen above; `openCapture`
  // ends on `input.focus()`, and focusing a field the browser scrolls into
  // view, which is what keeps it reachable from the foot of a long document.
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  await page.click('.gly-docslot-add');
  await page.waitForSelector('.gly-capture:not([hidden])');
  await page.waitForTimeout(300);
  const deepBox = await page.evaluate(() => {
    const el = document.querySelector('.gly-capture');
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, view: window.innerHeight };
  });
  check(
    'the capture card is on screen when opened from the foot of the document',
    deepBox.top >= 0 && deepBox.top < deepBox.view,
    JSON.stringify(deepBox),
  );
  await page.keyboard.press('Escape');
  check('Esc puts it away', !(await page.locator('.gly-capture').isVisible()));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  // --- §2.2c · THE RIGHT-CLICK, AND THE SCOPE THE SELECTION DECIDES ---
  //
  // `contextmenu` was UNCLAIMED before this — no handler existed anywhere in
  // web/ — so these are the first assertions about it. THE HAZARD IS THE FIRST
  // CHECK, not the last: a surface appended inside `.ProseMirror` is parsed as
  // prose and written to the author's file (a fixture went from 1 pending
  // suggestion to 81 and the `.md` gained the card's text as paragraphs). The
  // menu is on `body` and nothing in the editable subtree, and that is read off
  // the DOM rather than trusted.
  // NOTHING SELECTED MEANS THE EDITOR'S OWN SELECTION, NOT THE DOM'S. This
  // block asserts what the menu offers with no passage under the cursor, and
  // `menuItems` reads `editor.state.selection` — `removeAllRanges` clears the
  // browser's selection and leaves ProseMirror's exactly where the last
  // instruction left it. It went unnoticed while the composer opened on a
  // press: the selection was stale then too, and a right-click happened to
  // collapse the caret before the menu read it. The state is set here rather
  // than relied on.
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.galleyEdit.editor.commands.setTextSelection({ from: 1, to: 1 });
    window.getSelection().removeAllRanges();
  });
  await page.locator('.ProseMirror p').first().click({ button: 'right' });
  await page.waitForSelector('.gly-menu:not([hidden])');
  const menuHome = await page.evaluate(() => {
    const el = document.querySelector('.gly-menu');
    return {
      inProse: !!el.closest('.ProseMirror'),
      parent: el.parentElement.tagName,
      position: getComputedStyle(el).position,
      inside: document.querySelectorAll('.ProseMirror .gly-menu').length,
    };
  });
  check(
    'the menu is on body and NEVER inside the editable subtree',
    menuHome.inProse === false &&
      menuHome.parent === 'BODY' &&
      menuHome.inside === 0 &&
      menuHome.position === 'absolute',
    JSON.stringify(menuHome),
  );
  const collapsedRows = await menuRows(page);
  check(
    'with nothing selected the menu offers the whole document, and only that',
    collapsedRows.length === 1 &&
      /whole document/i.test(collapsedRows[0]) &&
      !/passage/i.test(collapsedRows[0]),
    JSON.stringify(collapsedRows),
  );
  // A REAL MENU WITH ROOM TO GROW, not a one-item popup: the rows are a list
  // and each is a focusable control, which is what lets the next item be a push
  // rather than a rewrite. Read as a claim about the SHAPE — a `div` with a
  // click handler would pass a count and fail the keyboard.
  const rowShape = await page.evaluate(() => {
    const list = document.querySelector('.gly-menu-list');
    const rows = [...list.querySelectorAll('.gly-menu-item')];
    return {
      role: list.getAttribute('role'),
      tags: [...new Set(rows.map((r) => r.tagName))],
      roles: [...new Set(rows.map((r) => r.getAttribute('role')))],
    };
  });
  check(
    'it is a real menu of focusable rows, built to take more of them',
    rowShape.role === 'menu' &&
      rowShape.tags.length === 1 &&
      rowShape.tags[0] === 'BUTTON' &&
      rowShape.roles.length === 1 &&
      rowShape.roles[0] === 'menuitem',
    JSON.stringify(rowShape),
  );
  await page.keyboard.press('Escape');
  // AND THE SCOPE IS THE SELECTION'S. Same gesture, different selection,
  // different offer — no mode, nothing to switch, and the second row still
  // there because a reviewer with a selection may still mean the whole file.
  await selectRetryBudget(page);
  await page.locator('.ProseMirror p').first().click({ button: 'right' });
  await page.waitForSelector('.gly-menu:not([hidden])');
  const selectedRows = await menuRows(page);
  check(
    'with text selected the menu offers the passage first, then the document',
    selectedRows.length === 2 &&
      /this passage/i.test(selectedRows[0]) &&
      /whole document/i.test(selectedRows[1]),
    JSON.stringify(selectedRows),
  );
  await page.keyboard.press('Escape');
  check(
    'Esc puts the menu away',
    !(await page.locator('.gly-menu').isVisible()),
  );
  // AND THE BROWSER'S OWN MENU IS UNTOUCHED OFF THE PROSE. `preventDefault` is
  // called only where this menu opens, so a right-click on the chrome is still
  // the platform's — nothing is taken away where nothing is given.
  await page.locator('.gly-bar').click({ button: 'right' });
  await page.waitForTimeout(200);
  check(
    'a right-click on the chrome opens nothing of ours',
    !(await page.locator('.gly-menu').isVisible()),
  );

  // THE INVARIANT, AND IT IS THE HALF THAT BREAKS SILENTLY. Only the RENDERING
  // moved: the {>>…<<} block is still the record in the author's file. A node
  // the browser's schema cannot build is not skipped by y-prosemirror — it is
  // DELETED out of the Yjs document, and the next projection writes that
  // deletion to disk. So NoteBlock has to stay registered and parsed and render
  // as nothing visible, and this is read off the real path rather than off
  // /_galley/pending, which would be green over a document already destroyed.
  const filed = await waitForDisk(/\{>>\s*@document/);
  check(
    'the {>>…<<} block with @document still persists in the .md',
    /\{>>\s*@document[\s\S]*Open with the decision, not the background\.[\s\S]*<<\}/.test(
      filed,
    ),
    JSON.stringify(filed),
  );
  // AND IT SURVIVES A PROJECTION THE BROWSER DROVE, which is the half a POST-
  // then-read cannot see: the server writes the block, and it is the round trip
  // through the editor's own schema that would take it back out again.
  await page.locator('.ProseMirror p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' The budget is the subject.');
  const projected = await waitForDisk(/The budget is the subject\./);
  check(
    'and it survives a projection the browser drove — the schema still builds the node',
    /The budget is the subject\./.test(projected) &&
      /\{>>\s*@document[\s\S]*Open with the decision, not the background\.[\s\S]*<<\}/.test(
        projected,
      ),
    JSON.stringify(projected),
  );

  // §2.3 — AN INSTRUCTION'S ONE VERB IS `×`, AND IT IS AT DESTROY WEIGHT.
  //
  // THIS SECTION USED TO ASSERT `edit`. A mark-anchored instruction had a rail
  // card carrying edit at settle weight and delete at destroy weight; the card
  // is deleted (one instruction may not live on two surfaces) and the row that
  // replaced it offers `×` alone — so the edit-verb assertions, and the flow
  // that drove edit-save through the card, are RETIRED rather than weakened.
  // Revising your own words is removing the row and writing it again.
  //
  // WHAT SURVIVES IS THE WEIGHT. `×` removes an instruction the agent would
  // otherwise be handed, so it may never be a pill at rest: borderless, muted,
  // and coloured only on hover. That is the same §4 handoff rule the card's
  // `delete` was held to, asked of the surface that inherited the verb.
  const removeWeight = await page.evaluate(() => {
    const x = document.querySelector('.ProseMirror .gly-row .gly-row-remove');
    if (!x) return null;
    const s = getComputedStyle(x);
    return {
      border: s.borderTopStyle,
      background: s.backgroundColor,
      color: s.color,
      muted: getComputedStyle(document.documentElement)
        .getPropertyValue('--gly-muted')
        .trim(),
      label: (x.textContent || '').trim(),
    };
  });
  check(
    'the row’s one verb is × at destroy weight — never a pill at rest',
    !!removeWeight &&
      removeWeight.label === '×' &&
      removeWeight.border === 'none' &&
      removeWeight.background === 'rgba(0, 0, 0, 0)',
    JSON.stringify(removeWeight),
  );

  // Back to one, so the count checks below read the state they were written
  // against. The whole-document card carries the same two verbs as any other.
  await page.click('.gly-overall-entries .gly-thread-delete');
  await page.click('.gly-overall-entries .gly-thread-delete');
  await page.waitForFunction(
    async () =>
      (await (await fetch('/_galley/pending')).json()).instructions.length ===
      1,
  );

  // NOTHING MOVES WHEN THE PRIMARY CHANGES ITS LABEL, which is the entire
  // reason the count sits in a reserved box inside the one grid cell the three
  // faces share. The rects are read over a change made SOMEWHERE ELSE — the
  // count going to zero from a delete in the rail — because that is the click
  // that would otherwise slide the control under the cursor. Readouts are not
  // held: the bar's one status cell yields by design (see paintReadout), and
  // every control sits upstream of it.
  //
  // THE THREE FACES ARE HELD TOO, AND THAT IS WHAT MAKES THIS DISCRIMINATING.
  // The button's own box is the widest of `Revise · 99 ▾` (13 mono units),
  // `revising · 9999s` (16) and `Approve` (7) — so the busy face bounds it and
  // a check that watched only `#gly-revise` would report `ok` with the count's
  // reserve deleted. What moves without the reserve is the label INSIDE the
  // box: the faces are `place-items: center` in one grid cell, so a clause
  // that shrinks re-centres `Revise` and its `▾` under the cursor. Shown red
  // with `min-width` stripped from `.gly-revise-count` in the built css, at
  // 1440px: the idle face alone moved, x 1204.03 → 1218.48 and width 86.72 →
  // 57.81, while `#gly-revise` itself held 1174.59/145.61 in both readings.
  const barRects = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [
          ...document.querySelectorAll(
            '.gly-bar button, .gly-bar .gly-census, .gly-revise-label',
          ),
        ].map((el, i) => {
          const r = el.getBoundingClientRect();
          // Keyed by POSITION, never by class: `.gly-reserved` is toggled on the
          // faces by this very change, so a class-derived key would report a
          // move every time whether or not a box did.
          return [
            `${i}:${el.id || el.tagName}`,
            [+r.x.toFixed(2), +r.y.toFixed(2), +r.width.toFixed(2)],
          ];
        }),
      ),
    );
  const barBefore = await barRects();
  // §5.4 — DELETE THE SENTENCE, DELETE THE INSTRUCTION ABOUT IT.
  //
  // Court: "if we highlight a sentence and add an instruction and then delete
  // the sentence, we should delete the instruction as well." It is the idiom
  // this codebase already uses one population over — deleting text under the
  // agent's pending mark has always been the verdict by hand — and until now
  // the reviewer's own mark behaved differently, leaving the instruction behind
  // in a section headed "unplaced · its words were removed". That head describes
  // the mechanism; what the reviewer did was retract the note.
  //
  // WHAT THIS REPLACED, AND WHAT THOSE CHECKS KNEW. A block of seven checks
  // stood here and drove exactly this gesture to prove the OPPOSITE decision
  // (2026-08-19: an unplaced instruction stays as a full card in the rail). They
  // asserted the section head reads `UNPLACED · ITS WORDS WERE REMOVED`, that
  // the card keeps the instruction's text, that it quotes the words it lost,
  // that the old apologising explainer is gone, that the card is dashed outside
  // with a solid 3px violet edge and its lost quote struck in `--gly-del`, and
  // that both verbs survive on it. None of that machinery is deleted — a block
  // instruction whose block goes can still reach it — but this gesture no longer
  // produces one, so this gate no longer exercises that styling. Written down
  // rather than quietly dropped, per this repository's own rule about deleting a
  // check: say what it knew.
  await selectRetryBudget(page);
  await page.keyboard.press('Backspace');
  // READ OFF THE SERVER, not off the rail. The card leaving the screen is what
  // the reviewer sees, and it is also what a browser-side filter would produce
  // while the thread sat in the review map — invisible but present, which this
  // codebase rates as the worse of the two. The sweep is the SERVER's, so the
  // claim is about what the server still holds.
  for (let i = 0; i < 10; i++) {
    const d = await page.evaluate(async () =>
      JSON.stringify(
        (await (await fetch('/_galley/pending')).json()).instructions.map(
          (x) => [x.key, x.run],
        ),
      ),
    );
    console.log(`DIAG t=${i}s ${d}`);
    await page.waitForTimeout(1000);
  }
  // POLLED EXPLICITLY, NOT THROUGH `waitForFunction`, and that is the whole
  // reason this check can fail. `page.waitForFunction(async () => …)` hands the
  // wait a PROMISE from the page function, a promise is truthy, and the wait
  // therefore resolves on its first poll whatever the fetch actually said. The
  // first cut of this check used that shape and reported `ok` with the orphaned
  // instruction sitting in the payload — measured by polling it once a second
  // for ten seconds with the sweep removed, and it never left.
  //
  // THE SAME SHAPE IS ELSEWHERE IN THIS FILE and is left alone rather than
  // swept up here: every other instance waits for something that does become
  // true, so they are slow no-ops rather than false passes, and rewriting them
  // blind is how a gate that was merely useless becomes one that is wrong.
  const pendingKeys = async () =>
    page.evaluate(async () =>
      (await (await fetch('/_galley/pending')).json()).instructions.map(
        (x) => x.key,
      ),
    );
  let left = await pendingKeys();
  for (let i = 0; i < 20 && left.length > 0; i++) {
    await page.waitForTimeout(500);
    left = await pendingKeys();
  }
  check(
    'deleting the highlighted sentence retracts the instruction about it',
    left.length === 0,
    JSON.stringify(left),
  );
  check(
    'and the rail has no unplaced card left to explain it away',
    (await page.locator('.gly-rail-unplaced .gly-thread').count()) === 0,
  );
  // THE DELETION THAT RETRACTED THE INSTRUCTION IS ITSELF A HAND EDIT, so the
  // primary holds Revise rather than settling to Approve. A pending reviewer
  // change is outgoing markup exactly as an instruction is — verdict.ts's
  // verdictLabel reads `view.changes` now, so zero instructions no longer means
  // a clean document while an unsent edit stands. This gate asserted Approve
  // here before that rule existed (Court: a hand edit must hold Revise so the
  // press is a choice, not a silent seal over unsent markup).
  await page.waitForFunction(() =>
    /Revise/.test(document.getElementById('gly-revise').innerText),
  );
  check(
    'the primary holds Revise while the retracting hand edit is still pending',
    (await page.locator('#gly-revise').innerText()).includes('Revise'),
    await page.locator('#gly-revise').innerText(),
  );
  const barAfter = await barRects();
  const moved = Object.keys(barBefore).filter(
    (k) => JSON.stringify(barBefore[k]) !== JSON.stringify(barAfter[k]),
  );
  check(
    'the primary changing its label moves nothing in the bar',
    moved.length === 0,
    JSON.stringify({ moved, before: barBefore, after: barAfter }),
  );
  const readout = (await page.locator('#gly-status').innerText()).trim();
  check(
    'the status reads the fixed grammar, which always fits',
    /(v1|round \d+) · (draft|with the agent|settled)/.test(readout) &&
      !readout.includes('instructions in this round'),
    readout,
  );

  await addOverallInstruction(
    page,
    'Keep the opening focused on the decision.',
    1,
  );
  // WAIT FOR THE PAINT, NOT THE WIRE. addOverallInstruction returns as soon as
  // `/_galley/pending` reports the instruction, which is the SERVER agreeing it
  // exists — the browser has not necessarily drawn the card yet. A bare
  // isVisible samples once and reported false on a loaded CI runner, failing a
  // check about a card that was about to appear. The sibling call site above
  // waits on this exact selector for this exact reason.
  //
  // The wait is BOUNDED and its failure is still a FAIL: if the card never
  // arrives this reports false rather than throwing, so the remaining checks in
  // this section still run and the output still names what broke.
  check(
    'whole-document instructions become cards in the same rail',
    await page
      .waitForSelector('.gly-overall-entries .gly-thread', { timeout: 5000 })
      .then(() => true)
      .catch(() => false),
  );
  check(
    'no native prompt or modal was opened',
    dialogs === 0,
    `${dialogs} dialogs`,
  );

  // A DIRECT HAND EDIT rides in this round too. The reviewer's own edits are
  // the round's outgoing message, drawn as a trail glow in the prose; the check
  // after the send is that pressing Revise SETTLES them — the same wipe approve
  // does, at the other verdict (see verdict.ts clearTrail). Left standing they
  // re-anchor onto the agent's rebuilt document, where the edit is already
  // baseline text, and read as a stale pending change over prose nobody will
  // act on again.
  await page.evaluate(() => {
    const ed = window.galleyEdit.editor;
    let end = null;
    ed.state.doc.descendants((node, pos) => {
      if (end === null && node.type.name === 'paragraph') {
        end = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });
    ed.commands.focus();
    ed.commands.insertContentAt(end, ' and precise');
  });
  check(
    'a hand edit shows a trail glow in the prose before Revise',
    await page
      .waitForSelector('.ProseMirror .gly-trail-ins', { timeout: 5000 })
      .then(() => true)
      .catch(() => false),
  );

  // A WHOLE-DOCUMENT COMPOSER LEFT OPEN WITH UNFILED TEXT is a draft with
  // nowhere to go once the round is sent — only FILED instructions travel. Open
  // it with a draft now; the check after the send below is that Revise closed
  // and discarded it. See verdict.ts postVerdict and cards.ts closeCapture.
  await page.click('.gly-docslot-add');
  await page.waitForSelector('.gly-capture:not([hidden])');
  await page.fill('.gly-overall-input', 'an unsent draft');
  check(
    'the whole-document composer is open with an unfiled draft before Revise',
    await page.locator('.gly-capture').isVisible(),
  );
  check(
    'Revise visibly discloses its two exits',
    (await page.locator('#gly-revise').innerText()).includes('Revise'),
  );
  await page.click('#gly-revise');
  // The title alone, with the tag's own text peeled back off — not the
  // button's full innerText: each item now carries an explanatory line below
  // its title (MENU_REVISE_EXPLAIN / MENU_TRUST_EXPLAIN) and the trust item
  // carries a tag (MENU_TRUST_TAG) inside the title itself, so this check is
  // about the verb, not the sentence or the tag under/inside it.
  const exits = await page.evaluate(() =>
    [...document.querySelectorAll('.gly-verdict-menu .gly-verdict-title')].map(
      (t) => {
        const tag = t.querySelector('.gly-verdict-tag');
        return (
          tag ? t.textContent.slice(0, -tag.textContent.length) : t.textContent
        ).trim();
      },
    ),
  );
  check(
    'the menu offers Revise and Revise & Approve',
    JSON.stringify(exits) === JSON.stringify(['Revise', 'Revise & Approve']),
    JSON.stringify(exits),
  );
  // AND EACH EXIT SAYS WHAT IT DOES, UNDER ITS OWN TITLE. `Revise` and
  // `Revise & Approve` are four words apart and one of them ends the review;
  // `.gly-verdict-explain` is the line that tells them apart, and nothing in a
  // browser had ever read it. probe.mjs pins the two strings in the bundle,
  // which is green over a line that never renders.
  const explains = await page.evaluate(() =>
    [
      ...document.querySelectorAll('.gly-verdict-menu .gly-verdict-explain'),
    ].map((e) => ({
      said: e.textContent.trim(),
      shown: e.offsetParent !== null,
      under: (() => {
        const title = e.parentElement.querySelector('.gly-verdict-title');
        return (
          !!title &&
          e.getBoundingClientRect().top >=
            title.getBoundingClientRect().bottom - 1
        );
      })(),
    })),
  );
  check(
    'and each exit carries its explanation, rendered, under its own title',
    explains.length === 2 &&
      explains.every((e) => e.shown && e.under && e.said.length > 20),
    JSON.stringify(explains),
  );
  await page.click('.gly-verdict-revise');
  await page.waitForFunction(
    async () =>
      (await (await fetch('/_galley/pending')).json()).instructions.length ===
      0,
  );
  check('Revise sends and clears the instruction round', true);
  check(
    'and Revise closed the open whole-document composer — the unsent draft is discarded',
    !(await page.locator('.gly-capture').isVisible()),
  );
  check(
    'and Revise SETTLED the reviewer’s hand edits — no trail glow or ghost survives the send',
    (await page.locator('.ProseMirror .gly-trail-ins').count()) === 0 &&
      (await page.locator('.ProseMirror .gly-trail-ghost').count()) === 0,
    JSON.stringify({
      ins: await page.locator('.ProseMirror .gly-trail-ins').count(),
      ghost: await page.locator('.ProseMirror .gly-trail-ghost').count(),
    }),
  );
  check(
    'a failed agent result closes the wait without closing review',
    (await ack(page, 'failed', 'test continues')) === 204,
  );

  // §5.1 — THE SCRUBBER'S HEAD IS THE DRAFT, AND ITS KEYFRAMES ARE THE RECORD.
  //
  // WHAT THIS REPLACED. `History opens on the newest round, not on the starting
  // version` pressed a chip and read the panel's paper: the panel had pinned its
  // selection to v1 at page load and never moved it again, so the record opened
  // on `v1 · Starting version` over rounds of real work. Both the chip and the
  // landing are deleted, and the defect cannot recur in the shape it had —
  // there is no stored selection to go stale. The claim that survives is the
  // one the reviewer sees: the track carries one keyframe per version, and the
  // handle rests on the newest with the DRAFT on screen, not an old version.
  const early = await page.evaluate(
    async () => (await (await fetch('/_galley/versions')).json()).rounds,
  );
  const atHead = await page.evaluate(() => ({
    keys: document.querySelectorAll('.gly-scrub-key').length,
    near: document
      .querySelector('.gly-scrub-key:last-child')
      ?.classList.contains('is-near'),
    scrubbing: document.body.classList.contains('gly-scrubbing'),
    label: document.querySelector('.gly-scrub-now')?.textContent ?? '',
  }));
  check(
    'the timeline carries one keyframe per version and rests on the newest',
    early.length > 1 &&
      atHead.keys === early.length &&
      atHead.near === true &&
      atHead.scrubbing === false &&
      atHead.label.includes(`v${early.length}`),
    JSON.stringify({ ...atHead, rounds: early.map((r) => r.n) }),
  );

  // --- History is a reading mode ---
  //
  // TWO REAL ROUNDS FIRST, WITH THE AGENT'S TESTIMONY ON THEM. Every claim
  // below is about a join — an ask beside the change that answered it, a card
  // beside the mark it is about — and a fixture with one round and no manifest
  // is a fixture in the state every one of those bugs is absent from.
  //
  // The agent's write surface is the FILE: while the handoff window is open it
  // owns the .md, and the watcher imports what it saves. That is the real path,
  // so it is the one driven here.
  async function agentReturns(next, manifest) {
    writeFileSync(doc, next);
    await page.waitForFunction(
      (t) => document.querySelector('.ProseMirror').innerText.includes(t),
      next
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))[0]
        .slice(0, 30),
      { timeout: 15000 },
    );
    const roundNote = next
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))[0]
      .slice(0, 40);
    const status = await page.evaluate(
      async (body) =>
        (
          await fetch('/_galley/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            // A NOTE, BECAUSE AN AGENT THAT ACKS WRITES ONE. This was `''`, which made
            // the fixture the one state the round-level answer is absent from — and
            // that sentence is the ONLY answer there is until a manifest names one
            // per change. `←` on the round card is asserted against it below.
          })
        ).status,
      {
        state: 'answered',
        note: `Revised the round: ${roundNote}`,
        changes: manifest,
      },
    );
    if (status !== 204) throw new Error(`ack answered ${status}`);
    await page.waitForFunction(
      async (n) =>
        (await (await fetch('/_galley/versions')).json()).rounds.length >= n,
      undefined,
      { timeout: 10000 },
    );
    await page.waitForTimeout(900);
  }
  async function sendRound(asks) {
    for (const [i, ask] of asks.entries()) {
      await addOverallInstruction(page, ask, i + 1);
    }
    // BY TEXT, NEVER BY POSITION. `/_galley/pending` sorts threads by key, so
    // the order an instruction was typed in is not the order it comes back in
    // — a positional read here attributes the agent's note to the wrong ask
    // while looking entirely correct, which is the exact mistake `joinTestimony`
    // refuses on the server side.
    const listed = await page.evaluate(async () =>
      (await (await fetch('/_galley/pending')).json()).instructions.map((i) => [
        i.text,
        i.key,
      ]),
    );
    const asked = new Map(listed);
    if (!(await page.locator('.gly-verdict-menu').isVisible()))
      await page.click('#gly-revise');
    await page.click('.gly-verdict-revise');
    await page.waitForFunction(
      async () =>
        (await (await fetch('/_galley/pending')).json()).instructions.length ===
        0,
    );
    return asked;
  }

  // The DRAFT's own metrics, read before any earlier version is on screen,
  // because "the same type and the same measure as the draft" is a comparison
  // and not a number somebody wrote down. A number here would go green the day
  // the draft's type changed and the version's did not, which is the whole bug.
  const draftType = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    const s = getComputedStyle(pm);
    return {
      size: s.fontSize,
      line: s.lineHeight,
      width: Math.round(pm.getBoundingClientRect().width),
    };
  });

  const ask1 = await sendRound(['Open with the decision, not the background.']);
  await agentReturns(
    '# A careful review\n\nBounded retries: 12 attempts over 48 hours.\n\n' +
      '## The budget\n\nEach message gets a retry budget.\n\n' +
      '## What happens at exhaustion\n\nWhen a message exhausts its budget it moves on.\n',
    [
      {
        quote: 'Bounded retries: 12 attempts over 48 hours.',
        answers: [ask1.get('Open with the decision, not the background.')],
        note: 'Led with the decision; moved the background after it.',
      },
    ],
  );
  // THE SECOND ROUND CARRIES THREE ASKS AND TWO CHANGES, and that is the shape
  // the fixture needs rather than a tidier one. A round with ONE change cannot
  // fail a `CHANGE k OF K` ordinal, cannot fail an alignment (one card has
  // nowhere to drift to), and cannot fail selection-by-dimming at all — there
  // is no other card to be dimmed. And the third ask is one the agent never
  // claims, which is the ask-only card: nothing the reviewer sent may ever
  // disappear, and a fixture where everything was answered certifies that it
  // does not.
  const ask2 = await sendRound([
    'Say what the default budget is, in numbers.',
    'Name the queue and its retention.',
    'Cite the incident review verbatim.',
  ]);
  await agentReturns(
    '# A careful review\n\nBounded retries: 12 attempts over 48 hours.\n\n' +
      '## The budget\n\nEach message gets a retry budget of 12 attempts over 48 hours (incident #482).\n\n' +
      '## What happens at exhaustion\n\nWhen a message exhausts its budget it moves to the dead letter queue, kept 14 days.\n',
    [
      {
        quote: 'of 12 attempts over 48 hours (incident #482)',
        answers: [ask2.get('Say what the default budget is, in numbers.')],
        note: 'Added the 12-attempt budget and linked incident #482.',
      },
      {
        quote: 'to the dead letter queue, kept 14 days',
        answers: [ask2.get('Name the queue and its retention.')],
        note: 'Named the queue and its 14-day retention.',
      },
    ],
  );

  // --- §5.2 · READING AN EARLIER VERSION IS THE SCRUBBER, AND NOTHING ELSE ---
  //
  // EVERY CHECK BETWEEN HERE AND PHASE 6 USED TO BE ABOUT HISTORY, and History
  // is deleted (Task 14): the landing rail of round cards, the seed card, the
  // `changes`/`side by side` picker, the change rail beside the paper, region
  // pinning and its dimming, the `‹ all rounds` handle, the amber chip that
  // opened all of it. The scrubber replaced the whole surface — one sheet, no
  // panes, no drawer — so the assertions are retired rather than weakened, and
  // what is asserted here is the surface that took the work over:
  //
  //   · a keyframe press puts an earlier version ON THE SHEET (`body
  //     .gly-scrubbing`, `.gly-scrub-paper[data-v]`) — replacing "History opens
  //     on the newest round", the landing rail's head and cards, the reading
  //     state's sub-bar and change cards, and side by side;
  //   · in the draft's own type, which is what "the reading state is the
  //     draft's paper wearing marks" was protecting;
  //   · the readout says where you are and that the draft is safe;
  //   · `restore vN as draft` is still at destroy weight and still arms —
  //     in the eyebrow now, where it is no longer a peer of any view control;
  //   · Esc returns to the head with the scroll intact, which was `‹ all
  //     rounds`, `← back to draft` and the round-trip scroll check together.
  //
  // THE RAIL-TOP CHECK GOES WITH THEM. `the rail does not move when the mode
  // does` compared the draft rail's top against History's in two states; there
  // is one rail now, so there is no second top to disagree with it.
  const enteredHistoryAt = await page.evaluate(() => window.scrollY);
  // The FIRST keyframe, which is v1 — the one version that is never the head,
  // so the press is unambiguous however many rounds the fixture has landed.
  await page.click('.gly-scrub-key');
  await page.waitForSelector('body.gly-scrubbing .gly-scrub-paper[data-v]');
  if (process.env.GALLEY_SHOTS)
    await page.screenshot({ path: `${process.env.GALLEY_SHOTS}/scrub.png` });
  const scrubbed = await page.evaluate(() => {
    const paper = document.querySelector('.gly-scrub-paper[data-v]');
    return {
      scroll: window.scrollY,
      docH: document.body.scrollHeight,
      v: paper.dataset.v,
      text: paper.innerText.trim().length,
      size: getComputedStyle(paper).fontSize,
      panes: document.querySelectorAll('.gly-versions-rail, .gly-versions-sub')
        .length,
      primary: document.getElementById('gly-revise').innerText.trim(),
      readout: document.getElementById('gly-status').innerText.trim(),
      restore: (() => {
        const b = document.querySelector('.gly-eyebrow .gly-versions-restore');
        if (!b || b.hidden) return null;
        const s = getComputedStyle(b);
        return { text: b.innerText, border: s.borderTopWidth };
      })(),
    };
  });
  check(
    'a keyframe press puts that version on the sheet, in the draft’s own type',
    scrubbed.v === '1' && scrubbed.text > 0 && scrubbed.size === draftType.size,
    JSON.stringify(scrubbed),
  );
  check(
    'and it is ONE SHEET — no rail beside it and no sub-bar over it',
    scrubbed.panes === 0,
    JSON.stringify(scrubbed.panes),
  );
  check(
    'the primary’s slot is the way back, and the readout says the draft is safe',
    scrubbed.primary === '← back to draft' &&
      /rounds? · draft is untouched$/.test(scrubbed.readout),
    JSON.stringify(scrubbed),
  );
  // RESTORE IS THE ONE ACT HERE WITH NO UNDO OUTSIDE GIT, so it may never be a
  // pill at rest and it arms before it fires. It shipped as a bordered pill
  // beside `Changes` and `Side by side`; those toggles are deleted and the
  // button lives in the eyebrow, where the weight still has to hold.
  check(
    'restore is at destroy weight — borderless, and it names the version it would write',
    !!scrubbed.restore &&
      scrubbed.restore.border === '0px' &&
      // innerText comes back through `text-transform: uppercase`, which is the
      // eyebrow's own type and not the label's, so the compare is on the words.
      /^restore v\d+ as draft$/i.test(scrubbed.restore.text),
    JSON.stringify(scrubbed.restore),
  );
  await page.click('.gly-eyebrow .gly-versions-restore');
  const armed = await page.evaluate(() => ({
    text: document.querySelector('.gly-eyebrow .gly-versions-restore')
      .innerText,
    armed: document
      .querySelector('.gly-eyebrow .gly-versions-restore')
      .classList.contains('is-armed'),
  }));
  check(
    'and it arms before it overwrites the draft, firing on the second press',
    /^replace draft\?$/i.test(armed.text) && armed.armed === true,
    JSON.stringify(armed),
  );

  // THE WAY OUT, AND THE SCROLL. Reading a version is a MODE and not a page:
  // the sentence the reviewer was reading has to be under the cursor when they
  // come back. Esc is the exit the spec gives the scrubber; the primary says
  // the same thing for the mouse and is asserted above.
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.body.classList.contains('gly-scrubbing'),
  );
  const back = await page.evaluate(() => ({
    prose: !!document.querySelector('.ProseMirror'),
    // `gly-scrubbing`, NOT `gly-history-mode`. Nothing has set the latter since
    // the reading mode became the scrubber's stage, so `!back.mode` was
    // vacuously true and this check could not fail on the half it names.
    mode: document.body.classList.contains('gly-scrubbing'),
    primary: document.getElementById('gly-revise').innerText.trim(),
    scroll: window.scrollY,
  }));
  check(
    'Esc returns to the head, and the primary returns the draft’s own face',
    back.prose && !back.mode && back.primary !== '← back to draft',
    JSON.stringify(back),
  );
  check(
    'and the draft’s scroll position survived the round trip',
    back.scroll === enteredHistoryAt,
    JSON.stringify({
      scroll: back.scroll,
      enteredHistoryAt,
      scrubbed: scrubbed.scroll,
      docH: scrubbed.docH,
    }),
  );
  const rounds = await page.evaluate(
    async () => (await (await fetch('/_galley/versions')).json()).rounds.length,
  );
  check(
    'reading a version leaves the record intact',
    rounds >= 4,
    String(rounds),
  );

  // --- PHASE 6 · WHAT 1440px TEACHES, 620px REPEATS ---
  //
  // §6.1 — THE TWO DOORS ARE ADJACENT. `Instructions · N` sat in the bottom bar
  // and `History` sat in the TOP bar, so the two controls this product insists
  // are peers were on opposite edges of the screen: nothing a reviewer learned
  // at 1440px transferred to 620px, and the top bar's own pairing was the thing
  // being unlearned. Board 1i.
  //
  // ONE INSTRUCTION IS PENDING FIRST, and it is filed through the rail while
  // the rail still exists — the whole-document handle is wide-layout chrome, so
  // this is the order the fixture has to be built in. It also gives the count a
  // number to be wrong about and the sheet a card to hold, which is what makes
  // §6.2 below capable of failing.
  await addOverallInstruction(
    page,
    'Name the retention window in the summary.',
    1,
  );
  await page.setViewportSize({ width: 620, height: 900 });
  await page.waitForFunction(
    () => document.querySelector('.gly-bottombar')?.hidden === false,
  );
  const foot = await page.evaluate(() => {
    const bar = document.querySelector('.gly-bottombar');
    return {
      order: [...bar.children].map((c) => c.className),
      buttons: [...bar.querySelectorAll('button')].map((b) => ({
        cls: b.className,
        // innerText and not textContent: what a reviewer reads is what the
        // browser renders, and a label collapsed out of the paint (this
        // repository has measured one) reads identically in the source.
        text: b.innerText.trim(),
        name: (b.getAttribute('aria-label') || b.innerText || '').trim(),
        // A RECT INSIDE THE WINDOW IS NOT A CONTROL THE REVIEWER CAN PRESS.
        reachable: (() => {
          const r = b.getBoundingClientRect();
          const at = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return !!at && b.contains(at);
        })(),
      })),
      // The rail is deleted; `!document.querySelector('.gly-rail').hidden` read
      // a column that is not in the DOM. Its absence is the claim.
      railGone: document.querySelector('.gly-rail') === null,
    };
  });
  // THE HISTORY DOOR IS DELETED, so `Instructions and History are adjacent` is
  // an assertion about a control that does not exist. What the bar carries at
  // 620px is the door to the instructions and the stepper; the record is
  // reached by the timeline, which is in the footer at every width.
  check(
    'the Instructions door leads the bottom bar, with the stepper beside it',
    foot.buttons.length === 2 &&
      /^Instructions · \d+$/.test(foot.buttons[0].text) &&
      foot.buttons[1].text === '↓ next' &&
      foot.order[0].includes('gly-bar-count'),
    JSON.stringify(foot),
  );
  // THE CLAIM IS THE PLACE, NOT THE WORD. The primary's label is a live thing —
  // `Revise · N ▾`, `Approve`, and `revising · 1s` while a round is in flight,
  // which is what a countdown started a few checks earlier is still saying when
  // this runs. Asserting the word made this check a race it lost the first time
  // the timing shifted; what phase 6 actually promises is that the control
  // stays selectable by `#gly-revise`, outside `.gly-bottombar`, and stays
  // pressable when the rail is gone — not that it stays in the top bar,
  // which Task 4 moved it out of into the fixed footer (`.gly-timeline`).
  //
  // AND THE WIDTH IS MEASURED, WHICH IS THE HALF THAT WENT MISSING. This block
  // shipped with `inTopBar: true` HARDCODED into the evaluate — a field the
  // page never answered — under a title that said the opposite of the comment
  // above it, and `width` was collected and only tested `> 0`. That is the one
  // measurement that would have caught the primary rendering ~425px wide with
  // its four faces laid out side by side: `#gly-revise.gly-revise` shipped
  // `display: inline-flex` and beat the one-cell grid the reserve is built on.
  // So the reserve itself is what is asserted — the four `.gly-revise-label`
  // rects share ONE ORIGIN, which is what "one grid cell" means in pixels, and
  // the button is under 200px, which is what it means in width.
  const primaryHere = await page.evaluate(() => {
    const b = document.getElementById('gly-revise');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const labels = [...b.querySelectorAll('.gly-revise-label')].map((el) => {
      const lr = el.getBoundingClientRect();
      return {
        x: Math.round(lr.x),
        mid: Math.round(lr.x + lr.width / 2),
        y: Math.round(lr.y),
        text: el.textContent,
      };
    });
    return {
      inTimeline: !!document.querySelector('.gly-timeline-right #gly-revise'),
      width: Math.round(r.width),
      top: Math.round(r.top),
      reachable: !!at && b.contains(at),
      inFoot: !!document.querySelector('.gly-bottombar #gly-revise'),
      labels,
      // ONE CELL IS ONE CENTRE, NOT ONE LEFT EDGE. `place-items: center`
      // centres each face in the shared cell, so four faces of four widths
      // have four different `x` and the SAME midpoint and the same `y`. Laid
      // out side by side — the `inline-flex` this check was written to catch —
      // the midpoints march rightwards and no two of them agree.
      // ±1px: the four faces share one grid cell, and their centres differ
      // only by the rounding of four different text widths — Linux fonts put
      // `← back to draft` at 515 beside three at 516 and a strict equality
      // read that as a second cell.
      oneCell:
        labels.length === 4 &&
        labels.every(
          (l) => Math.abs(l.mid - labels[0].mid) <= 1 && l.y === labels[0].y,
        ),
    };
  });
  check(
    'Revise is in the timeline footer, one grid cell wide, and pressable there',
    primaryHere !== null &&
      primaryHere.inTimeline === true &&
      primaryHere.oneCell === true &&
      primaryHere.width > 0 &&
      primaryHere.width < 200 &&
      primaryHere.reachable === true &&
      primaryHere.inFoot === false,
    JSON.stringify(primaryHere),
  );
  // EVERY CONTROL CARRIES A VISIBLE LABEL. `▤` was an icon with an accessible
  // name and a tooltip, and the first real review already proved of the History
  // glyph that neither makes a bare symbol discoverable to a sighted reviewer.
  // The claim is read off the RENDERED string of every button in the bar, so a
  // fourth control added wearing a glyph fails here rather than shipping.
  check(
    'every control in the bottom bar says what it is — no bare icons left',
    foot.buttons.every((b) => /[a-z]/i.test(b.text) && b.name.length > 0) &&
      foot.buttons.some((b) => b.text === '↓ next'),
    JSON.stringify(foot.buttons.map((b) => b.text)),
  );
  check(
    'and every one of them can actually be pressed at 620px',
    foot.buttons.every((b) => b.reachable),
    JSON.stringify(foot.buttons),
  );

  // §6.2 — THE DEAD 620px INSTRUCTIONS CLICK. Reported as unverified and it is
  // REAL: measured on the built binary at 620×900, the click was delivered
  // (`elementFromPoint` at the control's centre returned `.gly-bar-count`,
  // playwright resolved it in 9ms with no timeout) and `openInstructions` ran
  // (`called 1 time(s)`, instrumented) — and `.gly-rail`, `.gly-sheet` and
  // `.gly-versions` were ALL still hidden afterwards. Not the harness: a door
  // that answers the press and shows nothing.
  //
  // THE CHECK READS WHAT IS ON SCREEN, never that the handler ran. `sheetOpen`
  // is what the code SET, and a check reading it would have been green through
  // the whole defect — the flag was true for the frame between the two lines
  // that set it, and the surface was hidden the whole time.
  await page.click('.gly-bar-count');
  const narrowDoor = await page.evaluate(() => ({
    sheet: !document.querySelector('.gly-sheet').hidden,
    // The rail is deleted; this read `.hidden` on a column that is not in the
    // DOM. `railGone` is the claim that survives — one surface, one state.
    railGone: document.querySelector('.gly-rail') === null,
    cards: document.querySelectorAll('.gly-sheet .gly-thread').length,
    text: document.querySelector('.gly-sheet')?.innerText || '',
    barOverSheet: (() => {
      const b = document.querySelector('.gly-bar-count');
      const r = b.getBoundingClientRect();
      const at = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return !!at && b.contains(at);
    })(),
  }));
  check(
    'the Instructions door at 620px opens the review’s list instead of nothing',
    narrowDoor.sheet === true && narrowDoor.railGone === true,
    JSON.stringify({ sheet: narrowDoor.sheet, railGone: narrowDoor.railGone }),
  );

  // THE SHEET'S OWN ✕ HAS A NAME. The bottom bar's rule two checks up — every
  // control says what it is — retired `▤` outright; this control kept its glyph
  // and had NO accessible name at all, so the only way out of the review list
  // announced itself as the character `✕`, or as nothing. The two cases differ
  // on whether the glyph is legible to a SIGHTED reviewer (a ✕ closing a panel
  // is; `▤` was not, which the first real review proved) and agree completely
  // on the name.
  const sheetClose = await page.evaluate(() => {
    const b = document.querySelector('.gly-sheet-close');
    return b
      ? { name: b.getAttribute('aria-label') || '', title: b.title || '' }
      : null;
  });
  check(
    'the way out of the review list says what it is',
    sheetClose &&
      sheetClose.name.length > 0 &&
      /[a-z]/i.test(sheetClose.name) &&
      sheetClose.title === sheetClose.name,
    JSON.stringify(sheetClose),
  );
  check(
    'and the instruction that is pending is actually in it',
    narrowDoor.cards > 0 &&
      narrowDoor.text.includes('Name the retention window in the summary.'),
    JSON.stringify({
      cards: narrowDoor.cards,
      text: narrowDoor.text.slice(0, 200),
    }),
  );
  check(
    'the bottom bar stays reachable over the surface it opened',
    narrowDoor.barOverSheet === true,
  );

  // THE SECOND DOOR IS DELETED. `the History door beside it opens the record`
  // read `.gly-bar-versions`, the narrow bar's half of the History pairing;
  // the record is reached by the timeline now, which is in the footer at every
  // width and needs no door of its own. Retired rather than weakened.
  //
  // The sheet the Instructions door opened is put away by hand here: pressing
  // History used to be what closed it, and the sections below need the primary
  // pressable.
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.querySelector('.gly-sheet')?.hidden === true,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(
    () => document.querySelector('.gly-bottombar')?.hidden === true,
  );

  // §6.3 — THE ARRIVAL STRIP. Board 1e. A round has to actually come back for
  // this to exist, so one is driven the way every other round here is driven.
  await sendRound([]);
  await agentReturns(
    '# A careful review\n\nBounded retries: 12 attempts over 48 hours.\n\n' +
      '## The budget\n\nEach message gets a retry budget of 12 attempts over 48 hours (incident #482).\n\n' +
      '## What happens at exhaustion\n\nWhen a message exhausts its budget it moves to the dead letter queue, ' +
      'kept 14 days from the day it lands.\n',
    [
      {
        quote: 'kept 14 days from the day it lands',
        answers: [],
        note: 'Said when the retention window starts.',
      },
    ],
  );
  // AN ARRIVAL RAISES NOTHING OVER THE PAPER ANY MORE. Task 11 moved that
  // sentence INTO the paper — the changed block tints, the WAS strip under it
  // carries what it said before — and Task 14 deleted the strip surface and the
  // History chip it named. The checks that read them are retired below.
  //
  // THE STRIP'S SENTENCE WAS ALSO THIS SECTION'S CLOCK — the wait for `v{n}` on
  // it was what said the browser had finished landing the round. With it gone
  // the wait re-points to the frame the arrival repaints: the primary leaves
  // `revising`. That is the arrival landing in the UI, not a claim about it.
  // BOUNDED, AND THE TIMEOUT IS A RED CHECK RATHER THAN A SWALLOW. It was
  // `.catch(() => {})`, which turns "the round never landed" into a silent
  // fifteen-second pause followed by whatever the reds below happen to say —
  // and a wait that cannot fail is not a wait, it is a sleep. The failure has a
  // name now, so a build where the arrival never reaches the UI reports THAT
  // and not a scatter of downstream confusion.
  const landedInUI = await page
    .waitForFunction(
      () =>
        !(
          document.getElementById('gly-revise')?.innerText || 'revising'
        ).includes('revising'),
      undefined,
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false);
  check('the arrival reached the UI — the primary left `revising`', landedInUI);
  const record6 = await page.evaluate(
    async () => (await (await fetch('/_galley/versions')).json()).rounds,
  );
  const arrivedRound = record6[record6.length - 1];
  // THE COUNT IS THE SERVER'S. `changed` comes off `/_galley/versions`,
  // computed by diff.Regions per request. A count agreed with a render would be
  // a count that lies the day the render is wrong.
  check(
    'and that count is the record’s, not a count of anything drawn',
    arrivedRound.changed > 0,
    JSON.stringify({ changed: arrivedRound.changed }),
  );
  // THE STRIP IS DELETED AND SO IS THE CHIP IT NAMED. Six checks stood here —
  // the strip's corner, its border, its `read changes` verb, its quiet dismiss,
  // the History chip going amber, and `read changes` deep-linking to a round's
  // reading state — and every one of them measured a surface this task removes.
  // Task 11 put the arrival INSIDE the paper — the changed block tints and the
  // WAS strip under it carries what the sentence said before — and that surface
  // has its own checks where it is built. What is asserted here is the half
  // this task is responsible for: the two surfaces an arrival used to raise are
  // not on the page at all, and the primary is the verb the round left behind.
  const inline = await page.evaluate(() => ({
    strip: document.querySelectorAll('.gly-strip').length,
    chip: document.querySelectorAll('.gly-versions-open').length,
    primary: document.getElementById('gly-revise').innerText.trim(),
  }));
  check(
    'and neither the arrival strip nor the History chip is on the page at all',
    inline.strip === 0 && inline.chip === 0,
    JSON.stringify(inline),
  );
  check(
    'and the primary shows Approve, because nothing is pending',
    inline.primary.includes('Approve'),
    inline.primary,
  );

  await addOverallInstruction(page, 'Final trusted pass.', 1);
  await page.click('#gly-revise');
  await page.click('.gly-verdict-trust');
  await page.waitForFunction(
    async () =>
      (await (await fetch('/_galley/pending')).json()).instructions.length ===
      0,
  );
  await ack(page, 'failed', 'cannot complete the trusted pass');
  await page.waitForTimeout(1700);
  check(
    'Revise & Approve leaves a failed result open for another round',
    !(await page.isVisible('#gly-seal:not(.gly-seal-off)')),
  );

  // THE REFUSAL VOICE, ON THE ONE ROUND THAT EARNS IT — and it goes LAST
  // because it navigates. `NOT ANSWERED`, dashed, italic, is reserved for a
  // round the agent said outright it could not do. It used to be spent on every
  // unattributed ask, which is what put it over two instructions a revision had
  // plainly carried out; narrowing it without driving the narrow case is how it
  // would come back, because a state nothing drives is a state nothing protects.
  await addRangeInstruction(page, 'Rewrite this in the passive voice.', 1);
  await page.click('#gly-revise');
  await page.click('.gly-verdict-revise');
  await page.waitForTimeout(900);
  const cannotCode = await page.evaluate(
    async () =>
      (
        await fetch('/_galley/cannot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            why: 'the passive voice would bury the decision',
          }),
        })
      ).status,
  );
  check(
    'an exception is a round the server accepts',
    cannotCode === 204 || cannotCode === 200,
    String(cannotCode),
  );
  await page.waitForTimeout(1800);
  // THE REFUSAL'S CARD IS DELETED, AND THE KEYFRAME CARRIES THE VOICE NOW.
  // `a refused round wears NOT ANSWERED, dashed and in the refusal voice` read
  // `.gly-versions-unanswered` on the History landing. The record is the
  // timeline: an exception is a HOLLOW CORAL keyframe labelled `· cannot`, and
  // apart by shape as well as by word is the same discipline said on the
  // surface that inherited it.
  const refusedRound = await page.evaluate(() => {
    const k = document.querySelector('.gly-scrub-key[data-tone="coral"]');
    if (!k) return null;
    return {
      label: k.innerText.trim(),
      title: k.title,
      fill: k.dataset.fill,
      color: getComputedStyle(k).color,
      coral: (() => {
        const probe = document.createElement('span');
        probe.style.color = getComputedStyle(document.documentElement)
          .getPropertyValue('--gly-coral')
          .trim();
        document.body.appendChild(probe);
        const want = getComputedStyle(probe).color;
        probe.remove();
        return want;
      })(),
    };
  });
  // AND THE ONE THAT OVERWRITES THE DRAFT HOLDS STILL BETWEEN ITS TWO PRESSES.
  //
  // `restore vN as draft` becomes `replace draft?` on its own click, and while
  // that was written straight into textContent the control moved 33.1px left
  // and shrank 125.8 -> 92.7 between the arming press and the confirming one —
  // the second click landing where the first was not, on the one verb here that
  // cannot be undone. `.gly-thread-delete` has solved this since the day it was
  // written; the copy never carried across, and §4 asks it of the WEIGHT rather
  // than of that one button.
  const restoreBox = async () =>
    page.evaluate(() => {
      const b = document.querySelector('.gly-eyebrow .gly-versions-restore');
      if (!b || b.hidden) return null;
      const r = b.getBoundingClientRect();
      return {
        x: Math.round(r.x * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        said: b.innerText.trim(),
      };
    });
  // OFF THE HEAD FIRST — the verb is offered only while an earlier version is
  // on the sheet, because there is nothing at the head to restore the draft
  // FROM. THE VERSION BEFORE THE HEAD, not the first keyframe: restoring is a
  // real write and this section presses it twice, so a restore from v1 would
  // replace the whole fixture with the file as galley opened it and every count
  // below would be reading a different document.
  //
  // PRESSED THROUGH THE ELEMENT, not through the pointer: by this point the
  // fixture has eleven rounds and their labels overlap on a 1440px track, so
  // the neighbour's label sits over this one's centre and a real click lands on
  // the wrong keyframe. That crowding is real at eleven rounds and it is not
  // this check's claim; whether a keyframe is reachable by pointer is asserted
  // at §7, on a track the reviewer's own review actually produced.
  await page.evaluate(() =>
    document.querySelector('.gly-scrub-key:nth-last-child(2)').click(),
  );
  await page.waitForSelector('body.gly-scrubbing .gly-scrub-paper[data-v]');
  const restIdle = await restoreBox();
  if (restIdle) {
    await page.click('.gly-eyebrow .gly-versions-restore');
    await page.waitForTimeout(300);
    const restArmed = await restoreBox();
    check(
      'the restore verb does not move or resize on its own arming click',
      restArmed &&
        restIdle.x === restArmed.x &&
        restIdle.w === restArmed.w &&
        restIdle.said !== restArmed.said,
      JSON.stringify({ idle: restIdle, armed: restArmed }),
    );

    // AND IT SURVIVES BEING PRESSED. The confirming click announced itself with
    // `restoreButton.textContent = 'restoring…'`, which REPLACES the button's
    // children — destroying both label spans. Every later paintRestore then
    // wrote labels and toggled classes on DETACHED nodes, so the button was
    // left reading "restoring…" for as long as the page lived, with the reserve
    // that stops it moving on its own click gone with the spans. It is not a
    // failure path: the SUCCESS path did it too.
    //
    // THE CHECK READS THE SPANS, not the button's text. Text alone recovers on
    // the next repaint of a rebuilt panel and would go green over a button
    // whose reserve had been destroyed — the same proxy-reading shape this file
    // records four of.
    await page.click('.gly-eyebrow .gly-versions-restore');
    await page.waitForTimeout(600);
    const restAfter = await page.evaluate(() => {
      const b = document.querySelector('.gly-eyebrow .gly-versions-restore');
      if (!b) {
        return null;
      }
      return {
        spans: b.querySelectorAll('span').length,
        said: b.innerText.trim(),
      };
    });
    check(
      'pressing restore does not destroy the button that was pressed',
      restAfter && restAfter.spans >= 2 && restAfter.said !== 'restoring…',
      JSON.stringify(restAfter),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }

  // AND THE ROW THE REFUSAL IS ABOUT SURVIVES THE PRESS THAT SENT IT. Rows were
  // built from the PENDING list, which Revise empties — so the instant the
  // reviewer pressed, every row left the paper and spec §2-§4's `writing…`,
  // `applied` and `not applied` were unreachable states of a surface that was
  // no longer there. That left the repo's own invariant — nothing the reviewer
  // sent may ever disappear — with no surface at all. They come off the round's
  // immutable `asks` now, and a sent row offers no `×`: it is a fact about the
  // past, not an offer to un-say it.
  const refusedRows = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.ProseMirror .gly-row')];
    return {
      states: rows.map(
        (r) => r.querySelector('.gly-row-state')?.textContent ?? '',
      ),
      tones: rows.map((r) => r.dataset.tone),
      removable: rows.filter((r) => r.querySelector('.gly-row-remove')).length,
      phase: document.body.classList.contains('gly-phase-cannot'),
    };
  });
  check(
    'the refused instruction is still on the page, reading `not applied` in coral',
    refusedRows.states.length > 0 &&
      refusedRows.states.every((s) => s === 'not applied') &&
      refusedRows.tones.every((t) => t === 'coral') &&
      refusedRows.removable === 0 &&
      refusedRows.phase === true,
    JSON.stringify(refusedRows),
  );
  // AND THE BANNER SAYS IT IN WORDS, above the paper. `.gly-cannot` and its
  // four parts had no browser check at all — and the element declared
  // `display: grid`, which beat the UA's `[hidden]`, so an EMPTY coral box sat
  // over the sheet on every page that had never seen a refusal.
  const banner = await page.evaluate(() => {
    const el = document.querySelector('.gly-cannot');
    if (!el) {
      return { present: false };
    }
    const p = document.querySelector('.ProseMirror');
    return {
      present: true,
      hidden: el.hidden,
      display: getComputedStyle(el).display,
      label: el.querySelector('.gly-cannot-label')?.textContent ?? '',
      body: el.querySelector('.gly-cannot-body')?.textContent ?? '',
      why: el.querySelector('.gly-cannot-why')?.textContent ?? '',
      fixed: el.querySelector('.gly-cannot-fixed')?.textContent ?? '',
      abovePaper:
        el.getBoundingClientRect().bottom <= p.getBoundingClientRect().top,
    };
  });
  check(
    'the could-not banner is up, above the paper, carrying the agent’s reason',
    banner.present &&
      banner.hidden === false &&
      banner.display !== 'none' &&
      /could not/.test(banner.body) &&
      /passive voice/.test(banner.why) &&
      /report, not a conversation/.test(banner.fixed) &&
      banner.abovePaper,
    JSON.stringify(banner),
  );
  check(
    'a refused round is a hollow coral keyframe that says `cannot`',
    refusedRound &&
      /^R\d+$/.test(refusedRound.label) &&
      /· cannot$/.test(refusedRound.title) &&
      refusedRound.fill === 'none' &&
      refusedRound.color === refusedRound.coral,
    JSON.stringify(refusedRound),
  );

  // §6.4 — A HAND EDIT IS COUNTED ONCE, IN THE FOOTER TRAIL, AND HAS NO CARD.
  //
  // RETIRED, AND REPLACED RATHER THAN NARROWED. This section used to assert the
  // opposite: that `paintRailCards` filed one `.gly-change` per reviewer edit
  // under a `.gly-rail-changes` heading ("an edit the reviewer made by hand
  // appears in the rail"), with `revert`'s two-click arm on the card. That
  // surface is deleted. 02-states-and-behavior.md §1 gives a hand edit
  // page-only marks — coral line-through ghosts, the lime insertion wash —
  // cleared on send, and ONE count: the footer trail's `{E} edit(s), {I}
  // instruction(s) →`. A second list of the same edits beside the prose that
  // already shows them is the one-instruction-two-surfaces defect this branch
  // removed everywhere else. Targeted revert survives where the spec puts it,
  // over the ghost itself (`.gly-revert-float`, pending.ts) — the card's armed
  // pill was the second copy of it and went with the card.
  //
  // A PARAGRAPH, NOT THE HEADING, and the difference is not cosmetic. Emptying
  // a heading leaves "#" behind, which is a `changed` whose new text appears in
  // every other heading — genuinely ambiguous, and the server refuses it by
  // design rather than reverting one at random. Deleting a paragraph is both
  // the gesture a reviewer actually makes and the one shape the round can carry
  // exactly: a whole block, gone from where it was.
  //
  // READ OFF THE SERVER'S LIST, not the browser's live trail: `paintRevise`
  // counts `this.changes`, which is the round as the agent would receive it,
  // and the save debounce means the number arrives a beat after the keystroke —
  // hence the poll rather than one read.
  await page.evaluate(() => {
    const editor = window.galleyEdit.editor;
    const paras = [];
    editor.state.doc.descendants((node, pos) => {
      if (
        node.isTextblock &&
        node.type.name === 'paragraph' &&
        node.textContent.trim()
      ) {
        paras.push({ from: pos, to: pos + node.nodeSize });
      }
      return !node.isTextblock;
    });
    const last = paras[paras.length - 1];
    editor.commands.focus();
    editor.view.dispatch(editor.state.tr.delete(last.from, last.to));
  });
  let handEdit = { trail: '', cards: 0 };
  for (let i = 0; i < 24 && !/edit/.test(handEdit.trail); i++) {
    await page.waitForTimeout(500);
    handEdit = await page.evaluate(() => ({
      trail: (
        document.querySelector('.gly-revise-trail')?.innerText || ''
      ).trim(),
      // Every name the deleted list ever wore, on every surface — the rail, the
      // sheet, the bubble. The count is the assertion: a hand edit that grew a
      // card back anywhere fails here, not only in the rail.
      cards: document.querySelectorAll(
        '.gly-change, .gly-rail-changes, .gly-rail-changes-head, .gly-change-revert',
      ).length,
      // A ghost the reviewer can hover to revert — the surface the spec DOES
      // give a hand edit. Presence only: the float is positioned on hover.
      ghosts: document.querySelectorAll('.gly-trail-ghost').length,
    }));
  }
  check(
    'a hand edit is counted in the footer trail',
    /\b1 edit\b/.test(handEdit.trail),
    JSON.stringify(handEdit),
  );
  check(
    'and it has no card, on any surface — the marks in the prose are the surface',
    handEdit.cards === 0,
    JSON.stringify(handEdit),
  );

  // §6.4a — `a band that holds no cards reserves no height` IS RETIRED WITH THE
  // BAND. It stated the invariant `paintAnchors` and `threadCard` kept between
  // them: the band's height came from the stacker's bottom, the stacker's
  // adrift tail summed every card whose anchor it could not measure, and an
  // anchorless card counted into that height would have drawn a column of empty
  // air above the rail's flow sections. `.gly-rail-band` is deleted, and so are
  // both of its keepers — an instruction with a place in the document is a
  // ProseMirror widget row under its block, and the anchorless ones are in flow
  // in the sheet's slot with no height to reserve for anybody.

  // §6.5 — A SELECTION THAT CROSSES A BLOCK BOUNDARY CAN BE COMMENTED ON.
  //
  // It could not, and the failure was guaranteed rather than occasional:
  // `docRange` refused to produce coordinates for a selection whose ends were
  // in different blocks, so the composer sent the selected TEXT and the server
  // searched for it inside single blocks. The concatenation of two paragraphs
  // is in neither, so `findUnique` reported `matched 0 times` and refused —
  // after the composer had opened, accepted the typing, and taken the
  // reviewer's instruction. Every multi-block selection, always.
  //
  // THE CHECK DRIVES A REAL SELECTION rather than posting the coordinates,
  // because the browser's half is where the bug was: the server has had
  // path/from/to for a long time, and what was missing was any way for the page
  // to say "this ends over there".
  const crossed = await page.evaluate(() => {
    const editor = window.galleyEdit.editor;
    const blocks = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.isTextblock && node.textContent.trim()) {
        blocks.push({ pos, len: node.textContent.length });
      }
      return !node.isTextblock;
    });
    if (blocks.length < 2) {
      return null;
    }
    const a = blocks[0];
    const b = blocks[1];
    editor.commands.focus();
    // Mid-way into the first block, mid-way into the second: both ends inside
    // text, neither at a boundary, so nothing here is a degenerate range that
    // a single-block path could have handled anyway.
    editor.commands.setTextSelection({
      from: a.pos + 1 + Math.floor(a.len / 2),
      to: b.pos + 1 + Math.floor(b.len / 2),
    });
    editor.view.focus();
    return { blocks: blocks.length };
  });
  check(
    'the fixture has two blocks to select across',
    !!crossed,
    JSON.stringify(crossed),
  );
  if (crossed) {
    await page.waitForSelector('.gly-composer-form:not([hidden])', {
      timeout: 5000,
    });
    await page.fill('.gly-composer-text', 'tighten this passage');
    const before = await page.evaluate(
      async () =>
        (await (await fetch('/_galley/pending')).json()).instructions.length,
    );
    await page.click('.gly-composer-send');
    // POLLED, NOT `waitForFunction(async …)`: an async page function returns a
    // promise, a promise is truthy, and such a wait resolves on its first poll
    // whatever the fetch said. This file has paid for that once already.
    let after = before;
    for (let i = 0; i < 20 && after === before; i++) {
      await page.waitForTimeout(250);
      after = await page.evaluate(
        async () =>
          (await (await fetch('/_galley/pending')).json()).instructions.length,
      );
    }
    const filed = await page.evaluate(async () => {
      const list = (await (await fetch('/_galley/pending')).json())
        .instructions;
      const mine = list.filter((i) => i.text === 'tighten this passage');
      return {
        count: mine.length,
        quote: mine[0] ? mine[0].quote : null,
        run: mine[0] ? mine[0].run : null,
        marks: document.querySelectorAll('.gly-comment-anchor, .gly-highlight')
          .length,
      };
    });
    check(
      'an instruction on a selection crossing two blocks is accepted',
      filed.count === 1,
      JSON.stringify(filed),
    );
    check(
      'and it is ONE instruction with one run, not one per block',
      filed.count === 1 && !!filed.run,
      JSON.stringify(filed),
    );
  }

  // §7 — THE RECORD SURVIVES THE SEAL. LAST, because approving ends the review
  // and every check above it needs a live one.
  //
  // Losing the record was never argued — it was collateral. `sealHides` held
  // the whole census strip, and History's door lived in that strip, so sealing
  // a review took the record of it off the page; `layers.mjs` measured a click
  // on that door hanging for thirty seconds and throwing.
  //
  // THE DOOR IS DELETED AND THE CLAIM IS NOT. `History survives the seal — the
  // door is shown, enabled and pressable` and `the instruction list's door does
  // not` both read the census strip's two chips, and both chips are gone. The
  // record is the timeline, which is in the footer at every width; a sealed
  // review is exactly when somebody wants to read what happened, so the
  // keyframes have to be there and pressable, and the sheet has to answer.
  await page.evaluate(() =>
    fetch('/_galley/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict: 'approve' }),
    }),
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('#gly-seal')
        ?.classList.contains('gly-seal-off') === false,
    { timeout: 8000 },
  );
  const sealedTrack = await page.evaluate(() => {
    const key = document.querySelector('.gly-scrub-key');
    if (!key) {
      return null;
    }
    const r = key.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      // READ WHAT THE BROWSER WILL DO WITH A CLICK, not a class. A rect inside
      // the window is not a control the reviewer can press, and `display: none`
      // on an ancestor is exactly what used to be wrong here.
      shown: getComputedStyle(key).display !== 'none',
      disabled: key.disabled,
      reachable: !!at && key.contains(at),
      // The instruction list's door SHOULD be gone on a sealed page: every verb
      // on every one of those cards is dead, so it leads to a surface nothing
      // can be done on. The record is the opposite — reading is all that is
      // left. `.gly-census-count` was the wide bar's door and IS DELETED with
      // the census strip, so that clause could not fail; the door that still
      // exists is the narrow bar's `.gly-bar-count`, which the seal kills
      // (SEALED_VERBS, web/seal.ts), and it is what is read.
      countShown: (() => {
        const count = document.querySelector('.gly-bar-count');
        return !!count && !count.disabled;
      })(),
    };
  });
  check(
    'the timeline survives the seal — its keyframes are shown and pressable',
    sealedTrack &&
      sealedTrack.shown &&
      sealedTrack.disabled === false &&
      sealedTrack.reachable,
    JSON.stringify(sealedTrack),
  );
  check(
    'and the instruction list’s door does not, because every verb behind it is dead',
    sealedTrack && sealedTrack.countShown === false,
    JSON.stringify(sealedTrack),
  );
  await page.click('.gly-scrub-key');
  await page.waitForSelector('body.gly-scrubbing .gly-scrub-paper[data-v]');
  const sealedRead = await page.evaluate(() => ({
    scrubbing: document.body.classList.contains('gly-scrubbing'),
    text: (
      document.querySelector('.gly-scrub-paper[data-v]')?.innerText ?? ''
    ).trim().length,
  }));
  check(
    'and pressing one reads the review that just ended',
    sealedRead.scrubbing && sealedRead.text > 0,
    JSON.stringify(sealedRead),
  );
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
  if (childURL) {
    let gone = false;
    for (let i = 0; i < 25 && !gone; i += 1) {
      try {
        await fetch(childURL);
      } catch {
        gone = true;
      }
      if (!gone) await new Promise((r) => setTimeout(r, 200));
    }
    check('the child editor died with the workspace that started it', gone);
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // The server can project once while SIGTERM is landing.
  }
}

if (failures) {
  if (serverOutput.trim()) console.log(serverOutput.trim());
  process.exit(1);
}
