# galley

galley is a review page for a Markdown file, shared between you and Claude Code.

Ask Claude to open a draft in galley and it returns a URL. On that page you read the draft and edit anything you want to change yourself. Where Claude should do the work, highlight the sentence or paragraph and write the instruction. Press **Revise** and Claude receives those instructions, rewrites the file, and the result appears in front of you with the changes marked. Give another instruction if it is not right. Press **Approve** when it is.

Claude's changes land in the document the way an assistant's edits would.

Each time you send, and each time Claude answers, a copy of the file is saved beside it on your own machine. You can open any point in the review and see exactly what changed. Nothing is uploaded. The file remains ordinary Markdown throughout: instructions are held outside it, and none of them remain in the text.

`galley edit` also accepts HTML files: `galley edit page.html` extracts the prose into a Markdown document, the review proceeds as normal, and every projection re-renders the page.

**The drawer.** The path in the bar opens a list of every `.md` and `.html` under the workspace root — the document's directory, or `--root <dir>` to widen it. Choose one to jump to its editor; galley starts one if none is running and stops it with the one you started. `Cmd/Ctrl+K` opens the same list with a filter.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/jawhnycooke/galley/main/install.sh | sh
```

## Connect Claude Code

Install the plugin in [plugin/](plugin/README.md). Your session then receives each Revise as you press it, and the plugin teaches Claude how a review works, so asking it to open a draft is enough.

## Licensing

galley is source-available under the **Business Source License 1.1**
(`BUSL-1.1`) and is **free for any organization under 25 people** — individuals
and small teams pay nothing and nothing is held back. At 25 employees or more, a
company licenses galley; it is an honor-based commercial license, not a lock.
galley never gates a feature, never asks for a key, and never phones home — the
purchase receipt is the proof of compliance, and there is nothing to install or
activate.

Pricing is a one-time purchase by company size (Starter / Team / Company /
Growth, with a contact-us tier for 500+), available at
[**galley.tools/buy**](https://galley.tools/buy/). Each release converts to
Apache-2.0 three years after it ships, so no company is ever stranded on a
binary it cannot fork. The binding terms are in [LICENSE.md](LICENSE.md).
