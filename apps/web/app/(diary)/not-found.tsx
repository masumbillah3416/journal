/**
 * not-found.tsx — what the diary serves for an address that names no page.
 *
 * Next's own convention: this file renders, under `(diary)/layout.tsx`, for
 * any `notFound()` thrown inside this route group, and the response carries
 * HTTP 404 rather than 200. That status is the point of the file, not a side
 * effect of it — `/p/999` used to be answered with page 33 at status 200
 * (`pageAddress.ts` clamped, and said Task 13 would decide otherwise), which
 * told a crawler that thirty-three synonyms for the last page were all real
 * pages, and told a reader that the link they followed had worked.
 *
 * IT IS NOT A BOOK. The design has no 404 screen, so this one borrows the
 * design's surface — desk gradient, paper card, hairline, the three type
 * families — and invents no new furniture (CLAUDE.md §4). What it must have
 * is a way back in, because a reader who lands here has nothing else: the
 * one link goes to `/p/1`, the address of the Cover, written through
 * `pagePath` rather than as a literal so it cannot drift from the route it
 * names.
 *
 * ITS STYLES ARE IN `diary.css`, NOT IN A CSS MODULE OF ITS OWN, which is
 * PH1-005's fix rather than a filing preference. This file is a sibling slot
 * of `children` in the group's layout tree, so Next collected a CSS module
 * imported here as part of the SEGMENT's stylesheets and preloaded it in the
 * head of every `/p/<n>` - a stylesheet a page that is found never uses, which
 * Chrome logged a warning for on every cold load. `diary.css` is loaded on
 * every route of this group already, so folding the rules in leaves no second
 * chunk to preload and nothing to warn about; that file's own bottom block
 * carries the full reasoning and the `notFound` class-name prefix.
 *
 * `<main>` and the `<h1>` are load-bearing rather than decorative. axe's
 * `landmark-one-main` and `page-has-heading-one` are asserted on this route
 * with no exclusions at all (`e2e/routing.spec.ts`), which is the same bar
 * every diary route is held to and one the `/cms` case has to be excused
 * from.
 * Depends on: `pagePath` (@travel-diary/domain/pageAddress), and the
 * `notFound*` classes in ./diary.css (loaded by ./layout.tsx).
 */
/* c8 ignore start -- A Next.js convention file: it is never imported by any
 * test in either Vitest config (rendering one needs a real Next request and
 * render context, and no integration pass can supply one), so a per-file c8
 * ignore is CLAUDE.md §2.1's honest treatment for a file nothing can
 * measure - not exclude-and-regate, which would promise a pass that does not
 * exist. It holds no branch of its own: the only value on it is `pagePath(0)`,
 * which has its own 100%-covered suite. Its runtime behaviour, including its
 * 404 status and its axe result, is covered in the browser by
 * e2e/routing.spec.ts. Wraps the imports too, not just the export: an
 * unimported file's imports are themselves uncovered lines. */
import { pagePath } from '@travel-diary/domain/pageAddress'
import type React from 'react'

/** The address of the Cover — where a reader with a bad address is sent. */
const COVER = pagePath(0)

/** Renders the diary's page-not-found view. */
const DiaryNotFound = (): React.JSX.Element => (
  <main className="notFoundStage">
    <div className="notFoundCard">
      <p className="notFoundEyebrow">No such page</p>
      <h1 className="notFoundTitle">This page isn’t in the book</h1>
      <hr className="notFoundRule" />
      <p className="notFoundBody">
        The address you followed doesn’t name a page of this diary. It may have been a typo, or the page may have been
        taken out since the link was made.
      </p>
      <a className="notFoundBack" href={COVER}>
        Open the diary
      </a>
    </div>
  </main>
)

export default DiaryNotFound
/* c8 ignore stop */
