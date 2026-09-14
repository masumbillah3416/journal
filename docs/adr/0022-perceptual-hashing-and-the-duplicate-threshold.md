# 0022 — A difference hash and a linear scan, with the threshold at five bits

## Context

`handoff/design_handoff_travel_diary/DATA_MODEL.md`'s upload pipeline, step 5: _"Compute
`contentHash` (perceptual for stills); if it matches an existing row in the same journey,
skip and report as a duplicate."_ `SCREENS.md` §2.4 draws what the reader sees — _"3 look
like duplicates — skipped"_ on the upload card — and `README.md`'s own non-goals fix the
ceiling: _"No duplicate-image detection beyond the notice."_

So the question this ADR answers is narrow, and worth stating narrowly before choosing
anything: **has the author already put this photograph in this journey?** Not "is this
file anywhere in the library", not "find me similar pictures". One journey, roughly a
hundred rows, and a notice rather than an action.

One property of this repository's own pipeline decides the answer. **The bytes the author
uploads are never the bytes that get stored.** `runStillPipeline` re-encodes every still
through `sharp` to strip metadata (`docs/security.md`'s EXIF row), so the same photograph
dragged in twice — or dragged in once after a "save for web" export, a rotation, a
brightness tweak — is byte-different every time by construction.

## Options considered

1. **An exact content hash** (SHA-256 over the bytes). Rejected, and it is the option
   that looks right until the paragraph above is read: it catches only the case where the
   author uploads the identical file, which is the case they are least likely to create.
   A re-encode is byte-different and visually identical, and a re-encode is what our own
   pipeline performs. An exact hash would answer "not a duplicate" for the duplicate that
   actually happens.
2. **An index, or a Postgres vector extension** (a trigram index, pgvector, a BK-tree).
   Rejected as unearned at this size. A journey holds on the order of a hundred media
   rows; the scan below is a hundred 64-bit comparisons in memory, after one query that
   was going to be made anyway. An extension is a deployment dependency, a migration and
   a second thing that must exist on Neon, bought to make a microsecond faster. `CLAUDE.md`
   §4: a pattern earns its place on the second real use.
3. **A difference hash (dHash) plus a linear scan over one journey's rows.** Chosen.

## Decision

**`packages/domain/src/media/perceptualHash.ts` computes a 64-bit dHash from a 9×8
grayscale grid the encoder at the edge produces, and `apps/web/lib/media/ingestUpload.ts`
compares it against one journey's stored hashes in a single query.**

**Why a _difference_ hash rather than an average hash.** dHash keys on the SIGN of each
adjacent horizontal step — is this sample brighter than the one to its right — and never
on absolute brightness. That is precisely the property a re-encode, a resize and a
quality change preserve, which is the duplicate a reader actually creates. An average
hash compares every sample against the image's own mean, so a global exposure shift moves
many bits at once.

**Why the grid is nine wide and eight tall.** Eight comparisons need nine samples. A
square 8×8 grid yields seven bits per row and a silently 56-bit hash that still renders as
hex and still passes a shape assertion — a weaker comparison that looks identical from
outside. The grid is deliberately not square; `DHASH_WIDTH` carries that as an invariant
in the module header and has a case of its own.

**`DUPLICATE_MAX_DISTANCE = 5`, of 64 bits, inclusive.** Both sides of that boundary are
pinned as literals rather than against the constant, so a case cannot follow the number
when it moves.

- **What was measured**, through the real `inline` processor over generated fixtures
  (Phase 3 Task 6, reproduced in its review): **every same-photograph pair sat at 0** —
  quality 92 down to 55, a re-encode of the encoded file, a 92/40/20/10 chain, a downsize
  to 400×300 and back, a JPEG/WebP/JPEG round trip, the same pixels delivered as a PNG,
  and one copy carrying GPS and EXIF. **Two different generated photographs sat at 30.**
  The distance a real re-encode produces is nowhere near five, and the gap on the other
  side is six times it.
- **What was not measured, and is therefore judgement.** The collision direction. Every
  pair above is synthetic; no two genuinely similar photographs — the same scene a second
  apart, two frames of one burst — have been put through this. _"Two different
  photographs of the same scene do not come this close"_ is what five rests on, and it is
  untested. **The asymmetry is why five is low rather than generous:** raising it starts
  merging distinct frames of a burst, which loses a photograph, while lowering it at
  worst stores one file twice. That is the direction to measure first if a real library
  ever justifies moving the number.

**One query, with the journey in the `where`.** The comparison is a linear scan over the
hashes of ONE journey, keyed by journey id (`CLAUDE.md` §7's most important structural
rule), fetched in a single Payload `find` with `pagination: false`, `depth: 0` and a
narrow `select` — `CLAUDE.md` §6's no-N+1 rule and §7's select-narrowly rule in the same
call. A per-row read would be one query per photograph already in the journey.

## Consequences

- **`media.contentHash` is a PERCEPTUAL hash, and it is not an integrity checksum.** Two
  stored files can differ in every byte and carry the same `contentHash`; the same bytes
  re-encoded a second time will carry it too. It cannot be used to detect corruption, to
  verify a restore, or to deduplicate storage. `docs/data-model.md`'s `media` section says
  so at the field, so nobody meets the column without meeting that sentence — the column
  name is the one thing here that invites the wrong reading.
- **What the threshold tolerates, and what it does not — measured, not reasoned.** Run
  locally (`CLAUDE.md` §7.1: nothing left this machine) over
  `apps/web/lib/adapters/contract/media-fixtures.ts`'s own `rawGradient` at 1200×900,
  seed 11, JPEG q92, hashed through the same
  `.resize(9, 8, { fit: 'fill' }).greyscale().raw()` grid `stillPipeline.ts` builds:

  | Variant of the same photograph    | Distance | Verdict at 5      |
  | --------------------------------- | -------- | ----------------- |
  | re-encode at quality 55           | 0        | duplicate         |
  | downsize to 400×300 and back      | 0        | duplicate         |
  | brightness ×1.15                  | 0        | duplicate         |
  | brightness ×1.4                   | 1        | duplicate         |
  | crop 5% off every edge            | 13       | **stored as new** |
  | crop 10% off every edge           | 27       | stored as new     |
  | crop 25% off every edge           | 26       | stored as new     |
  | mirrored horizontally             | 27       | stored as new     |
  | rotated 90°                       | 30       | stored as new     |
  | a different photograph (seed 197) | 30       | stored as new     |

  **The crop row is the one that changes what may be claimed.** A crop is NOT tolerated —
  even five per cent off every edge lands at 13, nearly three times the threshold — and
  `apps/web/lib/media/ingestUpload.ts`'s header said it was, which is corrected in the
  same commit as this ADR. A brightness tweak and a resize genuinely are tolerated. What
  the numbers say beyond that is only "unrelated": past roughly 13 the distances stop
  ordering sensibly (a 25% crop scores below a 10% one) because a photograph whose frame
  has moved is, to a 9×8 gradient comparison, a different photograph — which is exactly
  what the seed-197 row scores.

  **Two things this table is not.** It is one synthetic fixture, not a corpus of real
  photographs, so it characterises the HASH's behaviour rather than a library's. And the
  two rows that overlap the record — 0 for a re-encode, 30 for a different seed — are the
  values Phase 3 Task 6 measured independently, which is why this run is offered as
  evidence rather than as a second opinion.

- **Duplicate detection happens under `inline` and NOT under `worker`,** and whoever
  writes the worker owns closing that. Under `worker` the row is created from the staged
  bytes with no `contentHash` at all, because the hash comes out of the pipeline and the
  pipeline runs on the worker (ADR 0004's amendment puts the queue hop between the
  receiver and the worker). Stated in `apps/web/lib/media/ingestUpload.ts`'s header, and
  named here so it is a recorded residual rather than a later surprise.
- **The duplicate is reported, never enforced.** `ingestUpload` answers with the existing
  row's id and stores nothing new; no row is deleted and nothing is merged. That matches
  `README.md`'s non-goal — the notice is the whole feature.
- **Nothing here is `sharp`'s.** The hash is a pure function of a grid of numbers, in
  `packages/domain`, at 100% coverage with no I/O: the encoder at the edge produces the
  9×8 grayscale grid, and the decision is testable without an image at all.
