# Phase 4 — Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bespoke eleven-screen authoring panel at `/admin` — Overview, Journeys, Journey editor, Media, Galleries, Book & bookmarks, Cover & About, Publish, Settings, Trash and Account — on top of an authorization model that exists **before** the first mutation, so that every screen matches `SCREENS.md` §2, a focal point set in the admin visibly moves the crop in the diary, and a browser sweep is committed per screen group.

**Architecture:** Authorization first, screens second. Tasks 1 and 2 give `journeys`, `pages`, `users` and the three globals an explicit access block and give every admin mutation one way to reach Payload with those rules **on** — because Payload's Local API defaults `overrideAccess` to `true`, a server action that forgets is a server action with no authorization at all. Everything after that is the same shape thirteen times: a pure module in `packages/domain/src/admin/**` holds whatever the screen decides (what is derived, what is orderable, what a click means), a repository in `apps/web/lib/admin/**` turns Payload rows into one typed view model (and takes its Payload instance as its first parameter, never reaching for `getPayload` itself, so a test can watch what it asks the database), a `'use server'` module built only from `guardedAction()` holds the mutations, and a Server Component draws the screen with the smallest possible `'use client'` island beneath it. The admin route-JS budget is the tight one, so the default is a Server Component and a client island is a decision with a measurement behind it.

**Tech Stack:** Next.js 15 (App Router), React Server Components, Payload 3 on Postgres, Zod at every trust boundary, CSS Modules against `@travel-diary/tokens`, Vitest (unit + jsdom + integration), Playwright (e2e, visual, a11y), Lighthouse CI.

**Spec:** `docs/superpowers/specs/2026-08-31-travel-diary-design.md` §4 (Phase 4), §5 (data model), §5.2 (focal point), §6 (module seams), §8 (rendering and routing), §12 (performance), §14 (risks)

**Screen source of record:** `handoff/design_handoff_travel_diary/SCREENS.md` §2.1 through §2.11, and the §2 preamble that specifies the shell

**Data source of record:** `handoff/design_handoff_travel_diary/DATA_MODEL.md`

**Security source of record:** `handoff/design_handoff_travel_diary/SECURITY.md`, and `docs/security.md`'s "What Phase 2 hands to Phase 4" section

**Decisions this phase executes:** `docs/adr/0018-admin-request-policy-and-the-guard-split.md`, `docs/adr/0019-the-admin-performance-gate-and-the-css-seam.md`, `docs/adr/0020-the-presign-seam-and-the-local-upload-receiver.md` (the sweep it says Phase 4 owes)

**Branch:** `feat/phase-4-admin`, cut from `main` at `5131195`.

---

## Global Constraints

Copied verbatim from `CLAUDE.md`, `docs/standards/**`, the design spec and the handoff. Every task's requirements implicitly include this section.

### From `CLAUDE.md` and `docs/standards/**`

- TypeScript `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (§3.1). **`any` and the non-null `!` are banned — use `unknown` and narrow** (§0.8).
- Zod at every trust boundary (§3.1). Zero lint warnings; `npm run lint` runs with `--max-warnings 0`.
- Coverage gates: **100%** lines/branches/functions on `packages/domain/**`, **95%** on `apps/web/lib/**` (§2.1). **"No file is in neither config's `include`."** A new directory joins an `include`, with a real threshold, in the same commit.
- TDD is mandatory (§0.1, §2.2): the failing test exists first **and is watched failing for the expected reason**. Red-to-green is one commit.
- "A test that has never failed is unproven. Domain logic is tested to 100%" (§0.2).
- "No claim of 'done', 'fixed' or 'passing' without pasted command output" (§0.4).
- `npm run verify` before every commit; `npm run verify:full` before any completion claim. **Never `--no-verify`** (§0.5).
- **Key everything by journey id; address rows by id, never by array position** (§0.9).
- Every module has a header naming the pattern it implements, or saying none and why (§0.3, §3.3). Five lines or so, plus any invariant a future edit could break (§1.4).
- **§7.1: repository content never leaves this machine.** A missing local tool makes a check UNRESOLVED, never outsourced.
- One logical change per commit, with a body explaining _why_ (§0.10). Conventional Commits, summary 72 characters or fewer, `Tests:` and `Refs:` trailers, ending with the `Co-Authored-By:` trailer (§8.2). **Take the exact form from `git log`, not from the template**: `docs/standards/08-git-workflow.md` prints `Claude Opus 5 (1M context) <noreply@anthropic.com>` and every commit on `main` today writes `Claude Opus 5 <noreply@anthropic.com>`. Match the commits; a plan that prescribed the template's literal would have every commit in this phase disagree with every commit before it.
- Never commit to `main` (§8.1). Read the staged diff before every commit.
- Browser QA is mandatory: `sweeping-for-browser-defects` to find, `fixing-browser-defects` to fix. **Never patch from a sweep without a failing test** (§10).

### Performance budgets — hard gates (`CLAUDE.md` §6, `docs/standards/06-performance.md`)

| Budget                       | Limit                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page flip                    | Sustained 60fps. **Only `transform` and `opacity` animated** — never layout properties                                                                              |
| Diary route JS               | ≤ 180KB gzipped                                                                                                                                                     |
| **Admin route JS**           | **≤ 320KB gzipped** — the tight one this phase                                                                                                                      |
| LCP                          | ≤ 3,085ms, Lighthouse `simulate` preset (150ms RTT, 1,638Kbps, 4x CPU, median of 5); the book surface at 1350x940, the mobile surface pinned at 412x823 at DPR 1.75 |
| CLS                          | ≤ 0.1                                                                                                                                                               |
| INP                          | ≤ 200ms                                                                                                                                                             |
| Database queries per request | No N+1. Every list is one query with joins                                                                                                                          |
| Images                       | Always a derivative tier, never an original. `hero2x` for displays at 2x or more                                                                                    |

Rules that bite on this phase specifically: **virtualize the gallery grid past 100 tiles**; debounce or `requestAnimationFrame` every resize and scroll handler; prefer `ResizeObserver` to resize listeners; memoize by identity, not by deep compare; measure before optimizing, and paste the measurement.

**A note for this plan's readers: the admin JS budget will be the tight one.** Payload's admin bundle is heavy and eleven screens are about to be added to a surface whose existing gate is asserted on three sign-in panes only. The default in every task below is a Server Component; a `'use client'` island is a decision, and Task 3 builds the measurement that makes it a decision with a number attached rather than a preference.

### Layout breakpoints (design spec §8.2, `SCREENS.md` §2)

| Surface   | Breakpoints                                    |
| --------- | ---------------------------------------------- |
| Diary     | `< 860px` → mobile reading mode                |
| **Admin** | **`≥ 1180` wide · `≥ 860` mid · below narrow** |
| Login     | `< 820` → single column                        |

### From `SECURITY.md`, the rows this phase owns

- "Check authorization on **every mutation**, not just at login. Payload access-control functions per collection; nothing inherits trust from the page it was reached from"
- "Back the account screen's session list with real `sessions` rows, or Revoke and 'Sign out everywhere' do nothing"
- "The `password the whole book` setting must gate server-side. A client-side check leaves the content fetchable"
- "Respect `indexGalleries` in `robots.txt` **and** with `X-Robots-Tag`, since the pages are statically served"
- "Read EXIF once to capture `capturedAt` and orientation" — "Then **strip all metadata** before storing or serving"
- "The design's 'Export everything' is a genuine feature, not a nicety — wire it up"
- `otpRequired` "is the **only** source of truth for the code step" (`DATA_MODEL.md`), and `SCREENS.md` §2.11 puts its toggle on the Account screen

### Copy and design fidelity

`SCREENS.md` is high-fidelity and every colour, size, spacing and copy string in it is deliberate. Design spec §15: **"The voice is deliberate: 'nineteen tarts, no regrets' is content, not a placeholder."** A task that paraphrases a copy string has not implemented it. Where a task below quotes a string in double quotes, that string is transcribed from `SCREENS.md` and goes into the DOM exactly as written.

---

## What already exists — build on it, never duplicate it

| Thing                                                 | Where                                                                                                                                                                      | What this phase does with it                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The admin route group and its document                | `apps/web/app/(admin)/layout.tsx`, `apps/web/app/(admin)/admin.css`                                                                                                        | Adds the shell inside it (Task 3). The layout stays a document shell; the rail is a component, not a layout rewrite                                        |
| `/admin`'s holding screen                             | `apps/web/app/(admin)/admin/page.tsx`, `apps/web/components/admin/PanelHome.tsx`                                                                                           | **Replaced** by the Overview screen (Task 12). `docs/deviations.md` §44 says Phase 4 replaces it, and that is where it is closed                           |
| The guard, and the factory every action is built from | `apps/web/lib/auth/guard.ts` — `requireAdminSession`, `guarded`, `guardedAction`                                                                                           | Every screen and every action in this phase. Nothing new is written here                                                                                   |
| The gate that reports an unguarded action             | `eslint-rules/guarded-server-actions.js`, `apps/web/lib/auth/adminGuardRegistration.test.ts`                                                                               | Constrains how every `'use server'` module below is written. No exemption is added for any of them                                                         |
| Which admin addresses answer without a session        | `apps/web/lib/auth/adminAccess.ts`'s `ADMIN_PUBLIC_PATHS`                                                                                                                  | Untouched: it is default-deny, so every screen this phase mounts is guarded by not being listed                                                            |
| Sign-in, the code step, reset, sign-out               | `apps/web/app/(admin)/admin/sign-in/page.tsx`, `apps/web/app/(admin)/admin/reset/page.tsx`, `apps/web/app/(admin)/admin/sign-out/route.ts`                                 | Untouched. The Account screen (Task 14) writes `users.otpRequired`, which the code step already reads                                                      |
| Sessions, revocation, "sign out everywhere"           | `apps/web/lib/auth/sessions.ts` — `createSessionService`                                                                                                                   | The Account screen's "Where you are signed in" calls it (Task 14). No second revocation path is written                                                    |
| The per-field access precedent                        | `apps/web/collections/sessions.ts`, `apps/web/collections/sessions.access.integration.test.ts`                                                                             | Copied in shape by Task 1, deliberately, including the "enumerate the fields from the config, not from a list" sweep                                       |
| The one production `overrideAccess` site and its pin  | `apps/web/lib/auth/setNewPassword.ts`, `apps/web/lib/auth/overrideAccessSites.test.ts`                                                                                     | Task 2 decides the question for all eleven screens and leaves that pin green                                                                               |
| Presigned upload, ingest, both processor adapters     | `apps/web/lib/media/uploadSlots.ts`, `apps/web/lib/media/ingestUpload.ts`, `apps/web/app/(admin)/admin/media/actions.ts`                                                   | The Media screen (Task 8) is a **caller** of `requestUploadSlots` and `finaliseUpload`. No new upload path is built                                        |
| The derivative tiers, including `grid`                | `apps/web/collections/media.ts`, `apps/web/lib/media/derivativeGeometry.ts`                                                                                                | Every admin thumbnail picks a tier from here. Never an original                                                                                            |
| The book bundle and the diary's renderers             | `apps/web/lib/readBookBundle.ts`, `packages/domain/src/bookBundle.ts`, `apps/web/components/pages/FramesI.tsx`                                                             | Read, not rewritten. The focal point **already reaches the DOM** as `object-position` — Task 7 builds the half that sets it, Task 15 proves the round trip |
| The gallery listing and its ordering                  | `apps/web/lib/galleryFrames.ts`, `apps/web/lib/readGalleryBundle.ts`                                                                                                       | The Galleries screen (Task 9) writes the `order` this reads                                                                                                |
| The admin performance gate                            | `lighthouserc.admin.json`, `scripts/run-lighthouse.mjs`                                                                                                                    | Task 3 gives it a session so it can see a guarded screen, and a second `assertMatrix` entry so `/admin` is judged rather than merely collected             |
| Browser fixtures for a signed-in admin                | `e2e/support/adminSession.ts` — `aSignedInSession`, `anAccountWithACodeStep`, `anUploadUrlFor`                                                                             | Every e2e case below. No second session fixture is written                                                                                                 |
| Seeded content to author against                      | `apps/web/scripts/seed.ts`, `apps/web/scripts/seed-data.ts`                                                                                                                | The screens are driven against the seed's 10 journeys / 33 pages                                                                                           |
| The documentation guards                              | `apps/web/lib/docs/pathCitations.test.ts`, `apps/web/lib/docs/fencedProse.test.ts`, `apps/web/lib/docs/caseCounts.test.ts`, `apps/web/lib/docs/coverageThresholds.test.ts` | Constrain every document this phase writes. Task 15 closes the `docs/qa/**` hole `pathCitations.test.ts`'s own header names                                |

---

## File Structure

| Path                                                   | Responsibility                                                          | Task    |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | ------- |
| `apps/web/collections/journeys.ts`                     | Gains an explicit `access` block                                        | 1       |
| `apps/web/collections/pages.ts`                        | Gains an explicit `access` block                                        | 1       |
| `apps/web/collections/users.ts`                        | Gains a per-row `access` block and field rules                          | 1       |
| `apps/web/globals/book.ts`                             | Gains an explicit `access` block                                        | 1       |
| `apps/web/globals/site.ts`                             | Gains an explicit `access` block                                        | 1       |
| `apps/web/globals/about.ts`                            | Gains an explicit `access` block                                        | 1       |
| `apps/web/collections/adminAccess.integration.test.ts` | The cross-account sweep over all six, fields enumerated from the config | 1       |
| `apps/web/lib/admin/adminScope.ts`                     | The one way an admin mutation reaches Payload with access control on    | 2       |
| `apps/web/lib/admin/adminScope.integration.test.ts`    | That the scope actually makes Payload refuse                            | 2       |
| `packages/domain/src/admin/navigation.ts`              | The eleven screens, their sections, colours and addresses               | 3       |
| `packages/domain/src/admin/breakpoints.ts`             | `wide`/`mid`/`narrow` from a measured width, and what each hides        | 3       |
| `apps/web/components/admin/shell/AdminShell.tsx`       | 238px rail plus main, the 96px header, the scrolling content area       | 3       |
| `apps/web/components/admin/shell/NavRail.tsx`          | Masthead, nav buttons, section colours, counts, profile footer          | 3       |
| `apps/web/components/admin/shell/ScreenHeader.tsx`     | Crumb, title, the two chips, Preview draft, Publish                     | 3       |
| `apps/web/components/admin/shell/shell.module.css`     | Everything the shell paints                                             | 3       |
| `apps/web/lib/admin/readNavCounts.ts`                  | The counts beside each nav button, in one query                         | 3       |
| `apps/web/scripts/mint-lighthouse-session.ts`          | A session row plus the `extraHeaders` file the collector reads          | 3       |
| `packages/domain/src/admin/journeyStatus.ts`           | Draft / Edited / Published / Archived, derived                          | 4       |
| `packages/domain/src/admin/journeyColumns.ts`          | Which columns survive which width                                       | 4       |
| `apps/web/lib/admin/readJourneysScreen.ts`             | Its rows, counts and status, in one query                               | 4       |
| `apps/web/app/(admin)/admin/journeys/page.tsx`         | The Journeys screen                                                     | 4       |
| `apps/web/app/(admin)/admin/journeys/actions.ts`       | `createJourney`, `archiveJourney`, `duplicateJourney`, `trashJourney`   | 4       |
| `packages/domain/src/admin/pageRail.ts`                | Page ordering, and the move/copy/delete operations, by id               | 5       |
| `packages/domain/src/admin/layoutGlyphs.ts`            | The four layouts' real grid cells                                       | 5       |
| `apps/web/lib/admin/readJourneyEditor.ts`              | One journey, its pages, its pool                                        | 5       |
| `apps/web/app/(admin)/admin/journeys/[id]/page.tsx`    | The Journey editor                                                      | 5       |
| `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`  | Every journey-editor mutation                                           | 5, 6, 7 |
| `apps/web/components/admin/editor/PageRail.tsx`        | The page cards, the tool row, the layout box                            | 5       |
| `packages/domain/src/admin/highlights.ts`              | The four-row cap and reordering, by id                                  | 6       |
| `apps/web/components/admin/editor/NotesPane.tsx`       | Notes fields, highlights, note, tally, furniture                        | 6       |
| `packages/domain/src/admin/focalPoint.ts`              | The click-to-percent maths and the pill's text                          | 7       |
| `apps/web/components/admin/editor/SlotPanel.tsx`       | A slot: badge, image, focal reticle, caption, alt                       | 7       |
| `apps/web/components/admin/editor/JourneyPool.tsx`     | The 2-column tile grid, ticked by id                                    | 7       |
| `packages/domain/src/admin/mediaFilters.ts`            | The five filter chips, as predicates over a row                         | 8       |
| `packages/domain/src/admin/gridColumns.ts`             | The tile grid's `minmax` floor for 3 to 8 columns                       | 8       |
| `apps/web/lib/admin/readMediaScreen.ts`                | Tiles, filters, counts                                                  | 8       |
| `apps/web/lib/media/sweepStagedUploads.ts`             | The abandoned pre-strip originals, swept                                | 8       |
| `apps/web/app/(admin)/admin/media/page.tsx`            | The Media screen                                                        | 8       |
| `packages/domain/src/admin/frameOrder.ts`              | Reorder and sort-by-date, **by id**                                     | 9       |
| `apps/web/lib/admin/readGalleriesScreen.ts`            | One journey's frames, in `order`                                        | 9       |
| `apps/web/app/(admin)/admin/galleries/page.tsx`        | The Galleries screen                                                    | 9       |
| `apps/web/app/(admin)/admin/galleries/actions.ts`      | Reorder, caption, the frame toggles, the poster                         | 9       |
| `packages/domain/src/admin/bookmarkOrder.ts`           | The movable rows, and the three fixed ones                              | 10      |
| `apps/web/app/(admin)/admin/book/page.tsx`             | Book & bookmarks                                                        | 10      |
| `apps/web/app/(admin)/admin/cover/page.tsx`            | Cover & About                                                           | 10      |
| `apps/web/app/(admin)/admin/book/actions.ts`           | The `book` and `about` global writes                                    | 10      |
| `packages/domain/src/admin/pendingChange.ts`           | A change's kind, tone, location and label                               | 11      |
| `apps/web/lib/admin/readPendingChanges.ts`             | What is waiting to go out, from Payload's versions                      | 11      |
| `apps/web/lib/admin/publishSelection.ts`               | Publishing a subset, and the paths it revalidates                       | 11      |
| `apps/web/app/(admin)/admin/publish/page.tsx`          | The Publish screen                                                      | 11      |
| `packages/domain/src/admin/prompts.ts`                 | "Needs a look", and the deep link each resolves to                      | 12      |
| `apps/web/lib/admin/readOverview.ts`                   | The stat grid, the book chip, the prompts, Lately                       | 12      |
| `packages/domain/src/admin/storageBar.ts`              | The 7px segmented bar's three widths                                    | 13      |
| `apps/web/lib/bookAccess.ts`                           | The `passwordProtect` server-side gate                                  | 13      |
| `apps/web/app/robots.ts`                               | `indexGalleries`, read from the global                                  | 13      |
| `apps/web/app/(admin)/admin/settings/page.tsx`         | The Settings screen                                                     | 13      |
| `apps/web/app/(admin)/admin/trash/page.tsx`            | The Trash screen                                                        | 13      |
| `apps/web/app/(admin)/admin/export/route.ts`           | "Export everything"                                                     | 13      |
| `apps/web/lib/admin/readAccountScreen.ts`              | The profile, the toggles, the session list                              | 14      |
| `apps/web/app/(admin)/admin/account/page.tsx`          | The Account screen                                                      | 14      |
| `apps/web/app/(admin)/admin/account/actions.ts`        | Profile, notifications, `otpRequired`, password, revoke                 | 14      |
| `e2e/admin.spec.ts`                                    | The shell, and one case per screen as it lands                          | 3 to 14 |
| `e2e/focalPoint.spec.ts`                               | The exit criterion: admin click to diary crop                           | 15      |

---

## Screen-to-task map

Every screen in `SCREENS.md` §2, and the one task that owns it. A screen with no owning task is a screen that ships by accident.

| `SCREENS.md` | Screen                                                | Owned by    |
| ------------ | ----------------------------------------------------- | ----------- |
| §2 preamble  | Shell: rail, header, cards, buttons, inputs, toggles  | **Task 3**  |
| §2.1         | Overview                                              | **Task 12** |
| §2.2         | Journeys                                              | **Task 4**  |
| §2.3         | Journey editor — page rail and layouts                | **Task 5**  |
| §2.3         | Journey editor — the Notes pane                       | **Task 6**  |
| §2.3         | Journey editor — slots, focal point, Frames, the pool | **Task 7**  |
| §2.4         | Media                                                 | **Task 8**  |
| §2.5         | Galleries                                             | **Task 9**  |
| §2.6         | Book & bookmarks                                      | **Task 10** |
| §2.7         | Cover & About                                         | **Task 10** |
| §2.8         | Publish                                               | **Task 11** |
| §2.9         | Settings                                              | **Task 13** |
| §2.10        | Trash                                                 | **Task 13** |
| §2.11        | Account                                               | **Task 14** |

§2.6 and §2.7 share Task 10 because both write globals and neither is more than two cards. §2.9 and §2.10 share Task 13 because Trash is four lines of specification and its rows are the soft-deleted journeys Settings' storage figures already count. The Journey editor is three tasks because it is roughly twice the size of any other screen, and because a reviewer can reject the page rail without unpicking the slots.

---

## Task-to-exit-criterion map

The spec's `_Exit:_` line for Phase 4 is three things (design spec §4). Each has exactly one **owning** task, and the case that proves it is named.

| Exit criterion                                                       | Owned by    | The case that proves it, and by what                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Every screen matches `SCREENS.md`**                                | **Task 15** | `e2e/visual.spec.ts`'s admin baselines at all three Playwright viewports, plus the per-screen-group sweeps in `docs/qa/`. Each screen task adds its own baseline as it lands; Task 15 is where the set is complete and the sweeps are triaged                           |
| **Focal points set in the admin visibly move the crop in the diary** | **Task 15** | `e2e/focalPoint.spec.ts`. The clicked position is produced by Playwright's mouse against a bounding box the browser measured; the asserted value is produced by a database row, `readBookBundle` and React, in a different process. Neither side is written by the test |
| **A browser sweep committed per screen group**                       | **Task 15** | Four files under `docs/qa/`, one per group, produced by `sweeping-for-browser-defects`. A sweep that produces no file did not happen (`CLAUDE.md` §10)                                                                                                                  |

Authorization is not one of the three, and is Task 1 anyway, for the reason in the next section.

---

## Why authorization is Task 1

**`journeys`, `pages` and `users` carry no `access` block at all.** Read the three files: `apps/web/collections/journeys.ts`, `apps/web/collections/pages.ts` and `apps/web/collections/users.ts` each declare `slug`, then `versions`/`auth`, then `fields`, and nothing else. They therefore inherit Payload's `defaultAccess` — `({ req: { user } }) => Boolean(user)`, **"signed in, or refused"** — for every one of the four operations.

That is the same shape that, on `sessions`, let any signed-in user read, update and delete **every other user's rows** until a cross-account test found it. The record is `docs/deviations.md` §29 and `apps/web/collections/sessions.access.integration.test.ts`. The collection-level fix was not sufficient either: three fields inside a correctly-permitted operation had to be closed separately — `user` (privilege escalation through the field the ownership predicate itself reads), `revokedAt` (a revoked session un-revoked by one `PATCH`) and `createdAt` (a field Payload injected during sanitisation, which therefore carried no rule at all).

`docs/security.md`'s "What Phase 2 hands to Phase 4" section states the live position plainly: "Phase 4 adds the second author or the first server action, and then the rule has to exist." **This phase adds both.** Eleven screens of mutations are about to be built on these collections. If authorization lands last, every screen needs re-auditing against it, and the three-of-ten miss rate the design spec predicts for exactly this retrofit (§4, Phase 2's rationale) is the outcome.

It is two tasks rather than one, because there are two independent holes and a reviewer can reject either without the other:

1. **Task 1 — the rules do not exist.** Six configuration objects gain an `access` block, and a cross-account sweep enumerated from the config proves each refuses what it should.
2. **Task 2 — the rules are not run.** Payload's Local API defaults `overrideAccess` to `true`, so an action calling `payload.update()` gets **no** access check at all unless it passes `overrideAccess: false` **and** a `user`. `overrideAccess` appears in production code at exactly one place — `apps/web/lib/auth/setNewPassword.ts:209`, at the password-reset spend, where the token is the authorization and Payload has no user to judge — and `apps/web/lib/auth/overrideAccessSites.test.ts` pins that set, requiring every production site to be named in `docs/security.md` and `docs/api.md`. Any authorization model this phase adopts has to account for it, and `docs/security.md` says the decision is made **once, for all the screens**, rather than per call site.

---

## How this plan answers the four checks Phase 3's plan got wrong

Phase 3's plan prescribed four checks that proved nothing. Every one was caught by an implementer who measured instead of trusting the plan, and each cost a review round. The class is: **an assertion whose two sides both originate inside the test.** This plan's rule, applied to every assertion below:

> **State what physically produces each value being compared.** If both sides originate inside the test, it is not a test — it is a restatement. Prefer prescribing _the property to establish and the mutation that must kill it_ over prescribing exact literal bytes or exact literal statuses that have not been verified to exist.

| The Phase 3 defect                                                                                                                               | What it would have passed against          | The rule this plan applies instead                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An EXIF assertion searching the stored bytes for the ASCII string `GPS` — **which does not appear in the fixture at all**                        | A file with the GPS directory fully intact | Never assert on a literal whose presence in the input has not been demonstrated **in the same case**. Where a task asserts absence, it asserts the corresponding presence first, in the same case. Task 8's sweep is written this way                          |
| Hand-written staging keys that would have been refused **before** the SVG and video checks they existed to exercise                              | Both cases, for the wrong reason           | Every fixture that must survive a prior check is **built by the production path that produces it** — `anUploadUrlFor` for uploads, `aSignedInSession` for sessions, `payload.create` for rows — never hand-assembled                                           |
| An expected-status list of `[302,303,401,403]` for a guarded route, when `fetch` follows redirects and a correctly-guarded route answers **200** | Every outcome, including the wrong one     | No assertion below lists alternative acceptable statuses. Where a redirect is the behaviour, the task asserts the **landing address** (`response.url`), or passes `redirect: 'manual'` and asserts one status. A set of acceptable answers is not an assertion |
| "Write the assertion as 7 and let it fail"                                                                                                       | Nothing — and two implementers refused it  | **No task below commits a known-failing test.** The red is watched in the working tree, before the implementation; red-to-green is one commit (§2.2, §8.2, and `git bisect`)                                                                                   |

And the positive form, which every task uses: **each task carries a numbered mutation step** naming the exact edit to make, the exact test that must fail, and the restore. Where a mechanism has no single line to delete, the task says so and mutates the nearest thing that changes behaviour. A mutation step that names no failing test has not been run.

**One more rule, specific to this phase.** Eleven screens' worth of assertions will be written against a DOM this plan cannot see. So where a task asserts about rendered output, it asserts a **property whose cause is outside the component** — an `object-position` that came from a database row, a count that came from a `payload.find`, an address that came from `packages/domain/src/admin/navigation.ts` — rather than a string that the test and the component both spell out. A test that spells a heading in both files has proved the heading was typed twice.

---

## Task 1: The access blocks `journeys`, `pages`, `users` and the three globals have never had

Six configuration objects inherit Payload's `defaultAccess` today. One of them — `users` — is a live cross-account defect of exactly the species `docs/deviations.md` §29 records on `sessions`, and `apps/web/collections/sealedUserAuth.ts` does not close it: that module seals the **auth** endpoints Payload mounts (`POST /api/users/login` and its siblings), and leaves the ordinary CRUD ones (`PATCH /api/users/<id>`) exactly as they were. So a caller signed in as account A can `PATCH` account B's row and set `otpRequired: false`, turning off somebody else's second factor — which `DATA_MODEL.md` calls "the **only** source of truth for the code step".

**Files:**

- Modify: `apps/web/collections/users.ts`, `apps/web/collections/journeys.ts`, `apps/web/collections/pages.ts`, `apps/web/globals/book.ts`, `apps/web/globals/site.ts`, `apps/web/globals/about.ts`
- Create: `apps/web/collections/adminAccess.integration.test.ts`
- Modify: `vitest.integration.config.ts` (the new test file is matched by the existing `apps/web/collections/**/*.integration.test.ts` include; no change is needed unless the run reports otherwise — check, do not assume)

**Interfaces:**

- Consumes: `Access` and `CollectionConfig` from `payload`; `ownSessionsOnly` (`apps/web/collections/sessions.ts`) **as a shape to copy, not to import** — it constrains on `user`, this constrains on `id`.
- Produces: `ownAccountOnly: Access`, exported from `apps/web/collections/users.ts`. Task 2 does **not** import it; the sweep test does.

- [ ] **Step 1: Write the failing cross-account test**

Create `apps/web/collections/adminAccess.integration.test.ts`. It needs two real accounts, and both are created through the Local API with `overrideAccess` left at its default — the accounts are fixtures, not the subject.

```ts
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { Payload, TypedUser } from 'payload'
import { getPayload } from '../lib/payload'
import { Users } from './users'

