# Timeline Draft — tracker

Plan: `ai_tasks/plans/2026-09-06-timeline-draft.md` (spec: `../handoff/timeline-draft/`).
Branch: `feat/timeline-draft`. Decision 2026-09-06: re-value the existing `--gly-*` tokens under their names (dark-first + `[data-theme]`), not a parallel namespace.

| # | Task | Depends on | Status |
|---|---|---|---|
| 0 | Branch + clean baseline | — | [x] |
| 1 | Tokens, theme switch, white sheet | 0 | [x] 76e6e36 |
| 2 | Self-hosted fonts | 1 | [x] f98fb10 |
| 3 | Phase (pure) + header readout | 1 | [x] ae6343a |
| 4 | Footer: primary, trail, verdict menu, cancel | 3 | [x] 7f19bd6 |
| 5 | Timeline pure functions | — | [x] ce21283 |
| 6 | Timeline track, drag, crossfade, History replaced | 4, 5 | [x] 06879d2 |
| 7 | Frame: eyebrow, whole-doc slot, onboarding, `?` | 3, 6 | [x] 3920695 |
| 8 | Inline composer: eyebrow, bar, chips, dimming | 1 | [x] fb89472 |
| 9 | Pinned rows as decorations, ghost revert, fence grip | 3, 7 | [x] 643796a |
| 10 | Wire: per-round `asks[].answered` (Go) | — | [x] 1185c69 |
| 11 | Arrival inline: WAS strip, agent note, applied rows | 9, 10 | [x] c374e43 |
| 12 | cannot banner | 7 | [x] 3b615ec |
| 13 | Keys: ←/→, Esc, j/k over rows | 6, 9 | [ ] |
| 14 | Delete retired surfaces | 6, 7, 9, 11, 13 | [ ] |
| 15 | HTML page-mode pill | 7, 14 | [ ] |
| 16 | Streaming polish (optional) | 9 | [ ] |
| 18 | Rows for selection-anchored instructions (added) | 9, 13 | [ ] |
| 17 | Final verification (local only, no PR) | all | [ ] |

Parallel-safe waves: {1} → {2, 3, 5, 8, 10} → {4} → {6} → {7} → {9, 12} → {11, 13} → {14} → {15, 16} → {17}.

## Review
(filled in at completion)
