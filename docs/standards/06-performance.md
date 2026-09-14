# 6 · Performance budgets — hard gates

The detail for `CLAUDE.md` §6. `CLAUDE.md` states the rule in short and points here; the
full text — including every sentence this repository quotes as `CLAUDE.md` §6 — is below.
The section numbers are `CLAUDE.md`'s and do not change.

| Budget                                                                                                                                                                             | Limit                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Page flip                                                                                                                                                                          | Sustained 60fps. **Only `transform` and `opacity` animated** — never layout properties     |
| Diary route JS                                                                                                                                                                     | ≤ 180KB gzipped                                                                            |
| Admin route JS                                                                                                                                                                     | ≤ 320KB gzipped                                                                            |
| LCP (`/p/1`, Lighthouse `simulate` preset: 150ms RTT, 1,638Kbps, 4x CPU, median of 5; the book surface at a 1350x940 viewport, the mobile surface at a pinned 412x823 at DPR 1.75) | ≤ 3,085ms — see ADR 0008 for the number and its derivation, ADR 0014 for the two viewports |
| CLS                                                                                                                                                                                | ≤ 0.1                                                                                      |
| INP                                                                                                                                                                                | ≤ 200ms                                                                                    |
| Database queries per request                                                                                                                                                       | No N+1. Every list is one query with joins                                                 |
| Images                                                                                                                                                                             | Always a derivative tier, never an original. `hero2x` for displays ≥2×                     |

Rules: virtualize the gallery grid past 100 tiles. Debounce or `requestAnimationFrame` every resize and scroll handler. Prefer `ResizeObserver` to resize listeners. No synchronous layout reads inside animation frames. Memoize by identity, not by deep compare. Measure before optimizing — and paste the measurement.