/** The marker every row this file creates carries, so `afterAll` can find them. */
const MARKER = 'test-admin-access'

let payload: Payload
let accountA: TypedUser
let accountB: TypedUser

const anAccount = async (local: string): Promise<TypedUser> => {
  const created = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}-${local}@example.test`, password: 'not-a-real-password' },
  })
  return { ...created, collection: 'users' }
}

beforeAll(async () => {
  payload = await getPayload()
  accountA = await anAccount('a')
  accountB = await anAccount('b')
})

afterAll(async () => {
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
})

describe('users, across two accounts', () => {
  it('refuses one account the ability to turn off another account’s second factor', async () => {
    // The refusal and the value are produced by two different things: Payload
    // decides the first, Postgres holds the second. Asserting only that the
    // call threw would pass against a rule that threw AFTER writing.
    await expect(
      payload.update({
        collection: 'users',
        id: accountB.id,
        overrideAccess: false,
        user: accountA,
        data: { otpRequired: false },
      }),
    ).rejects.toThrow()

    const afterwards = await payload.findByID({ collection: 'users', id: accountB.id, depth: 0 })
    expect(afterwards.otpRequired).toBe(true)
  })

  it('narrows a listing to the caller’s own row rather than refusing it', async () => {
    const found = await payload.find({ collection: 'users', overrideAccess: false, user: accountA, depth: 0 })

    // The left side comes from Postgres through Payload's access layer; the
    // right side is the id the create call returned. Neither is typed twice.
    expect(found.docs.map((doc) => doc.id)).toEqual([accountA.id])
  })

  it('refuses an account creation through the API, because this diary has one author', async () => {
    await expect(
      payload.create({
        collection: 'users',
        overrideAccess: false,
        user: accountA,
        data: { email: `${MARKER}-c@example.test`, password: 'not-a-real-password' },
      }),
    ).rejects.toThrow()
  })

  it('refuses an account deletion through the API, on a row that really exists', async () => {
    // The row is real on purpose: a delete aimed at an id that does not exist
    // is refused for being ABSENT rather than for being forbidden, which is
    // how the missing `delete` predicate on the server-only collections
    // survived beside a passing test (docs/deviations.md §28).
    await expect(
      payload.delete({ collection: 'users', id: accountB.id, overrideAccess: false, user: accountA }),
    ).rejects.toThrow()

    const stillThere = await payload.findByID({ collection: 'users', id: accountB.id, depth: 0 })
    expect(stillThere.id).toBe(accountB.id)
  })

  it('leaves every field of another account’s row untouched by any update A can make', async () => {
    // The field list is enumerated from the config rather than written here,
    // so a field Phase 4 adds to `users` is swept the day it lands. This is
    // the shape sessions.access.integration.test.ts uses, for the same reason.
    const writable = Users.fields.flatMap((field) =>
      'name' in field && typeof field.name === 'string' ? [field.name] : [],
    )
    expect(writable.length).toBeGreaterThan(0)

    const before = await payload.findByID({ collection: 'users', id: accountB.id, depth: 0 })
    const attempts = await Promise.allSettled(
      writable.map((name) =>
        payload.update({
          collection: 'users',
          id: accountB.id,
          overrideAccess: false,
          user: accountA,
          data: { [name]: 'changed-by-the-other-account' },
        }),
      ),
    )
    const after = await payload.findByID({ collection: 'users', id: accountB.id, depth: 0 })

    expect(attempts.filter((outcome) => outcome.status === 'fulfilled')).toEqual([])
    expect(
      writable.filter((name) => before[name as keyof typeof before] !== after[name as keyof typeof after]),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run them and watch them fail, for the right reason**

Run: `npx vitest run --config vitest.integration.config.ts apps/web/collections/adminAccess.integration.test.ts`

Expected: all five FAIL. The first fails because the update **succeeds** — read the failure message and confirm it says the promise resolved, not that it rejected with something unexpected; that distinction is the whole point of watching the red. The second fails returning **two** rows. The third and fourth fail because the operations succeed. The fifth fails with a non-empty list of fulfilled attempts.

If any of them fails for a different reason (a missing Postgres, a fixture collision), fix the fixture and re-run before going on. A red for the wrong reason proves nothing (`CLAUDE.md` §0.1).

- [ ] **Step 3: Give `users` its access block**

In `apps/web/collections/users.ts`, above `export const Users`:

```ts
/**
 * Restricts an operation to the caller's own account row.
 *
 * Returns a `Where` rather than a boolean so a `find` NARROWS to the caller's
 * own row instead of refusing the request, while an `update` aimed at anybody
 * else's row matches nothing and is refused. The same shape, for the same
 * reason, as `ownSessionsOnly` in `./sessions.ts`.
 *
 * @param request - Payload's access argument; only `req.user` is read.
 * @returns A `Where` matching the caller's own row, or `false` with no caller.
 */
export const ownAccountOnly: Access = ({ req: { user } }) => (user ? { id: { equals: user.id } } : false)
```

and on the collection, immediately after `slug`:

```ts
  // HANDOFF-DEVIATION: DATA_MODEL.md's `users` section prints a field list and
  // no access block, so this collection inherited Payload's defaultAccess —
  // "signed in, or refused", where "signed in" means ANY account. That is the
  // shape docs/deviations.md §29 records as a cross-account leak on
  // `sessions`, and `sealedUserAuth.ts` does not close it: that module seals
  // the AUTH endpoints, not `PATCH /api/users/<id>`. Measured before this
  // block existed: account A turned off account B's `otpRequired`, which
  // DATA_MODEL.md calls the only source of truth for the code step.
  // `create` and `delete` are refused outright rather than narrowed — the
  // design has one author (design spec §1.2), accounts arrive through
  // `npm run db:seed`, and an account cannot meaningfully delete itself from
  // the screen it is signed in on. See docs/deviations.md §52.
  access: {
    read: ownAccountOnly,
    create: () => false,
    update: ownAccountOnly,
    delete: () => false,
  },
```

Add `Access` to the existing `import type { CollectionConfig } from 'payload'` line.

**Two field-level rules were considered and are deliberately absent, which is stated here because their absence is a decision.** (1) Payload's injected `loginAttempts`/`lockUntil` are writable by the row's owner, so an account can clear its own cooling-off period — but the principal who can do that already holds the password or the session, so it is not the escalation `sessions.user` was. (2) `createdAt`/`updatedAt` are injected and therefore carry no rule, as on `sessions` — but nothing on `users` authenticates or is audited against them. Both are recorded in the module header rather than closed, because a rule with no threat behind it is a rule the next reader deletes.

- [ ] **Step 4: Run the five cases and watch them pass**

Run: `npx vitest run --config vitest.integration.config.ts apps/web/collections/adminAccess.integration.test.ts`
Expected: PASS, 5 of 5. **Paste the output.**

- [ ] **Step 5: Mutation — delete the block, name the test that must fail**

Delete the four lines of `access: { … }` from `Users`. Re-run Step 4's command.
**The tests that must fail: all five.** Restore, re-run, **paste both runs.** If any case still passes with the block gone, that case is asserting something else and must be rewritten before this task closes.

- [ ] **Step 6: Commit**

```text
feat(auth): give users a per-row access block, closing a cross-account write
```

Body: what was measured (A turning off B's `otpRequired` through `PATCH /api/users/<id>`), why `sealedUserAuth.ts` did not already stop it, why `create`/`delete` are refused outright, and the two field rules considered and rejected. `Refs:` `docs/deviations.md` §29, `docs/security.md` "What Phase 2 hands to Phase 4", `SECURITY.md` "Check authorization on every mutation".

- [ ] **Step 7: Write the failing cases for `journeys`, `pages` and the three globals**

Append to `apps/web/collections/adminAccess.integration.test.ts`. These five objects have no rule and need one before Task 2 makes them the rules that run on every admin call. Unlike `users` there is no present exploit here — the deployment has one account — so the property to establish is narrower and is stated as such: **a caller with no session is refused every operation, and the refusal comes from a rule this repository wrote rather than from a default it inherited.**

```ts
describe('the content collections and globals, for a caller with no session', () => {
  it('refuses to read a journey', async () => {
    await expect(payload.find({ collection: 'journeys', overrideAccess: false })).rejects.toThrow()
  })

  it('refuses to read a page', async () => {
    await expect(payload.find({ collection: 'pages', overrideAccess: false })).rejects.toThrow()
  })

  it('refuses to update the book global', async () => {
    await expect(
      payload.updateGlobal({ slug: 'book', overrideAccess: false, data: { title: 'not by this caller' } }),
    ).rejects.toThrow()
  })

  it('refuses to update the site global', async () => {
    await expect(
      payload.updateGlobal({ slug: 'site', overrideAccess: false, data: { name: 'not by this caller' } }),
    ).rejects.toThrow()
  })

  it('refuses to update the about global', async () => {
    await expect(
      payload.updateGlobal({ slug: 'about', overrideAccess: false, data: { replyTo: 'nobody@example.test' } }),
    ).rejects.toThrow()
  })
})

