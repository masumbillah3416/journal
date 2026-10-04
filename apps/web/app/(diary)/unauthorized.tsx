/**
 * unauthorized.tsx — what the diary served once the author had closed the
 * whole book, and what nothing in this route group reaches today.
 *
 * NOTHING RAISES `unauthorized()` IN `(diary)/` ANY MORE. A closed book now
 * has a password to ask for, so the three page entries redirect to `/unlock`
 * instead of refusing — `docs/deviations.md` §100 is the entry that records
 * why there was nothing to ask for before. The gallery download route still
 * answers 401, but it builds its own `Response` rather than raising, because
 * its body is meant to be a photograph.
 *
 * THIS FILE IS THEREFORE UNREACHED, and is kept rather than deleted for one
 * measured reason: it is Next's own convention for the route group, so the
 * day any code here raises `unauthorized()` again it is this file that
 * renders, with a 401 rather than a 200. Deleting it would also mean
 * deciding about `experimental.authInterrupts` in `apps/web/next.config.ts`,
 * which is a change to the build this task has no mandate for. Recorded as a
 * residual rather than left to be discovered.
 *
 * What it says below describes the behaviour it used to serve.
 *
 * Next's own convention, the twin of `not-found.tsx`: this file renders,
 * under `(diary)/layout.tsx`, for any `unauthorized()` raised inside this
 * route group, and the response carries **HTTP 401** rather than 200. That
 * status is the point of the file, not a side effect of it — `SECURITY.md`
 * requires the `password the whole book` setting to gate SERVER-SIDE,
 * "a client-side check leaves the content fetchable", and a 200 carrying an
 * apology is exactly such a check.
 *
 * It needs `experimental.authInterrupts` in `apps/web/next.config.ts`; that
 * flag exists for this file and `apps/web/lib/bookAccess.ts`'s header carries
 * the reasoning, including why the 401 sends no `WWW-Authenticate` challenge.
 *
 * ITS COPY IS A SECURITY CLAIM, AND IT IS CHECKED. "not the photographs behind
 * them" was FALSE when this file was written: a closed book still served every
 * photograph through Payload's own REST, GraphQL and file routes. It is closed
 * at `apps/web/collections/media.ts`'s `read` rule, which is the one predicate
 * all three pass through.
 * `apps/web/lib/bookGateRegistration.test.ts` is what now counts the surfaces,
 * and `e2e/bookGate.spec.ts` asks a running server for each of them. Do not
 * widen this sentence without widening that file first.
 *
 * IT IS NOT A BOOK, and it offers no way in, which is the one way it differs
 * from its twin. The 404 links to `/p/1` because a reader who mistyped an
 * address has somewhere to go; a reader of a closed book has nowhere, and a
 * link to the cover would answer 401 as well. Inventing a password form here
 * would be inventing a screen `SCREENS.md` does not have and a credential
 * `DATA_MODEL.md` does not store.
 *
 * ITS STYLES ARE `diary.css`'s `diaryNotice*` classes, shared with
 * `not-found.tsx` — one surface, two notices — for that file's own reason: a
 * CSS module imported from a sibling slot of `children` is preloaded in the
 * head of every page of the book and used by none of them.
 *
 * `<main>` and the `<h1>` are load-bearing rather than decorative, for the
 * same reason they are there: axe's `landmark-one-main` and
 * `page-has-heading-one` are asserted on this route with no exclusions
 * (`e2e/a11y.spec.ts`).
 * Depends on: the `diaryNotice*` classes in ./diary.css (loaded by
 * ./layout.tsx).
 */
/* c8 ignore start -- A Next.js convention file: it is never imported by any
 * test in either Vitest config (rendering one needs a real Next request and
 * render context, and no integration pass can supply one), so a per-file c8
 * ignore is CLAUDE.md §2.1's honest treatment for a file nothing can
 * measure - not exclude-and-regate, which would promise a pass that does not
 * exist. It holds no branch and no value of its own. Its runtime behaviour,
 * including its 401 status, is covered in the browser by
 * e2e/bookGate.spec.ts. Wraps the imports too, not just the export: an
 * unimported file's imports are themselves uncovered lines. */
import type React from 'react'

/** Renders the diary's closed-book notice. */
const DiaryUnauthorized = (): React.JSX.Element => (
  <main className="diaryNoticeStage">
    <div className="diaryNoticeCard">
      <p className="diaryNoticeEyebrow">Closed</p>
      <h1 className="diaryNoticeTitle">This diary isn’t open to readers</h1>
      <hr className="diaryNoticeRule" />
      <p className="diaryNoticeBody">
        Whoever keeps this diary has closed it for now. Nothing in it is being served — not this page, not its
        galleries, and not the photographs behind them. If you were reading it, ask them to open it again.
      </p>
    </div>
  </main>
)

export default DiaryUnauthorized
/* c8 ignore stop */
