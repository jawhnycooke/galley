---
title: "The Spec: # not a heading"
status: draft
owner: court
tags:
  - review
  - markdown
body: |
  ## nor is this
  *and this is not emphasis*
---

# The Spec

Every line above this heading is metadata, and none of it is markdown. The list is YAML's, the "#" is inside a quoted string, and the indentation under `body:` is the only thing that makes it a block scalar.

- a bullet, so the body is not only prose
- another

| knob | value |
| --- | --- |
| timeout | 30s |

---

That thematic break is a real one: front matter is a document-head construct, so a "---" anywhere else in the file means what it has always meant.
