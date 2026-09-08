import { Node, mergeAttributes } from '@tiptap/core';

// A MkDocs Material admonition or content tab — docmodel.Admonition:
//
//   !!! note "Title"     ??? note "Title"     ???+ note "Title"     === "Tab"
//       body, indented four spaces
//
// A CONTAINER, not a literal region. Its body is ordinary markdown prose, so
// it is `block+` like a blockquote and every sentence in it is markable,
// suggestable and instructable; the title is the first child, an
// `admonitionTitle`, so it is editable text the CRDT carries as text.
//
// It must exist in this schema for the reason every galley node does: an
// element whose nodeName the schema does not know is not skipped by
// y-prosemirror, it is DELETED from the Yjs document, and galley projects the
// deletion to disk. internal/ydoc's TestEveryBlockKindExistsInTheBrowserSchema
// is the gate that made this file unskippable.
//
// TABS ARE STACKED, NEVER SWITCHED. Every tab body is on the page at once:
// hidden text cannot be reviewed and does not appear in a version diff.
// Collapsible markers (`???`, `???+`) show a glyph and stay open for the same
// reason.
export const AdmonitionBlock = Node.create({
  name: 'admonition',
  group: 'block',
  content: 'admonitionTitle block+',
  defining: true,

  addAttributes() {
    return {
      // One of `!!!`, `???`, `???+`, `===`.
      marker: {
        default: '!!!',
        parseHTML: (el) => el.getAttribute('data-marker') || '!!!',
        renderHTML: (attrs) => ({ 'data-marker': attrs.marker }),
      },
      // The type word; empty for a tab.
      type: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-type') || '',
        renderHTML: (attrs) => ({ 'data-type': attrs.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-galley-admonition]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-galley-admonition': '',
        class: 'gly-admonition',
      }),
      0,
    ];
  },
});

// The title line — docmodel.AdmonitionTitle. `text*` with no marks: MkDocs
// reads the quoted title as a plain string and galley writes it back verbatim.
// It is not in the `block` group, so the only place the schema lets it stand
// is where the Go side writes it: first child of an admonition.
export const AdmonitionTitle = Node.create({
  name: 'admonitionTitle',
  content: 'text*',
  marks: '',
  defining: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'p[data-galley-admonition-title]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'p',
      mergeAttributes(HTMLAttributes, {
        'data-galley-admonition-title': '',
        class: 'gly-admonition-title',
      }),
      0,
    ];
  },
});