describe('the content collections and globals, for the signed-in author', () => {
  it('lets the author read and write a journey, so the editor is not locked out by its own rule', async () => {
    const created = await payload.create({
      collection: 'journeys',
      overrideAccess: false,
      user: accountA,
      data: { name: MARKER, place: MARKER, slug: `${MARKER}-journey`, dates: 'one day' },
    })
    const updated = await payload.update({
      collection: 'journeys',
      id: created.id,
      overrideAccess: false,
      user: accountA,
      data: { place: 'somewhere else' },
    })

    expect(updated.place).toBe('somewhere else')

    await payload.delete({ collection: 'journeys', id: created.id, overrideAccess: false, user: accountA })
  })
})
```

**Why the signed-out cases are not vacuous, said plainly:** they would pass today, against the inherited default. They are here as the regression guard for the block Step 8 writes — the failure they exist to catch is a future `read: () => true` added for a public API nobody thought through — and the mutation in Step 10 is what proves they are wired to this repository's rule rather than to Payload's. The case that genuinely fails first is the author case: `journeys.create` through `overrideAccess: false` is the call every Task 4 action will make, and nothing has ever run it.

- [ ] **Step 8: Run them and watch the author case fail**

Run: `npx vitest run --config vitest.integration.config.ts apps/web/collections/adminAccess.integration.test.ts`
Expected: the five signed-out cases PASS (they assert the default's behaviour, which is correct today), and **`lets the author read and write a journey` FAILS** — `journeys` has `required: true` on `name`, `place`, `slug` and `dates`, so read the failure and confirm it is an access refusal rather than a validation error. If it is a validation error, the fixture is wrong, not the rule.

- [ ] **Step 9: Give the five objects their access blocks**

The same block on `Journeys` and `Pages`, immediately after `slug`:

```ts
  // HANDOFF-DEVIATION: DATA_MODEL.md prints no access block for this
  // collection, so it inherited Payload's defaultAccess. Written out because
  // Phase 4 Task 2 makes every admin read and write pass
  // `overrideAccess: false`, which turns this from an unexercised default into
  // the rule that runs on every screen — and because a dependency's default is
  // not this repository's decision. It is the SAME behaviour as the default,
  // deliberately: the diary reads these rows through the Local API, which
  // bypasses access control, so nothing public depends on them being readable
  // over HTTP and widening them would be exposure nobody asked for.
  // See docs/deviations.md §52.
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
```

The same four-key block on `Book`, `Site` and `About` in `apps/web/globals/`, with `read` and `update` only — a global has no `create` or `delete`. Each carries the same comment, pointing at this task.

- [ ] **Step 10: Run, then mutate**

Run Step 8's command. Expected: PASS, 11 of 11. **Paste it.**

Then mutate: change `Journeys`'s `read` to `() => true`. Re-run.
**The test that must fail: `refuses to read a journey`.** Restore, re-run, **paste both runs.** This is the step that converts the five signed-out cases from "asserting the default" into "asserting our rule": with the block present, they are wired to it.

- [ ] **Step 11: Commit**

```text
feat(auth): write the access rules journeys, pages and the globals inherited
```

Body: that these are the rules Task 2 makes load-bearing, that the behaviour is deliberately identical to the default they replace and why widening was rejected, and that the author case is the one that had never been run.

---

## Task 2: `overrideAccess` decided once, for all eleven screens

`docs/security.md`: "Payload's Local API defaults `overrideAccess` to `true`, so a call that passes nothing runs with those rules skipped… **For Phase 4 it is a trap.** A server action that calls `payload.update()` on behalf of a request gets no access check from Payload unless it passes `overrideAccess: false` and a `user`… Phase 4 must decide this once, for all ten screens, rather than per call site."

This task is that decision, and it is a module rather than a convention so that a screen has nothing to remember — the same argument `guardedAction` makes about the guard itself.

**Files:**

- Create: `apps/web/lib/admin/adminScope.ts`, `apps/web/lib/admin/adminScope.integration.test.ts`
- Modify: `packages/domain/src/ids.ts`, `packages/domain/src/ids.test.ts` (the branded-id-to-row-id guard, promoted from its two private copies)
- Modify: `apps/web/lib/auth/sessions.ts`, `apps/web/lib/auth/otpService.ts` (each drops its private copy)
- Modify: `apps/web/lib/auth/overrideAccessSites.test.ts` (the production set grows to two)
- Modify: `docs/security.md`, `docs/api.md` (both must name every production site, or that test fails)
- Create: `docs/adr/0023-admin-authorization-and-override-access.md` — the decision, taken once, for eleven screens
- Modify: `vitest.integration.config.ts` (add `apps/web/lib/admin/adminScope.ts` to the coverage `include`, gated at 100)

**Interfaces:**

- Consumes: `AuthenticatedSession` (`apps/web/lib/auth/sessions.ts`) — `{ readonly user: UserId }`, which is a **branded string**, not a Payload row; `getPayload` (`apps/web/lib/payload.ts`); `TypedUser` from `payload`.
- Produces:
  - `accountRowId(user: UserId): number | undefined` in `packages/domain/src/ids.ts`
  - `interface AdminScope { readonly user: TypedUser; readonly overrideAccess: false }`
  - `adminScope(session: AuthenticatedSession): Promise<AdminScope>` in `apps/web/lib/admin/adminScope.ts`

  Every task from 4 onwards spreads `...(await adminScope(session))` into every `payload.find`, `findByID`, `create`, `update`, `delete`, `findGlobal` and `updateGlobal` it makes. That spread is the whole interface; no task writes `overrideAccess` itself.

- [ ] **Step 1: Write the failing test for the promoted guard**

`AuthenticatedSession.user` is a `UserId` — a branded **string** — and Payload's Postgres adapter wants a number. Two private copies of the conversion already exist, in `apps/web/lib/auth/sessions.ts` (`accountRowId`) and `apps/web/lib/auth/otpService.ts`. This task is the third caller, which is when `CLAUDE.md` §4's "no abstraction for a single caller" stops applying.

Append to `packages/domain/src/ids.test.ts`:

```ts
describe('accountRowId', () => {
  it('returns the row id for a branded id that names one', () => {
    expect(accountRowId(userId('104'))).toBe(104)
  })

  it('returns undefined rather than NaN for a brand that is not a row id', () => {
    // `Number('nonsense')` reaching the driver escapes as a raw
    // `Failed query: … params: NaN`, past every Result contract above it.
    expect(accountRowId(userId('nonsense'))).toBeUndefined()
  })

  it('returns undefined for a row id no table can hold', () => {
    expect(accountRowId(userId('0'))).toBeUndefined()
    expect(accountRowId(userId('-3'))).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project unit packages/domain/src/ids.test.ts`
Expected: FAIL — `accountRowId is not exported` / not defined.

- [ ] **Step 3: Promote the guard, and delete both copies**

Add to `packages/domain/src/ids.ts`:

```ts
/**
 * The numeric row id a branded account id names, or `undefined`.
 *
 * The brand only promises a non-empty string, so a caller can hand over
 * something that is not a Payload id; answering `undefined` keeps
 * `Number('nonsense')` from reaching the driver as `NaN` and escaping as a raw
 * `Failed query` past whatever `Result` contract is above it.
 *
 * @param user - The branded account id.
 * @returns The row id, or `undefined` when the brand does not name one.
 * @example
 * accountRowId(userId('104')) // 104
 */
export const accountRowId = (user: UserId): number | undefined => {
  const parsed = Number(user)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}
```

Delete the private `accountRowId` from `apps/web/lib/auth/sessions.ts` and the equivalent from `apps/web/lib/auth/otpService.ts`, and import this one in both. Read each call site: neither file may keep a second spelling of the same guard, which is the duplication `resetPath.test.ts` exists to refuse.

- [ ] **Step 4: Run the whole unit suite, not just the new file**

Run: `npm run test:unit`
Expected: PASS. Two modules just lost a private function; anything that was depending on a subtly different one fails here.

- [ ] **Step 5: Write the failing test for the scope itself**

Create `apps/web/lib/admin/adminScope.integration.test.ts`. The property to establish is not "the object has two keys" — that is a restatement. It is: **a call made with this scope is refused by the rules Task 1 wrote, and the same call made without it is not.**

```ts
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { userId } from '@travel-diary/domain/ids'
import { getPayload } from '../payload'
import { adminScope } from './adminScope'

const MARKER = 'test-admin-scope'
let payload: Payload
let other: number

beforeAll(async () => {
  payload = await getPayload()
  const created = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}-other@example.test`, password: 'not-a-real-password' },
  })
  other = created.id
})

afterAll(async () => {
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
})

describe('adminScope', () => {
  it('carries the account the session names, read from the row rather than from the brand', async () => {
    const mine = await payload.create({
      collection: 'users',
      data: { email: `${MARKER}-mine@example.test`, password: 'not-a-real-password' },
    })

    const scope = await adminScope({ user: userId(String(mine.id)) })

    // The left side is what the scope resolved; the right side came back from
    // `payload.create`. The session only ever carried the id.
    expect(scope.user.id).toBe(mine.id)
    expect(scope.user.collection).toBe('users')
  })

  it('makes Payload refuse a write the guard alone would have allowed', async () => {
    const mine = await payload.create({
      collection: 'users',
      data: { email: `${MARKER}-refuse@example.test`, password: 'not-a-real-password' },
    })
    const scope = await adminScope({ user: userId(String(mine.id)) })

    // Same call, twice, differing only in the scope. Without it Payload runs
    // with access control off and the write lands on somebody else's account;
    // with it, Task 1's `ownAccountOnly` refuses. If the first half ever stops
    // succeeding, this case has stopped measuring what it claims to.
    const withoutScope = await payload.update({
      collection: 'users',
      id: other,
      data: { notifyWeekly: true },
    })
    expect(withoutScope.notifyWeekly).toBe(true)

    await expect(
      payload.update({ collection: 'users', id: other, ...scope, data: { notifyWeekly: false } }),
    ).rejects.toThrow()

    const afterwards = await payload.findByID({ collection: 'users', id: other, depth: 0 })
    expect(afterwards.notifyWeekly).toBe(true)
  })

  it('refuses a session whose brand names no row, rather than querying with NaN', async () => {
    await expect(adminScope({ user: userId('nonsense') })).rejects.toThrow()
  })
})
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run --config vitest.integration.config.ts apps/web/lib/admin/adminScope.integration.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 7: Write the scope**

Create `apps/web/lib/admin/adminScope.ts`:

```ts
/**
 * adminScope — the one way an admin read or write reaches Payload with this
 * repository's access rules switched ON.
 *
 * Payload's Local API defaults `overrideAccess` to `true`: a call that passes
 * nothing runs with collection and field access control SKIPPED. Phase 2 was
 * right to leave it that way — every call there had already authenticated the
 * request itself — and `docs/security.md` names it a trap for this phase,
 * because eleven screens of Server Actions are about to call `payload.update`.
 * Deciding it per call site is deciding it eleven times and forgetting once.
 *
 * It resolves the account ROW because `AuthenticatedSession` carries only a
 * branded id and Payload's access predicates read `req.user.id`. One extra
 * `findByID` per action, not per row: this is not the N+1 CLAUDE.md §6 forbids.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is one lookup and one
 * object; naming a pattern for that would be cargo cult.
 *
 * INVARIANT — `overrideAccess` is `false` here and nowhere else in this
 * directory. `apps/web/lib/auth/overrideAccessSites.test.ts` pins the
 * production set to this file and `setNewPassword.ts`, and requires both to be
 * named in `docs/security.md` and `docs/api.md`.
 * Depends on: `payload` (types), `accountRowId` (@travel-diary/domain/ids),
 * `getPayload` (../payload), `AuthenticatedSession` (../auth/sessions).
 */
import { accountRowId } from '@travel-diary/domain/ids'
import type { TypedUser } from 'payload'
import type { AuthenticatedSession } from '../auth/sessions'
import { getPayload } from '../payload'

/** What every admin Local API call spreads, so no call site decides this. */
export interface AdminScope {
  /** The account row Payload's access predicates judge against. */
  readonly user: TypedUser
  /** Literally `false`: the type refuses a call site that flips it. */
  readonly overrideAccess: false
}

/**
 * The scope for the account the guard admitted.
 *
 * @param session - What `guardedAction` handed the action.
 * @returns The scope to spread into every Local API call the action makes.
 * @throws When the session's brand names no account row — which is a bug in
 *   whatever minted it, not a state a screen can draw.
 * @example
 * const scope = await adminScope(session)
 * await payload.update({ collection: 'journeys', id, ...scope, data })
 */
export const adminScope = async (session: AuthenticatedSession): Promise<AdminScope> => {
  const id = accountRowId(session.user)
  if (id === undefined) throw new Error('the admitted session names no account row')

  const payload = await getPayload()
  const account = await payload.findByID({ collection: 'users', id, depth: 0 })

  return { user: { ...account, collection: 'users' }, overrideAccess: false }
}
```

If `TypedUser`'s shape makes `{ ...account, collection: 'users' }` fail `tsc`, read `node_modules/payload/dist/index.d.ts` for the alias's definition and satisfy it — **do not reach for `as`, and do not reach for `any`** (`CLAUDE.md` §0.8).

- [ ] **Step 8: Run both suites**

Run: `npx vitest run --config vitest.integration.config.ts apps/web/lib/admin/adminScope.integration.test.ts`
Expected: PASS, 3 of 3. **Paste it.**

- [ ] **Step 9: Make `overrideAccessSites.test.ts` green the honest way**

`npm run verify` is now red: `apps/web/lib/auth/overrideAccessSites.test.ts` pins `PRODUCTION_SITES` to exactly `['apps/web/lib/auth/setNewPassword.ts']`, and every non-test file carrying the option must be in that list. Run it first and read the failure — that red is the check working.

Run: `npx vitest run --project unit apps/web/lib/auth/overrideAccessSites.test.ts`
Expected: FAIL, naming `apps/web/lib/admin/adminScope.ts` as an unlisted production site.

Then: add `'apps/web/lib/admin/adminScope.ts'` to `PRODUCTION_SITES`, and add a case that distinguishes the two sites by what they pass, because they pass opposite values and a list that hides that difference is a list that stops meaning anything:

```ts
it('switches access control ON at the admin scope and OFF only at the reset spend', () => {
  const scope = readFileSync(path.join(REPOSITORY_ROOT, 'apps/web/lib/admin/adminScope.ts'), 'utf8')

  expect(scope).toContain('overrideAccess: false')
  expect(scope).not.toContain('overrideAccess: true')
})
```

- [ ] **Step 10: Name the new site in both documents**

`overrideAccessSites.test.ts` fails until `docs/security.md` and `docs/api.md` each name `apps/web/lib/admin/adminScope.ts`. In `docs/security.md`, edit the "What Phase 2 hands to Phase 4" section: paragraph 1's "**For Phase 4 it is a trap**" now has an answer, and it is this module — say what it does, say that every admin call spreads it, and say that the `false`/`true` split between the two sites is what the new case pins. In `docs/api.md`'s "Planned server actions" section, add the same fact where it says Phase 4's mutations are server actions.

Run: `npx vitest run --project unit apps/web/lib/auth/overrideAccessSites.test.ts`
Expected: PASS. **Paste it.**

- [ ] **Step 11: Mutation — flip the scope, name the test that must fail**

Change `overrideAccess: false` to `overrideAccess: true` in `adminScope.ts`. Run Step 8's command and Step 10's command.
**The tests that must fail: `makes Payload refuse a write the guard alone would have allowed` and `switches access control ON at the admin scope and OFF only at the reset spend`.** Restore, re-run both, **paste all four runs.**

- [ ] **Step 12: Add the coverage entry, then commit**

Add `'apps/web/lib/admin/adminScope.ts'` to `vitest.integration.config.ts`'s coverage `include` with a per-file threshold of 100/100/100 (it is three branches and they are all exercised above), and exclude it by exact path from `vitest.config.ts`'s coverage include for the same reason its `lib/media` neighbours are — it needs a real Payload and the unit pass cannot execute it. `CLAUDE.md` §2.1: no file is in neither config's include.

Run: `npm run verify`
Expected: PASS. **Paste it.**

```text
feat(admin): make every admin call run Payload's access rules, once
```

Body: the trap `docs/security.md` named, why a module rather than a convention (the `guardedAction` argument), the one extra `findByID` and why it is not an N+1, and the `PRODUCTION_SITES` growth with the `false`/`true` split.

---

## Task 3: The shell, and a performance gate that can see a guarded screen

`SCREENS.md` §2's preamble specifies the chrome every screen sits in, and `CLAUDE.md` §6's 320KB admin ceiling is currently asserted on three sign-in panes only — `docs/testing.md` records that "`/admin` ITSELF HAS NO LIGHTHOUSE BUDGET" and that closing it "needs a session for the collector… and that is Phase 4's, which is the phase that adds the ten screens behind the guard". Both halves are this task, together, because a shell whose bundle nothing measures is the shell every later task adds to.

**Files:**

- Create: `packages/domain/src/admin/navigation.ts`, `packages/domain/src/admin/navigation.test.ts`
- Create: `packages/domain/src/admin/breakpoints.ts`, `packages/domain/src/admin/breakpoints.test.ts`
- Create: `apps/web/components/admin/shell/AdminShell.tsx`, `AdminShell.test.tsx`, `NavRail.tsx`, `NavRail.test.tsx`, `ScreenHeader.tsx`, `ScreenHeader.test.tsx`, `shell.module.css` (all under `apps/web/components/admin/shell/`)
- Create: `apps/web/lib/admin/readNavCounts.ts`, `apps/web/lib/admin/readNavCounts.integration.test.ts`
- Create: `apps/web/scripts/mint-lighthouse-session.ts`, `apps/web/scripts/mint-lighthouse-session.integration.test.ts`
- Modify: `scripts/run-lighthouse.mjs`, `scripts/lighthouseAnnotations.mjs` if the annotation reads the config's URL list
- Modify: `lighthouserc.admin.json`
- Modify: `apps/web/app/(admin)/admin/page.tsx` (draw `PanelHome` inside the shell, so the shell has a live screen from this task on)
- Modify: `vitest.config.ts`, `vitest.integration.config.ts` (includes and thresholds for the new directories)

**Interfaces:**

- Consumes: `requireAdminSession` (`apps/web/lib/auth/guard.ts`); `adminScope` (Task 2); `pagePath` (`packages/domain/src/pageAddress.ts`) for "Read the diary".
- Produces:
  - `type AdminSection = 'overview' | 'journeys' | 'media' | 'book' | 'settings' | 'trash'`
  - `interface NavEntry { readonly id: string; readonly label: string; readonly subLabel: string; readonly href: string; readonly section: AdminSection }`
  - `const ADMIN_NAV: readonly NavEntry[]`
  - `sectionColour(section: AdminSection): string`
  - `activeNavId(pathname: string): string | undefined`
  - `type AdminWidthMode = 'wide' | 'mid' | 'narrow'`
  - `adminWidthMode(width: number): AdminWidthMode`
  - `interface HeaderControls { readonly savedChip: boolean; readonly unpublishedChip: boolean; readonly previewDraft: boolean }`
  - `headerControls(width: number): HeaderControls`
  - `interface NavCounts { readonly journeys: number; readonly media: number; readonly unpublished: number; readonly trashed: number }`
  - `readNavCounts(payload: Payload, scope: AdminScope): Promise<NavCounts>`
  - `<AdminShell screen={NavEntry} crumb={string} counts={NavCounts} lastPublished={string | null} children>`

  Every screen task from 4 onwards renders its content as `AdminShell`'s children and adds its own entry to `ADMIN_NAV`.

- [ ] **Step 1: Write the failing tests for navigation**

`packages/domain/src/admin/navigation.test.ts`. The section colours are `SCREENS.md` §2's, transcribed: Overview/Publish `#a34434` · Journeys/Editor `#3d817e` · Media/Galleries `#a06b3e` · Book/Cover `#5a72a8` · Settings `#a15a4e` · Trash `#736247`.

```ts
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, activeNavId, sectionColour } from './navigation'

describe('ADMIN_NAV', () => {
  it('addresses every screen under /admin, so no entry can point off the panel', () => {
    expect(ADMIN_NAV.every((entry) => entry.href === '/admin' || entry.href.startsWith('/admin/'))).toBe(true)
  })

  it('gives every entry a distinct id and a distinct address', () => {
    expect(new Set(ADMIN_NAV.map((entry) => entry.id)).size).toBe(ADMIN_NAV.length)
    expect(new Set(ADMIN_NAV.map((entry) => entry.href)).size).toBe(ADMIN_NAV.length)
  })
})

describe('sectionColour', () => {
  it('paints the book and cover screens the same blue, because SCREENS.md groups them', () => {
    expect(sectionColour('book')).toBe('#5a72a8')
  })

  it('paints trash in the muted brown it is given, not in a section colour reused from elsewhere', () => {
    expect(sectionColour('trash')).toBe('#736247')
    expect(
      new Set(['overview', 'journeys', 'media', 'book', 'settings', 'trash'].map((s) => sectionColour(s as never)))
        .size,
    ).toBe(6)
  })
})

describe('activeNavId', () => {
  it('marks the journeys entry active while the editor is open, because the editor is a journeys screen', () => {
    expect(activeNavId('/admin/journeys/7')).toBe(activeNavId('/admin/journeys'))
  })

  it('does not mark the overview active on every address just because its href is a prefix of them', () => {
    // `/admin` is a prefix of every other entry. A naive `startsWith` makes the
    // rail light two buttons at once, which is the defect this case exists for.
    expect(activeNavId('/admin/media')).not.toBe(activeNavId('/admin'))
  })

  it('returns undefined for an address no entry owns', () => {
    expect(activeNavId('/admin/nothing-here')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --project unit packages/domain/src/admin/navigation.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write `navigation.ts`**

Nine rail entries, in `SCREENS.md` §2's reading order. Account is reached from the rail's profile button rather than from a nav button, and the Journey editor is an address rather than an entry — both are stated in the module header so the next reader does not add them.

```ts
/**
 * navigation — the admin rail's entries, their section colours, and which one
 * an address belongs to.
 *
 * Pure and in the domain because three consumers need the same answer and none
 * of them should own it: the rail draws the buttons, `ScreenHeader` prints the
 * crumb, and `lighthouserc.admin.json`'s URL list is checked against it.
 *
 * ACCOUNT IS NOT AN ENTRY. SCREENS.md §2 reaches it from the rail's profile
 * button, not from the nav list. THE JOURNEY EDITOR IS NOT AN ENTRY EITHER: it
 * is an address under `journeys`, which is why `activeNavId` matches on segment
 * boundaries rather than on equality.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A table and two lookups.
 * Depends on: nothing.
 */

/** The six colour groups SCREENS.md §2 divides the panel into. */
export type AdminSection = 'overview' | 'journeys' | 'media' | 'book' | 'settings' | 'trash'

/** One button in the rail. */
export interface NavEntry {
  /** Stable key; also what `activeNavId` returns. */
  readonly id: string
  /** Caveat 23px, as SCREENS.md §2 writes it. */
  readonly label: string
  /** Courier 10px, uppercase, beneath the label. */
  readonly subLabel: string
  /** The address, always under `/admin`. */
  readonly href: string
  /** Which colour group the 5px bar takes. */
  readonly section: AdminSection
}

/** The rail, top to bottom. */
export const ADMIN_NAV: readonly NavEntry[] = [
  { id: 'overview', label: 'Overview', subLabel: 'The desk', href: '/admin', section: 'overview' },
  { id: 'journeys', label: 'Journeys', subLabel: 'Trips and pages', href: '/admin/journeys', section: 'journeys' },
  { id: 'media', label: 'Media', subLabel: 'Everything uploaded', href: '/admin/media', section: 'media' },
  { id: 'galleries', label: 'Galleries', subLabel: 'Order and captions', href: '/admin/galleries', section: 'media' },
  { id: 'book', label: 'Book', subLabel: 'Bookmarks and settings', href: '/admin/book', section: 'book' },
  { id: 'cover', label: 'Cover', subLabel: 'Cloth and about', href: '/admin/cover', section: 'book' },
  { id: 'publish', label: 'Publish', subLabel: 'What goes out', href: '/admin/publish', section: 'overview' },
  { id: 'settings', label: 'Settings', subLabel: 'Site and readers', href: '/admin/settings', section: 'settings' },
  { id: 'trash', label: 'Trash', subLabel: 'Kept for thirty days', href: '/admin/trash', section: 'trash' },
]

/** SCREENS.md §2's section colours, transcribed. */
const SECTION_COLOURS: Readonly<Record<AdminSection, string>> = {
  overview: '#a34434',
  journeys: '#3d817e',
  media: '#a06b3e',
  book: '#5a72a8',
  settings: '#a15a4e',
  trash: '#736247',
}

/**
 * The 5px bar's colour for a section.
 * @param section - The group the entry belongs to.
 * @returns The hex colour SCREENS.md §2 gives it.
 */
export const sectionColour = (section: AdminSection): string => SECTION_COLOURS[section]

/**
 * Which rail entry an address belongs to.
 *
 * Longest match on a SEGMENT boundary, never `startsWith` — `/admin` is a
 * prefix of every other address, so a prefix test lights two buttons at once.
 * @param pathname - The address being drawn.
 * @returns The entry's id, or `undefined` when no entry owns it.
 */
export const activeNavId = (pathname: string): string | undefined =>
  [...ADMIN_NAV]
    .sort((left, right) => right.href.length - left.href.length)
    .find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))?.id
```

The sub-labels are ours: `SCREENS.md` §2 specifies the sub-label's type and colour but prints no strings for the rail. Record that in `docs/deviations.md` in Task 15, as deviation §53, rather than leaving a reader to wonder which lines came from the handoff.

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run --project unit packages/domain/src/admin/navigation.test.ts`
Expected: PASS, 6 of 6. **Paste it.**

- [ ] **Step 5: Mutation — break the boundary match**

Replace `pathname === entry.href || pathname.startsWith(\`${entry.href}/\`)`with`pathname.startsWith(entry.href)`, and remove the sort.
**The test that must fail: `does not mark the overview active on every address just because its href is a prefix of them`.** Restore, re-run, **paste both runs.**

- [ ] **Step 6: Write the failing tests for the breakpoints**

`SCREENS.md` §2's header hides the "Saved just now" chip below 1040px, the "n unpublished" chip below 900px and "Preview draft" below 780px; design spec §8.2 gives the surface `≥ 1180` wide, `≥ 860` mid, below that narrow. Five numbers, and every one is a place a screen has been seen to break.

`packages/domain/src/admin/breakpoints.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adminWidthMode, headerControls } from './breakpoints'

describe('adminWidthMode', () => {
  it('is wide at exactly 1180, because the spec says ≥', () => {
    expect(adminWidthMode(1180)).toBe('wide')
    expect(adminWidthMode(1179)).toBe('mid')
  })

  it('is mid at exactly 860, and narrow one pixel below', () => {
    expect(adminWidthMode(860)).toBe('mid')
    expect(adminWidthMode(859)).toBe('narrow')
  })
})

describe('headerControls', () => {
  it('hides each control at the width SCREENS.md gives it, and not one pixel early', () => {
    expect(headerControls(1040).savedChip).toBe(true)
    expect(headerControls(1039).savedChip).toBe(false)
    expect(headerControls(900).unpublishedChip).toBe(true)
    expect(headerControls(899).unpublishedChip).toBe(false)
    expect(headerControls(780).previewDraft).toBe(true)
    expect(headerControls(779).previewDraft).toBe(false)
  })
})
```

- [ ] **Step 7: Run, implement, run**

Run: `npx vitest run --project unit packages/domain/src/admin/breakpoints.test.ts` — FAIL, module missing.

Then write `breakpoints.ts` with the five constants named (`WIDE_FROM = 1180`, `MID_FROM = 860`, `SAVED_CHIP_FROM = 1040`, `UNPUBLISHED_CHIP_FROM = 900`, `PREVIEW_DRAFT_FROM = 780`), each carrying the `SCREENS.md` or design-spec reference it came from, and the two functions above them.

Re-run. Expected: PASS, 3 of 3. **Paste both runs.**

- [ ] **Step 8: Mutation — move one boundary**

Change `WIDE_FROM` to `1181`.
**The test that must fail: `is wide at exactly 1180, because the spec says ≥`.** Restore, re-run, **paste both runs.** Repeat for `SAVED_CHIP_FROM = 1041`; **the test that must fail is `hides each control at the width SCREENS.md gives it, and not one pixel early`.**

- [ ] **Step 9: Write the failing test for the counts**

`apps/web/lib/admin/readNavCounts.integration.test.ts`. The property: **one query per count and no N+1** (`CLAUDE.md` §6), and each count comes from Postgres rather than from a length the caller already had.

```ts
it('counts journeys without loading them, so the rail does not pay for the list', async () => {
  const scope = await adminScope({ user: userId(String(author.id)) })
  const counts = await readNavCounts(payload, scope)

  const all = await payload.find({ collection: 'journeys', ...scope, limit: 0, depth: 0 })

  // The left side is `readNavCounts`'s own query; the right side is Payload's
  // `totalDocs` for the same collection. Two queries, one truth.
  expect(counts.journeys).toBe(all.totalDocs)
})

it('excludes trashed journeys from the journeys count and counts them under trash instead', async () => {
  const scope = await adminScope({ user: userId(String(author.id)) })
  const before = await readNavCounts(payload, scope)

  const trashed = await payload.create({
    collection: 'journeys',
    ...scope,
    data: {
      name: MARKER,
      place: MARKER,
      slug: `${MARKER}-trashed`,
      dates: 'one day',
      deletedAt: new Date().toISOString(),
    },
  })
  const after = await readNavCounts(payload, scope)

  expect(after.journeys).toBe(before.journeys)
  expect(after.trashed).toBe(before.trashed + 1)

  await payload.delete({ collection: 'journeys', id: trashed.id, ...scope })
})
```

- [ ] **Step 10: Run, implement, run**

Run: `npx vitest run --config vitest.integration.config.ts apps/web/lib/admin/readNavCounts.integration.test.ts` — FAIL, module missing.

Write `readNavCounts.ts`: four `payload.find` calls with `limit: 0`, `depth: 0` and a `where` each, reading `totalDocs` only. `journeys` excludes `deletedAt` set; `trashed` requires it; `media` counts every row; `unpublished` counts journeys whose `_status` is `draft`. Each call spreads the scope.

Re-run. Expected: PASS. **Paste both runs.**

- [ ] **Step 11: Mutation — drop the trash filter**

Delete the `deletedAt` clause from the `journeys` query's `where`.
**The test that must fail: `excludes trashed journeys from the journeys count and counts them under trash instead`.** Restore, re-run, **paste both runs.**

- [ ] **Step 12: Write the failing jsdom tests for the rail and header**

`apps/web/components/admin/shell/NavRail.test.tsx`. Assert about things whose cause is outside the component — the entry list and the colour table — rather than about strings the test and the component both spell.

```tsx
it('draws one button per rail entry, in the order navigation declares', () => {
  const host = renderRail({ pathname: '/admin' })

  const labels = [...host.querySelectorAll('a[data-nav-id]')].map((node) => node.getAttribute('data-nav-id'))
  expect(labels).toEqual(ADMIN_NAV.map((entry) => entry.id))
})

it('paints each button’s bar with its own section colour, so two sections never look alike', () => {
  const host = renderRail({ pathname: '/admin' })

  const painted = ADMIN_NAV.map((entry) => {
    const bar = host.querySelector(`a[data-nav-id="${entry.id}"] [data-section-bar]`)
    return bar?.getAttribute('style') ?? ''
  })
  expect(painted.every((style, index) => style.includes(sectionColour(ADMIN_NAV[index]?.section ?? 'overview')))).toBe(
    true,
  )
})

it('marks exactly one button current, and it is the one activeNavId names', () => {
  const host = renderRail({ pathname: '/admin/journeys/7' })

  const current = [...host.querySelectorAll('a[aria-current="page"]')].map((node) => node.getAttribute('data-nav-id'))
  expect(current).toEqual([activeNavId('/admin/journeys/7')])
})
```

`ScreenHeader.test.tsx` asserts the same way against `headerControls`: render at a given width and assert that the controls present are exactly the ones `headerControls(width)` reports true.

- [ ] **Step 13: Run, build the shell, run**

Run: `npx vitest run --project unit-dom apps/web/components/admin/shell` — FAIL, components missing.

Build `NavRail.tsx`, `ScreenHeader.tsx` and `AdminShell.tsx` against `SCREENS.md` §2's preamble, and `shell.module.css` for everything they paint: the 238px rail on `linear-gradient(180deg, #3b332a, #2c251e)` with padding `20px 0 16px 18px`; the masthead's site name (Courier 9.5px `.3em`) over "The back room" (Caveat 38px `#f6ecd6`); nav buttons at `border-radius: 0 5px 5px 0`, padding `9px 12px 9px 0`, gap 6px, with the 5px section bar, the Caveat 23px label, the Courier 10px `.13em` uppercase sub-label at `rgba(243,231,205,.72)` and the count; the active state's `#fbf6e9` fill, `translateX(-4px)`, `0 3px 12px -5px rgba(0,0,0,.5)` and `#2f3b38` ink; the footer's 34px circular avatar profile button with "Your account" and its terracotta ring when active, over "Last published …" and Sign out. The main column is a 96px header over a scrolling content area at `padding: 24px 30px 44px` with `overflow-x: hidden`; the header is flex, wrapping, `1px solid rgba(120,98,60,.22)` beneath, padding `20px 30px 15px`, its title block `flex: 1 1 230px; min-width: 230px` **so the controls wrap and the title does not**, the crumb Courier 10px `.26em` over the Caveat 48px title.

`AdminShell` is a Server Component. `NavRail` needs the current address, which is a client concern — so the **rail takes `pathname` as a prop from the screen that renders it**, and stays a Server Component too. That is a decision the admin JS budget pays for: measure it in Step 16 before adding `'use client'` anywhere.

Re-run. Expected: PASS. **Paste both runs.**

- [ ] **Step 14: Mutation — give two sections the same colour**

In `navigation.ts`, set `trash` to `#a34434`.
**The tests that must fail: `paints trash in the muted brown it is given…` (unit) and `paints each button’s bar with its own section colour…` (jsdom).** Restore, re-run both, **paste all four runs.**

- [ ] **Step 15: Mint a session the collector can use**

Create `apps/web/scripts/mint-lighthouse-session.ts`: it creates (or finds) a dedicated account, calls `createSessionService(...).startSession(...)` exactly as `e2e/support/adminSession.ts`'s `aSignedInSession` does, and **writes nothing but the cookie header to stdout**. It never writes a file into the repository and nothing it prints is committed — `CLAUDE.md` §0.6.

Its integration test asserts the property that matters: **the identifier it prints authenticates.**

```ts
it('prints a cookie the guard itself accepts, not merely a well-formed string', async () => {
  const header = await mintLighthouseSession()
  const value = readBrowserSession(header)

  expect(value).not.toBeNull()

  const sessions = createSessionService({ payload: await getPayload(), now: Date.now })
  const authenticated = await sessions.authenticate(value as SessionId)
  expect(authenticated.ok).toBe(true)
})
```

`readBrowserSession` is `apps/web/lib/auth/browserSession.ts`'s — the same parser the guard uses, so the cookie is judged by the production reader rather than by a regex written here.

- [ ] **Step 16: Teach the collector to carry it, and MEASURE that it worked**

In `scripts/run-lighthouse.mjs`, before running `lighthouserc.admin.json`: run the minting script, and pass the cookie to lhci as a collect-settings override on the command line. Then add `/admin` to that config's `url` array, and **a second `assertMatrix` entry** whose `matchingUrlPattern` matches `/admin` with no trailing segment — `docs/testing.md` records that the existing `.*/admin/.*` does not match it, so a URL added without one is "collected and never judged, which is the shape of green this branch has spent four reviews removing".

**This step is a measurement, not a configuration change, and it does not close until the measurement is pasted.** Run `npm run test:perf` and read `lhci-reports/admin`'s output for the `/admin` run:

| What to read                   | What proves the session reached the collector                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| The run's final URL            | It is `/admin`. If it is `/admin/sign-in`, the cookie did not survive and the gate is measuring the sign-in screen twice   |
| `http-status-code`             | Asserted at `minScore: 1` by the matrix entry, on the `/admin` URL specifically                                            |
| `resource-summary:script:size` | The number, against 327680. **Paste it** — this is the first measurement of the admin ceiling on a screen behind the guard |

If lhci does not carry the header through, do not work around it by making `/admin` public. Report the mechanism as **UNRESOLVED** per `CLAUDE.md` §7.1, name the tool, and fall back to the bound `docs/testing.md` already uses: state in `docs/testing.md` §7 which of the screen's modules are `'use client'` and measure that set directly. A bound is honest; a widened gate is not.

- [ ] **Step 17: Put a real screen inside the shell**

Change `apps/web/app/(admin)/admin/page.tsx` to render `PanelHome` as `AdminShell`'s children, passing the Overview entry, the crumb, `readNavCounts`'s result and the last-published date. The screen keeps its `requireAdminSession()` call **in its own file** — `adminGuardRegistration.test.ts` credits no file for what another one contains, and a layout is another file.

Add an `e2e/admin.spec.ts` case: sign in with `aSignedInSession`, open `/admin`, and assert the rail has `ADMIN_NAV.length` buttons and that the one with `aria-current="page"` is `overview`. The count comes from the domain module; the DOM comes from a real Chromium.

- [ ] **Step 18: Coverage entries, verify, commit**

`packages/domain/src/admin/**` is matched by the existing `packages/*/src/**/*.ts` include at 100/100/100 — no change, but **run the coverage pass and confirm**, because §2.1's rule is "no file is in neither config's include" and confirming is cheaper than discovering. `apps/web/components/admin/shell/**` is matched at 90; `apps/web/lib/admin/readNavCounts.ts` needs the same treatment `adminScope.ts` got in Task 2 (integration-gated, unit-excluded by exact path). `apps/web/scripts/mint-lighthouse-session.ts` joins `vitest.integration.config.ts`'s include.

Run: `npm run verify` — PASS, pasted. Then `npm run verify:full` — PASS, pasted.

```text
feat(admin): build the panel shell, and gate it behind a real measurement
```

Body: the shell `SCREENS.md` §2 specifies; why the rail is a Server Component and what that buys against the 320KB ceiling; that `/admin` now has the Lighthouse budget `docs/testing.md` recorded it as lacking, and what the first measurement was.

---

## Task 4: Journeys (`SCREENS.md` §2.2)

The list every other screen is reached from: search, five status chips, the create panel, a table whose columns drop by priority, and the row-action strip behind `⋯`.

**Files:**

- Create: `packages/domain/src/admin/journeyStatus.ts`, `journeyStatus.test.ts`, `packages/domain/src/admin/journeyColumns.ts`, `journeyColumns.test.ts`
- Create: `apps/web/lib/admin/readJourneysScreen.ts`, `readJourneysScreen.integration.test.ts`
- Create: `apps/web/app/(admin)/admin/journeys/page.tsx`, `apps/web/app/(admin)/admin/journeys/actions.ts`
- Create: `apps/web/components/admin/journeys/JourneyTable.tsx` + test, `CreatePanel.tsx` + test, `journeys.module.css`
- Modify: `e2e/admin.spec.ts`, `e2e/visual.spec.ts`, `e2e/a11y.spec.ts`, `docs/api.md`

**Interfaces:**

- Consumes: `adminScope` (Task 2), `AdminShell`, `ADMIN_NAV` (Task 3), `guardedAction` (`apps/web/lib/auth/guard.ts`), `JourneyId`/`journeyId` (`packages/domain/src/ids.ts`).
- Produces:
  - `type JourneyStatus = 'draft' | 'published' | 'edited' | 'archived'`
  - `journeyStatus(row: { readonly status: 'draft' | 'published'; readonly hasNewerDraft: boolean; readonly archived: boolean }): JourneyStatus`
  - `const JOURNEY_STATUS_FILTERS: readonly ('all' | JourneyStatus)[]`
  - `visibleJourneyColumns(width: number): readonly JourneyColumn[]` where `type JourneyColumn = 'thumb' | 'name' | 'pages' | 'edited' | 'media' | 'dates' | 'status' | 'actions'`
  - `interface JourneyRow { readonly id: JourneyId; readonly name: string; readonly place: string; readonly dates: string; readonly pages: number; readonly media: number; readonly editedAt: string; readonly status: JourneyStatus; readonly coverSrc: string | null }`
  - `readJourneysScreen(payload: Payload, scope: AdminScope, query: { readonly search: string; readonly filter: 'all' | JourneyStatus }): Promise<readonly JourneyRow[]>`
  - `createJourney`, `duplicateJourney`, `archiveJourney`, `trashJourney` — all `guardedAction(...)` exports of `apps/web/app/(admin)/admin/journeys/actions.ts`

- [ ] **Step 1: Write the failing tests for the derived status**

`SCREENS.md` §2.2 gives five chips — All / Published / Edited / Draft / Archived — and the data model stores none of them: `versions: { drafts: true }` gives Payload's `_status`, and `archived` is a checkbox. "Edited" is the state the Publish screen exists for, so getting it wrong here makes two screens disagree.

```ts
import { describe, expect, it } from 'vitest'
import { journeyStatus } from './journeyStatus'

describe('journeyStatus', () => {
  it('is draft while a journey has never been published', () => {
    expect(journeyStatus({ status: 'draft', hasNewerDraft: false, archived: false })).toBe('draft')
  })

  it('is published when the live version is the newest one', () => {
    expect(journeyStatus({ status: 'published', hasNewerDraft: false, archived: false })).toBe('published')
  })

  it('is edited when something is published AND something newer is not', () => {
    // This is the only status that needs two facts. A version of this that
    // reads `_status` alone reports "published" for a journey with unpublished
    // edits, which is the exact state SCREENS.md §2.8's "n changes waiting"
    // counts — two screens, one truth.
    expect(journeyStatus({ status: 'published', hasNewerDraft: true, archived: false })).toBe('edited')
  })

  it('is archived whatever the version state, because archived is a shelf and not a stage', () => {
    expect(journeyStatus({ status: 'published', hasNewerDraft: true, archived: true })).toBe('archived')
    expect(journeyStatus({ status: 'draft', hasNewerDraft: false, archived: true })).toBe('archived')
  })
})
```

- [ ] **Step 2: Run it, implement, run**

Run: `npx vitest run --project unit packages/domain/src/admin/journeyStatus.test.ts` — FAIL, module missing. Implement with `archived` checked first and `hasNewerDraft` deciding between `published` and `edited`. Re-run — PASS, 4 of 4. **Paste both runs.**

- [ ] **Step 3: Mutation — decide on `_status` alone**

Replace the body with `archived ? 'archived' : status`.
**The test that must fail: `is edited when something is published AND something newer is not`.** Restore, re-run, **paste both runs.**

- [ ] **Step 4: Write the failing tests for the column priority**

`SCREENS.md` §2.2's ladder, transcribed: base is `48px | minmax(0,1.7fr) | 96px (status) | minmax(0,104px) (actions)`; `pages` 52px joins at +720px; `edited` `minmax(0,94px)` at +800px; `media` `minmax(0,1fr)` at +880px; `dates` `minmax(0,1.15fr)` at +1000px.

```ts
describe('visibleJourneyColumns', () => {
  it('keeps the four base columns at any width, so a narrow table is still a table', () => {
    expect(visibleJourneyColumns(320)).toEqual(['thumb', 'name', 'status', 'actions'])
  })

  it('adds each optional column at the width SCREENS.md gives it and not before', () => {
    expect(visibleJourneyColumns(719)).not.toContain('pages')
    expect(visibleJourneyColumns(720)).toContain('pages')
    expect(visibleJourneyColumns(799)).not.toContain('edited')
    expect(visibleJourneyColumns(800)).toContain('edited')
    expect(visibleJourneyColumns(879)).not.toContain('media')
    expect(visibleJourneyColumns(880)).toContain('media')
    expect(visibleJourneyColumns(999)).not.toContain('dates')
    expect(visibleJourneyColumns(1000)).toContain('dates')
  })

  it('never drops a column that a wider table shows, so the ladder only ever grows', () => {
    // Every width's set is a subset of the next one up. Written as a property
    // rather than as five more literals: a ladder with a hole in it is the
    // defect, and a hole is invisible to the case above.
    const widths = [320, 720, 800, 880, 1000, 1400]
    const sets = widths.map((width) => new Set(visibleJourneyColumns(width)))
    expect(
      sets.every((set, index) => index === 0 || [...(sets[index - 1] ?? new Set())].every((column) => set.has(column))),
    ).toBe(true)
  })
})
```

- [ ] **Step 5: Run, implement, run, mutate**

Implement as an ordered table of `{ column, from }` pairs filtered by width, so the ladder cannot grow a hole by construction. Re-run — PASS, 3 of 3.

Mutation: change `pages`'s `from` to 721. **The test that must fail: `adds each optional column at the width SCREENS.md gives it and not before`.** Restore. **Paste all runs.**

- [ ] **Step 6: Write the failing test for the repository**

`apps/web/lib/admin/readJourneysScreen.integration.test.ts`. Two properties, and both have a cause outside the test: **one query, not one per journey** (`CLAUDE.md` §6's "No N+1"), and **the counts are the database's**.

```ts
it('reports each journey’s page and media counts from the database, not from a loaded list', async () => {
  const scope = await adminScope({ user: userId(String(author.id)) })
  const rows = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })
  const row = rows.find((candidate) => candidate.id === journeyId(String(seeded.id)))

  const pages = await payload.find({
    collection: 'pages',
    ...scope,
    limit: 0,
    depth: 0,
    where: { journey: { equals: seeded.id } },
  })
  const media = await payload.find({
    collection: 'media',
    ...scope,
    limit: 0,
    depth: 0,
    where: { journey: { equals: seeded.id } },
  })

  expect(row?.pages).toBe(pages.totalDocs)
  expect(row?.media).toBe(media.totalDocs)
})

it('hides a trashed journey from the list, because the list is not the trash screen', async () => {
  const scope = await adminScope({ user: userId(String(author.id)) })
  const before = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })

  await payload.update({
    collection: 'journeys',
    id: seeded.id,
    ...scope,
    data: { deletedAt: new Date().toISOString() },
  })
  const after = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })

  expect(before.map((row) => row.id)).toContain(journeyId(String(seeded.id)))
  expect(after.map((row) => row.id)).not.toContain(journeyId(String(seeded.id)))
})

it('matches the search against the name and the place, which is what the author types', async () => {
  const scope = await adminScope({ user: userId(String(author.id)) })
  const byPlace = await readJourneysScreen(payload, scope, { search: seeded.place, filter: 'all' })

  expect(byPlace.map((row) => row.id)).toContain(journeyId(String(seeded.id)))
})
```

- [ ] **Step 7: Implement the repository**

One `payload.find` on `journeys` with `depth: 0` and a narrow `select` (`CLAUDE.md` §7), then **one** grouped count query per related collection rather than one per journey — Payload has no `GROUP BY`, so use a single `find` on `pages` and on `media` with `where: { journey: { in: ids } }`, `limit: 0` is not enough there, so select only `journey` and tally in memory. Write that reasoning in the module header: three queries total, independent of the number of journeys, which is what "no N+1" means here.

Cover thumbnail: the journey's `media` row with `isCover`, resolved to its `thumb` derivative URL. **Never an original** (`CLAUDE.md` §6).

- [ ] **Step 8: Mutation — make it an N+1**

Replace the two grouped queries with a per-journey `payload.find` inside the map, and add a case that fails on it:

```ts
it('asks the database a fixed number of questions however many journeys there are', async () => {
  // The counter is Payload's own: `payload.db.count`-level instrumentation is
  // not available, so this wraps `payload.find` for the duration of the call.
  // The two sides are a real query count and a constant this module states.
  const seen: string[] = []
  const spied = new Proxy(payload, {
    get: (target, key) =>
      key === 'find'
        ? (args: Parameters<typeof payload.find>[0]) => {
            seen.push(String(args.collection))
            return target.find(args)
          }
        : Reflect.get(target, key),
  })

  await readJourneysScreen(spied, scope, { search: '', filter: 'all' })

  expect(seen).toEqual(['journeys', 'pages', 'media'])
})
```

This is why every repository in this phase takes its Payload instance as its first parameter rather than reaching for `getPayload` itself: injecting the dependency is what makes the query count observable, and a module that reaches for its own singleton cannot be asked this question. The screens pass `await getPayload()`; a test passes whatever it wants to watch.

**The test that must fail with the N+1 restored: `asks the database a fixed number of questions however many journeys there are`.** Restore the grouped version, re-run, **paste both runs.**

- [ ] **Step 9: Build the screen and the create panel**

`apps/web/app/(admin)/admin/journeys/page.tsx` — a Server Component: `await requireAdminSession()` **in this file**, `adminScope`, `readJourneysScreen`, drawn inside `AdminShell`.

The table is `SCREENS.md` §2.2's: header row `rgba(120,98,60,.07)` in Courier 9.5px `.2em` uppercase; body rows padded `13px 20px` with a `1px dotted rgba(120,98,60,.26)` bottom and `rgba(163,68,52,.045)` on hover; a 44px cover thumb at `rotate(-1.5deg)`; the name in Caveat 30px over the place in Garamond italic 15px; monospace data cells, **all truncating**; the status pill; then Edit / Gallery / `⋯`.

`⋯` expands a strip beneath the row: `rgba(163,68,52,.05)`, `inset 0 1px 0` top rule, the journey name, a spacer, Duplicate, Archive/Unarchive, and a ringed "Move to trash".

The create panel carries a terracotta `1.5px` ring and a washi strip, "A new journey" over its note, three fields (where / country / dates) in `1.1fr 1fr 1fr` above 820px, Create and Cancel, and the line **"Starts as a draft — no bookmark until you publish."** — transcribed, not paraphrased.

**The client island is the expand/collapse of `⋯` and the create panel's open state, and nothing else.** Search and the status chips are `searchParams` on a Server Component: they are addresses, they survive a reload, and they ship no JavaScript.

- [ ] **Step 10: Write the four actions**

`apps/web/app/(admin)/admin/journeys/actions.ts` — a `'use server'` module whose every value export is a `guardedAction(...)` call and nothing else, because `eslint-rules/guarded-server-actions.js` reports anything else.

```ts
'use server'
import { z } from 'zod'
import { guardedAction } from '../../../../lib/auth/guard'
import { adminScope } from '../../../../lib/admin/adminScope'
import { getPayload } from '../../../../lib/payload'

const newJourney = z.object({
  name: z.string().trim().min(1),
  place: z.string().trim().min(1),
  dates: z.string().trim().min(1),
})

export const createJourney = guardedAction(async (session, input: unknown) => {
  const parsed = newJourney.parse(input)
  const scope = await adminScope(session)
  const payload = await getPayload()

  return payload.create({
    collection: 'journeys',
    ...scope,
    // A new journey is a DRAFT, which is what the panel's own line promises:
    // "Starts as a draft — no bookmark until you publish."
    draft: true,
    data: { ...parsed, slug: slugFor(parsed.name), archived: false },
  })
})
```

`duplicateJourney` copies the row and its `pages` rows, always as drafts, with a slug that does not collide. `archiveJourney` toggles `archived`. `trashJourney` sets `deletedAt` — a soft delete, never `payload.delete` (`CLAUDE.md` §7).

Zod at the boundary is not optional: a Server Action is a `POST` endpoint anybody with the action id can reach (`guard.ts`'s header), so its argument is untrusted input even though the guard has admitted the caller.

- [ ] **Step 11: Write the failing integration test for the actions, then make it pass**

The property for `trashJourney`: **the row survives and the diary stops seeing it.** Both halves matter — a `payload.delete` would pass a test that only checked the list.

```ts
it('soft-deletes a journey, leaving the row where the trash screen can find it', async () => {
  await trashJourney(journeyId(String(seeded.id)))

  const row = await payload.findByID({ collection: 'journeys', id: seeded.id, depth: 0 })
  expect(row.deletedAt).not.toBeNull()
})
```

Calling a `guardedAction` from an integration test needs `next/headers` and `next/navigation` stood in for — `apps/web/lib/auth/guard.integration.test.ts` already does this for exactly this reason. **Read that file and reuse its approach; do not invent a second one.**

- [ ] **Step 12: Mutation, e2e, verify, commit**

Mutation: change `trashJourney` to call `payload.delete`. **The test that must fail: `soft-deletes a journey, leaving the row where the trash screen can find it`.** Restore. **Paste both runs.**

Add to `e2e/admin.spec.ts`: sign in, open `/admin/journeys`, create a journey through the panel, and assert the new row appears with the **Draft** pill. Add the visual baseline at all three Playwright viewports and an axe case, both following `e2e/visual.spec.ts`'s and `e2e/a11y.spec.ts`'s existing shape.

Add a `docs/api.md` row for each of the four actions — `docs/api.md`'s own contract says each gets a full row in the commit that adds it.

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): build the journeys list, its create panel and its four actions
```

---

## Task 5: Journey editor I — the page rail, the layout picker, and page operations

`SCREENS.md` §2.3's left column, and the four mutations behind it. The editor's grid is `184px | minmax(0,1fr) | 250px` above 1180px, `168px | minmax(0,1fr)` above 860px with the pool spanning `1 / -1`, and a single column below.

**Files:**

- Create: `packages/domain/src/admin/pageRail.ts` + test, `packages/domain/src/admin/layoutGlyphs.ts` + test
- Create: `apps/web/lib/admin/readJourneyEditor.ts` + integration test
- Create: `apps/web/app/(admin)/admin/journeys/[id]/page.tsx`, `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`
- Create: `apps/web/components/admin/editor/PageRail.tsx` + test, `LayoutPicker.tsx` + test, `editor.module.css`
- Modify: `vitest.config.ts` (a bracketed dynamic route cannot carry a `c8 ignore` hint that the provider reads — see the exclusions that already exist for `apps/web/app/(diary)/p/[n]/page.tsx` and follow them)

**Interfaces:**

- Consumes: everything Tasks 2, 3 and 4 produce.
- Produces:
  - `type PageLayout = 'three-up' | 'four-up' | 'full-bleed' | 'text-spread'`
  - `interface GlyphCell { readonly column: readonly [number, number]; readonly row: readonly [number, number] }`
  - `interface LayoutGlyph { readonly columns: string; readonly rows: string; readonly cells: readonly GlyphCell[] }`
  - `layoutGlyph(layout: PageLayout): LayoutGlyph`
  - `interface RailPage { readonly id: PageId; readonly title: string; readonly kind: 'notes' | 'frames'; readonly order: number }`
  - `movePage(pages: readonly RailPage[], id: PageId, direction: 'up' | 'down'): readonly RailPage[]`
  - `readJourneyEditor(payload, scope, id: JourneyId): Promise<JourneyEditorView>`
  - `addPage`, `copyPage`, `deletePage`, `reorderPages`, `setPageLayout` — guarded actions

- [ ] **Step 1: Write the failing tests for the layout glyphs**

`SCREENS.md` §2.3 is explicit about why this module exists: "Each glyph is a 30px-tall CSS grid of **real cells**, distinct per layout (an empty grid renders four identical rectangles)." So the property is **distinctness**, and it is asserted directly rather than by four separate literal comparisons that could all be typed wrong the same way.

```ts
import { describe, expect, it } from 'vitest'
import { LAYOUTS, layoutGlyph } from './layoutGlyphs'

describe('layoutGlyph', () => {
  it('gives no two layouts the same drawing, which is the whole reason it exists', () => {
    const drawings = LAYOUTS.map((layout) => JSON.stringify(layoutGlyph(layout)))

    expect(new Set(drawings).size).toBe(LAYOUTS.length)
  })

  it('draws three up as a tall cell beside two, spanning both rows', () => {
    const glyph = layoutGlyph('three-up')

    expect(glyph.columns).toBe('1.45fr 1fr')
    expect(glyph.rows).toBe('1fr 1fr')
    expect(glyph.cells).toHaveLength(3)
    expect(glyph.cells[0]).toEqual({ column: [1, 2], row: [1, 3] })
  })

  it('draws full bleed as exactly one cell, so it cannot look like four up', () => {
    expect(layoutGlyph('full-bleed').cells).toHaveLength(1)
    expect(layoutGlyph('four-up').cells).toHaveLength(4)
  })

  it('draws text spread with three rules beside one block', () => {
    const glyph = layoutGlyph('text-spread')

    expect(glyph.rows).toBe('1fr 1fr 1fr')
    expect(glyph.cells.filter((cell) => cell.row[1] - cell.row[0] === 3)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run, implement, run, mutate**

Run: `npx vitest run --project unit packages/domain/src/admin/layoutGlyphs.test.ts` — FAIL, module missing. Implement the four entries from `SCREENS.md` §2.3's table. Re-run — PASS, 4 of 4.

Mutation: make `three-up` return `four-up`'s glyph.
**The tests that must fail: `gives no two layouts the same drawing…` and `draws three up as a tall cell beside two…`.** Restore. **Paste all runs.**

- [ ] **Step 3: Write the failing tests for the page rail**

Reordering is where `CLAUDE.md` §0.9 bites: **address rows by id, never by array position.**

```ts
describe('movePage', () => {
  it('swaps a page with its neighbour, identified by id rather than by where it sits', () => {
    const pages = [aRailPage('a', 0), aRailPage('b', 1), aRailPage('c', 2)]

    expect(movePage(pages, pageId('b'), 'up').map((page) => page.id)).toEqual([pageId('b'), pageId('a'), pageId('c')])
  })

  it('leaves the first page alone when asked to move it up, rather than wrapping', () => {
    const pages = [aRailPage('a', 0), aRailPage('b', 1)]

    expect(movePage(pages, pageId('a'), 'up')).toEqual(pages)
  })

  it('renumbers order so no two pages share one, which is what the book reads', () => {
    const moved = movePage([aRailPage('a', 0), aRailPage('b', 5), aRailPage('c', 9)], pageId('c'), 'up')

    expect(moved.map((page) => page.order)).toEqual([0, 1, 2])
  })

  it('returns the list unchanged for an id it does not hold, rather than throwing at a screen', () => {
    const pages = [aRailPage('a', 0)]

    expect(movePage(pages, pageId('missing'), 'down')).toEqual(pages)
  })
})
```

`aRailPage` is a factory added to `packages/domain/src/testing/factories.ts`, beside the factories already there (`CLAUDE.md` §2.3: factory fixtures).

- [ ] **Step 4: Run, implement, run, mutate**

Implement `movePage` by finding the index **from the id**, swapping, then renumbering `order` from the resulting sequence.

Mutation: change the lookup to take a positional index argument instead of an id, and adjust the first case to pass `1`. **The test that must fail after restoring the id-based case: `swaps a page with its neighbour, identified by id rather than by where it sits`.** Restore both. **Paste all runs.**

If that mutation feels like it proves little, it is because the id/index distinction cannot be killed by a one-line edit alone — so the second half of this step is the real proof: add a case that **sorts the input differently and asserts the same outcome**, which a positional implementation cannot satisfy.

```ts
it('moves the same page whatever order the list arrives in', () => {
  const ascending = [aRailPage('a', 0), aRailPage('b', 1), aRailPage('c', 2)]
  const shuffled = [ascending[2], ascending[0], ascending[1]].flatMap((page) => (page ? [page] : []))

  expect(movePage(shuffled, pageId('a'), 'down').find((page) => page.id === pageId('a'))?.order).toBe(
    movePage(ascending, pageId('a'), 'down').find((page) => page.id === pageId('a'))?.order,
  )
})
```

- [ ] **Step 5: Build the editor's left column and its actions**

`readJourneyEditor` loads one journey, its pages in `order`, and the journey's media pool — **three queries, not one per page** — and its integration test asserts the query list the way Task 4 Step 8 does.

`PageRail.tsx` draws `SCREENS.md` §2.3's cards: the "Pages in {journey}" eyebrow, then a 30x38px paper preview, the name in Caveat 24px and meta in Courier 9px. The selected card gets `#fffdf6`, a `1.5px` terracotta inset ring and a lift shadow; the others `rgba(255,253,246,.5)` with a `1px` ring. **The selected card reveals a tool row beneath it** at padding `5px 7px 0`: ↑ ↓ · spacer · Copy · Delete, all Courier 9px `.1em`.

Beneath it, the dashed `1.5px` layout box: a "Layout" eyebrow with the active layout's name in `#a34434`, the 2x2 grid of four glyph buttons drawn from `layoutGlyph`, then "+ Add page with this layout". Cells are `rgba(120,98,60,.34)`, and `rgba(163,68,52,.5)` when selected.

The actions in `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`: `addPage`, `copyPage`, `deletePage`, `reorderPages`, `setPageLayout`. Each is a `guardedAction`, each parses its input with Zod, each spreads `adminScope`, and each takes **ids**. `reorderPages` takes the whole ordered list of ids and writes each row's `order` — one write per page, in one transaction-shaped loop, because Payload has no bulk-position update; say so in the module header rather than leaving a reader to think it is an oversight.

- [ ] **Step 6: The jsdom test that proves the glyphs are real cells**

```tsx
it('draws a different number of cells for each layout button, so four buttons are not four rectangles', () => {
  const host = renderLayoutPicker({ active: 'three-up' })

  const counts = LAYOUTS.map((layout) => host.querySelectorAll(`[data-layout="${layout}"] [data-glyph-cell]`).length)
  expect(counts).toEqual(LAYOUTS.map((layout) => layoutGlyph(layout).cells.length))
})
```

The left side is the DOM React produced; the right side is the domain module. If someone renders four identical rectangles, this fails — which is the defect `SCREENS.md` names in parentheses.

- [ ] **Step 7: e2e, verify, commit**

`e2e/admin.spec.ts`: open a seeded journey's editor, move the second page up, reload, and assert the order **persisted** — the assertion reads the rail after a round trip, so the value comes from Postgres rather than from React state.

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): build the journey editor's page rail and layout picker
```

---

## Task 6: Journey editor II — the Notes pane

`SCREENS.md` §2.3's _Notes page_ section: the field grid, Highlights, The note, Tally, and **Page furniture** — "the marks that make it look kept, not typed".

**Files:**

- Create: `packages/domain/src/admin/highlights.ts`, `packages/domain/src/admin/highlights.test.ts`
- Create: `apps/web/collections/journeys.schema.test.ts` (the cap and the schema, pinned to each other)
- Create: `apps/web/components/admin/editor/NotesPane.tsx` + test, `Furniture.tsx` + test
- Modify: `apps/web/app/(admin)/admin/journeys/[id]/actions.ts` (adds `saveNotes`), `apps/web/components/admin/editor/editor.module.css`
- Modify: `packages/domain/src/testing/factories.ts`

**Interfaces:**

- Consumes: Task 5's `readJourneyEditor` view; `WeatherGlyph` (`packages/domain/src/bookBundle.ts`) — `'sun' | 'haze' | 'wind'`, already defined, **not redeclared**.
- Produces:
  - `const MAX_HIGHLIGHTS = 4`
  - `interface Highlight { readonly id: string; readonly text: string }`
  - `addHighlight(rows: readonly Highlight[], row: Highlight): readonly Highlight[]`
  - `moveHighlight(rows: readonly Highlight[], id: string, direction: 'up' | 'down'): readonly Highlight[]`
  - `removeHighlight(rows: readonly Highlight[], id: string): readonly Highlight[]`
  - `saveNotes` — a guarded action taking `{ journey: JourneyId, location, dates, weather, mood, weatherGlyph, highlights, note, tally, furniture, slug }`

- [ ] **Step 1: Write the failing tests for the highlight cap**

`DATA_MODEL.md` caps `highlights` at 4 **in the schema, not just the UI** — "the notes page layout is tuned for 3–4 and a fifth breaks its rhythm" — and `SCREENS.md` prints the instruction "four maximum — they set the page rhythm". Two places already say four; this is the third and it must agree with the schema rather than with the copy.

Two files, because `packages/domain` "must never import from `apps/`" (design spec §3) and the agreement between the cap and the schema can only be asserted from the side that may reach both.

First, the domain's own behaviour, in `packages/domain/src/admin/highlights.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { aHighlight } from '../testing/factories'
import { MAX_HIGHLIGHTS, addHighlight } from './highlights'

describe('addHighlight', () => {
  it('refuses a fifth highlight, which the schema also refuses', () => {
    const four = [aHighlight('a'), aHighlight('b'), aHighlight('c'), aHighlight('d')]

    expect(addHighlight(four, aHighlight('e'))).toEqual(four)
  })

  it('accepts a fourth, so the cap is a cap and not a refusal', () => {
    const three = [aHighlight('a'), aHighlight('b'), aHighlight('c')]

    expect(addHighlight(three, aHighlight('d'))).toHaveLength(MAX_HIGHLIGHTS)
  })
})
```

Then the agreement, in a new `apps/web/collections/journeys.schema.test.ts`, which may import both:

```ts
import { describe, expect, it } from 'vitest'
import { MAX_HIGHLIGHTS } from '@travel-diary/domain/admin/highlights'
import { Journeys } from './journeys'

describe('the journeys schema', () => {
  it('caps highlights at the number the admin’s own editor caps them at', () => {
    const highlights = Journeys.fields.find((field) => 'name' in field && field.name === 'highlights')

    expect(highlights && 'maxRows' in highlights ? highlights.maxRows : undefined).toBe(MAX_HIGHLIGHTS)
  })
})
```

The left side is read off the Payload config; the right side is the domain constant. Neither is a literal `4` typed in this file — which is the point: a check written as `expect(...).toBe(4)` would stay green while the two drifted apart.

- [ ] **Step 2: Run, implement, run, mutate**

Implement `addHighlight` (refuses past the cap, returns the same reference), `moveHighlight` (by id, as Task 5), `removeHighlight` (by id). Every operation is by id — `CLAUDE.md` §0.9.

Mutation: set `MAX_HIGHLIGHTS` to `5`. **The tests that must fail: `refuses a fifth highlight, which the schema also refuses` and `caps highlights at the number the admin’s own editor caps them at`.** Restore. **Paste all runs.**

- [ ] **Step 3: Build the Notes pane**

The field grid is `minmax(0,1fr) minmax(0,1fr) minmax(0,132px) minmax(0,132px)` above 900px — Location (Caveat 26px), Dates, Weather, Mood (Courier 12–13px). Below it, `1.15fr minmax(0,.85fr)` above 1020px.

Left column: "Highlights" with its instruction line, rows of a `::` grip (Courier 12px `#736247`, `cursor: grab`), a Caveat 25px underlined input and a `×`, then a dashed "Add highlight". "The note" is a 4-row textarea in Garamond 17px / 1.55. "Tally" is a 2-column grid of key/value pairs, Garamond 16px against Caveat 24px right-aligned — and it is **four rows, always**, because `DATA_MODEL.md` sets `minRows: 4, maxRows: 4` and notes that `tally.value` is deliberately text: "Several journeys use 'plenty' and 'uncounted'." A number input here would be a defect, not a refinement.

Then a rule and **Page furniture**, with its own heading line, holding: Sign-off (full-width Caveat 25px `#736247`); Weather glyph (three 74px cards at `flex: 1`, **each drawing its actual mark** over a Courier 8.5px label, selected getting `rgba(163,68,52,.07)` and a `1.5px` terracotta ring); Postage stamp (a live 52x64px face in the journey accent beside stacked country and value inputs); Accent (five 38px swatches at `linear-gradient(160deg, {c}, rgba(0,0,0,.22))`, `0 0 0 2.5px #a34434` when selected); Gallery address (a `/gallery/` prefix beside a Courier 12px slug input).

- [ ] **Step 4: The jsdom test that proves the weather glyphs are marks, not labels**

The same defect species as Task 5's four rectangles: three cards that all draw nothing look identical.

```tsx
it('draws a distinct mark for each weather glyph, not three identical cards with different words', () => {
  const host = renderFurniture({ weatherGlyph: 'sun' })

  const marks = ['sun', 'haze', 'wind'].map(
    (glyph) => host.querySelector(`[data-glyph="${glyph}"] svg`)?.innerHTML ?? '',
  )
  expect(new Set(marks).size).toBe(3)
  expect(marks.every((mark) => mark.length > 0)).toBe(true)
})
```

- [ ] **Step 5: Write `saveNotes`, and the integration test that proves it reaches the diary**

The property: **what the editor saved is what the diary's own bundle reads back.** The two sides are the action's input and `readBookBundle`'s output, and nothing in between is written by the test.

```ts
it('puts a saved highlight where readBookBundle finds it, because the editor is not a second store', async () => {
  await saveNotes({
    journey: journeyId(String(seeded.id)),
    highlights: [{ id: 'h1', text: 'nineteen tarts, no regrets' }] /* … */,
  })
  await publishJourney(journeyId(String(seeded.id)))

  const bundle = await readBookBundle()
  const notes = bundle.pages.find((page) => page.kind === 'notes' && page.journeyId === journeyId(String(seeded.id)))

  expect(notes?.highlights).toContain('nineteen tarts, no regrets')
})
```

`publishJourney` arrives in Task 11; until then this case publishes by writing the journey with `_status: 'published'` through the scope and says so in a comment, and Task 11 replaces that line with the real action. **Do not leave the case out until Task 11** — a save that never reaches the bundle is the defect, and it is cheapest to catch here.

- [ ] **Step 6: Mutation, verify, commit**

Mutation: make `saveNotes` write `highlights` to a field name the schema does not have (`highlight`). **The test that must fail: `puts a saved highlight where readBookBundle finds it…`.** Restore. **Paste both runs.**

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): build the notes pane, its highlights cap and its page furniture
```

---

## Task 7: Journey editor III — slots, the focal point, Frames, and the pool

The half of `SCREENS.md` §2.3 that makes the phase's second exit criterion possible, plus the `withSlots` residual Phase 3 handed over with no owner.

**Files:**

- Create: `packages/domain/src/admin/focalPoint.ts` + test
- Create: `apps/web/components/admin/editor/SlotPanel.tsx` + test, `FramesPane.tsx` + test, `JourneyPool.tsx` + test
- Modify: `apps/web/app/(admin)/admin/journeys/[id]/actions.ts` (adds `setSlotMedia`, `setSlotFocalPoint`, `setSlotText`, `clearSlot`)
- Modify: `apps/web/lib/readBookBundle.ts` (the `withSlots` fallback), `apps/web/lib/readBookBundle.integration.test.ts`
- Modify: `packages/domain/src/bookBundle.ts` if `Slot` needs a state the fallback can express

**Interfaces:**

- Consumes: `Slot` (`packages/domain/src/bookBundle.ts`), `MediaId`, `PageId`, `SlotKey` (`packages/domain/src/ids.ts`).
- Produces:
  - `interface FocalPoint { readonly x: number; readonly y: number }`
  - `focalPointFrom(click: { readonly clientX: number; readonly clientY: number }, rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }): FocalPoint`
  - `focalPointLabel(point: FocalPoint | null): string`
  - `isCentred(point: FocalPoint): boolean`
  - `setSlotFocalPoint(input: { readonly page: PageId; readonly slot: SlotKey; readonly point: FocalPoint })` — a guarded action

- [ ] **Step 1: Write the failing tests for the focal-point maths**

`SCREENS.md` §2.3 gives the formula. Transcribed:

```text
x = clamp(0, ((clientX − rect.left) / rect.width) × 100, 100)
y = clamp(0, ((clientY − rect.top) / rect.height) × 100, 100)
```

The pill reads "centred — click to focus" when unset, and "focus 25% 30%" when set.

```ts
describe('focalPointFrom', () => {
  it('turns a click at the middle of a box into 50, 50', () => {
    expect(focalPointFrom({ clientX: 150, clientY: 100 }, { left: 100, top: 50, width: 100, height: 100 })).toEqual({
      x: 50,
      y: 50,
    })
  })

  it('turns a click at the top-left corner into 0, 0 rather than into a negative', () => {
    expect(focalPointFrom({ clientX: 100, clientY: 50 }, { left: 100, top: 50, width: 100, height: 100 })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('clamps a drag that left the box, in both directions', () => {
    const rect = { left: 100, top: 50, width: 100, height: 100 }

    expect(focalPointFrom({ clientX: -400, clientY: -400 }, rect)).toEqual({ x: 0, y: 0 })
    expect(focalPointFrom({ clientX: 9000, clientY: 9000 }, rect)).toEqual({ x: 100, y: 100 })
  })

  it('does not divide by a zero-width box, which is what a hidden slot measures as', () => {
    // An element behind `display: none` measures 0x0. Without this the value is
    // NaN, and NaN reaches `background-position` as an invalid declaration the
    // browser silently drops — a focal point that appears to save and does
    // nothing, which is the class of defect this screen exists to avoid.
    expect(focalPointFrom({ clientX: 10, clientY: 10 }, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
    })
  })
})

describe('focalPointLabel', () => {
  it('says what SCREENS.md says when nothing is set', () => {
    expect(focalPointLabel(null)).toBe('centred — click to focus')
  })

  it('reads back the point, rounded, in the form SCREENS.md prints', () => {
    expect(focalPointLabel({ x: 25.4, y: 29.6 })).toBe('focus 25% 30%')
  })
})
```

- [ ] **Step 2: Run, implement, run, mutate**

Run: `npx vitest run --project unit packages/domain/src/admin/focalPoint.test.ts` — FAIL, module missing. Implement. Re-run — PASS, 6 of 6.

Mutation: remove the upper clamp (leave `Math.max(0, …)` only).
**The test that must fail: `clamps a drag that left the box, in both directions`.** Restore. Then remove the zero-width guard. **The test that must fail: `does not divide by a zero-width box…`.** Restore. **Paste all four runs.**

- [ ] **Step 3: Build the slot panel**

`SCREENS.md` §2.3's _Notes page_ right column gives two slots — hero 186px, ephemera 124px — each with a label, a motion badge ("Loops" terracotta / "Still" muted), the image with `cursor: crosshair`, Replace / Clear, a focal-point pill, then caption (Caveat 23px) and alt text (Garamond 14.5px). The _Frames page_ is `repeat(auto-fit, minmax(196px, 1fr))` at gap 18px, four slots at 152px, same parts.

The reticle is 26px, centred on the point, drawn with `box-shadow: 0 0 0 1.5px #fdf8ec, 0 0 0 3px rgba(163,68,52,.85), 0 1px 4px rgba(0,0,0,.4)`. The image is a background, positioned `background-position: x% y%`.

**The point is stored as two numbers, not as the string `"x y"`.** `SCREENS.md` describes the prototype's representation; `DATA_MODEL.md` is the field-list authority and gives `pages.slots[].focalX` and `focalY` as `number` with `defaultValue: 50`. The string is composed at render. Record this reading in `docs/deviations.md` in Task 15 so the next reader does not "fix" it back.

**It is keyed per journey _and_ per page** — `SCREENS.md` is explicit: "Tokyo/Frames I must not share Tokyo/Frames II." The client island holds `Record<SlotKey, FocalPoint>` where `SlotKey` is the branded `${pageId}:${slotIndexInSchema}` — and the state is never a bare value, which is `CLAUDE.md` §0.9 and the five defects `DATA_MODEL.md` attributes to exactly that.

- [ ] **Step 4: The jsdom test that proves the key is per page**

```tsx
it('keeps two pages’ focal points apart, which is the defect SCREENS.md names by journey and page', () => {
  const host = renderSlotPanels({
    slots: [aSlotView('frames-i', 0, { x: 20, y: 30 }), aSlotView('frames-ii', 0, { x: 70, y: 80 })],
  })

  const positions = [...host.querySelectorAll('[data-focal-target]')].map((node) =>
    node
      .getAttribute('style')
      ?.match(/background-position:\s*([^;]+)/u)?.[1]
      ?.trim(),
  )
  expect(new Set(positions).size).toBe(2)
})
```

- [ ] **Step 5: Write `setSlotFocalPoint` and prove the round trip through the bundle**

The integration case that makes this task worth its own gate:

```ts
it('moves the crop the diary renders, which is why the control is not decorative', async () => {
  const before = await readBookBundle()
  const beforeSlot = slotOf(before, framesPage, 0)

  await setSlotFocalPoint({ page: framesPage, slot: slotKey(`${framesPage}:0`), point: { x: 12, y: 87 } })

  const after = await readBookBundle()
  const afterSlot = slotOf(after, framesPage, 0)

  // The left sides are two reads of the same production mapper against the
  // same database, before and after one action. Nothing here asserts a
  // literal the action was given AND the assertion was given.
  expect(beforeSlot).not.toEqual(afterSlot)
  expect(afterSlot?.focalX).toBe(12)
  expect(afterSlot?.focalY).toBe(87)
})
```

Design spec §5.2: "If this is not wired through to rendering, the admin control is decorative. It is a Phase 4 exit criterion for exactly that reason." This case proves the **data** half. Task 15 proves the **pixel** half in a browser.

- [ ] **Step 6: Build the journey pool**

"Journey pool" eyebrow with "{n} of {total} in the book" in `#a34434`, the instruction line, then a 2-column tile grid capped at `max-height: 432px` and scrolling: `aspect-ratio: 1/1` thumbs, `0 0 0 2px #a34434` when ticked else a `1px` ring, a 17px tick box top-left, a duration chip on clips. The footer is a dashed "Drop files or browse".

**Tiles are ticked by media id.** The selection is `ReadonlySet<MediaId>`, never an index — and the jsdom case that proves it re-sorts the pool between renders and asserts the same tile stays ticked, which a positional selection cannot satisfy.

Clip affordances — the duration chip, and the pool accepting a video at all — are behind the `MEDIA_PIPELINE` flag, exactly as design spec §9.3 requires: "whether the admin shows clip-specific affordances (video upload picker, poster field, duration display)". Read the flag on the server and pass a boolean down; do not read `process.env` in a component.

- [ ] **Step 7: Close the `withSlots` residual**

Phase 3 recorded, in `apps/web/lib/readBookBundle.ts`'s own comment, that a media row which is not `ready` reaches the bundle with a `src` that does not load, and that "**IF THAT IS EVER WORTH CLOSING, THE FIX IS A FALLBACK IN `withSlots`, NOT A FILTER HERE**". No phase owned it. It becomes ownable here because this is the task that lets an author put a still-processing upload into a slot.

Write the failing case first:

```ts
it('draws an empty frame for a slot whose media is not ready, rather than a src that 403s', async () => {
  const processing = await payload.create({
    collection: 'media',
    data: { kind: 'still', alt: MARKER, order: 0, state: 'processing' },
    file: { data: await aTinyPng(), mimetype: 'image/png', name: `${MARKER}.png`, size: 1 },
  })
  await setSlotMedia({ page: framesPage, slot: slotKey(`${framesPage}:0`), media: mediaId(String(processing.id)) })

  const bundle = await readBookBundle()

  // Not `toBeUndefined()` on the whole slot: dropping the slot is what the
  // existing comment says takes the WHOLE BOOK down. The slot survives with
  // no source.
  expect(slotOf(bundle, framesPage, 0)?.src).toBeNull()
})
```

Then add the fallback: `slotsFor` keeps the slot and sets `src: null` when the resolved media row is not `ready`, and `Slot.src` becomes `string | null`. **Every consumer of `Slot.src` must handle it** — `apps/web/components/pages/FramesI.tsx`, `apps/web/components/pages/EphemeraSlot.tsx`, `apps/web/components/mobile/MobilePage.tsx` and `apps/web/components/pages/deferredPhotograph.ts` — and Phase 3 left a census test for exactly this kind of change; find it (`git log --oneline` names it "census the derivative consumers") and extend it rather than writing a second one.

- [ ] **Step 8: Mutation, e2e, verify, commit**

Mutation: revert `slotsFor` to dropping the row (`return []`). **The test that must fail: `draws an empty frame for a slot whose media is not ready…`, and the whole-book case that the existing comment predicts.** Restore. **Paste both runs.**

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): wire the focal point to the slot, and let an unready slot draw
```

Body: the exit criterion this makes possible; the numbers-not-string reading of `SCREENS.md` against `DATA_MODEL.md`; and that the `withSlots` fallback is Phase 3's named residual, closed here because this is the screen that creates the state.

---

## Task 8: Media (`SCREENS.md` §2.4), and the pre-strip originals nothing sweeps

The screen that drives Phase 3's upload path, and the security residual Phase 3 handed to this phase by name.

**`docs/adr/0020-the-presign-seam-and-the-local-upload-receiver.md`, verbatim:** "A slot that is uploaded to and never finalised leaves its staged bytes behind forever, and nothing in Phase 3 sweeps them… **Those objects are the PRE-STRIP ORIGINALS**: the copy that still carries the GPS coordinates, which is the exact data `SECURITY.md`'s read-EXIF-then-strip requirement exists to remove… **The sweep is owed by Phase 4**, not 'eventually': it needs a scheduler, which no task in the Phase 3 plan builds."

**Files:**

- Create: `packages/domain/src/admin/mediaFilters.ts` + test, `packages/domain/src/admin/gridColumns.ts` + test
- Create: `packages/domain/src/media/stagedObjects.ts` + test (which staged keys are stale, pure)
- Create: `apps/web/lib/admin/readMediaScreen.ts` + integration test
- Create: `apps/web/lib/media/sweepStagedUploads.ts` + integration test, `apps/web/scripts/sweep-staged.ts`, `apps/web/scripts/run-sweep-staged.ts`
- Create: `apps/web/app/(admin)/admin/media/page.tsx`, `apps/web/components/admin/media/Dropzone.tsx` + test, `MediaGrid.tsx` + test, `UploadCard.tsx` + test, `media.module.css`
- Modify: `apps/web/lib/ports/storage.ts` (**adds `list`**), `apps/web/lib/adapters/local-storage.ts`, `apps/web/lib/adapters/contract/storage-contract.ts`
- Modify: `apps/web/app/(admin)/admin/media/actions.ts` (adds the bulk actions), `package.json`, `docs/runbook.md`, `docs/security.md`
- Create: `docs/adr/0024-the-staged-upload-sweep.md`

**Interfaces:**

- Consumes: `requestUploadSlots`, `finaliseUpload` (`apps/web/app/(admin)/admin/media/actions.ts`) — **built in Phase 3, called here, not rewritten**; `StoragePort` (`apps/web/lib/ports/storage.ts`); `metadataMarkersIn` (`packages/domain/src/media/exif.ts`).
- Produces:
  - `StoragePort.list(prefix: string): Promise<Result<readonly StoredObject[], string>>` where `interface StoredObject { readonly key: string; readonly bytes: number; readonly modifiedAt: number }`
  - `type MediaFilter = 'everything' | 'stills' | 'clips' | 'in-the-book' | 'unused'`
  - `matchesMediaFilter(row: MediaTile, filter: MediaFilter): boolean`
  - `gridMinimum(columns: number): number` — the `calc(1120/columns)` floor, with `columns` clamped to 3–8
  - `staleStagedObjects(objects: readonly StoredObject[], live: ReadonlySet<string>, now: number, ttlMs: number): readonly string[]`
  - `sweepStagedUploads(deps, now: number): Promise<Result<readonly string[], string>>`

- [ ] **Step 1: Write the failing contract case for `list`**

The sweep cannot exist without enumeration, and `StoragePort` has five operations and no `list`. Add the case to the **shared** contract suite so both the local adapter and any future R2 one answer it — `apps/web/lib/adapters/contract/storage-contract.ts` is already run against `local-storage.ts`.

```ts
it('lists the objects under a prefix and nothing outside it', async () => {
  const inside = `${prefix}/staged/one.bin`
  const outside = `${prefix}-neighbour/staged/two.bin`
  await storage.put(inside, new Uint8Array([1]), 'application/octet-stream')
  await storage.put(outside, new Uint8Array([2]), 'application/octet-stream')

  const listed = await storage.list(`${prefix}/`)

  // The left side is whatever the adapter walked; the right side is the two
  // keys this case wrote. A prefix that matched by `startsWith` on the RAW
  // string would include the neighbour, which is the defect: `staging/j1` is a
  // prefix of `staging/j10`.
  expect(listed.ok ? listed.value.map((object) => object.key) : []).toEqual([inside])
})

it('reports each object’s size and modification time, which is what a sweep decides on', async () => {
  const key = `${prefix}/staged/sized.bin`
  const body = new Uint8Array([1, 2, 3, 4, 5])
  const before = Date.now()
  await storage.put(key, body, 'application/octet-stream')

  const listed = await storage.list(`${prefix}/`)
  const found = listed.ok ? listed.value.find((object) => object.key === key) : undefined

  // `bytes` is compared to the length this case wrote; `modifiedAt` to a clock
  // read before the write. Both causes are outside the adapter.
  expect(found?.bytes).toBe(body.length)
  expect(found?.modifiedAt).toBeGreaterThanOrEqual(before - 1000)
})
```

- [ ] **Step 2: Run, implement, run, mutate**

Run: `npx vitest run --config vitest.integration.config.ts apps/web/lib/adapters/local-storage` — FAIL, `list` is not a function.

Add `list` to `StoragePort` with TSDoc, and to `local-storage.ts` as a recursive directory walk rooted at the resolved storage namespace, returning keys **relative to the namespace** so they are the same strings `put`/`get` take.

Mutation: implement the prefix test as `key.startsWith(prefix)` against a prefix with no trailing separator, and call `list('staging/j1')`. **The test that must fail: `lists the objects under a prefix and nothing outside it`.** Restore. **Paste both runs.**

- [ ] **Step 3: Write the failing tests for staleness, pure**

```ts
describe('staleStagedObjects', () => {
  it('leaves an object alone while a media row still points at it', () => {
    const objects = [aStoredObject('staging/j1/a.jpg', { modifiedAt: 0 })]

    expect(staleStagedObjects(objects, new Set(['staging/j1/a.jpg']), 1_000_000, 3_600_000)).toEqual([])
  })

  it('leaves a young orphan alone, because an upload in flight has no row yet', () => {
    // An upload that is still being PUT has no media row and is not abandoned.
    // Sweeping on orphanhood alone deletes the author's photograph mid-upload.
    const objects = [aStoredObject('staging/j1/b.jpg', { modifiedAt: 990_000 })]

    expect(staleStagedObjects(objects, new Set(), 1_000_000, 3_600_000)).toEqual([])
  })

  it('sweeps an orphan older than the window', () => {
    const objects = [aStoredObject('staging/j1/c.jpg', { modifiedAt: 0 })]

    expect(staleStagedObjects(objects, new Set(), 1_000_000, 3_600_000)).toEqual(['staging/j1/c.jpg'])
  })

  it('never returns a key outside the staging prefix, whatever it is handed', () => {
    // Default-deny: the sweep DELETES, so a bug here destroys a photograph
    // somebody published. The guard is in the pure module, where it is cheap
    // to prove, rather than in the caller, where it is one refactor from gone.
    const objects = [aStoredObject('media/j1/published.jpg', { modifiedAt: 0 })]

    expect(staleStagedObjects(objects, new Set(), 1_000_000, 3_600_000)).toEqual([])
  })
})
```

`ttlMs` is injected, and `now` is injected — `CLAUDE.md` §2.3: time is always injected, and a `Date.now()` inside logic under test is a defect.

- [ ] **Step 4: Run, implement, run, mutate**

Implement in `packages/domain/src/media/stagedObjects.ts`, reusing `STAGING_PREFIX` from `packages/domain/src/media/uploadSlot.ts` rather than a second copy of the string.

Mutation: delete the prefix guard. **The test that must fail: `never returns a key outside the staging prefix, whatever it is handed`.** Then delete the age check. **The test that must fail: `leaves a young orphan alone…`.** Restore both. **Paste all runs.**

- [ ] **Step 5: Write the sweep, and prove it removes bytes that really do carry metadata**

This is the assertion the brief's first Phase 3 defect is about. **The absence is only meaningful if the presence was demonstrated in the same case**, and the staged object is built by the production upload path rather than hand-assembled — `e2e/support/adminSession.ts`'s `anUploadUrlFor` exists precisely because a hand-written staging key gets refused before the check it was written for.

```ts
it('removes an abandoned staged original, and the bytes it removed really were unstripped', async () => {
  // 1 · Stage a photograph THROUGH the production path: request a slot, then
  //     PUT to the URL it returned. Nothing here writes a key by hand.
  const offered = await requestUploadSlots({ journey: journeyId(String(seeded.id)), files: [aPhotographWithExif()] })
  const slot = offered.ok ? offered.value[0] : undefined
  expect(slot).toBeDefined()
  await putThroughOfferedSlot(slot, exifBytes)

  // 2 · POSITIVE CONTROL, before anything is asserted absent: the object that
  //     is about to be swept is read back out of the store and shown to carry
  //     metadata. Without this the case below passes against an empty store.
  const staged = await storage.get(slot?.stagingKey ?? '')
  expect(staged.ok).toBe(true)
  expect(metadataMarkersIn(staged.ok ? staged.value : new Uint8Array())).toContain('exif')

  // 3 · Never finalised. Sweep with a clock past the window.
  const swept = await sweepStagedUploads({ storage, payload }, Date.now() + TWO_HOURS)

  expect(swept.ok ? swept.value : []).toContain(slot?.stagingKey)
  expect(await storage.exists(slot?.stagingKey ?? '')).toBe(false)
})

it('does not remove the staged object of an upload that was finalised seconds ago', async () => {
  const offered = await requestUploadSlots({ journey: journeyId(String(seeded.id)), files: [aPhotographWithExif()] })
  const slot = offered.ok ? offered.value[0] : undefined
  await putThroughOfferedSlot(slot, exifBytes)
  await finaliseUpload({ stagingKey: slot?.stagingKey ?? '', journey: journeyId(String(seeded.id)) })

  const swept = await sweepStagedUploads({ storage, payload }, Date.now() + TWO_HOURS)

  // finaliseUpload already deletes the staging object on every success path
  // (Phase 3 Task 8), so what this case really guards is that the sweep does
  // not report a key it did not remove, and does not reach past `staging/`.
  expect(swept.ok ? swept.value : []).not.toContain(slot?.stagingKey)
})
```

`aPhotographWithExif` and `exifBytes` come from `apps/web/lib/adapters/contract/media-fixtures.ts`, which Phase 3 built with **real `sharp`-encoded** photographs for exactly this reason. Do not build a second fixture family.

- [ ] **Step 6: Give it a scheduler, and say which one**

No scheduler exists. Three shapes were available and the decision is recorded in `docs/adr/0024-the-staged-upload-sweep.md`:

| Option                                                | Why not, or why                                                                                                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sweep inside the upload path, opportunistically       | Rejected. ADR 0020 already refuses it: "inventing one inside the upload path would be the speculative extension CLAUDE.md §4 refuses", and it makes a delete a side effect of an unrelated request |
| A `jobs` row and a worker                             | Rejected. The worker is deferred (ADR 0004) and does not exist. A queue with no consumer is a table that grows                                                                                     |
| **A CLI script, invoked by the platform's scheduler** | **Taken.** `npm run media:sweep-staged`, the same shape as `npm run media:rederive` (`apps/web/scripts/run-rederive.ts`), invoked in production by Vercel Cron and documented in `docs/runbook.md` |

Add `media:sweep-staged` to the root `package.json` and to `apps/web/package.json`, following `media:rederive`'s two-line pattern exactly. `apps/web/scripts/run-sweep-staged.ts` is the entry point and carries the same whole-file `c8 ignore` with the same reason `run-rederive.ts` carries; `apps/web/scripts/sweep-staged.ts` holds the body and is gated by `vitest.integration.config.ts` at the number it measures.

Then update **`docs/security.md`'s EXIF row** — it currently records this as "swept by Phase 4" — and `docs/runbook.md`, which owns the same residual. Both must now say what runs, how often, and what happens if it does not: the objects are not served (a staged object has no `media` row, so Payload's own file-access check refuses it), so a missed run is growth rather than exposure.

- [ ] **Step 7: Mutation — make the sweep vacuous, and watch the positive control catch it**

Change `sweepStagedUploads` to return `ok([])` without listing anything.
**The test that must fail: `removes an abandoned staged original, and the bytes it removed really were unstripped`.**

Then the more interesting mutation: change the test's **positive control** to run against a fixture with no EXIF at all (`aTinyPng()`), keeping the sweep correct.
**The test that must fail: the same one, at the `toContain('exif')` line.** That is the check the Phase 3 defect did not have. Restore both. **Paste all four runs.**

- [ ] **Step 8: Build the Media screen**

The dropzone is `2px dashed rgba(120,98,60,.4)` at `4px` radius and padding `26px 24px`, flex with wrap: a 70px ringed circle holding a 20px rotated square, then a text block at `flex: 1 1 300px; min-width: 300px` — and `SCREENS.md` §2.4 gives the reason in its own words: "The `min-width` floor is required. Without it the text block absorbs all shrink, the headline wraps to two lines and the zone grows to 300px tall." Write a jsdom case that asserts the declared `min-width`, and a visual baseline at the `mid` viewport where the shrink happens.

The headline is Caveat 34px over an italic note naming the accepted formats and stating that clips loop automatically; then an "Add to — {journey}" select bound to all journeys; then Browse.

The upload card is "Uploading — 2 of 34" with the duplicate notice on the right (`rgba(132,88,37,.1)`, `#845825`, "3 look like duplicates — skipped"), and rows of a 230px filename, a 3px track with a terracotta fill, and a right-aligned percentage. **The duplicate notice is not decoration** — Phase 3's `finaliseUpload` already returns a duplicate outcome; the card renders that, it does not invent one.

Controls: filename search at `flex: 1 1 200px`, the five filter chips (Everything / Stills / Clips / In the book / Unused), and a bulk bar that appears **only with a selection**: `rgba(163,68,52,.08)` with a ring, "{n} selected", then Add to book / Caption / Move / Clear.

The grid is `repeat(auto-fill, minmax(calc(1120/columns)px, 1fr))` at gap 14px with `columns` 3–8, default 6 — `gridMinimum` is the pure function behind that `calc`, and its test asserts the clamp at both ends. Tiles are square with `0 0 0 2.5px #a34434` when selected and a `1px` ring otherwise, a 19px tick box, an "In book" chip bottom-left, a duration chip bottom-right, and the filename beneath in Courier 9.5px.

**Selection is a `ReadonlySet<MediaId>`**, and the jsdom case re-sorts the grid between renders and asserts the same tile stays selected.

- [ ] **Step 9: Virtualize past 100 tiles**

`CLAUDE.md` §6 and design spec §12: "The gallery grid virtualizes past 100 tiles — the design tops out at ~100 assets per journey, which is exactly the threshold where a naive grid starts to hurt." The Media screen is the grid that can exceed it, because it lists every journey's media.

The property to establish: **the number of tile elements in the DOM does not grow with the number of rows.** Two sides with different causes — the row count is the fixture's, the element count is the DOM's.

```tsx
it('draws a bounded number of tiles however many rows it is given', () => {
  const small = renderGrid({ rows: manyTiles(120) })
  const large = renderGrid({ rows: manyTiles(1200) })

  expect(large.querySelectorAll('[data-media-tile]').length).toBe(small.querySelectorAll('[data-media-tile]').length)
})
```

- [ ] **Step 10: The bulk actions, e2e, verify, commit**

`addToBook`, `captionMedia`, `moveMedia` and the selection clear are guarded actions taking **arrays of ids**. `moveMedia` re-points `media.journey`, which changes which gallery a photograph is in — assert in integration that the source journey's `galleryFrames` count falls and the destination's rises, both read from `apps/web/lib/galleryFrames.ts`'s own query rather than counted by the test.

`e2e/admin.spec.ts`: upload a real photograph through the browser using `anUploadUrlFor`'s path (`e2e/upload.spec.ts` already drives the real PUT — extend it rather than writing a second driver), then assert the tile appears in the grid and carries the derivative's URL, **not** the original's.

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): build the media screen, and sweep the staged originals nobody did
```

Body: the screen; the residual ADR 0020 named and why the sweep is a scheduled script rather than a hook; and that the case proving the sweep works reads metadata out of the object **before** asserting it is gone.

---

## Task 9: Galleries (`SCREENS.md` §2.5)

Reordering by drag, sort by date, the bulk caption panel, and the selected-frame panel — including the poster filmstrip for clips. `SCREENS.md` states the invariant in bold: "**Select frames by id, not index** — sorting reorders the grid and a positional index desyncs the panel from the highlight."

**Files:**

- Create: `packages/domain/src/admin/frameOrder.ts` + test
- Create: `apps/web/lib/admin/readGalleriesScreen.ts` + integration test
- Create: `apps/web/app/(admin)/admin/galleries/page.tsx`, `apps/web/app/(admin)/admin/galleries/actions.ts`
- Create: `apps/web/components/admin/galleries/FrameGrid.tsx` + test, `SelectedFrame.tsx` + test, `CaptionAll.tsx` + test, `galleries.module.css`

**Interfaces:**

- Consumes: `galleryFrameWhere`, `GALLERY_FRAME_SORT` (`apps/web/lib/galleryFrames.ts`) — the gallery's own ordering, so the admin and the diary cannot disagree about what "first" means.
- Produces:
  - `reorderFrames(frames: readonly Frame[], moved: MediaId, before: MediaId | null): readonly Frame[]`
  - `sortFramesByDate(frames: readonly Frame[]): readonly Frame[]`
  - `coverFrame(frames: readonly Frame[]): MediaId | undefined`
  - `readGalleriesScreen(payload: Payload, scope: AdminScope, journey: JourneyId): Promise<GalleriesView>`
  - `setFrameOrder`, `setFrameText`, `setFrameFlags`, `setPosterAt`, `applyBulkCaptions` — guarded actions

- [ ] **Step 1: Write the failing tests, with the selection invariant first**

```ts
describe('reorderFrames', () => {
  it('moves a frame to sit before another, naming both by id', () => {
    const frames = [aFrame('a'), aFrame('b'), aFrame('c')]

    expect(reorderFrames(frames, mediaId('c'), mediaId('a')).map((frame) => frame.id)).toEqual([
      mediaId('c'),
      mediaId('a'),
      mediaId('b'),
    ])
  })

  it('moves a frame to the end when nothing is named to sit before it', () => {
    const frames = [aFrame('a'), aFrame('b')]

    expect(reorderFrames(frames, mediaId('a'), null).map((frame) => frame.id)).toEqual([mediaId('b'), mediaId('a')])
  })

  it('renumbers order densely, because the diary reads order and not position', () => {
    const reordered = reorderFrames([aFrame('a', 4), aFrame('b', 9)], mediaId('b'), mediaId('a'))

    expect(reordered.map((frame) => frame.order)).toEqual([0, 1])
  })
})

describe('sortFramesByDate', () => {
  it('orders by capturedAt, and keeps a frame with no capture time last rather than first', () => {
    // `capturedAt` comes from EXIF and is absent on anything that had none
    // stripped from it. Sorting undefined first puts the least-known
    // photographs at the top of every gallery, which is the wrong default and
    // is invisible until real photographs arrive (design spec §14).
    const sorted = sortFramesByDate([aFrame('a', 0, null), aFrame('b', 1, '2025-03-01'), aFrame('c', 2, '2024-01-01')])

    expect(sorted.map((frame) => frame.id)).toEqual([mediaId('c'), mediaId('b'), mediaId('a')])
  })

  it('does not change which frame is the cover, because the cover is the first AFTER sorting', () => {
    const sorted = sortFramesByDate([aFrame('a', 0, '2025-03-01'), aFrame('b', 1, '2024-01-01')])

    expect(coverFrame(sorted)).toBe(mediaId('b'))
  })
})
```

- [ ] **Step 2: Run, implement, run, mutate**

Mutation: make `reorderFrames` take a positional index rather than an id, and re-run with the list pre-shuffled. **The test that must fail: `moves a frame to sit before another, naming both by id`.** Then make `sortFramesByDate` sort `null` first. **The test that must fail: `orders by capturedAt, and keeps a frame with no capture time last…`.** Restore both. **Paste all runs.**

- [ ] **Step 3: Build the screen**

The layout is `minmax(0,1fr) 286px` above 1180px, `minmax(0,1fr) 258px` above 860px, stacked below.

Controls: a journey select bound to `journey` with "{name} — {n} frames" labels; the line "Drag to reorder. The first frame is the gallery cover."; a spacer; **Sort by date**, which toggles, reads "By date ✓" and turns terracotta when active; and **Caption all**, which toggles the bulk panel.

The bulk panel has a terracotta `1.5px` ring, "Caption what is still blank" with "{n} frames have no caption", rows of a 38px thumb, a 112px filename and a Caveat 21px input **placeholder-hinted with a suggestion**, capped at 250px and scrolling, then "Apply captions" and the line "Anything left empty keeps its file name for now."

The tile grid sits in a card at `repeat(auto-fill, minmax(136px, 1fr))`, gap 12px, `cursor: grab`. Tiles carry an index badge, a three-bar grip top-right, a "Cover" chip on the first, and a `rgba(44,37,30,.5)` scrim plus a solid "Hidden" chip bottom-left when hidden. Selected is `0 0 0 2.5px #a34434`.

The selected-frame panel: a "Selected frame" eyebrow, a 150px preview, the file line (stills "…jpg · 4032 × 3024 · 6.1 MB", clips "…mp4 · 1920 × 1080 · loops silently"), Caption in Caveat 25px, a 2-row Alt text textarea, three toggles (Hidden from the gallery / Use as gallery cover / Also place in the book), and for clips a **Poster frame** block: an eyebrow with a state chip ("first frame" amber / "set at 0:11" green), an explanatory line, and a `repeat(4, minmax(0,1fr))` filmstrip of timestamped grabs. The footer is "Save frame".

**The clip half is behind `MEDIA_PIPELINE`** (design spec §9.3). With `inline` bound there are no clips at all, so the poster block is not rendered and the file line's clip branch is unreachable from the screen — say so in the component header and cover the branch in jsdom by passing a clip row directly, which is the honest way to keep the 90% gate meaningful rather than excluding the branch.

- [ ] **Step 4: The jsdom case that proves the panel follows the id**

This is `SCREENS.md`'s own named defect, and it is the one case in this task that must exist even if the others are cut.

```tsx
it('keeps the selected frame selected after a re-sort, because it is tracked by id', () => {
  const host = renderGalleries({ frames: [aFrameView('a'), aFrameView('b'), aFrameView('c')], selected: mediaId('c') })
  expect(host.querySelector('[data-selected-frame]')?.getAttribute('data-frame-id')).toBe('c')

  rerenderGalleries(host, { frames: [aFrameView('c'), aFrameView('a'), aFrameView('b')], selected: mediaId('c') })

  // The element's id attribute is React's; the expected value is the id the
  // first render was given. A positional implementation renders 'a' here.
  expect(host.querySelector('[data-selected-frame]')?.getAttribute('data-frame-id')).toBe('c')
  expect(host.querySelector('[data-frame-id="c"][data-highlighted="true"]')).not.toBeNull()
})
```

- [ ] **Step 5: Integration — the order the admin writes is the order the diary reads**

```ts
it('writes an order the gallery route reads back, so the admin and the diary agree on first', async () => {
  const before = await readGalleryBundle(seeded.slug)
  const reversed = [...before.frames].reverse().map((frame) => frame.id)

  await setFrameOrder({ journey: journeyId(String(seeded.id)), order: reversed })

  const after = await readGalleryBundle(seeded.slug)

  // Left: the diary's own bundle reader, after the write. Right: the list the
  // action was given. The mapper in between is production code.
  expect(after.frames.map((frame) => frame.id)).toEqual(reversed)
})
```

- [ ] **Step 6: Mutation, e2e, verify, commit**

Mutation: make `setFrameOrder` write every row's `order` as `0`. **The test that must fail: `writes an order the gallery route reads back…`** — and check it fails on the ORDER rather than on a length, because `GALLERY_FRAME_SORT` falls back to `id` and a degenerate order silently sorts by id.

`e2e/admin.spec.ts`: open a gallery, drag the third tile to the front, reload, and assert the "Cover" chip moved with it.

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): build the galleries screen, ordered and selected by id
```

---

## Task 10: Book & bookmarks (`SCREENS.md` §2.6) and Cover & About (`SCREENS.md` §2.7)

Two screens, one task: both write globals, neither is more than two cards, and both feed the same three diary surfaces.

**Files:**

- Create: `packages/domain/src/admin/bookmarkOrder.ts` + test
- Create: `apps/web/lib/admin/readBookScreen.ts` + integration test, `apps/web/lib/admin/readCoverScreen.ts` + integration test
- Create: `apps/web/app/(admin)/admin/book/page.tsx`, `apps/web/app/(admin)/admin/book/actions.ts`, `apps/web/app/(admin)/admin/cover/page.tsx`
- Create: `apps/web/components/admin/book/BookmarkOrder.tsx` + test, `BookSettings.tsx` + test, `CoverPreview.tsx` + test, `AboutCard.tsx` + test, `book.module.css`

**Interfaces:**

- Consumes: `coverCloths` and the `BookChrome` shape (`packages/domain/src/bookBundle.ts`); `fitCoverTitle` (`packages/domain/src/coverTitle.ts`) — the live preview uses the diary's own fitter, so the preview cannot flatter the real cover.
- Produces:
  - `type BookmarkRowKind = 'cover' | 'contents' | 'journey' | 'about'`
  - `moveBookmark(rows: readonly BookmarkRow[], id: string, direction: 'up' | 'down'): readonly BookmarkRow[]`
  - `saveBookSettings`, `saveBookmarkOrder`, `saveCover`, `saveAbout` — guarded actions

- [ ] **Step 1: Write the failing tests for the fixed rows**

`SCREENS.md` §2.6: "Cover, Contents and About are fixed and refuse to move."

```ts
describe('moveBookmark', () => {
  it('refuses to move the cover, which is fixed', () => {
    const rows = [aBookmark('cover', 'cover'), aBookmark('tokyo', 'journey'), aBookmark('about', 'about')]

    expect(moveBookmark(rows, 'cover', 'down')).toEqual(rows)
  })

  it('refuses to move a journey past a fixed row', () => {
    // Moving Tokyo up would put it above Contents, which is a position the
    // book has no page for. Refusing the move is what "fixed" means; letting
    // it through and clamping later is where an off-by-one lives.
    const rows = [aBookmark('cover', 'cover'), aBookmark('contents', 'contents'), aBookmark('tokyo', 'journey')]

    expect(moveBookmark(rows, 'tokyo', 'up')).toEqual(rows)
  })

  it('swaps two journeys, by id', () => {
    const rows = [aBookmark('contents', 'contents'), aBookmark('tokyo', 'journey'), aBookmark('lisbon', 'journey')]

    expect(moveBookmark(rows, 'lisbon', 'up').map((row) => row.id)).toEqual(['contents', 'lisbon', 'tokyo'])
  })
})
```

- [ ] **Step 2: Run, implement, run, mutate**

Mutation: allow a journey to swap with a fixed row. **The test that must fail: `refuses to move a journey past a fixed row`.** Restore. **Paste both runs.**

- [ ] **Step 3: Build Book & bookmarks**

Layout `minmax(0,1fr) 340px` above 1180px, stacked below.

**Bookmark order** — "this is also the order of the book". Rows at `10px 0` with a dotted rule: a `::` grip, a 9px rotated tint square, the name in Caveat 26px, the place in Garamond italic 15px, "p. {n}" right-aligned in a 66px cell, then 26px ↑ ↓ buttons that turn terracotta on hover.

**"p. {n}" is derived, never stored** (`DATA_MODEL.md`, "Derived, not stored"): it comes from the same page numbering the diary uses, so the two cannot disagree. The integration case asserts it against `readBookBundle`'s own contents entries rather than against a number computed here.

**Book settings** — the Contents page note (a 2-row textarea, and `SCREENS.md` says plainly "this is the line the diary prints"); Journey order (As arranged / Newest first / Oldest first chips, writing `book.journeyOrderMode`); Cover cloth (four 44px swatches, `0 0 0 2.5px #a34434` when selected); Page turn (a range input 400–1600 step 50, labelled brisk / "{n} ms" / languid); Gallery thumbnail (140–300 step 10, dense / "{n} px" / generous); then toggles for tape/stamps/stickers, ribbon bookmark and page counter.

"**Both sliders are controlled and their readouts follow the value**" — `SCREENS.md` says so, and the jsdom case asserts it by changing the input and reading the label, which is the only way an uncontrolled slider fails.

The two ranges match the schema exactly: `book.flipDurationMs` is `min: 400, max: 1600` and `book.galleryThumbPx` is `min: 140, max: 300` in `apps/web/globals/book.ts`. Assert the agreement from the config, the way Task 6 Step 1 does for the highlights cap, rather than typing the numbers in three places.

- [ ] **Step 4: Build Cover & About**

Two equal columns above 1180px.

**Cover** — a 172x224px live preview (the cloth gradient, an `inset: 9px` rule, the eyebrow, the **fitted** title, the subtitle and "Kept by") beside four fields: Title (Caveat 30px), Subtitle, Kept by, Years shown (Courier 13px). Below, four cloth swatches.

The preview fits the title with `fitCoverTitle` — the diary's own module — so "Title must fit, not truncate" (`SCREENS.md` §1.1) is true in the preview because it is the same function, not because a second one agrees with it. The jsdom case renders a title long enough to need shrinking and asserts the rendered font size equals `fitCoverTitle`'s answer for that string and box.

**About** — a 140px portrait with Replace, beside two paragraph textareas, a Kit list of grip + input rows, and a reply-to address in Caveat 26px `#a34434`.

- [ ] **Step 5: Integration — a global written here reaches the diary**

```ts
it('prints the contents note the book screen saved, on the diary’s own contents page', async () => {
  await saveBookSettings({ contentsNote: 'kept in a drawer, mostly' })

  const bundle = await readBookBundle()

  expect(bundle.chrome.contentsNote).toBe('kept in a drawer, mostly')
})
```

- [ ] **Step 6: Mutation, e2e, verify, commit**

Mutation: make `saveBookSettings` write to `site` instead of `book`. **The test that must fail: `prints the contents note the book screen saved…`.** Restore. **Paste both runs.**

`e2e/admin.spec.ts`: change the cover cloth, open `/p/0`, and assert the cover's computed background changed. Add visual baselines for both screens at all three viewports and axe cases for both.

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): build the book, bookmark, cover and about screens
```

---

## Task 11: Publish (`SCREENS.md` §2.8), and the revalidation the spec has been waiting for

Design spec §8: "Publishing triggers on-demand revalidation of affected paths only." `apps/web/app/(diary)/p/[n]/page.tsx`'s own header records this as "a later task's — nothing publishes yet". This is that task.

**Files:**

- Create: `packages/domain/src/admin/pendingChange.ts` + test, `packages/domain/src/admin/affectedPaths.ts` + test
- Create: `apps/web/lib/admin/readPendingChanges.ts` + integration test, `apps/web/lib/admin/publishSelection.ts` + integration test
- Create: `apps/web/app/(admin)/admin/publish/page.tsx`, `apps/web/app/(admin)/admin/publish/actions.ts`
- Create: `apps/web/components/admin/publish/Headline.tsx` + test, `ChangesCard.tsx` + test, `EditionsCard.tsx` + test, `publish.module.css`
- Modify: `docs/api.md`, `docs/architecture.md`

**Interfaces:**

- Consumes: Payload's `versions` on `journeys` and `pages`; `pagePath` (`packages/domain/src/pageAddress.ts`); `revalidatePath` from `next/cache`.
- Produces:
  - `type ChangeKind = 'journey' | 'page' | 'media' | 'book' | 'about' | 'site'`
  - `interface PendingChange { readonly id: string; readonly kind: ChangeKind; readonly text: string; readonly location: string; readonly at: string }`
  - `publishButtonLabel(total: number, ticked: number): string`
  - `affectedPaths(changes: readonly PendingChange[], book: BookBundle): readonly string[]`
  - `readPendingChanges(payload, scope): Promise<readonly PendingChange[]>`
  - `publishSelection`, `revertChange`, `restoreEdition` — guarded actions

- [ ] **Step 1: Write the failing tests for the button's own copy**

`SCREENS.md` §2.8 gives the primary button two forms and one inert state: it reads **"Publish all 4"** or **"Publish 2 of 4"**, and goes inert (a muted ring, `#8f836d`) when nothing is ticked.

```ts
describe('publishButtonLabel', () => {
  it('says "Publish all n" when everything is ticked', () => {
    expect(publishButtonLabel(4, 4)).toBe('Publish all 4')
  })

  it('says "Publish n of m" when a subset is ticked', () => {
    expect(publishButtonLabel(4, 2)).toBe('Publish 2 of 4')
  })

  it('still names the total when nothing is ticked, because the button is inert and not blank', () => {
    expect(publishButtonLabel(4, 0)).toBe('Publish 0 of 4')
  })
})
```

- [ ] **Step 2: Write the failing tests for the affected paths**

This is the half that makes publishing worth doing, and the half that is easiest to write as a no-op. The property: **publishing a journey revalidates that journey's own pages and the two global pages that list it, and nothing else.**

```ts
describe('affectedPaths', () => {
  it('revalidates the pages a published journey occupies, and the contents page that lists it', () => {
    const paths = affectedPaths([aChange('journey', 'tokyo')], aBookBundle())

    expect(paths).toContain(pagePath(1))
    expect(paths).toContain(pagePath(tokyoNotesIndex))
    expect(paths).not.toContain(pagePath(lisbonNotesIndex))
  })

  it('revalidates the gallery of a journey whose media changed', () => {
    expect(affectedPaths([aChange('media', 'tokyo')], aBookBundle())).toContain('/gallery/tokyo')
  })

  it('revalidates every page when the book global changed, because the chrome is on all of them', () => {
    const paths = affectedPaths([aChange('book', null)], aBookBundle())

    // The expected count comes from the bundle's own page list, not from a
    // literal: a book with a journey added has more pages and this still holds.
    expect(new Set(paths).size).toBeGreaterThanOrEqual(aBookBundle().pages.length)
  })

  it('returns no duplicates, so one path is not revalidated four times', () => {
    const paths = affectedPaths([aChange('journey', 'tokyo'), aChange('page', 'tokyo')], aBookBundle())

    expect(paths.length).toBe(new Set(paths).size)
  })
})
```

- [ ] **Step 3: Run, implement, run, mutate**

Mutation: make `affectedPaths` return every path for every change (the "revalidate everything" shortcut).
**The test that must fail: `revalidates the pages a published journey occupies, and the contents page that lists it`** — at its `not.toContain` line, which is the whole of "affected paths only". Restore. **Paste both runs.**

- [ ] **Step 4: Read the pending changes out of Payload's versions**

`readPendingChanges` lists, for `journeys` and `pages`, the rows whose newest version is a draft newer than the published one, plus the globals that have been edited since their last publish. Each becomes a `PendingChange` with the kind chip's tone, the change text, its location and its timestamp — `SCREENS.md` §2.1's "Waiting to go out" rows and §2.8's "Changes card" rows are the same data drawn twice, and Task 12 consumes this module rather than writing a second one.

Its integration case asserts against a state it created through the production actions:

```ts
it('reports a journey as waiting once it has been edited after publishing, and not before', async () => {
  await publishSelection([]) // baseline: nothing waiting
  const quiet = await readPendingChanges(payload, scope)

  await saveNotes({ journey: journeyId(String(seeded.id)), note: 'a line that was not there' })
  const noisy = await readPendingChanges(payload, scope)

  expect(quiet.map((change) => change.id)).not.toContain(changeIdFor(seeded))
  expect(noisy.map((change) => change.id)).toContain(changeIdFor(seeded))
})
```

- [ ] **Step 5: Write `publishSelection`, and prove it publishes a subset**

`SCREENS.md` §2.8's whole point is that the author ticks what goes out. The property: **an unticked change stays unpublished while a ticked one goes live**, measured through the diary's own reader.

```ts
it('publishes what was ticked and leaves what was not, in the same call', async () => {
  await saveNotes({ journey: journeyId(String(tokyo.id)), note: 'tokyo, edited' })
  await saveNotes({ journey: journeyId(String(lisbon.id)), note: 'lisbon, edited' })

  await publishSelection([changeIdFor(tokyo)])

  const bundle = await readBookBundle()

  expect(noteOf(bundle, tokyo)).toBe('tokyo, edited')
  expect(noteOf(bundle, lisbon)).not.toBe('lisbon, edited')
})
```

`readBookBundle` reads published rows, so the two sides are: the string the action was asked to publish, and the string the diary's production mapper reads back out of Postgres. The second one is not written anywhere in this test.

- [ ] **Step 6: Wire revalidation, and assert the call rather than the effect**

`revalidatePath` cannot be observed from a Vitest integration run — there is no Next.js render cache there. So the assertion is on the **argument list**, with `next/cache` stood in for the way `guard.integration.test.ts` stands in for `next/headers`:

```ts
it('revalidates exactly the paths affectedPaths names, and no others', async () => {
  const revalidated: string[] = []
  vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidated.push(path) }))

  await publishSelection([changeIdFor(tokyo)])

  // Left: what publishSelection actually called. Right: the pure module's
  // answer for the same change against the same bundle. If the wiring is
  // deleted, the left side is empty; if it over-revalidates, the sets differ.
  expect(new Set(revalidated)).toEqual(
    new Set(affectedPaths(await readPendingChanges(payload, scope), await readBookBundle())),
  )
})
```

**Do not assert that the list is non-empty and stop there.** An assertion that only checks "something was revalidated" passes for a handler that revalidates `/` and nothing else.

- [ ] **Step 7: Build the screen**

Layout `minmax(0,1fr) 360px` above 1180px.

**Headline card** — washi at `top: -12px; right: 44px` at `rotate(3deg)`; "{n} changes waiting" in Caveat 40px with `flex: 1 1 280px; min-width: 280px`; the line "Nothing below is visible to readers until you publish."; then Preview draft and the primary button from `publishButtonLabel`, inert with a muted ring and `#8f836d` when nothing is ticked.

**Changes card** — a header with "tick what goes out", then rows of a 21px checkbox, the kind chip, the text (struck through and `#8f836d` when excluded) over "{location} · {when}", and Revert.

**Editions card** — rows of a 9px rotated mark (filled `#a34434` for the live edition, a ring otherwise), the timestamp in Courier 10.5px, the description in Garamond 16.5px / 1.35, and View / Restore. `restoreEdition` calls Payload's own version restore — `journeys` and `pages` both carry `versions: { drafts: true }`, which `docs/runbook.md` already names as what backs this screen.

- [ ] **Step 8: Close the deviation Phase 2 opened**

`docs/deviations.md` §38 records that `SCREENS.md` §3.4's status line "counts something nothing can count", and names its reversal condition: "Phase 4's Publish screen, which brings a real count with it." Bring it: `SignedInStep.tsx`'s line can now read the real number, and the deviation entry gets its "reversed by" note in Task 15. Do not leave it open on the ground that the screen exists somewhere else — a reversal condition that is met and not acted on is a deviation that has become false.

- [ ] **Step 9: Mutation, e2e, verify, commit**

Mutation: delete the `revalidatePath` loop from `publishSelection`. **The test that must fail: `revalidates exactly the paths affectedPaths names, and no others`.** Restore. **Paste both runs.**

`e2e/admin.spec.ts`: edit a journey, open Publish, untick one of two changes, publish, then open the diary and assert the published change is visible and the unticked one is not — in the real browser, against the real build.

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): build the publish screen and revalidate only affected paths
```

---

## Task 12: Overview (`SCREENS.md` §2.1), and the end of the holding screen

`/admin` currently draws `PanelHome`, which `docs/deviations.md` §44 records as ours and as "Phase 4 replaces the whole of it". This is that replacement, and it is late in the plan deliberately: three of its four cards are views of data Tasks 8, 9 and 11 produce, and building it first would mean building those views twice.

**Files:**

- Create: `packages/domain/src/admin/prompts.ts` + test, `packages/domain/src/admin/overviewStats.ts` + test
- Create: `apps/web/lib/admin/readOverview.ts` + integration test
- Modify: `apps/web/app/(admin)/admin/page.tsx` (draws the Overview), `apps/web/components/admin/PanelHome.tsx` (**deleted**, with its test)
- Create: `apps/web/components/admin/overview/StatGrid.tsx` + test, `WaitingCard.tsx` + test, `LiveBookCard.tsx` + test, `PromptsCard.tsx` + test, `LatelyCard.tsx` + test, `overview.module.css`
- Modify: `docs/deviations.md` (§44 gets its reversal), `e2e/admin.spec.ts`, `e2e/visual.spec.ts`, `e2e/a11y.spec.ts`

**Interfaces:**

- Consumes: `readPendingChanges`, `PendingChange` (Task 11); `readNavCounts` (Task 3); `fitCoverTitle` (`packages/domain/src/coverTitle.ts`).
- Produces:
  - `type PromptKind = 'pick-posters' | 'caption-them' | 'no-alt-text' | 'nothing-published'`
  - `interface Prompt { readonly kind: PromptKind; readonly text: string; readonly action: string; readonly href: string }`
  - `prompts(state: OverviewState): readonly Prompt[]`
  - `readOverview(payload, scope): Promise<OverviewView>`

- [ ] **Step 1: Write the failing tests for the deep links**

`SCREENS.md` §2.1 is emphatic and specific: "**These must deep-link to the exact screen _and_ selection** — 'Pick posters' resolves the first clip with no poster and selects it by id; 'Caption them' opens the bulk panel already expanded."

A prompt that links to `/admin/galleries` and leaves the author to find the frame is the defect this sentence exists to prevent, and it is invisible unless the test reads the query string.

```ts
import { describe, expect, it } from 'vitest'
import { activeNavId } from './navigation'
import { prompts } from './prompts'

describe('prompts', () => {
  it('links "Pick posters" at the first clip with no poster, naming it by id', () => {
    const state = anOverviewState({ clipsWithoutPosters: [mediaId('41'), mediaId('67')] })
    const prompt = prompts(state).find((candidate) => candidate.kind === 'pick-posters')

    const url = new URL(prompt?.href ?? '', 'https://example.test')
    expect(url.searchParams.get('frame')).toBe('41')
  })

  it('links "Caption them" with the bulk panel already asked for', () => {
    const state = anOverviewState({ framesWithoutCaptions: 6 })
    const prompt = prompts(state).find((candidate) => candidate.kind === 'caption-them')

    expect(new URL(prompt?.href ?? '', 'https://example.test').searchParams.get('captionAll')).toBe('1')
  })

  it('sends every prompt to an address the rail itself recognises', () => {
    // The left side is each prompt's own href; the right side is the
    // navigation module's answer for it. A prompt pointing at a screen that
    // does not exist is a dead link that renders perfectly.
    const state = anOverviewState({ clipsWithoutPosters: [mediaId('41')], framesWithoutCaptions: 6 })

    expect(
      prompts(state).every(
        (prompt) => activeNavId(new URL(prompt.href, 'https://example.test').pathname) !== undefined,
      ),
    ).toBe(true)
  })

  it('offers no prompt when there is nothing to look at, rather than an empty card', () => {
    expect(prompts(anOverviewState({}))).toEqual([])
  })
})
```

- [ ] **Step 2: Run, implement, run, mutate**

Mutation: drop the `frame` parameter from `pick-posters`'s href. **The test that must fail: `links "Pick posters" at the first clip with no poster, naming it by id`.** Then point `caption-them` at `/admin/gallery` (a path no entry owns). **The test that must fail: `sends every prompt to an address the rail itself recognises`.** Restore both. **Paste all runs.**

- [ ] **Step 3: Make the target screens honour the parameters**

A deep link is only a deep link if the destination reads it. Extend Task 9's Galleries screen to read `frame` and `captionAll` from `searchParams` and open in that state, and add the e2e case that walks the whole thing:

```ts
test('the overview’s "Pick posters" prompt opens the gallery with that frame already selected', async ({ page }) => {
  await signIn(page)
  await page.goto('/admin')
  await page.getByRole('link', { name: 'Pick posters' }).click()

  // The id is never typed here. It is read off the prompt's own href before
  // the click, and compared with what the destination highlighted.
  const expected = new URL(page.url()).searchParams.get('frame')
  await expect(page.locator('[data-selected-frame]')).toHaveAttribute('data-frame-id', expected ?? '')
})
```

- [ ] **Step 4: Build the four cards**

**Stat grid** — `repeat(4, minmax(0,1fr))` above 820px and `repeat(2, …)` below, gap 16px. Each card: a label in Courier 10px `.22em`, a value in Caveat 52px, a note in Garamond italic 15px, and a 3px full-height coloured tick at the left edge. Every figure is **derived** (`DATA_MODEL.md`, "Derived, not stored") and comes from `readOverview`'s queries, not from a stored counter.

**Main split** `1.35fr minmax(0,1fr)`, gap 20px.

**Waiting to go out** — a washi strip at `top: -12px; left: 34px`; a header with "Review all"; rows at `13px 0` with a dotted separator: a 64px fixed-width kind chip (Courier 9px `.16em`, colour-coded by tone with a 55%-alpha ring), the change text in Garamond 17px over its location in Courier 10px, a timestamp, and Revert. **This reads `readPendingChanges` — the same module the Publish screen reads** — and the integration case asserts the two screens report the same set, because two screens counting the same thing differently is the defect `journeyStatus` was written to avoid.

**The book, live** — a 78x104px cloth chip carrying the fitted title and years (through `fitCoverTitle`, as Task 10's preview does), beside a summary line, the publish date, and Open live / Copy link.

**Needs a look** — a terracotta eyebrow, then the prompts: an 8px rotated square, the text in Garamond 16.5px / 1.35, and the action link.

**Lately** — two columns at `0 40px` gap, rows of an 82px timestamp and a description.

- [ ] **Step 5: Delete `PanelHome`, and close its deviation**

Delete `apps/web/components/admin/PanelHome.tsx` and `PanelHome.test.tsx`. `apps/web/app/(admin)/admin/page.tsx` keeps `requireAdminSession()` **in its own file** and draws the Overview inside `AdminShell`.

`PanelHome.tsx` exports `DIARY_PATH`, which `docs/deviations.md` cites; check every importer before deleting (`git grep DIARY_PATH`) and move the constant to wherever it is still needed, rather than re-declaring `pagePath(0)` — that duplication is what `apps/web/lib/auth/resetPath.test.ts` exists to refuse.

Then edit `docs/deviations.md` §44 to record that its reversal condition is met and by what. A deviation whose "what would reverse this" has happened is a false document.

- [ ] **Step 6: Mutation, verify, commit**

Mutation: make `readOverview` return `readNavCounts`'s journey count where the media count belongs. **The test that must fail: the stat-grid integration case, which compares each figure with its own `payload.find` total.** If no case fails, the stat grid is asserting against literals and must be rewritten before this task closes.

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): replace the holding screen with the overview it promised
```

---

## Task 13: Settings (`SCREENS.md` §2.9), Trash (`SCREENS.md` §2.10), and the two `SECURITY.md` rows they unblock

Two screens and two security requirements that `docs/security.md` records as waiting for exactly this screen: "`passwordProtect` gates server-side" is **"STILL NOT DISCHARGED: THERE IS NO GATE"**, and "`indexGalleries` respected" is **"HALF DISCHARGED; the half that reads the setting is Phase 4's"**. Both were blocked on the same thing — "a gate over a setting nothing can set is a gate nobody can test" — and this task removes that blocker and then discharges them in the same pass.

**Files:**

- Create: `packages/domain/src/admin/storageBar.ts` + test, `packages/domain/src/admin/trashCountdown.ts` + test
- Create: `apps/web/lib/admin/readSettingsScreen.ts` + integration test, `apps/web/lib/admin/readTrashScreen.ts` + integration test
- Create: `apps/web/lib/bookAccess.ts` + integration test
- Create: `apps/web/app/robots.ts`; delete `apps/web/public/robots.txt`
- Create: `apps/web/app/(admin)/admin/settings/page.tsx`, `settings/actions.ts`, `apps/web/app/(admin)/admin/trash/page.tsx`, `trash/actions.ts`, `apps/web/app/(admin)/admin/export/route.ts`
- Create: `apps/web/components/admin/settings/SiteCard.tsx` + test, `MaterialCard.tsx` + test, `ReadersCard.tsx` + test, `apps/web/components/admin/trash/TrashCard.tsx` + test, `settings.module.css`
- Modify: `apps/web/app/(diary)/p/[n]/page.tsx`, `apps/web/app/(diary)/m/[n]/page.tsx`, `apps/web/app/(diary)/gallery/[slug]/page.tsx`, `apps/web/middleware.ts` as the gate requires
- Modify: `docs/security.md` (two rows move off "not discharged"), `e2e/routing.spec.ts`, `docs/runbook.md`

**Interfaces:**

- Consumes: `site` global (`apps/web/globals/site.ts`) — `allowDownloads`, `allowShare`, `indexGalleries`, `passwordProtect`, `touchPageTurn`; `downloadCacheControl` (`packages/domain/src/galleryDownload.ts`), which already reads `passwordProtect` for the download's cache policy.
- Produces:
  - `storageSegments(byKind: { readonly stills: number; readonly clips: number }, quota: number): readonly { readonly kind: 'stills' | 'clips' | 'free'; readonly percent: number }[]`
  - `daysUntilGone(deletedAt: string, now: number): number`
  - `bookIsGated(site: { readonly passwordProtect: boolean }, request: Request): Promise<boolean>`
  - `readSettingsScreen(payload: Payload, scope: AdminScope): Promise<SettingsView>`
  - `readTrashScreen(payload: Payload, scope: AdminScope, now: number): Promise<readonly TrashRow[]>`
  - `saveSite`, `saveReaderSettings`, `takeBookOffline`, `restoreJourney`, `deleteJourneyForGood` — guarded actions

- [ ] **Step 1: Write the failing tests for the storage bar**

`SCREENS.md` §2.9 gives a 7px segmented bar with photos at `#2f6b68` and clips at `#845825` over a track, and "41.2 GB of 100 GB" above it. `DATA_MODEL.md` lists "Storage quota — sum `filesize` grouped by `kind`" under **Derived, not stored**.

```ts
describe('storageSegments', () => {
  it('turns bytes into percentages of the quota, not of the used total', () => {
    // 29% and 12.2% of ONE HUNDRED, which is what SCREENS.md's example bar
    // shows. A version dividing by the used total draws a full bar at 1GB.
    const segments = storageSegments({ stills: 29, clips: 12.2 }, 100)

    expect(segments.find((segment) => segment.kind === 'stills')?.percent).toBeCloseTo(29)
    expect(segments.find((segment) => segment.kind === 'free')?.percent).toBeCloseTo(58.8)
  })

  it('never reports more than the whole bar when the quota is exceeded', () => {
    const segments = storageSegments({ stills: 90, clips: 40 }, 100)

    expect(segments.reduce((total, segment) => total + segment.percent, 0)).toBeCloseTo(100)
    expect(segments.find((segment) => segment.kind === 'free')?.percent).toBe(0)
  })
})
```

- [ ] **Step 2: Write the failing test for the `passwordProtect` gate**

This is the requirement `SECURITY.md` states as "The `password the whole book` setting must gate server-side. A client-side check leaves the content fetchable", and the one `docs/security.md` records as having no gate at all.

The property, and both of its halves: **with the setting on, a request with no password is refused; with it off, the same request is served.** Two calls differing in one global, so a gate that refuses everything fails as loudly as one that refuses nothing.

```ts
it('refuses the book to a reader with no password once the whole book is protected', async () => {
  await payload.updateGlobal({ slug: 'site', data: { passwordProtect: true } })

  const gated = await fetch(`${origin}/p/1`, { redirect: 'manual' })

  // One status, not a list of acceptable ones. `redirect: 'manual'` is what
  // makes the status readable at all — a following fetch reports the landing
  // page's 200 and says nothing about the gate (Phase 3's third defect).
  expect(gated.status).toBe(401)
})

it('serves the same address once the setting is off, so the gate is the setting and not the route', async () => {
  await payload.updateGlobal({ slug: 'site', data: { passwordProtect: false } })

  const open = await fetch(`${origin}/p/1`, { redirect: 'manual' })

  expect(open.status).toBe(200)
})
```

The refusal's shape is a decision: **`401` with a `WWW-Authenticate: Basic` challenge**, because the handoff gives no password screen for the public diary and inventing one would be design this phase has no specification for. Record it in `docs/deviations.md` and in `docs/security.md`'s row, with the alternative named (a bespoke password page, deferred because `SCREENS.md` has no design for it).

The gate lives in `apps/web/lib/bookAccess.ts` and is called from the diary's route entries — **not** from a client component, and not from the middleware, for the same reason the session guard is not in the middleware (`apps/web/lib/auth/guard.ts`'s header): the Edge runtime cannot read Postgres, and the setting lives there.

- [ ] **Step 3: Write the failing tests for `indexGalleries`**

`docs/security.md` names the two things owed, and says they are one change: "replace the static file with `apps/web/app/robots.ts` (Next's own metadata route, which can read the global) so a `false` setting produces `Disallow: /gallery/`, and set `X-Robots-Tag: noindex` on `apps/web/app/(diary)/gallery/[slug]/page.tsx` from the same setting".

```ts
it('disallows the galleries in robots.txt when the author has turned indexing off', async () => {
  await payload.updateGlobal({ slug: 'site', data: { indexGalleries: false } })

  const body = await (await fetch(`${origin}/robots.txt`)).text()

  expect(body).toContain('Disallow: /gallery/')
})

it('sends X-Robots-Tag noindex on a gallery page for the same setting, because robots.txt does not unindex a known URL', async () => {
  await payload.updateGlobal({ slug: 'site', data: { indexGalleries: false } })

  const response = await fetch(`${origin}/gallery/${seeded.slug}`)

  expect(response.headers.get('x-robots-tag')).toBe('noindex')
})

it('sends neither once indexing is allowed again', async () => {
  await payload.updateGlobal({ slug: 'site', data: { indexGalleries: true } })

  const body = await (await fetch(`${origin}/robots.txt`)).text()
  const response = await fetch(`${origin}/gallery/${seeded.slug}`)

  expect(body).not.toContain('Disallow: /gallery/')
  expect(response.headers.get('x-robots-tag')).toBeNull()
})
```

The third case is the one that stops this being a hard-coded `noindex`. `e2e/routing.spec.ts` already asserts the static `robots.txt` is served and does not forbid the diary — update it to the generated route rather than leaving two sources of truth.

- [ ] **Step 4: Build Settings**

Two equal columns; the left stacks two cards.

**The site** — Site name, Address, Description, Reply-to, each with an italic hint beneath.

**Your material** — the explanatory paragraph, Export everything / Import a backup, then **Space used**: "41.2 GB of 100 GB", the 7px segmented bar from `storageSegments`, a legend of three rotated-square swatches, and the last backup date.

**Readers** — five toggles, one per `site` field: allow downloads, share buttons, let search engines index galleries, password the whole book, keep the page-turn on touch. Then a "Careful now" block: an eyebrow, an explanation, and a ringed "Take the book offline".

The toggle set and the `site` global's fields must correspond exactly, and that is asserted from the config rather than typed twice:

```ts
it('offers one toggle per reader setting the site global holds', () => {
  const booleans = Site.fields.flatMap((field) =>
    'type' in field && field.type === 'checkbox' && 'name' in field ? [field.name] : [],
  )
  const host = renderReadersCard(aSiteSettings())

  expect([...host.querySelectorAll('[data-setting]')].map((node) => node.getAttribute('data-setting'))).toEqual(
    booleans,
  )
})
```

- [ ] **Step 5: Build "Export everything"**

`SECURITY.md` closes with it: "The design's 'Export everything' is a genuine feature, not a nicety — **wire it up**", under the heading "The thing most likely to actually hurt you". Design spec §10 repeats it.

`apps/web/app/(admin)/admin/export/route.ts` is `export const GET = guarded(handleExport)` — a route, not an action, because the response is a stream of bytes rather than a value. It writes a ZIP containing a JSON dump of every collection and global plus the media manifest (keys, sizes and hashes), and **not** 40GB of photographs: the bucket is backed up by the bucket's own versioning (`docs/runbook.md`), and a serverless function cannot stream 40GB anyway. Say that in the route's header and in `docs/runbook.md`, because an "Export everything" that quietly excludes the photographs is worse than one that says what it holds.

The test asserts the round trip rather than the file list: **every collection the Payload config declares appears in the dump**, enumerated from the config so a collection added later is exported the day it lands.

- [ ] **Step 6: Build Trash**

One card, max 1000px. The header is "Kept for thirty days" with "nothing here is gone until you say so" and a count. The empty state is a centred Caveat 34px **"Nothing thrown away"** over an italic line. Rows: a 46px thumb, the name in Caveat 27px over "{place} · 3 pages · {n} photographs", then "goes for good in 30 days", then Put back (a dark ring) and Delete for good (a terracotta ring).

`daysUntilGone` is pure with an injected clock, and its tests cover the day it was trashed, the twenty-ninth day and a row already past the window. `restoreJourney` clears `deletedAt`; `deleteJourneyForGood` is the **only** hard delete in this phase, and its integration case asserts that the journey's `pages` and its `media` rows are dealt with too — a hard delete that orphans rows is how `readBookBundle` acquires a slot pointing at nothing, which Task 7 just spent a step making survivable.

- [ ] **Step 7: Mutation, verify, commit**

Mutations, each with its named victim:

| Mutation                                              | The test that must fail                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Make `bookIsGated` return `false` unconditionally     | `refuses the book to a reader with no password once the whole book is protected`                |
| Make `bookIsGated` return `true` unconditionally      | `serves the same address once the setting is off, so the gate is the setting and not the route` |
| Hard-code `X-Robots-Tag: noindex` on the gallery page | `sends neither once indexing is allowed again`                                                  |
| Divide the storage segments by the used total         | `turns bytes into percentages of the quota, not of the used total`                              |

Restore each. **Paste every run.**

Then update `docs/security.md`: the `passwordProtect` row stops saying "STILL NOT DISCHARGED: THERE IS NO GATE" and says what the gate is, where it runs and which case proves it; the `indexGalleries` row stops saying "HALF DISCHARGED". `apps/web/lib/docs/securityRequirements.test.ts` pins that document's quotations to `SECURITY.md`, so read its rules before editing.

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): build settings and trash, and gate the book the setting promises
```

---

## Task 14: Account (`SCREENS.md` §2.11)

Four cards, and one of them holds the setting `SECURITY.md` calls the only source of truth for the code step.

**Files:**

- Create: `apps/web/lib/admin/readAccountScreen.ts` + integration test
- Create: `apps/web/app/(admin)/admin/account/page.tsx`, `apps/web/app/(admin)/admin/account/actions.ts`
- Create: `apps/web/components/admin/account/ProfileCard.tsx` + test, `NotifyCard.tsx` + test, `GettingInCard.tsx` + test, `SessionsCard.tsx` + test, `account.module.css`
- Modify: `docs/security.md` (the "Sessions revocable, listed on the Account screen" row), `apps/web/components/admin/shell/NavRail.tsx` (the profile button's target)

**Interfaces:**

- Consumes: `createSessionService` (`apps/web/lib/auth/sessions.ts`) — `revokeSession` and `revokeAllSessions` are already written and are what this screen calls; `readBrowserSession` (`apps/web/lib/auth/browserSession.ts`) to mark the current row.
- Produces: `readAccountScreen(payload: Payload, scope: AdminScope): Promise<AccountView>`, and `saveProfile`, `saveNotifications`, `setOtpRequired`, `changePassword`, `revokeOneSession`, `signOutEverywhere` — all guarded actions.

- [ ] **Step 1: Write the failing test for the OTP toggle, end to end**

`SCREENS.md` §2.11: the "One-time code at sign-in" toggle's hint switches between **"six digits sent to the email above, then five minutes to use them"** and **"off — your password alone signs you in"**, and "**This toggle is the authoritative OTP setting**". `SECURITY.md` §2 is the reason: the prototype kept the flag in `localStorage`, "and **anyone can set it to `0` and skip the second factor entirely**".

The property: **turning it off here changes what the sign-in handler does**, proved through the sign-in path rather than by reading the row back.

```ts
it('turns the code step off for the next sign-in, which is the only thing this toggle means', async () => {
  await setOtpRequired(false)

  const outcome = await signIn({ email: account.email, password: FIXTURE_PASSWORD, ip: FIXTURE_IP })

  // The left side is the production sign-in service's own answer; the right
  // side is the state the toggle asked for. Asserting `users.otpRequired` is
  // `false` would prove the write and nothing about the behaviour.
  expect(outcome.ok && outcome.value.kind).toBe('signed-in')
})

it('turns it back on, so the assertion above is not passing for a service that never asks', async () => {
  await setOtpRequired(true)

  const outcome = await signIn({ email: account.email, password: FIXTURE_PASSWORD, ip: FIXTURE_IP })

  expect(outcome.ok && outcome.value.kind).toBe('code-required')
})
```

The second case is what stops the first being vacuous. Read `apps/web/lib/auth/signIn.ts`'s `SignInOutcome` for the exact member names before writing these — **do not guess them from this plan**; if they differ, use the file's, because the file is the contract and this plan is a description of it.

- [ ] **Step 2: Write the failing test for the session list and Revoke**

`SECURITY.md`: "Back the account screen's session list with real `sessions` rows, or Revoke and 'Sign out everywhere' do nothing." `docs/security.md`'s row already says Phase 2 built the rows and Phase 4 builds the screen.

```ts
it('lists the reader’s own live sessions, and nobody else’s', async () => {
  const mine = await aSignedInSession('account-screen')
  const theirs = await aSignedInSessionFor(otherAccount)

  const view = await readAccountScreen(payload, scope)

  const listed = view.sessions.map((row) => row.id)
  expect(listed).toContain(sessionRowIdFor(mine))
  expect(listed).not.toContain(sessionRowIdFor(theirs))
})

it('stops a revoked session authenticating, which is what makes Revoke not decorative', async () => {
  const doomed = await aSignedInSession('account-screen-revoke')
  const sessions = createSessionService({ payload, now: Date.now })
  expect((await sessions.authenticate(doomed)).ok).toBe(true)

  await revokeOneSession(sessionRowIdFor(doomed))

  // Before and after, asked of the same production `authenticate` the guard
  // asks. The "before" half is what makes the "after" half mean something.
  expect((await sessions.authenticate(doomed)).ok).toBe(false)
})
```

- [ ] **Step 3: Build the four cards**

**Who is keeping this** — a 132px avatar with Replace, beside Name on the cover (Caveat 26px), Sign-off used on pages (Caveat 24px `#736247`), and a Time zone select **whose options state how dates are written** — that phrasing is `SCREENS.md`'s and it means the option labels carry an example, not just a zone name.

**Tell me when** — two toggles, writing `users.notifyOnPublish` and `users.notifyWeekly`.

**Getting in** — the sign-in email; Current / New password in two columns above 900px; the "One-time code at sign-in" toggle with its two hints; then Save changes.

`changePassword` verifies the current password by calling `payload.login` through the Local API and discarding whatever it returns, then writes the new one through `adminScope` — which Task 1's `ownAccountOnly` permits on the caller's own row and refuses on anybody else's. **State the consequence in the action's header:** a wrong current password counts toward Payload's own `maxLoginAttempts: 5`, so five wrong attempts here lock the account for `lockTime` exactly as five wrong attempts at the sign-in screen do. That is the correct behaviour and it will surprise somebody; a comment is cheaper than the surprise.

**Where you are signed in** — rows of a 9px mark (filled for the current session), the device over "{place} · {when}", and Current / Revoke; then Sign out everywhere and Sign out. The current row is identified by comparing the request's own cookie against each row's hash through the production reader, never by "the newest row".

- [ ] **Step 4: Point the rail's profile button here**

`SCREENS.md` §2's rail footer has a profile button with a terracotta ring when active. Task 3 built it with no target; give it `/admin/account`, and extend `NavRail.test.tsx`'s active-state case to cover it. Account is still not a nav entry — `navigation.ts`'s header already says why.

- [ ] **Step 5: Mutation, e2e, verify, commit**

Mutation: make `setOtpRequired` write to a field the schema does not have. **The tests that must fail: both cases in Step 1.** Then make `revokeOneSession` update `lastSeenAt` instead of `revokedAt`. **The test that must fail: `stops a revoked session authenticating…`.** Restore both. **Paste all runs.**

`e2e/admin.spec.ts`: sign in twice (two contexts), revoke the second from the first, and assert the second context is redirected to `/admin/sign-in` on its next navigation — the redirect is the browser's, not the test's.

Run `npm run verify` and `npm run verify:full`; paste both.

```text
feat(admin): build the account screen, its OTP toggle and real session revocation
```

---

## Task 15: The exit criteria, the sweeps, the documents, and every residual named

Nothing new is built here that a screen needs. What is here is the proof of the three exit criteria, the four committed browser sweeps, the documentation that ships in the same phase as the code (`CLAUDE.md` §1.3), and an answer — a task or an explicit decision — for every residual Phase 3 handed over.

**Files:**

- Create: `e2e/focalPoint.spec.ts`
- Create: four sweep reports under `docs/qa/`, named by `CLAUDE.md` §10's own convention — `docs/qa/YYYY-MM-DD-<area>-sweep.md` — with the areas `admin-desk`, `admin-authoring`, `admin-material` and `admin-keeping`, and `YYYY-MM-DD` the day each sweep is actually run
- Create: `docs/adr/0023-admin-authorization-and-override-access.md` (if Task 2 did not write it), `docs/adr/0024-the-staged-upload-sweep.md`
- Create: `apps/web/lib/docs/newestSweep.test.ts`
- Modify: `apps/web/scripts/placeholder.ts`, `vitest.config.ts`
- Modify: `docs/architecture.md`, `docs/api.md`, `docs/data-model.md`, `docs/security.md`, `docs/testing.md`, `docs/runbook.md`, `docs/deviations.md`, `README.md` if it describes the panel
- Modify: `e2e/visual.spec.ts`, `e2e/a11y.spec.ts`, `lighthouserc.admin.json`

- [ ] **Step 1: Prove exit criterion 2 in a browser**

Design spec §4: "focal points set in the admin visibly move the crop in the diary". Design spec §5.2 says why it is an exit criterion: "If this is not wired through to rendering, the admin control is decorative."

Task 7 proved the data half. This proves the pixel half, and it is written so that **neither side of the comparison is a literal this file chose**:

```ts
test('a focal point clicked in the editor moves the crop the diary renders', async ({ page }) => {
  await signIn(page)
  await page.goto(`/admin/journeys/${journeyRowId}`)

  // 1 · Click a measured point inside the slot. The coordinates come from the
  //     browser's own bounding box, not from this file.
  const slot = page.locator('[data-focal-target]').first()
  const box = await slot.boundingBox()
  if (box === null) throw new Error('the slot has no box, so nothing below measures anything')
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.8)

  // 2 · Read what the admin now shows. Produced by the focal-point module.
  const inAdmin = await slot.evaluate((node) => getComputedStyle(node).backgroundPosition)

  await page.getByRole('button', { name: 'Save draft' }).click()
  await publishThrough(page)

  // 3 · Read what the DIARY renders, in a fresh navigation, from a bundle a
  //     different module built out of Postgres.
  await page.goto(diaryPathForThatPage)
  const inDiary = await page.locator(diarySlotSelector).evaluate((node) => getComputedStyle(node).objectPosition)

  // Both are the browser's computed values for the same stored pair. The
  // assertion is that they AGREE and that they are not the default.
  expect(inDiary).toBe(inAdmin)
  expect(inDiary).not.toBe('50% 50%')
})
```

The final `not.toBe('50% 50%')` is load-bearing: `pages.slots[].focalX/focalY` both default to 50, so a test that only compared the two surfaces would pass against a control that saved nothing at all. That is the Phase 3 defect class, in this phase's own shape.

- [ ] **Step 2: Complete the visual and accessibility coverage**

Every screen has a baseline at all three Playwright viewports (`desktop` 1440x900, `mid` 1000x800, `mobile` 390x844) and an axe case. Each screen task added its own as it landed; this step is where the set is checked for holes, against `ADMIN_NAV` rather than against a list:

```ts
it('has a visual baseline for every rail entry, so a screen cannot ship unbaselined', () => {
  const baselines = readdirSync('e2e/visual.spec.ts-snapshots')

  expect(ADMIN_NAV.filter((entry) => !baselines.some((file) => file.startsWith(`admin-${entry.id}-`)))).toEqual([])
})
```

- [ ] **Step 3: Sweep, in four groups, with `sweeping-for-browser-defects`**

`CLAUDE.md` §10 makes this mandatory and says what it produces: "a triaged defect report at `docs/qa/YYYY-MM-DD-<area>-sweep.md` — **a sweep that produces no file did not happen**". The spec's exit line asks for one **per screen group**:

| Group     | Screens                                                   |
| --------- | --------------------------------------------------------- |
| The desk  | Shell, Overview, Publish                                  |
| Authoring | Journeys, Journey editor                                  |
| Material  | Media, Galleries                                          |
| Keeping   | Book & bookmarks, Cover & About, Settings, Trash, Account |

Every sweep instruments `console`, `pageerror` and failed responses **before** walking a route — the handoff's own defect log is mostly silent failures, none of which appear in a screenshot.

**Nothing found in a sweep is patched from the sweep.** `CLAUDE.md` §10: "never patch a defect straight from a sweep. A fix without a test that failed first proves nothing and guards nothing." Each defect goes through `fixing-browser-defects`, which requires the failing automated test first and the whole defect class fixed rather than the instance.

- [ ] **Step 4: Fix the `docs/qa` hole, now that this phase writes four reports into it**

`apps/web/lib/docs/pathCitations.test.ts`'s own header names it: `docs/qa/**` is excluded from the citation corpus because a historical report may name a since-renamed file, "THE HOLE, NAMED RATHER THAN ASSERTED AWAY… What would close it honestly is a write-time check over the NEWEST report alone. It does not exist."

Build it, because this phase quadruples the number of reports: `apps/web/lib/docs/newestSweep.test.ts` resolves the citations of **the newest file under `docs/qa/` only**, by the date in its name, using `pathCitations.test.ts`'s own extraction rules — imported, not copied, which means extracting them from that file into a module both can use. The older reports stay untouched and stay excluded, which is what keeps the record a record.

Its non-vacuity case: assert that the newest report was actually found and that it contains at least one citation, so a run against an empty or unparsed file cannot report green.

- [ ] **Step 5: Fix the `c8 ignore` hint that suppresses nothing**

`apps/web/scripts/placeholder.ts` carries two `/* c8 ignore next -- … */` comments whose reason spans three lines. `c8 ignore next` ignores the line after the comment **begins**, which is a line inside the comment itself — so neither guard is suppressed, which is why `vitest.config.ts` gates that file's branches at **87.5** instead of 100.

The fix is one of two shapes, and the choice is measured rather than argued: put the reason on the same line as the directive, or wrap each guard in `c8 ignore start`/`stop`. Make the change, run the coverage pass, and **raise the threshold to whatever it now measures**. If it measures 100, the gate says 100. If the hint still suppresses nothing, say so and leave the number — but then delete the comment, because a directive that does nothing is a comment claiming a suppression that is not happening.

Run: `npm run test:unit` and paste the `placeholder.ts` line of the coverage table, before and after.

- [ ] **Step 6: Decide the `MEDIA_PIPELINE=worker` residual explicitly**

Phase 3 shipped with `MEDIA_PIPELINE=worker` refused at environment validation, and recorded that "the commit that removes the refusal owes an end-to-end pass".

**Phase 4 does not remove it, and this is the decision rather than an omission.** Video is deferred by ADR 0004; no Fly.io worker exists; and removing a refusal this phase cannot exercise end to end would be exactly the "flip one config, then debug for three days" outcome ADR 0004 exists to prevent. What this phase adds instead is the thing that keeps the debt visible: a case asserting that the refusal is still there, naming what is owed when it goes.

```ts
it('still refuses MEDIA_PIPELINE=worker, and names the pass owed by whoever removes this', () => {
  // Deleting this case is the cheapest way to remove the refusal silently, so
  // the case says what it is standing in front of: an end-to-end pass through
  // a real worker, which nothing in Phases 3 or 4 has ever run.
  const parsed = parseEnv({ ...aValidEnv(), MEDIA_PIPELINE: 'worker' })

  expect(parsed.ok).toBe(false)
})
```

Record the decision in `docs/deviations.md` and in `docs/adr/0004-media-pipeline-mode.md`'s consequences, with the owner named as "whichever phase provisions the worker".

- [ ] **Step 7: The documents, in the same commits as the code where possible and here where not**

`CLAUDE.md` §1.3: load-bearing documents ship in the commit; descriptive ones when they become false. Most of these should already have moved with their task — this step is the check, not the first attempt.

| Document               | What this phase changes                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture.md` | §1's repository structure gains `lib/admin/**`, `components/admin/**` and `packages/domain/src/admin/**`; a new "The back room, built" section replacing the front-door-only one                                                             |
| `docs/api.md`          | A full row per screen route and per server action — the file's own contract requires it in the commit that adds each                                                                                                                         |
| `docs/data-model.md`   | The access blocks from Task 1; the `Slot.src` nullability from Task 7                                                                                                                                                                        |
| `docs/security.md`     | The authorization rows (Tasks 1, 2), `passwordProtect` and `indexGalleries` (Task 13), the staged-upload sweep (Task 8), the Account screen's session list (Task 14); and "What Phase 2 hands to Phase 4" becomes "what Phase 4 did with it" |
| `docs/testing.md`      | §7's admin performance section, now that `/admin` and the screens have a gate; §10's new `newestSweep.test.ts`                                                                                                                               |
| `docs/runbook.md`      | The sweep's schedule; Export everything and what it holds; restoring an edition                                                                                                                                                              |
| `docs/deviations.md`   | §52 onwards — see the table below                                                                                                                                                                                                            |
| `README.md`            | Only if it describes the panel as unbuilt                                                                                                                                                                                                    |

The deviations this phase opens, numbered from §52 because §51 is the last one in the file today:

| Entry | What it records                                                                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| §52   | The access blocks on `journeys`, `pages`, `users` and the three globals, which `DATA_MODEL.md` prints no block for (Task 1)                  |
| §53   | The rail's sub-labels, which are ours — `SCREENS.md` §2 gives the type and colour but no strings (Task 3)                                    |
| §54   | The focal point stored as two numbers, per `DATA_MODEL.md`, where `SCREENS.md` §2.3 describes the prototype's `"x y"` string (Task 7)        |
| §55   | `Slot.src` becoming nullable, and the empty frame a not-`ready` row now draws (Task 7)                                                       |
| §56   | The `passwordProtect` refusal answering `401` with a Basic challenge, because the handoff designs no password screen for the diary (Task 13) |
| §57   | "Export everything" holding the database and a media manifest rather than 40GB of photographs (Task 13)                                      |
| §58   | `MEDIA_PIPELINE=worker` left refused, with the owner of the owed pass named (Step 6)                                                         |

Each entry follows the file's existing shape, including **"What would reverse this"** — `docs/deviations.md` §38 and §44 are the two this phase reverses, and both must be edited rather than left standing.

- [ ] **Step 8: Re-measure every budget, and report each one**

| Budget                         | How                                                                                                                                           | Where it is reported                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Admin route JS ≤ 320KB gzipped | `npm run test:perf`, the `lighthouserc.admin.json` run, every screen URL                                                                      | `docs/testing.md` §7, with the number per screen |
| LCP ≤ 3,085ms, CLS ≤ 0.1       | The same run's assertions                                                                                                                     | The same place                                   |
| Diary JS ≤ 180KB gzipped       | `lighthouserc.json` and `lighthouserc.book.json` — **this phase changed `readBookBundle`** (Task 7), so the diary's budgets are not untouched | `docs/testing.md` §7                             |
| INP ≤ 200ms                    | Lighthouse reports it; where it is not collected, say so rather than claiming it                                                              | The same place                                   |

If the admin route JS is over 320KB on any screen, **the budget does not move.** Design spec §12 and `CLAUDE.md` §6 make these hard gates, and `docs/deviations.md` §23 records what happened the last time a budget was raised to fit the code. The fix is fewer client components; the list of `'use client'` modules per screen is the first place to look, and every one of them was a decision a task took with a measurement attached.

- [ ] **Step 9: The triple-check (`CLAUDE.md` §9)**

1. **Correctness** — a hostile re-read of the whole branch diff, looking for the four defect shapes this plan's own preamble names.
2. **Verification** — `npm run verify:full`, `npm run test:e2e`, `npm run test:visual`, `npm run test:a11y`, `npm run test:perf`, each run and each output pasted. A tool that is not installed makes its check **UNRESOLVED** and is reported as such, never worked around (`CLAUDE.md` §7.1).
3. **Specification** — re-diff `SCREENS.md` §2.1 through §2.11 against what was built, screen by screen, reading the copy strings character by character. "nineteen tarts, no regrets" is content.

- [ ] **Step 10: Commit, and close the phase**

```text
docs(admin): close phase 4 — exit criteria, sweeps, residuals and documents
```

Body: each exit criterion and the named case that discharges it; the four sweeps and their triage outcomes; every residual with its answer; and every budget with its measured number.

---

## Identifier ledger

Every non-obvious identifier the snippets above reference, and where it comes from. Phase 2's plan shipped seven helpers referenced but never defined; this table is the check that catches that species.

### Already in the tree (verified by reading it)

| Identifier                                                                                                        | Module                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `Result`, `ok`, `err`, `isOk`                                                                                     | `packages/domain/src/result.ts`                               |
| `JourneyId`, `PageId`, `MediaId`, `SlotKey`, `UserId`, `SessionId`, and their constructors                        | `packages/domain/src/ids.ts`                                  |
| `Slot`, `BookPage`, `BookBundle`, `BookChrome`, `WeatherGlyph`, `GalleryCounts`                                   | `packages/domain/src/bookBundle.ts`                           |
| `pagePath`, `addressedPageIndex`                                                                                  | `packages/domain/src/pageAddress.ts`                          |
| `fitCoverTitle`                                                                                                   | `packages/domain/src/coverTitle.ts`                           |
| `downloadCacheControl`                                                                                            | `packages/domain/src/galleryDownload.ts`                      |
| `readExifFacts`, `metadataMarkersIn`                                                                              | `packages/domain/src/media/exif.ts`                           |
| `STAGING_PREFIX`, the upload-slot plan                                                                            | `packages/domain/src/media/uploadSlot.ts`                     |
| `guarded`, `guardedAction`, `requireAdminSession`, `authenticateAdminRequest`, `AuthenticatedSession`             | `apps/web/lib/auth/guard.ts`, `apps/web/lib/auth/sessions.ts` |
| `createSessionService`, `SessionService`, `SessionRefusal`                                                        | `apps/web/lib/auth/sessions.ts`                               |
| `createSignInService`, `SignInOutcome`                                                                            | `apps/web/lib/auth/signIn.ts`                                 |
| `readBrowserSession`                                                                                              | `apps/web/lib/auth/browserSession.ts`                         |
| `ADMIN_PUBLIC_PATHS`, `isGuardedAdminPath`                                                                        | `apps/web/lib/auth/adminAccess.ts`                            |
| `SIGN_IN_PATH`, `ADMIN_PANEL_PATH`, `SIGN_OUT_ENDPOINT`                                                           | `apps/web/lib/auth/adminPaths.ts`                             |
| `ownSessionsOnly`                                                                                                 | `apps/web/collections/sessions.ts`                            |
| `getPayload`                                                                                                      | `apps/web/lib/payload.ts`                                     |
| `readBookBundle`                                                                                                  | `apps/web/lib/readBookBundle.ts`                              |
| `readGalleryBundle`                                                                                               | `apps/web/lib/readGalleryBundle.ts`                           |
| `galleryFrameWhere`, `GALLERY_FRAME_SORT`, `journeyPagesQuery`                                                    | `apps/web/lib/galleryFrames.ts`                               |
| `StoragePort`, `validateStorageKey`                                                                               | `apps/web/lib/ports/storage.ts`                               |
| `requestUploadSlots`, `finaliseUpload`                                                                            | `apps/web/app/(admin)/admin/media/actions.ts`                 |
| `aSignedInSession`, `anAccountWithACodeStep`, `anUploadUrlFor`, `removeSignedInFixture`, `FIXTURE_ADMIN_PASSWORD` | `e2e/support/adminSession.ts`                                 |
| `expectNoAxeViolations`                                                                                           | `e2e/support/axe.ts`                                          |
| `waitForLiveBook`, `wholeBookPath`                                                                                | `e2e/support/liveBook.ts`                                     |
| `livingDocuments`, `markdownFiles`, `repositoryFiles`, `REPOSITORY_ROOT`                                          | `apps/web/lib/docs/markdownCorpus.ts`                         |
| `PRODUCTION_SITES`                                                                                                | `apps/web/lib/auth/overrideAccessSites.test.ts`               |

### Introduced by this plan, with the task that defines each

| Identifier                                                                                                      | Defined in                                                                                      | Task |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| `ownAccountOnly`                                                                                                | `apps/web/collections/users.ts`                                                                 | 1    |
| `accountRowId`                                                                                                  | `packages/domain/src/ids.ts`                                                                    | 2    |
| `AdminScope`, `adminScope`                                                                                      | `apps/web/lib/admin/adminScope.ts`                                                              | 2    |
| `AdminSection`, `NavEntry`, `ADMIN_NAV`, `sectionColour`, `activeNavId`                                         | `packages/domain/src/admin/navigation.ts`                                                       | 3    |
| `AdminWidthMode`, `adminWidthMode`, `HeaderControls`, `headerControls`                                          | `packages/domain/src/admin/breakpoints.ts`                                                      | 3    |
| `NavCounts`, `readNavCounts`                                                                                    | `apps/web/lib/admin/readNavCounts.ts`                                                           | 3    |
| `mintLighthouseSession`                                                                                         | `apps/web/scripts/mint-lighthouse-session.ts`                                                   | 3    |
| `JourneyStatus`, `journeyStatus`, `JOURNEY_STATUS_FILTERS`                                                      | `packages/domain/src/admin/journeyStatus.ts`                                                    | 4    |
| `JourneyColumn`, `visibleJourneyColumns`                                                                        | `packages/domain/src/admin/journeyColumns.ts`                                                   | 4    |
| `JourneyRow`, `readJourneysScreen`                                                                              | `apps/web/lib/admin/readJourneysScreen.ts`                                                      | 4    |
| `createJourney`, `duplicateJourney`, `archiveJourney`, `trashJourney`                                           | `apps/web/app/(admin)/admin/journeys/actions.ts`                                                | 4    |
| `PageLayout`, `GlyphCell`, `LayoutGlyph`, `LAYOUTS`, `layoutGlyph`                                              | `packages/domain/src/admin/layoutGlyphs.ts`                                                     | 5    |
| `RailPage`, `movePage`                                                                                          | `packages/domain/src/admin/pageRail.ts`                                                         | 5    |
| `readJourneyEditor`, `JourneyEditorView`                                                                        | `apps/web/lib/admin/readJourneyEditor.ts`                                                       | 5    |
| `addPage`, `copyPage`, `deletePage`, `reorderPages`, `setPageLayout`                                            | `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`                                           | 5    |
| `MAX_HIGHLIGHTS`, `Highlight`, `addHighlight`, `moveHighlight`, `removeHighlight`                               | `packages/domain/src/admin/highlights.ts`                                                       | 6    |
| `saveNotes`                                                                                                     | `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`                                           | 6    |
| `FocalPoint`, `focalPointFrom`, `focalPointLabel`, `isCentred`                                                  | `packages/domain/src/admin/focalPoint.ts`                                                       | 7    |
| `setSlotMedia`, `setSlotFocalPoint`, `setSlotText`, `clearSlot`                                                 | `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`                                           | 7    |
| `StoredObject`, `StoragePort.list`                                                                              | `apps/web/lib/ports/storage.ts`                                                                 | 8    |
| `staleStagedObjects`                                                                                            | `packages/domain/src/media/stagedObjects.ts`                                                    | 8    |
| `sweepStagedUploads`                                                                                            | `apps/web/lib/media/sweepStagedUploads.ts`                                                      | 8    |
| `MediaFilter`, `matchesMediaFilter`                                                                             | `packages/domain/src/admin/mediaFilters.ts`                                                     | 8    |
| `gridMinimum`                                                                                                   | `packages/domain/src/admin/gridColumns.ts`                                                      | 8    |
| `MediaTile`, `readMediaScreen`                                                                                  | `apps/web/lib/admin/readMediaScreen.ts`                                                         | 8    |
| `reorderFrames`, `sortFramesByDate`, `coverFrame`                                                               | `packages/domain/src/admin/frameOrder.ts`                                                       | 9    |
| `readGalleriesScreen`                                                                                           | `apps/web/lib/admin/readGalleriesScreen.ts`                                                     | 9    |
| `setFrameOrder`, `setFrameText`, `setFrameFlags`, `setPosterAt`, `applyBulkCaptions`                            | `apps/web/app/(admin)/admin/galleries/actions.ts`                                               | 9    |
| `BookmarkRow`, `BookmarkRowKind`, `moveBookmark`                                                                | `packages/domain/src/admin/bookmarkOrder.ts`                                                    | 10   |
| `saveBookSettings`, `saveBookmarkOrder`, `saveCover`, `saveAbout`                                               | `apps/web/app/(admin)/admin/book/actions.ts`                                                    | 10   |
| `ChangeKind`, `PendingChange`, `publishButtonLabel`                                                             | `packages/domain/src/admin/pendingChange.ts`                                                    | 11   |
| `affectedPaths`                                                                                                 | `packages/domain/src/admin/affectedPaths.ts`                                                    | 11   |
| `readPendingChanges`                                                                                            | `apps/web/lib/admin/readPendingChanges.ts`                                                      | 11   |
| `publishSelection`, `revertChange`, `restoreEdition`                                                            | `apps/web/app/(admin)/admin/publish/actions.ts`                                                 | 11   |
| `PromptKind`, `Prompt`, `prompts`, `OverviewState`                                                              | `packages/domain/src/admin/prompts.ts`                                                          | 12   |
| `OverviewView`, `readOverview`                                                                                  | `apps/web/lib/admin/readOverview.ts`                                                            | 12   |
| `storageSegments`                                                                                               | `packages/domain/src/admin/storageBar.ts`                                                       | 13   |
| `daysUntilGone`                                                                                                 | `packages/domain/src/admin/trashCountdown.ts`                                                   | 13   |
| `bookIsGated`                                                                                                   | `apps/web/lib/bookAccess.ts`                                                                    | 13   |
| `saveSite`, `saveReaderSettings`, `takeBookOffline`, `restoreJourney`, `deleteJourneyForGood`                   | `apps/web/app/(admin)/admin/settings/actions.ts`, `apps/web/app/(admin)/admin/trash/actions.ts` | 13   |
| `readAccountScreen`                                                                                             | `apps/web/lib/admin/readAccountScreen.ts`                                                       | 14   |
| `saveProfile`, `saveNotifications`, `setOtpRequired`, `changePassword`, `revokeOneSession`, `signOutEverywhere` | `apps/web/app/(admin)/admin/account/actions.ts`                                                 | 14   |

### Test factories this plan adds

All go in `packages/domain/src/testing/factories.ts` beside the ones already there, or in the web-side `testing/` directory when they need Payload: `aRailPage`, `aHighlight`, `aFrame`, `aFrameView`, `aBookmark`, `aStoredObject`, `aChange`, `aBookBundle`, `anOverviewState`, `aSiteSettings`, `aSlotView`, `manyTiles`, `aMediaTile`. Each takes overrides and has real defaults — `CLAUDE.md` §2.3.

---

## Residuals Phase 4 inherits, and what each gets

| Residual                                                                                                  | Where it is recorded                                                                                                                                 | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Staged-but-never-finalised upload objects are un-stripped originals still carrying GPS**                | `docs/adr/0020-the-presign-seam-and-the-local-upload-receiver.md`, `docs/security.md`'s EXIF row, `docs/runbook.md`                                  | **Task 8** — a `list` operation on the storage port, a pure staleness rule, a sweep whose test reads the metadata out of the object before asserting the object is gone, and a scheduled CLI script. ADR 0024 records why it is not a hook in the upload path                                                                                                                                                                                                                                                       |
| **A not-`ready` row in a book slot reaches the bundle with a `src` that does not load**                   | `apps/web/lib/readBookBundle.ts`'s own comment; owned by no phase                                                                                    | **Task 7** — the fallback in `withSlots` that comment prescribes, taken up here because this is the task that lets an author place a still-processing upload                                                                                                                                                                                                                                                                                                                                                        |
| **The commit that removes `MEDIA_PIPELINE=worker`'s env refusal owes an end-to-end pass**                 | `docs/adr/0004-media-pipeline-mode.md`, the Phase 3 merge commit                                                                                     | **Task 15 Step 6 — an explicit decision not to remove it**, with a case standing over the refusal and the owed pass named, owned by whichever phase provisions the worker                                                                                                                                                                                                                                                                                                                                           |
| **`docs/qa/**` sits outside the documentation guards**                                                    | `apps/web/lib/docs/pathCitations.test.ts`'s header, `docs/testing.md` §10.2                                                                          | **Task 15 Step 4** — the write-time check over the newest report only, which is the shape that header already says would close it honestly. This phase writes four reports, which is what makes it worth building now                                                                                                                                                                                                                                                                                               |
| **`apps/web/scripts/placeholder.ts`'s `c8 ignore` hint spans three comment lines and suppresses nothing** | `vitest.config.ts`'s 87.5 branch gate                                                                                                                | **Task 15 Step 5** — fixed or deleted, with the threshold set to what is then measured. A gate at 87.5 because of a broken comment is a gate nobody chose                                                                                                                                                                                                                                                                                                                                                           |
| **Media is served from the app's own origin, not a separate one**                                         | `docs/security.md`'s "Media served from a separate origin" row, which records it as **NOT DISCHARGED** and "a deploy-time decision rather than code" | **Not taken, and said so here.** `MEDIA_ORIGIN` is validated by `apps/web/lib/env.ts` and read by nothing, and the local adapter serves from disk — there is no second origin to point at until R2 is provisioned, so a code change here would be untestable on this machine and unexercised in CI. It stays `SECURITY.md`'s open row with the deployment named as its owner, and Task 15 edits `docs/security.md` to say Phase 4 considered it and why it is still open, rather than leaving it to look overlooked |
| `/cms`'s route directory is to be deleted in production                                                   | `docs/api.md`                                                                                                                                        | **Not taken, and said so here.** It is a deployment concern rather than a screen, `payload.config.ts` already disables the admin in production, and `sealedUserAuth.ts` means nothing can sign into it. Recorded in `docs/api.md` as still owed rather than quietly dropped                                                                                                                                                                                                                                         |

---

## Tensions between the specification and what exists

Named here so no task discovers one halfway through and resolves it privately.

1. **`SCREENS.md` §2.3 stores the focal point as the string `"x y"`; `DATA_MODEL.md` gives two numbers.** `DATA_MODEL.md` is the field-list authority and the schema already has `focalX`/`focalY`. Two numbers, composed at render. Deviation §54.
2. **The design spec says "ten screens" in §1 and lists eleven in §4.** §4's list is the one with the names in it and matches `SCREENS.md` §2.1–§2.11. Eleven.
3. **`SCREENS.md` §2.11 shows the sign-in email in "Getting in" but does not say it is editable.** Treated as displayed, not editable — changing an account's address with no verification step is a security change `SECURITY.md` does not ask for. If the author wants it, it is a later change with a verification flow, not a text input added quietly.
4. **`SCREENS.md` §2 specifies the rail's sub-label type and colour but prints no strings.** Ours, recorded as deviation §53.
5. **`site.passwordProtect` has no designed password screen anywhere in the handoff.** A `401` with a Basic challenge, recorded as deviation §56, with a bespoke screen named as the alternative that was deferred.
6. **The admin performance gate cannot see a guarded screen without a session.** Task 3 mints one for the collector. If the mechanism does not work on this machine, it is **UNRESOLVED** and reported as such (`CLAUDE.md` §7.1) — never closed by making a screen public.

---

## Phase 4 exit criteria

From the design spec's §4, unedited: "_Exit:_ every screen matches `SCREENS.md`; focal points set in the admin visibly move the crop in the diary; browser sweep committed per screen group."

This phase is done when, and only when:

1. **Every screen matches `SCREENS.md`** — eleven screens plus the shell, each with a visual baseline at `desktop`, `mid` and `mobile`, each with an axe case, and the §2.1–§2.11 re-diff of Task 15 Step 9 completed copy string by copy string.
2. **A focal point clicked in the editor moves the crop the diary renders** — `e2e/focalPoint.spec.ts`, whose assertion compares two browsers' computed styles produced by two different modules and refuses the default `50% 50%`.
3. **Four sweeps committed under `docs/qa/`**, one per screen group, each triaged, and every defect fixed through `fixing-browser-defects` with a test that failed first.
4. `npm run verify:full` green and pasted; `npm run test:e2e`, `npm run test:visual`, `npm run test:a11y` and `npm run test:perf` green and pasted.
5. Coverage gates met: 100% on `packages/domain/**`, 95% on `apps/web/lib/**`, and **no file in neither config's `include`**.
6. Every admin route guarded and every server action built from `guardedAction` — proved by `apps/web/lib/auth/adminGuardRegistration.test.ts` and `eslint-rules/guarded-server-actions.js`, with no exemption added for anything in this phase.
7. Admin route JS ≤ 320KB gzipped on every collected screen, LCP ≤ 3,085ms, CLS ≤ 0.1 — **measured, pasted, and not moved to fit.**
8. Every residual in the table above closed or answered with a written decision, and every document in Task 15 Step 7 true on the day the phase merges.
