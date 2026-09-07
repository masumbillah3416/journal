# 0013 — The gallery image budget, raised from a defect's own measurement

**Status: DECIDED.** The repository owner took **Option 1** below: raise
`lighthouserc.json`'s `/gallery/<slug>` `resource-summary:image:size` gate from
`400000` to **`600000`**, not to the 477,329 bytes PH1-003's fix now measures. Option 3
— the technically correct fix — is accepted and **deferred to Phase 3**, which owns the
media pipeline. The reasoning below is
`.superpowers/sdd/2026-09-01-phase-1-public-diary/closing-fixes-report.md`'s own
"The red gate, and why it was not raised" section, carried to a decision.

**A CITATION THAT CANNOT BE FOLLOWED, AND WHY IT IS LEFT NAMED.** The report above was a Phase 1 working note under `.superpowers/`, which is not tracked: `git ls-files .superpowers` returns nothing and no commit in this repository's history ever held it. Phase 2's final whole-branch review found four ADRs citing that directory (finding 39). The reference is kept rather than deleted because it records where the reasoning came from, but a reader must know it is unopenable — so everything this decision RESTS on is stated here rather than delegated to it. Everything that section argued is reproduced in
this ADR's own Context and Decision below; nothing here depends on reading it.

## Context

`docs/adr/0006-diary-image-window.md` and PH1-003
(`docs/qa/2026-09-03-phase-1-closing-sweep.md`) both concern what derivative a device
gets served, from opposite directions: 0006 stopped `/p/1` fetching images it should
not have fetched at all; PH1-003 found the gallery fetching the **wrong** derivative for
every device it did fetch for. Fixing PH1-003 (`88ce1c1`) made `TILE_TIERS` a `srcset`
the browser chooses from, rather than a server-side guess. That is correct, and it is
also the reason `/gallery/patagonia`'s image-size gate turned red immediately after.

**The number, measured, not estimated.** Nine images are fetched on that route both
before and after PH1-003's fix — the request count does not change. What changes is the
size of each: at Lighthouse's 412px emulated viewport the grid is one column, so a tile
is 376 CSS px, and at the emulated DPR of 1.75 that needs 658 device pixels. The `srcset`
offers 400w and 800w, so the browser now correctly takes the 800w candidate where it
used to be handed the 400w one regardless. 173,579 → 477,329 bytes, for the same nine
requests, against a 400,000-byte gate.

**The 400,000 figure was calibrated against the defect, not against a correct gallery.**
It was set while every tile was served at roughly 0.6× density on a phone — exactly
PH1-003's bug. A budget measured on wrong behaviour is not a budget; it is the bug's
footprint given a name. Correct densities legitimately cost more, and there is no rung
between the `thumb` (400px) and `tile` (800px) derivatives to soften the jump — see
`apps/web/collections/media.ts`'s `imageSizes` and `docs/adr/0003-derivative-generation.md`,
which this ADR revisits below.

## Options considered

1. **Raise the gallery image budget**, with a recorded rationale: the old number
   encoded a defect, not a promise. **Taken.** Simplest, and it does not touch product
   behaviour — the fix that caused the number to move is correct and stays.
2. **Window the grid earlier** — lower `VIRTUALIZE_ABOVE` from 100 so fewer of
   Patagonia's 60 tiles render, cutting how many fall inside Chrome's lazy-load
   prefetch distance. **Rejected.** `CLAUDE.md` §6 says, in its own words, "virtualize
   the gallery grid past 100 tiles" — lowering that threshold to chase a byte budget is
   a rule change dressed as a fix, and it buys the number back by degrading a feature
   the handoff sizes at roughly 100 assets per journey. The grid would get _worse_ to
   make the gate read better.
3. **Add an intermediate derivative tier** (~700px) to `collections/media.ts`, so a
   one-column phone tile costs roughly half of the 800px candidate while staying sharp
   at its actual device-pixel need. **The right answer, deferred to Phase 3.** It needs
   every stored `media` row re-derived — Phase 3 owns the media pipeline and is already
   going to rebuild the derivative ladder for the reasons `docs/adr/0003` and
   `docs/adr/0004` set out; re-deriving every row now, in a phase that does not own that
   pipeline, is work done twice. Phase 3 should read this ADR before it touches
   `imageSizes` again.

