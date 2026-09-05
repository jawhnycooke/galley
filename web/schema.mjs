// schema.mjs — `just schema`. THE GATE THAT HAS NO SHAPE IN IT.
//
// A NODE THE BROWSER'S SCHEMA CANNOT BUILD IS DELETED, AND THE PROJECTION
// WRITES THE DELETION TO THE AUTHOR'S FILE. That sentence has now been paid for
// three times — `<note>`, a blank table cell, and a list item whose first child
// is not a paragraph — and each time the answer was a hand-written check for
// that one shape. Two of them are still in the tree (internal/ydoc's
// TestEveryCellCrossesWithABlockInside, web/typing.mjs §0) and both are worth
// keeping, because they read a real fragment and real bytes. Neither could have
// caught the third.
//
// WHY THE EXISTING GATES CANNOT SEE THIS CLASS, stated so nobody adds a fourth
// hand-written check instead:
//
//   - every .md in the repository passes, before and after each bug. A corpus
//     of real documents is a corpus of the shapes somebody already thought of.
//   - FuzzRoundTrip is Parse<->Serialize only. ALL EIGHTEEN spellings of the
//     list-item bug round-trip BYTE-IDENTICALLY through it, because Serialize
//     never sees the browser.
//   - schema_drift_test.go and probe.mjs's FRAGMENT_NODES check node NAMES.
//     `listItem` was in both lists the whole time; it was its CONTENT rule that
//     could not be satisfied.
//   - `just typing`, `just layers`, `just motion` and `just loop` each open ONE
//     fixture. A fixture is a shape somebody chose.
//
// So this gate replays y-prosemirror's own walk over markdown.Parse's own
// output, across a generated cross product of every construct in every
// container at every position that changes the answer — plus every .md file in
// the repository, which is the half that must stay green.
//
// Running it:
//
//   just schema
//   node web/schema.mjs            # from web/, with node_modules installed
//   node web/schema.mjs --list     # print the corpus ids and exit
//
// It needs node and a Go toolchain. It needs NO browser and NO server, which is
// why — unlike layers/motion/typing/loop — it could be part of `just verify` if
// CI ever grows node; today it is a standing gate run by hand and by anyone
// touching internal/markdown or the fragment's shape.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { validate, checkDrift } from './schemacheck.mjs';
import { rows } from './schemacorpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: REPO, ...opts });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => {
      out += d;
    });
    p.stderr.on('data', (d) => {
      err += d;
    });
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd}: ${err || code}`)),
    );
    if (opts.stdin !== undefined) {
      p.stdin.end(opts.stdin);
    }
  });

// EVERY .md THE REPOSITORY SHIPS. This half of the corpus must be green
// always — it is what says the gate is measuring the product and not just
// refusing everything. `git ls-files` rather than a walk: a file that is not
// tracked is not shipped, and node_modules is enormous.
async function shippedFiles() {
  const listed = (await run('git', ['ls-files', '*.md', '*.markdown']))
    .split('\n')
    .filter(Boolean);
  return listed.map((path) => ({
    id: `file:${path}`,
    src: readFileSync(join(REPO, path), 'utf8'),
    file: path,
  }));
}

const corpus = rows();

if (process.argv.includes('--list')) {
  for (const r of corpus) console.log(r.id);
  process.exit(0);
}

let failures = 0;
let refusals = 0;
const say = (line) => console.log(line);

// 0. The schema this gate checks is the schema the browser builds.
const drift = checkDrift();
for (const d of drift) {
  failures += 1;
  say(`FAIL  extension-list drift — ${d}`);
}
if (!drift.length) say('ok    the extension list matches entry.ts');

const files = await shippedFiles();
const all = [...corpus, ...files];
const byId = new Map(all.map((r) => [r.id, r]));

const jsonl = all
  .map((r) => JSON.stringify({ id: r.id, src: r.src }))
  .join('\n');
const dumped = await run('go', ['run', './cmd/galley-schemadump'], {
  stdin: jsonl,
});

let checked = 0;
const deleted = [];
const refused = [];
for (const line of dumped.split('\n')) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  const src = byId.get(row.id);
  if (row.refused !== undefined) {
    refusals += 1;
    refused.push({ id: row.id, why: row.refused });
    continue;
  }
  checked += 1;
  const bad = validate(row.blocks || []);
  if (bad.length)
    deleted.push({ id: row.id, src: row.src, file: src && src.file, bad });
}

if (checked + refusals !== all.length) {
  failures += 1;
  say(
    `FAIL  the dumper answered for ${checked + refusals} of ${all.length} inputs`,
  );
}

// 1. NOTHING THE REPOSITORY SHIPS LOSES A NODE. If this ever goes red, a real
// document in this tree is being rewritten by opening it.
const shippedLosses = deleted.filter((d) => d.file);
if (shippedLosses.length) {
  failures += 1;
  say(`FAIL  ${shippedLosses.length} shipped .md file(s) lose a node on open`);
  for (const d of shippedLosses) {
    say(`      ${d.file}`);
    for (const f of d.bad) say(`        ${f.path} :: ${f.why}`);
  }
} else {
  say(`ok    all ${files.length} shipped .md files survive being opened`);
}

// 2. NOTHING THE CORPUS GENERATES LOSES A NODE EITHER. Where a shape genuinely
// cannot be made legal without moving the author's bytes, markdown.Parse must
// REFUSE it with a line number — which is reported below and is never a
// deletion. Silent deletion is the one outcome this gate exists to forbid.
const corpusLosses = deleted.filter((d) => !d.file);
if (corpusLosses.length) {
  failures += 1;
  say(
    `FAIL  ${corpusLosses.length} of ${corpus.length} generated inputs lose a node on open`,
  );
  for (const d of corpusLosses) {
    say(`      ${d.id}  ${JSON.stringify(d.src)}`);
    for (const f of d.bad) say(`        ${f.path} :: ${f.why}`);
  }
} else {
  say(`ok    all ${corpus.length} generated inputs survive being opened`);
}

if (refusals) {
  // A REFUSAL IS A RESULT, NOT A FAILURE — and it is printed in full so that a
  // new one cannot be added without somebody reading it. Refusing is honest;
  // silently deleting is not.
  say(`note  ${refusals} input(s) markdown.Parse refuses outright:`);
  for (const r of refused) say(`        ${r.id} — ${r.why}`);
}

say('');
say(
  failures === 0
    ? `PASS  ${checked} documents, 0 nodes deleted (${relative(REPO, HERE)}/schema.mjs)`
    : `FAILED with ${failures} failing check(s)`,
);
process.exit(failures === 0 ? 0 : 1);
