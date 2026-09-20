/**
 * media/stagedObjects — which staged objects a sweep may delete, decided from
 * a store listing and nothing else.
 *
 * ═══ WHAT THESE OBJECTS ARE, WHICH IS WHY THIS MODULE EXISTS ═══
 *
 * A slot that is uploaded to and never finalised leaves its bytes under
 * `staging/<journey>/…` forever. `apps/web/lib/media/ingestUpload.ts` deletes
 * the staged copy on every FINALISE path, including a refusal; an upload that
 * never reaches a finalise — the author closed the tab, the request failed,
 * the page was reloaded — reaches none of them. **Those objects are the
 * PRE-STRIP ORIGINALS**: the copy that still carries the GPS coordinates,
 * which is exactly the data `docs/security.md`'s read-EXIF-then-strip row
 * exists to remove. Freeing disk is not the reason to sweep them.
 * `docs/adr/0020` named the residual and assigned the sweep to Phase 4;
 * `docs/adr/0024-the-staged-upload-sweep.md` is the sweep's own decision.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven, deliberately. One pure predicate over a list. The
 * `Result` its caller returns belongs to the caller: nothing here can fail.
 *
 * ═══ WHY THE DECISION IS PURE, AND HERE ═══
 *
 * The caller both LISTS and DELETES, so every branch it takes is a branch that
 * destroys somebody's photograph when it is wrong — and an integration test of
 * a delete can only ever assert the cases it thought of. The three refusals
 * below are therefore decided in a module with no store, no clock and no
 * database, where each of them is a two-line case.
 *
 * ═══ TWO REFUSALS, AND THEY COMPOSE AS AN AND ═══
 *
 *   1. **A key nothing minted is never returned.** `isMintedStagingKey` is a
 *      match against the shape `planUploadSlots` produces — default-deny —
 *      rather than a list of keys to avoid. It is the one that matters most:
 *      the production store is rooted at `MEDIA_DIR`, the same directory
 *      Payload keeps every stored photograph and derivative in, so a sweep
 *      that trusted the prefix it was handed could delete the published book.
 *   2. **A young orphan is never returned.** An upload still being PUT has no
 *      row yet and is not abandoned; sweeping on orphanhood alone deletes the
 *      author's photograph mid-upload. The window is therefore the ONLY thing
 *      standing between the sweep and an upload in flight, which is why both
 *      of its sides are pinned below.
 *
 * ═══ THERE IS NO "A ROW STILL POINTS AT IT" REFUSAL, AND THAT IS MEASURED ═══
 *
 * The task brief specifies a third parameter, `live: ReadonlySet<string>` —
 * "the staging keys a media row still points at" — and this module was written
 * with it. **Nothing in this repository can produce that set.** No column of
 * `media`, `journeys`, `pages` or `jobs` records a staging key
 * (`apps/web/collections/*.ts`, `apps/web/migrations/*.ts`,
 * `apps/web/lib/ports/queue.ts`), and `apps/web/lib/media/ingestUpload.ts`
 * deletes the staged object in a `finally` on EVERY finalise path, refusals
 * included — so a finalised upload has no staged object to protect and an
 * un-finalised one has no row. Every caller would pass an empty set, and a
 * guard whose input is always empty is a guard nothing can fail, with a test
 * case that is a hypothesis rather than a test. It is left out rather than
 * carried, and the day a worker needs the staged original to SURVIVE ingest
 * (ADR 0004 defers that worker), the column that records the key and this
 * guard arrive together.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **The window is inclusive at its own edge.** An object whose age is
 *     exactly `ttlMs` is KEPT; one millisecond older is swept. Both sides are
 *     pinned in `stagedObjects.test.ts`, and a third case proves the line
 *     moves with `ttlMs` rather than sitting at a literal.
 *   - **`now` and `ttlMs` are both injected.** A `Date.now()` in here is a
 *     decision no test can assert (CLAUDE.md §2.3), and a window baked in as a
 *     constant is a window the sweep's own caller cannot state.
 *   - **A clock that has gone backwards keeps everything.** An object written
 *     "in the future" has a negative age, which is below any window, so skew
 *     makes the sweep do nothing rather than do something wrong.
 *
 * Depends on: `isMintedStagingKey` from ./uploadSlot. No `Result`: there is no
 * way for this to fail, and a Result that is always `ok` is a wrapper.
 */
import { isMintedStagingKey } from './uploadSlot'

/**
 * How long an un-finalised staged object is left alone — one hour.
 *
 * ═══ CHOSEN AGAINST THE THING IT PROTECTS ═══
 *
 * It has to outlive the longest plausible upload still in flight, because an
 * object swept too early is the author's photograph deleted out from under
 * their own progress bar. The capability URL that upload is travelling under
 * lives fifteen minutes ({@link UPLOAD_URL_TTL_SECONDS}), so anything older
 * than that cannot still be being written to under the slot it was offered —
 * one hour is four times that, which covers a clock disagreeing with ours and
 * a client that re-requested a slot for the same file.
 *
 * It is not longer, because the whole point is that these bytes carry
 * coordinates: every hour it is raised is an hour a home address sits in the
 * store. The sweep is scheduled hourly (`docs/runbook.md`), so an abandoned
 * original lives at most two hours.
 *
 * INJECTED, NEVER READ HERE. {@link staleStagedObjects} takes the window as a
 * parameter; this is the value the scheduled script passes, named in one place
 * so the runbook and the script cannot disagree.
 */
export const STAGED_UPLOAD_TTL_MS = 3_600_000

/**
 * One object a store listing reported.
 *
 * TWO FIELDS, NOT THE PORT'S THREE. `apps/web/lib/ports/storage.ts`'s
 * `StoredObject` also carries `bytes`, which nothing here decides on — and
 * naming that type would make this package depend on `apps/web`'s, which is
 * backwards. A `StoredObject` satisfies this structurally, so the caller hands
 * its listing straight in.
 */
export interface StagedObject {
  /** The object's key, exactly as the store reports and accepts it. */
  readonly key: string
  /** When it was last written, as epoch milliseconds. */
  readonly modifiedAt: number
}

/**
 * The staged objects that may be deleted.
 *
 * @param objects - Everything the store listed under the staging namespace.
 * @param now - The sweep's clock reading, injected.
 * @param ttlMs - How long an orphan is left alone, injected. An age of exactly
 *   this is kept; one millisecond more is swept.
 * @returns The keys to delete, in the order they were listed. Empty when
 *   nothing qualifies, which is the ordinary answer.
 * @example
 * staleStagedObjects(listed, Date.now(), STAGED_UPLOAD_TTL_MS)
 */
export const staleStagedObjects = (objects: readonly StagedObject[], now: number, ttlMs: number): readonly string[] =>
  objects
    .filter((object) => isMintedStagingKey(object.key) && now - object.modifiedAt > ttlMs)
    .map((object) => object.key)
