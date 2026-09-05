import { Node, mergeAttributes } from '@tiptap/core';

// FRONT MATTER — docmodel.FrontMatter. The YAML ("---") or TOML ("+++") block
// a file may open with, carried into the document VERBATIM: both delimiter
// lines, the body, and nothing decoded.
//
// IT MUST EXIST IN THIS SCHEMA. An element whose nodeName the schema does not
// know is not skipped by y-prosemirror — createNodeFromYElement's catch
// DELETES it from the Yjs document, the deletion broadcasts, and galley
// projects it to the author's file. That is the same sentence <note> is here
// for, and the same one a blank table cell and a paragraph-less list item paid
// for. A node the Go side writes and this file has never heard of is a node
// the reviewer loses by opening their document.
//
// `content: 'text*'` and `code: true`, exactly like a fence. The Go side writes
// the block as one unmarked YXmlText run inside <frontMatter> (ydoc.writeBlock's
// rawText branch), so the schema has to describe a node that can hold one —
// declaring it atom or contentless would be a content violation, which is the
// same deletion through the other door. `code: true` is the schema's own word
// for "this text is literal", and it is what suggestions.ts's isFence already
// reads; the front matter entry in literalRegion is asked FIRST so the refusal
// says what this actually is rather than calling it a fence.
//
// CARRIED, NOT EDITABLE, and the distinction is the design. Front matter is
// metadata, not prose: there is nothing in Block.Inlines for the suggestion
// pipeline to hang a mark on, no card to draw, and a YAML document with one
// character changed is a build that fails rather than a sentence that reads
// oddly. So the reviewer SEES the document they opened — the block renders,
// selects and copies — and every edit to it is refused in the same voice a
// fence and a table are refused in.
//
// THE FENCE'S LOCK AND NOT THE NOTE'S, deliberately. <note> is
// contenteditable="false" because its words are authored somewhere else
// entirely (the composer and the rail), so there is nothing for a keystroke
// there to mean. Front matter is a literal REGION like a fence and a table, and
// those two are left editable on purpose so that a keystroke reaches the
// transaction filter and the reviewer is TOLD why it was refused — the passive
// chip says read-only before anyone tries, and the active note says it after.
// contenteditable="false" here would make FRONT_MATTER_INSIDE a sentence
// nothing can reach, which this codebase already records as how a sentence
// drifts.
export const FrontMatterBlock = Node.create({
  name: 'frontMatter',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [
      { tag: 'pre[data-galley-front-matter]', preserveWhitespace: 'full' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(HTMLAttributes, {
        'data-galley-front-matter': '',
        class: 'gly-front-matter',
      }),
      0,
    ];
  },
});
