/**
 * route.ts — `GET /admin/export`: SCREENS.md §2.9's "Export everything".
 *
 * ═══ A ROUTE, NOT A SERVER ACTION ═══
 *
 * The response is a stream of bytes the browser saves, rather than a value a
 * component re-renders from. A Server Action returns to the page that called
 * it; only a route handler can answer with `Content-Disposition: attachment`.
 * So this is `guarded(handleExport)` — the route-handler half of
 * `lib/auth/guard.ts`, which answers a refusal with a 303 rather than
 * redirecting with `next/navigation` (a `redirect()` from a handler answers
 * 307 and re-posts).
 *
 * ═══ WHAT IS IN IT IS `exportEverything`'S DECISION, NOT THIS FILE'S ═══
 *
 * `lib/admin/exportEverything.ts` decides which collections go out, which are
 * withheld and why, and refuses a config declaring anything nobody has
 * classified. It carries the reasoning and the integration test; this file is
 * the guard, the headers and the filename.
 *
 * ═══ IT IS JSON, AND IT IS NOT THE PHOTOGRAPHS ═══
 *
 * The dump holds every content row, every global and a manifest of the media
 * library — each file's key, size and hash — and NOT 40GB of photographs: the
 * bucket is backed up by the bucket's own versioning (`docs/runbook.md`), and
 * a serverless function cannot stream that in a request. The document says so
 * in its own `excludes` field, so a file opened in five years explains itself.
 * `docs/deviations.md` §103 records why it is JSON rather than the ZIP the
 * brief asked for.
 *
 * `Cache-Control: private, no-store` because it is the whole diary in one
 * file, and `X-Robots-Tag: noindex` because a download is never a result to
 * index — the same two headers the gallery's download handler sets, for the
 * same two reasons.
 * Depends on: `guarded` (../../../../lib/auth/guard), `adminScope` and
 * `exportEverything` (../../../../lib/admin/…), `getPayload`
 * (../../../../lib/payload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: resolve the
 * scope, ask `exportEverything` for the document, and turn it into a
 * `Response` with four fixed headers and a dated filename. Every decision is
 * `guarded`'s (executed by `guard.integration.test.ts`) or
 * `exportEverything`'s (executed by
 * `exportEverything.integration.test.ts`, gated at 100% by
 * vitest.integration.config.ts). Neither Vitest project can execute a route
 * handler: it needs a real Next request context. This file is NOT under a
 * bracketed directory, so the hint is read. */
import { adminScope } from '../../../../lib/admin/adminScope'
import { exportEverything } from '../../../../lib/admin/exportEverything'
import { guarded } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'
import type { AuthenticatedSession } from '../../../../lib/auth/sessions'

/**
 * The filename the browser saves it as.
 *
 * DATED, because the one question anybody asks of a backup file is when it was
 * taken, and a folder of files all called `travel-diary.json` answers it for
 * none of them. The same instant is inside the document, in `takenAt`.
 * @param at - The instant the dump was taken.
 * @returns The filename.
 */
const filenameFor = (at: number): string => `travel-diary-${new Date(at).toISOString().slice(0, 10)}.json`

/**
 * Answers with the whole diary as one document.
 *
 * @param _request - The incoming request. Nothing is read from it: the export
 *   is the whole diary and takes no parameters.
 * @param session - The account the guard admitted.
 * @returns The document, as an attachment.
 */
const handleExport = async (_request: Request, session: AuthenticatedSession): Promise<Response> => {
  const at = Date.now()
  const dump = await exportEverything(await getPayload(), await adminScope(session), at)

  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameFor(at)}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}

export const GET = guarded(handleExport)
/* c8 ignore stop */
