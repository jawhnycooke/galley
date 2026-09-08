# MkDocs blocks

An admonition with a title:

!!! check "Checkpoint"
    Run `uv --version`. You should see a version number.

One with no title, and a body of several blocks:

!!! note
    First paragraph of the body.

    - a list inside
    - with two items

    ```bash
    echo "a fence inside"
    ```

A collapsed one and an expanded one:

??? tip "Collapsed by default"
    Hidden until opened on the published site; always visible here.

???+ tip "Expanded by default"
    Shown on the published site too.

Two adjacent tabs:

=== ":material-cloud: NeonDB (Recommended)"
    1. Sign up.
    2. Copy the connection string.

=== ":material-docker: Docker"
    ```bash
    docker run -d postgres:16
    ```

A header with no body at all:

!!! warning "Empty"

Nested:

!!! note "Outer"
    Outer body.

    !!! tip "Inner"
        Inner body.

Inside a blockquote:

> !!! note "Quoted"
>     A quoted body.

Inside a list item:

- an item
  !!! note "In a list"
      An item's admonition.

A title with an escaped quote:

!!! check "Say \"hi\""
    Body.

Near misses stay prose: a sentence mentioning !!! note "x" mid-line, and a setext underline is a heading, which is pinned in the parser tests rather than here because ATX is the only heading spelling written back.

# Setext

=== not quoted is a paragraph too.

```text
!!! note "inside a fence is a fence's own text"
    still code
```
