// schemacheck.mjs — y-prosemirror's verdict on a galley document, with no
// browser and no server.
//
// THE GENERIC CHECK. Three data-loss bugs in this repository were one bug:
// markdown.Parse produced a node the BROWSER'S SCHEMA CANNOT BUILD, and
// y-prosemirror deleted it out of the author's file. `<note>` was a tag TipTap
// had never been taught; a blank table cell and a list item whose first child
// is not a paragraph were tags it knows and CONTENT rules it cannot satisfy.
// Each was answered with a hand-written check for that one shape — and the
// third arrived anyway. This file is the check that has no shape in it: it
// constructs the SAME schema entry.ts builds and replays the SAME walk
// y-prosemirror does, so anything Parse can produce that the browser will
// delete fails here, including the ones nobody has thought of.
//
// WHY IT CAN BE TRUSTED WITHOUT A BROWSER. Every step below is the shipped
// code's own:
//
//   - the schema is `getSchema(...)` over the extension list in entry.ts —
//     the same call TipTap makes internally, over the same extensions, and
//     EXTENSIONS is held to entry.ts's own array by checkDrift() so the copy
//     cannot go stale in silence.
//   - the tree is markdown.Parse's real output, dumped by
//     cmd/galley-schemadump, shaped the way internal/ydoc's writeBlock writes
//     it into the fragment: a codeBlock's raw Text, else Inlines as text runs
//     (a hardBreak inline becoming its own element), else Children.
//   - the walk is createNodeFromYElement's. It builds children first, and
//     `createChildren` pushes a child only `if (n !== null)` — so A CHILD THAT
//     FAILS IS DELETED AND ITS PARENT IS BUILT WITHOUT IT, which is how the
//     cascade happens and why this models it rather than stopping at the first
//     throw. It then calls `schema.node(name, attrs, children)`, which is
//     `createChecked` and THROWS on a content violation, and the catch does
//     `el._item.delete()` — the node leaves the Y doc, the deletion is
//     broadcast, EditServer's OnUpdate fires, touch() schedules Project(), and
//     the projection writes the shortened document to the author's file.
//
// THE TOP LEVEL IS DELIBERATELY NOT CHECKED. y-prosemirror's initProseMirrorDoc
// ends with `schema.topNodeType.create(...)` — `create`, not `createChecked` —
// so an empty document does not throw and nothing is deleted for it. Asserting
// `doc`'s own `block+` here would fail every empty .md file, which is a file
// nobody has lost anything from. A document that ends up empty because every
// one of its blocks was deleted is already reported, once per deleted block.
//
// So "fails here" means exactly one thing: OPENING THIS DOCUMENT IN A BROWSER
// DELETES THIS NODE, WITH EVERYTHING IN IT, AND WRITES THE DELETION TO DISK.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TableRow from '@tiptap/extension-table-row';
import {
  TolerantHeading,
  FiguredCodeBlock,
  FiguredImage,
  ReadOnlyTable,
  AlignedTableHeader,
  AlignedTableCell,
  Ins,
  Del,
  Highlight,
} from './entry.ts';
import { NoteBlock } from './note.ts';
import { FrontMatterBlock } from './frontmatter.ts';
import { MathBlock } from './math.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

// The schema-bearing half of entry.ts's extension list, configured identically.
// Collaboration, suggestionMode and trailMode contribute no node and no mark;
// they are named in SCHEMALESS below so checkDrift can account for every entry
// in entry.ts rather than ignoring what it does not recognise.
export const EXTENSIONS = [
  StarterKit.configure({ history: false, heading: false, codeBlock: false }),
  TolerantHeading,
  FiguredCodeBlock,
  Link.configure({ openOnClick: false, autolink: false }),
  FiguredImage,
  ReadOnlyTable.configure({ resizable: false }),
  TableRow,
  AlignedTableHeader,
  AlignedTableCell,
  NoteBlock,
  FrontMatterBlock,
  MathBlock,
  Ins,
  Del,
  Highlight,
];

// The extensions that add NO node and NO mark, so they are absent from
// EXTENSIONS above and must not read as drift. Each is a bare plugin:
// Collaboration binds the fragment, suggestionMode is the literal-region
// filter, trailMode paints the reviewer's own edits, and litMode holds which
// runs are being attended to — all four are view state or transaction guards,
// and none of them can be built into a schema.
export const SCHEMALESS = [
  'Collaboration',
  'suggestionMode',
  'trailMode',
  'litMode',
];

export const fragmentSchema = getSchema(EXTENSIONS);

