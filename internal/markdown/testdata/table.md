# Tables

A paragraph before the table, which must stay a paragraph.

| Phase | Contents | State |
| --- | --- | --- |
| 1 | Editor, capture mode | shipped |
| **1e** | **Tables — read-only, full round trip** | |
| 3 | Tech blocks, `galley mcp` | |

## Alignment

| left | center | right | default |
| :-- | :-: | --: | --- |
| a | b | c | d |

## What a cell can hold

| syntax | example |
| --- | --- |
| emphasis | *italic* and **bold** |
| code | `a && b` |
| a link | [galley](https://example.com/galley) |
| a pipe | a\|b |
| a pipe in code | `c\|d` |
| a suggestion | {--old--} and {++new++} |
| a substitution | {~~old~>new~~} |
| a comment anchor | {==important==} |
| a note | {>>the units here are wrong<<} |
| empty | |
| | a blank cell that is NOT the last one |

## A note in a cell

A cell whose whole content is a `{>>note<<}` is a BLOCK comment on that cell, and it is written back into the file — see `note.go`. Every column position, because the fix lives in `cellParts` and could have been conditioned on an index; unlike the blank cell, this one CAN fail from a golden file at any of them. A note with prose beside it is a RANGE comment and is lifted into the sidecar, so it cannot appear in a fixture that must be a fixed point.

| left | middle | right |
| --- | --- | --- |
| {>>the first column<<} | y | z |
| x | {>>the middle column<<} | z |
| x | y | {>>the last column<<} |
| x | {>>one<<} {>>two<<} | z |
| x | {>>@document the units in this table are wrong<<} | z |
| x | {>>@block @document is the first word here<<} | z |
| x | {>>a\|b<<} | z |

> | quoted | table |
> | --- | --- |
> | still | a table |

A paragraph after the table.