Reverting PH1-003 to put the soft-upscale defect back was not proposed: a confirmed S3
correctness bug is not currency to buy back a byte budget.

## Decision

**Set `resource-summary:image:size` for `/gallery/<slug>` to `600000`, not to the
measured 477,329.**

Two reasons, both about what the gate is _for_:

1. **The fixtures understate a real photograph.** The seeded placeholders are
   stripe-pattern PNGs; PH1-003's own residual note already records that Payload can
   only derive `thumb` and `tile` for a ≤1200px source. A real upload compresses
   differently than a synthetic test pattern, and a real 800px JPEG runs larger than
   these PNGs at the same pixel count. A gate set at today's exact measurement
   (477,329) would go red the day the first real photograph replaces a fixture — which
   would be the budget failing for the wrong reason: not because lazy-loading broke,
   but because the number was never given any headroom to be a _derivative's_ cost
   rather than a _fixture's_ cost.
2. **The gate still has to catch what it exists to catch.** Its job is not "gallery
   images are small" in the abstract; it is "lazy-loading is doing its job" — that a
   one-column phone viewport fetches roughly nine tiles' worth of images, not all
   sixty. 600,000 sits close enough above 477,329 to absorb a real photograph's extra
   weight, and far enough below the failure mode below that the failure mode still
   fails.

**The lazy-load regression, measured rather than assumed.** `Tile.tsx`'s `loading="lazy"`
was changed to `"eager"` on a throwaway local build — nothing committed — and the same
route was measured once under the same simulated-mobile Lighthouse settings
`lighthouserc.json` asserts. Every one of Patagonia's 60 tiles fetched instead of nine:

|                                                                  | requests | image transfer |
| ---------------------------------------------------------------- | -------- | -------------- |
| lazy-loading intact (this pass's baseline)                       | 9        | 477,329        |
| lazy-loading disabled (the regression this gate exists to catch) | 60       | **4,600,585**  |

4,600,585 bytes is **7.67×** the 600,000 limit — comfortably red. The gate at 600,000
still catches the failure it is there for; it was not loosened past the point of being
a detector. (The rough order-of-magnitude estimate available before measuring — "all 60
tiles instead of nine is roughly 3MB, five times the proposed limit" — undershot the
real number; measuring rather than estimating found a wider margin, not a narrower one.)

**What this decision does not change.** `aggregationMethod: "median"` and
`numberOfRuns: 5` are untouched, per the same reasoning `docs/adr/0008-lcp-budget-and-the-framework-floor.md`
gives for leaving them alone. The `/gallery/<slug>` LCP, script-size and CLS assertions
are untouched — this ADR is scoped to the one gate PH1-003's fix moved.

## Consequences

- `lighthouserc.json`'s `/gallery/<slug>` `resource-summary:image:size` assertion is
  now `error` at `maxNumericValue: 600000`. `npm run test:perf` is green again.
- **Cross-reference for Phase 3, per `docs/adr/0003-derivative-generation.md`.** That
  ADR's derivative ladder (`thumb` 400 / `tile` 800 / `frame` 1400 / `hero` 2000 /
  `hero2x` 4000) has no rung between 400 and 800, which is what forces a one-column
  phone tile to cost 800px worth of bytes for a 658px need. Phase 3, when it rebuilds
  the derivative pipeline, should add the ~700px tier Option 3 describes and lower this
  gate again once every `media` row carries it — at which point 600,000 should be
  re-measured against real photographs, not raised further on faith.
- This gate will legitimately read closer to 600,000 once real photographs replace the
  seeded placeholders, per the fixture-understatement reasoning above. That is expected,
  not a regression to chase.
- The 400,000 figure this ADR replaces is not restored by any means available in Phase
  1: doing so would require either the deferred derivative tier (Option 3) or degrading
  the gallery grid (Option 2), and neither is this phase's decision to make alone.
