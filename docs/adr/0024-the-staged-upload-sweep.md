# 0024 — The staged-upload sweep is a scheduled script

## Context

`docs/adr/0020-the-presign-seam-and-the-local-upload-receiver.md` closed with a residual it
named rather than left to be found, and the words are worth quoting because they are the
whole of this decision's context:

> A slot that is uploaded to and never finalised leaves its staged bytes behind forever, and
> nothing in Phase 3 sweeps them… **Those objects are the PRE-STRIP ORIGINALS**: the copy
> that still carries the GPS coordinates, which is the exact data `SECURITY.md`'s
> read-EXIF-then-strip requirement exists to remove… **The sweep is owed by Phase 4**, not
> "eventually": it needs a scheduler, which no task in the Phase 3 plan builds.

`apps/web/lib/media/ingestUpload.ts` deletes the staged copy on every _finalise_ path — in a
`finally`, so a refusal removes it too. What it cannot reach is an upload that never
finalises: the author closes the tab, the request fails, the page is reloaded. Those objects
have no `media` row, so nothing in the database knows they exist, and until this ADR nothing
walked the store to find out.

**They are not served.** A staged object has no `media` row, and Payload's own file-access
check requires one, so a signed-out reader cannot fetch one by guessing its key. That is what
makes this a residual rather than a live exposure — and it is not a reason to leave them: an
un-stripped original in the store is a home address in the store, and the whole read-then-strip
pipeline exists so that no copy of one survives ingest.

`SECURITY.md`'s own requirement is the one this is a residual against, so the row it belongs
in is `docs/security.md`'s EXIF row, not a capacity note. `docs/runbook.md` says the same
where an operator meets it.

## Options considered

| Option                                                     | Why not, or why                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sweep inside the upload path, opportunistically            | **Rejected.** ADR 0020 already refuses it: "inventing one inside the upload path would be the speculative extension CLAUDE.md §4 refuses". It also makes a delete a side effect of an unrelated request, so an author uploading one photograph pays for everybody else's abandoned ones, and a store that is slow to enumerate becomes a slow upload.                                                                                                                          |
| A `jobs` row and a worker                                  | **Rejected.** The worker is deferred (ADR 0004) and does not exist. A queue with no consumer is a table that grows — and the thing being swept is already "a store that grows because nothing consumes it", so this would answer it with a second one.                                                                                                                                                                                                                         |
| **A CLI script, run by hand until something schedules it** | **Taken, with the scheduler NOT built.** `npm run media:sweep-staged`, the same two-file shape `npm run media:rederive` has (`apps/web/scripts/run-rederive.ts`). **Nothing invokes it: this repository holds no `vercel.json` and no cron definition of any kind, and `.github/workflows/` holds `ci.yml` alone.** Today it is one command an operator runs, locally and in a restore drill alike. What is left is named under Consequences. Documented in `docs/runbook.md`. |

## Decision

`apps/web/lib/media/sweepStagedUploads.ts` lists the staging namespace through
`StoragePort.list` — added for this, in the shared contract suite, so the R2 adapter answers
it unchanged — asks `@travel-diary/domain/media/stagedObjects`'s `staleStagedObjects` which
keys may go, and deletes those.

**The decision about WHICH keys is pure, and that is the load-bearing part.** The production
store is rooted at `MEDIA_DIR`, which is also where Payload keeps every published photograph
and every derivative — so the listing this walks contains the book. What stands between the
sweep and the book is `isMintedStagingKey`, a match against the shape `planUploadSlots`
produces: default-deny, the same inversion `eslint-rules/guarded-server-actions.js` is this
repository's worked example of. A key under `staging-archive/`, a key at the wrong depth, and
a stored photograph's own flat filename are each refused by not being recognised, rather than
by appearing on a list somebody had to think of.

**The window is one hour, and it is the only thing standing between the sweep and an upload
in flight.** An upload still being PUT has no row and no finalise; sweeping on orphanhood
alone would delete the author's photograph mid-upload. One hour is four times the fifteen
minutes an offered upload URL lives (`UPLOAD_URL_TTL_SECONDS`), which covers a clock
disagreeing with ours and a client that re-requested a slot; it is not longer because every
hour it is raised is an hour a set of coordinates sits in the store. `STAGED_UPLOAD_TTL_MS`
is the constant, both of its sides are pinned by cases, and a third case proves the line moves
when the constant does.

