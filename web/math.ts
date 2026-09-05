import { Node, mergeAttributes } from '@tiptap/core';

// DISPLAY MATH — docmodel.MathBlock. `$$` on its own line, some TeX, `$$` on its
// own line, carried into the document VERBATIM: both delimiters, the body, and
// nothing decoded.
//
// IT MUST EXIST IN THIS SCHEMA. An element whose nodeName the schema does not
// know is not skipped by y-prosemirror — createNodeFromYElement's catch DELETES
// it from the Yjs document, the deletion broadcasts, and galley projects it to
// the author's file. That is the sentence <note> and <frontMatter> are both here
// for, and `internal/ydoc`'s TestEveryBlockKindExistsInTheBrowserSchema is what
// makes it impossible to add the Go side without this file: it reads
// docmodel's own source and went red on `mathBlock` the moment the constant
// landed.
//
// `content: 'text*'` and `code: true`, exactly like a fence and like front
// matter — the Go side writes the block as one unmarked YXmlText run inside
// <mathBlock> (ydoc.writeBlock's rawText branch), so the schema has to describe
// a node that can hold one. Declaring it an atom or contentless would be a
// content violation, which is the same deletion through the other door.
//
// CARRIED, NOT EDITABLE, for front matter's reason and not a weaker one: the
// content is TeX. It is not markdown, there is nothing in Block.Inlines for the
// suggestion pipeline to hang a mark on, no card to draw, and a formula with one
// character changed is a renderer that fails rather than a sentence that reads
// oddly. So the reviewer SEES the block they opened — it renders, selects and
// copies — and every edit to it is refused in the voice a fence and a table are
// refused in.
//
// THE FENCE'S LOCK AND NOT THE NOTE'S, for front matter's reason again: the
// block stays editable so a keystroke REACHES the transaction filter and the
// reviewer is told why it was refused. contenteditable="false" would make
// MATH_INSIDE a sentence nothing can reach, which this codebase records as how a
// sentence drifts.
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'pre[data-galley-math]', preserveWhitespace: 'full' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(HTMLAttributes, {
        'data-galley-math': '',
        class: 'gly-math',
      }),
      0,
    ];
  },
});