// checkDrift holds the list above to the one entry.ts actually hands the
// Editor. THE SCHEMA IS THE WHOLE CLAIM, so a copy of the extension list is a
// second place for it to live, and a gate reading a stale copy reports on a
// schema the browser does not have. It is a source read rather than an import
// because the list is an inline array literal inside `new Editor({...})` — the
// only import that could replace it is one entry.ts does not export, and
// entry.ts is out of this pass's reach.
//
// It compares the ORDER too: getSchema resolves a node name to the LAST
// extension that defines it, which is how FiguredCodeBlock takes `codeBlock`
// from StarterKit's stripped copy. Two lists with the same members in a
// different order are two different schemas.
export function checkDrift(entryPath = join(HERE, 'entry.ts')) {
  const src = readFileSync(entryPath, 'utf8');
  const at = src.indexOf('extensions: [');
  if (at < 0) return ['entry.ts: no `extensions: [` array found'];
  // Walk to the matching bracket so a nested array or object cannot end it
  // early.
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('[', at); i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return ['entry.ts: unterminated `extensions:` array'];
  const body = src
    .slice(src.indexOf('[', at) + 1, end)
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .join('\n');
  // Each entry is a bare identifier or `Identifier.configure(...)`/`call(...)`
  // at depth 0 of the array.
  const names = [];
  let depth2 = 0;
  let token = '';
  for (const ch of body) {
    if ('([{'.includes(ch)) depth2 += 1;
    else if (')]}'.includes(ch)) depth2 -= 1;
    if (ch === ',' && depth2 === 0) {
      const m = token.trim().match(/^([A-Za-z_$][\w$]*)/);
      if (m) names.push(m[1]);
      token = '';
      continue;
    }
    token += ch;
  }
  const m = token.trim().match(/^([A-Za-z_$][\w$]*)/);
  if (m) names.push(m[1]);

  const mine = [
    'StarterKit',
    'TolerantHeading',
    'FiguredCodeBlock',
    'Link',
    'FiguredImage',
    'ReadOnlyTable',
    'TableRow',
    'AlignedTableHeader',
    'AlignedTableCell',
    'NoteBlock',
    'FrontMatterBlock',
    'MathBlock',
    'Ins',
    'Del',
    'Highlight',
  ];
  const theirs = names.filter((n) => !SCHEMALESS.includes(n));
  if (mine.join(',') !== theirs.join(',')) {
    return [
      "web/schemacheck.mjs's EXTENSIONS has drifted from entry.ts's list — " +
        'the schema checked is not the schema the browser builds.\n' +
        `         schemacheck: ${mine.join(', ')}\n` +
        `         entry.ts:    ${theirs.join(', ')}`,
    ];
  }
  return [];
}

// The bridge writes a hardBreak inline as its own <hardBreak/> element rather
// than as a text run; see internal/ydoc's writeInlines.
const HARD_BREAK = 'hardBreak';

// The kinds whose content is ONE RAW RUN in Block.Text rather than inline
// content or children — internal/ydoc's rawText, which the bridge asks before
// it chooses how to write a block. A kind missing here is checked as an EMPTY
// node, so a content rule its real text would violate reads green.
const RAW_TEXT = new Set(['codeBlock', 'frontMatter', 'mathBlock']);

/** build replays createNodeFromYElement over one docmodel block.
 *
 *  Returns { node } when the browser builds it, or { node: null } when it
 *  throws — in which case the node has been DELETED and every failure under it
 *  (its own, and any child's) has been pushed onto `failures`.
 */
export function build(block, path, failures, schema = fragmentSchema) {
  const kids = [];
  const fail = (why) => {
    failures.push({ path, kind: block.kind, why });
    return { node: null };
  };

  if (RAW_TEXT.has(block.kind)) {
    // Raw text is one run with no marks. An EMPTY fence writes
    // nothing at all — YXmlText.Insert ignores empty text — so it reaches the
    // browser with no children, which `text*` satisfies.
    if (block.text) {
      try {
        kids.push(schema.text(block.text));
      } catch (e) {
        return fail(`text: ${e.message}`);
      }
    }
  } else if (block.inlines && block.inlines.length) {
    for (const inl of block.inlines) {
      if ((inl.marks || []).includes(HARD_BREAK)) {
        try {
          kids.push(schema.node(HARD_BREAK, null, []));
        } catch (e) {
          // createTextNodesFromYText's catch deletes the TEXT run, not the
          // element — but a hardBreak is an element of its own, so this is
          // createNodeFromYElement's catch and the break is what goes.
          failures.push({
            path: `${path}/hardBreak`,
            kind: HARD_BREAK,
            why: e.message,
          });
        }
        continue;
      }
      // YXmlText.Insert ignores empty text, so an empty inline never becomes a
      // run — and schema.text('') throws, so modelling it would invent a
      // failure the browser never sees.
      if (!inl.text) continue;
      let marks;
      try {
        marks = (inl.marks || [])
          .filter((m) => m !== HARD_BREAK)
          .map((m) => {
            const type = schema.marks[m];
            if (!type) throw new Error(`unknown mark ${JSON.stringify(m)}`);
            return type.create({});
          });
        kids.push(schema.text(inl.text, marks));
      } catch (e) {
        // createTextNodesFromYText deletes the whole YXmlText run on a throw,
        // and returns null so none of its nodes reach the parent.
        failures.push({ path: `${path}/#text`, kind: 'text', why: e.message });
      }
    }
  } else {
    for (let i = 0; i < (block.children || []).length; i += 1) {
      const child = block.children[i];
      const r = build(child, `${path}/${child.kind}[${i}]`, failures, schema);
      // `if (n !== null) children.push(n)` — the parent is built WITHOUT the
      // child that failed. This is the cascade: an emptied bulletList fails
      // `listItem+` next, and a blockquote holding only that list fails
      // `block+` after it.
      if (r.node !== null) kids.push(r.node);
    }
  }
  try {
    return { node: schema.node(block.kind, block.attrs || null, kids) };
  } catch (e) {
    return fail(e.message);
  }
}

/** validate returns every node the browser would delete from this document,
 *  in document order, innermost first. An empty array means opening the
 *  document deletes nothing. */
export function validate(blocks, schema = fragmentSchema) {
  const failures = [];
  for (let i = 0; i < (blocks || []).length; i += 1) {
    build(blocks[i], `${blocks[i].kind}[${i}]`, failures, schema);
  }
  return failures;
}