**The clock is injected.** `sweepStagedUploads(deps, now)`; `apps/web/scripts/run-sweep-staged.ts`
passes `Date.now()`. A window read from inside the logic is a window no test can assert.

**The command's exit code is a decision of its own**, which is why
`apps/web/scripts/sweep-staged.ts` exists beside the entry point rather than inside it: a
sweep that could not list the store must exit non-zero, or the platform's scheduler reports a
green run while un-stripped originals accumulate. That is the one failure of this command
nobody would otherwise notice, and it has a case on each side.

### One thing the task brief specified that is deliberately absent

The brief gave `staleStagedObjects` a `live: ReadonlySet<string>` parameter — "the staging
keys a media row still points at" — and gave the sweep a `payload` dependency to build it
from. **Nothing in this repository can produce that set.** No column of `media`, `journeys`,
`pages` or `jobs` records a staging key, and `ingestUpload` deletes the staged object on every
finalise path, so a finalised upload has no staged object to protect and an un-finalised one
has no row. Every caller would have passed an empty set: a guard nothing can fail, with a test
case that is a hypothesis rather than a test. It is left out, and the day a worker needs the
staged original to _survive_ ingest (ADR 0004 defers that worker), the column that records the
key and the guard that reads it arrive together.

## Consequences

- **The residual ADR 0020 named is HALF closed, and the half that is open is the half it
  named.** ADR 0020's words were "it needs a scheduler, which no task in the Phase 3 plan
  builds"; no task in the Phase 4 plan builds one either. What landed is the instrument — the
  command, the decision about which keys, the exit code — and nothing that fires it.
  `docs/security.md`'s EXIF row records the residual as **open and mitigated by an available
  command**, not closed.
- **NOTHING SCHEDULES IT. It runs when somebody runs it.** That is stated here rather than
  left to a reader to discover from the absence of a config: an operator who believes a
  schedule exists will not run the command, and un-stripped originals then accumulate
  indefinitely — which is the residual itself, one level up, where it is harder to notice.
- **What the remaining step actually is, in the shape it would take.** A platform cron
  triggers an **HTTP request to a route in the deployment**; it cannot run an npm script, so
  `npm run media:sweep-staged` is not a target a cron entry can name. Closing this is a route
  that calls `sweepStaged` with the same deps `apps/web/scripts/run-sweep-staged.ts` builds,
  guarded so only the scheduler can reach it, plus the `vercel.json` `crons` entry — or the
  equivalent — pointing at it. **It is not built here**, because the route's guard and its
  address are decisions about a deployment target this repository has not chosen, and
  inventing one to make a sentence true is the speculation CLAUDE.md §4 refuses and that this
  ADR refuses two rows above.
- **A missed run is growth, not exposure** — the objects are not served — so the absence of a
  schedule is a non-urgent gap rather than an incident. The command exits 1 when it could not
  run at all, which is what a scheduler would need on the day one exists.
- **Nothing bounds how long an abandoned original lives.** `STAGED_UPLOAD_TTL_MS` bounds only
  how YOUNG one may be when the sweep runs — one hour, so an upload in flight is safe. How
  long one sits before a sweep is whatever the gap between manual runs is, and an unscheduled
  sweep bounds nothing.
- **`StoragePort` grew a sixth operation**, and it is in the shared contract suite, so the R2
  adapter inherits it. Whoever writes the R2 adapter implements `list` against the bucket's
  own listing API and runs the same four cases.
- **The sweep names no adapter**, so it is the same sweep on R2. What changes is the deps the
  entry point builds.
- **`vitest.integration.config.ts` gates both new files at 100%**, measured. The one arm
  neither can reach is a `delete` that refuses, which the local adapter cannot do; it carries
  a `c8 ignore` with that reason and stays in the code because an R2 delete genuinely can.
