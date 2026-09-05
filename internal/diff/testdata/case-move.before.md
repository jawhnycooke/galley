The last two are core CommonMark rather than a dialect, and refusing them refuses the whole document. That is a known gap, not a design position. If your file has any of the four, edit it somewhere else for now.

**And four things are mangled instead of refused — this is the worst thing galley does.** Definition lists, `$$` display math, `:::note` containers and `> [!NOTE]` GitHub callouts are all *plain paragraphs* to CommonMark, and galley turns a soft line break inside a paragraph into a space so prose reflows. Their meaning is carried entirely by the line breaks that are dropped, and nothing warns you:

| you wrote | it comes back |
| --- | --- |
| `Term` / `: definition` | `Term : definition` — one paragraph |
| `$$` / `E = mc^2` / `$$` | `$$ E = mc^2 $$` — one line |
| `:::note` / body / `:::` | `:::note An admonition body. :::` — one line |
| `> [!NOTE]` / `> A github callout.` | `> [!NOTE] A github callout.` — one line |

The same reflow applies to ordinary prose, and there it is deliberate: **a hard-wrapped paragraph comes back on one line.** Task-list items, `~~strikethrough~~`, bare autolinks and inline `$x^2$` are carried through as literal text and round-trip byte for byte. galley cannot tell any of the four mangled forms from prose without asking for the dialect first; each is the same job front matter was, and none is done. Don't point `galley edit` at a Docusaurus, Obsidian or MkDocs page that leans on them.
