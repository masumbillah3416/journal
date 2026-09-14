# 0013 — The gallery image budget, raised from a defect's own measurement

**Status: DECIDED, and SUPERSEDED IN ITS NUMBER — the gate is `680000` today, not the
`600000` this heading records.** See "Owner ruling, 2026-09-14" at the foot of this file,
which is the current state; everything above it is left exactly as it was written,
because it recorded a decision that was correct on the evidence of its own day.

The repository owner took **Option 1** below: raise
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

### Option 3 was taken in Phase 3 Task 10, and the gate did not move

**The Decision above is left exactly as written.** It recorded a decision that was correct
at the time and on the evidence available then; what follows is what happened when the
deferred option was built, not a revision of it.

`apps/web/collections/media.ts` gained the `grid` rung (700², between `thumb` and `tile`)
in `20260913_201520_add_media_grid_tier`; `npm run media:rederive`
(`apps/web/scripts/rederive-media.ts`) gave every stored row the new derivative in place;
and `readGalleryBundle.ts`'s `TILE_TIERS` offers it as a `srcset` candidate, so the browser
can choose it. All three were needed: a tier nothing serves is storage, not a saving.

**The measurement, and it is the opposite of the one this ADR predicted.** Same command,
same five runs, same median, same `/gallery/patagonia`:

|                                                       | requests | image transfer |
| ----------------------------------------------------- | -------- | -------------- |
| before (`thumb` 400 / `tile` 800, this ADR's Context) | 9        | 477,329        |
| after (`grid` 700 offered, corpus re-derived)         | 9        | **642,138**    |
| lazy-loading disabled, re-measured on the new corpus  | 60       | 4,009,810      |

The browser's choice is correct — it takes the 700w candidate for its 658-device-pixel need
instead of overfetching 800w, which is exactly what Option 3 asked for. The bytes went up
anyway.

#### The cause is fixture GEOMETRY, not fixture content

**A first published account of this said the cause was that the placeholders are
stripe-pattern PNGs. That was wrong, and the repository's own corpus falsifies it. The
correction is kept here rather than quietly swapped, because the wrong version went out to a
controller as a measurement.** Most of the gallery's placeholders are stripe-pattern PNGs
and the rung makes them SMALLER.

Every number below is the size of a file physically on disk under `apps/web/media` after
`npm run db:seed && npm run media:rederive`, reached through each `media` row's own
`sizes_grid_filename` and `sizes_tile_filename`. Nothing is estimated.

| what `/gallery/patagonia` is made of            | frames | source size, from `seed.ts` | 700 ÷ 800 |
| ----------------------------------------------- | ------ | --------------------------- | --------- |
| `SLOT_SIZE.hero` placeholder                    | 1      | 1200×900                    | 0.834     |
| `SLOT_SIZE.ephemera` placeholder                | 1      | 1200×560                    | 0.678     |
| **`SLOT_SIZE.frame` in-book slot placeholders** | **7**  | **1000×800**                | **1.621** |
| `GALLERY_FRAME_SIZE` gallery-only placeholders  | 52     | 900×900                     | 0.816     |

|                                   | at 700px  | at 800px  | ratio     |
| --------------------------------- | --------- | --------- | --------- |
| the nine tiles the gate measures  | 645,733   | 501,435   | **1.288** |
| all 61 frames of the same gallery | 4,046,096 | 4,672,127 | **0.866** |

**So the rung saves 13% across the gallery and costs 29% across the nine tiles the budget
looks at.** The inversion is confined to the seven `SLOT_SIZE.frame` placeholders — and
those seven sit inside the measured nine by construction, because `seed.ts` numbers the nine
in-book slots before every gallery-only frame, so they are exactly the tiles a one-column
viewport loads eagerly.

**Why those seven and not the other 54, measured rather than reasoned.** `seed.ts`
rasterises the in-book slot placeholder at 1000×800, and a Payload `imageSize` is a
`sharp(...).resize(n, n, { fit: 'cover', position: 'centre' })`. `cover`'s scale factor is
`max(n/width, n/height)`, so for a 1000×800 source it is **exactly 1.000 at n = 800** and
0.875 at n = 700. Checked by comparing raw pixels: the 800×800 derivative of
`patagonia-a1-*.png` is **byte-for-byte identical to a plain `extract()` centre crop of its
source**, and the 700×700 derivative is not. The 800px file is therefore a near-lossless
re-encode of untouched source pixels, which for a hard-edged periodic pattern costs almost
nothing; the 700px file is the first resample, and resampling that pattern by 0.875 produces
more distinct values per row than PNG's row filters can exploit. Every other family
resamples at both rungs (`cover` scale 0.778 and 0.889 for a 900×900 or 1200×900 source),
and there the larger output is the larger file, as it should be.

**The rule a future reader needs, and the one the first account did not give.** A `cover`
derivative whose scale factor reaches 1 on both axes is not resampled at all; the rung
immediately below it is the first that is. **Any tier whose width lands just under a
fixture's short edge inverts that fixture's cost, whatever the fixture is a picture of.**
`grid` at 700 did it to a 1000×800 source because `tile` at 800 sits exactly on that
source's short edge. That is checkable in advance for any proposed rung, against the sizes
in `seed.ts`, without running Lighthouse at all.

**Two rows were deleted from this section rather than corrected.** The first account also
carried a "photographic JPEG" and a "photographic PNG" row, offered as the proof that the
rung saves 31% for real content. They named no file, no dimensions and no command, so nobody
could re-measure the rows the conclusion turned on — the defect species this phase has spent
itself on. They are gone. The 0.816 and 0.866 above answer the same question better, because
they are files in this repository.

#### What the gate is doing, and what would actually move it

**`resource-summary:image:size` for `/gallery/<slug>` was UNCHANGED at 600,000 when this
section was written**, and `npm run test:perf` was red on that one assertion at 642,138.
_(It is `680000` today: the owner ruled on 2026-09-14 and took Option 2 below — see the
final section of this file. This paragraph is left as it stood so the three options can
be read as they were put.)_ Raising it to fit a number
produced by a fixture-geometry collision would be the mistake this ADR was written to stop —
a budget recalibrated to whatever the current artefact costs — and lowering it is not
available either. Three options act on the real lever; each is a decision rather than an
edit:

1. **Change `SLOT_SIZE.frame` so no ladder rung sits on the source's short edge.** One
   constant in `apps/web/scripts/seed.ts`. Measured with the repository's own rasteriser and
   Patagonia's own accent: the A1 placeholder at 1000×800 gives 16,722 / 71,724 / 44,237 at
   400 / 700 / 800 — ratio 1.621, reproducing the on-disk file to the byte — and at 1000×900
   gives 21,104 / 65,188 / 76,278, **ratio 0.855, inversion gone**.

   **The seven in-book slots are seven different placeholders and have to be summed as
   seven.** Each carries its own label, so its own bytes; A1's figure cannot stand for the
   others, and an earlier version of this paragraph multiplied it by seven and understated
   the margin sevenfold. Rendered per label:

   |                                          | A1     | A2     | A3     | B1     | B2     | B3     | B4     | sum         |
   | ---------------------------------------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ----------- |
   | at 700px, source 1000×800 (today)        | 71,724 | 71,977 | 72,263 | 71,745 | 72,016 | 72,235 | 71,954 | **503,914** |
   | at 700px, source 1000×900 (the proposal) | 65,188 | 65,649 | 65,765 | 64,885 | 65,514 | 65,759 | 65,157 | **457,917** |

   The top row reproduces all seven on-disk files to the byte, which is what makes the
   bottom row worth anything: today's nine minus hero@700 minus ephemera@700 is
   `645,733 − 67,133 − 74,686 = 503,914`, the top row's sum exactly. So the nine measured
   tiles would fall from 645,733 to **599,736** bytes on disk — **264 bytes under the
   600,000 gate, which is 0.04%.** That is not headroom in
   any sense; it is within rounding of red, and it is a prediction from on-disk file sizes
   while the gate asserts a five-run median of Lighthouse's _transfer_ size, so taking this
   option means measuring it rather than trusting this row. It also changes seeded pixels,
   so every visual baseline showing an in-book slot photograph is regenerated.

2. **Accept the number for this corpus and record it.** The only option that changes no
   pixels. The gate would then be measuring nine tiles, seven of which are fixtures whose
   geometry collides with the ladder, and that fact would have to be written where the gate
   is and not only here.
3. **Replace the seeded placeholders with real photographs.** Still available, and it was
   this ADR's own anticipation. It removes the collision incidentally — a photograph's
   dimensions are unlikely to land on a rung — rather than deliberately, and it is the most
   expensive of the three.

**The gate is still a detector, re-measured rather than assumed.** `Tile.tsx`'s
`loading="lazy"` was changed to `"eager"` on a throwaway local build — nothing committed —
and the same route measured once under the same settings: 60 requests and 4,009,810 bytes,
**6.68×** the 600,000 limit. Nine tiles against sixty, so lazy-loading is intact and the
budget still catches what it exists to catch. It is not the 4,600,585 this ADR measured, and
no cause is offered for the difference here: the corpus was re-derived between the two
measurements, so anything said about why would be an explanation nobody ran. What was
measured is the request count — 60 against 9 — and that is what the assertion is about. The
same caution applies to the 477,329 in the table above: it was measured on the
pre-re-derivation corpus, whose 800px derivatives sum to 501,435 on disk today, so it is this
ADR's historical number and not a baseline to subtract from.

#### The rung's saving is narrow-band, and centred on the measuring device

A 700w candidate is only ever chosen when a tile's device-pixel need lands in **(400, 700]** —
the ladder offers 400, 700 and 800, and a browser takes the smallest candidate that covers
the need. Lighthouse's emulation, 412 CSS px at DPR 1.75, gives this ADR's 658, inside that
band. It is not where most readers are: `e2e/gallery.spec.ts`'s own measurement records a
one-column tile at **354 CSS px** on the 390px project, which needs 708 device pixels at
DPR 2 and 1,062 at DPR 3 — both above 700, both still taking the 800w candidate exactly as
before. So on the phones readers actually hold the rung is neutral rather than a saving. It
is a saving at the viewport this budget is measured at, which is what Option 3 was written
against and what it delivers.

---

## Owner ruling, 2026-09-14: take Option 2, and set the gate from the measurement

**The repository owner ruled on this on 2026-09-14, after being shown the measurements
above**, and took **Option 2** of the three this ADR left open — _accept the number for
this corpus and record it_ — with one addition: the gate moves to a number derived from
the measurement rather than staying red. **Option 1** (change `SLOT_SIZE.frame` so no
rung sits on a fixture's short edge) was not taken: its own row above predicts a
**264-byte** margin under the old limit, which this ADR already called "not headroom",
and it would regenerate every visual baseline showing an in-book slot photograph.
**Option 3** (replace the placeholders with real photographs) remains available and
remains the most expensive.

**This is a human's decision on measured evidence, not an agent moving a threshold it
found inconvenient.** The distinction is the reason the gate stayed red for a phase
instead of being widened when it first went red: raising a budget to make CI pass is how
a budget stops meaning anything, and nothing below was applied until the owner had the
numbers and made the call.

### The number, and how it was measured

`npm run test:perf`'s own command, against a production `next build` served by
`next start`, with `apps/web/.next` deleted first, on a corpus that had been
`npm run db:seed`-ed and then `npm run media:rederive`-d. Lighthouse's default
`simulate` throttling, the `lighthouserc.json` viewport (412x823 at DPR 1.75, mobile
emulation), **five runs, median** — the same `aggregationMethod` the config asserts:

```
resource-summary.image.size for /gallery/patagonia
all five runs: 642138, 642138, 642138, 642138, 642138   median 642138
```

Five identical runs, because this quantity is a sum over the same static files rather
than anything timing-dependent. **That is a transfer-size figure, not an on-disk one.**
The two are close but not equal, and the difference is stated rather than elided: the
nine files the browser actually fetches sum to **636,378 bytes on disk** (each row's own
`sizes_grid_filename`, read out of `apps/web/media`), and the 5,760-byte gap is nine
responses' worth of HTTP overhead. Every number in this section that is a disk figure
says so.

**MED-001's fix did not move it, and the identical figure is the evidence.** That fix
(`docs/qa/2026-09-08-media-pipeline-sweep.md`, commit `97ea602`) gave `frame`
`withoutEnlargement: true`, so every row gained an uncropped derivative and every gallery
tile's `srcset` gained a candidate at the row's own source width. The measurement above
is nevertheless byte-for-byte the 642,138 this ADR recorded before it, because at 412 CSS
px and DPR 1.75 a tile needs 658 device pixels and the browser still takes the 700w
`grid`; the new candidate is 900w, 1000w or 1200w and is never the smallest one that
covers the need. Confirmed in a browser as well as in the totals: at that surface the
tile's `currentSrc` is `…-700x700.png`, and only at DPR 3 — where the need is 1,062
device pixels and the old ladder had nothing above 800w to offer — does the browser take
the new candidate.

### What this number is a measurement OF, which is the thing the old one hid

**It measures nine stripe-pattern placeholder PNGs, not nine photographs.** The gallery's
fixtures are rasterised by `apps/web/scripts/seed.ts`, and seven of the nine the gate
looks at are `SLOT_SIZE.frame` placeholders at 1000x800 whose short edge sits exactly on
the `tile` rung — the geometry collision the section above measures in detail, which is
why the 700px rung makes those seven _larger_ rather than smaller. A real photographic
corpus would produce a different number, in an unknown direction, and **the gate would
have to be re-measured rather than trusted** on the day the placeholders are replaced.
The 400,000 figure this ADR originally replaced failed precisely because nobody could
tell what it measured; the requirement here is that a reader can.

### Why 680,000, derived rather than rounded

Two-sided, and both sides measured:

| bound                                  | value       | what it is                                             |
| -------------------------------------- | ----------- | ------------------------------------------------------ |
| the measurement                        | **642,138** | five-run transfer-size median, above                   |
| **the gate**                           | **680,000** | 37,862 above the measurement — **5.90%** of it         |
| the cheapest possible TENTH eager tile | ~707,700    | see the sum below                                      |
| the failure this gate exists to catch  | 4,009,810   | `loading="eager"`, measured below — **5.90x** the gate |

**The tenth tile, named and summed — and the first published version of this row named
the wrong file and did not close its own arithmetic.** It read
`642,138 + 65,331 (patagonia-g010-204-700x700)`, which is 707,469 rather than the ~707,700
it claimed, and `g010` is the **ninth** file, not a tenth: it is already inside the eager
window, which is why it is one of the nine in the 636,378 disk sum above. The correction
is kept rather than quietly swapped, because the error it made — adding a disk figure to
a transfer figure with no overhead term — is exactly the disk-versus-transfer conflation
that produced this phase's 264-byte non-margin.

The cheapest tile that could ENTER the window is the next one in
`GALLERY_FRAME_SORT` order — the row whose `sizes_grid_filename` is
`patagonia-g011-204-700x700`, a generated derivative in the gitignored
`apps/web/media` store rather than a file in this repository:

```
     642,138   the measured transfer-size median of the nine
+     64,922   g011's grid derivative, ON DISK
+       ~640   one response's HTTP overhead
                 (the nine measure 642,138 transfer against 636,378 on disk:
                  5,760 / 9 = 640 bytes each)
=   ~707,700   the cheapest measurement a tenth eager tile could produce
```

The upper bound is what makes 680,000 a budget rather than a ceiling written where the
current artefact happens to sit. A tenth tile falling inside the eager window is the
smallest real regression of the kind this gate watches for, so any gate at or above
~707,700 would pass it silently. 680,000 sits **27,700 bytes below** that, and 37,862
above the measurement. That margin is not "one byte over" and it is not open-ended: it
absorbs encoder drift (a `sharp`/`libpng` bump moving PNG sizes a few per cent) and
nothing larger.

### The gate is still a detector, re-measured on this corpus rather than quoted

`Tile.tsx`'s `loading="lazy"` was changed to `"eager"` on a throwaway local build —
nothing committed, the file restored immediately after — and `/gallery/patagonia`
measured once under the same settings against the same re-derived corpus:

|                                                             | requests | image transfer |
| ----------------------------------------------------------- | -------- | -------------- |
| lazy-loading intact (the measurement this gate is set from) | 9        | 642,138        |
| lazy-loading disabled (the regression this gate catches)    | 60       | **4,009,810**  |

4,009,810 is **6.68x** the old 600,000 limit and **5.90x** the new 680,000 one. Sixty
requests against nine is the assertion's real subject, and it is unchanged. The figure
reproduces this ADR's earlier eager measurement to the byte, which is the second piece of
evidence that MED-001's fix changed no candidate the browser takes at this viewport.

### What this ruling does not change

`aggregationMethod: "median"` and `numberOfRuns: 5` are untouched, for the reason this
ADR and `docs/adr/0008-lcp-budget-and-the-framework-floor.md` both give. The
`/gallery/<slug>` LCP, script-size and CLS assertions are untouched. `SLOT_SIZE.frame`
is untouched, so no seeded pixel moves and no visual baseline is regenerated on account
of this decision.
