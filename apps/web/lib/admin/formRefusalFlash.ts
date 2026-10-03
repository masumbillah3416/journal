/**
 * formRefusalFlash — the one-shot carrier a refused Server Action leaves for
 * the render that follows it.
 *
 * `./formRefusal.ts` holds the shape and the reasoning; this is the half that
 * touches the request, and it is a module of its own so the pure half can be
 * imported by a client island.
 *
 * ═══ A COOKIE THE BROWSER IS TOLD TO DISCARD ═══
 *
 * `maxAge: 0` is the mechanism rather than a detail. Measured in Chromium
 * against this app, with JavaScript on and off:
 *
 *   - the value set here is readable by the page AND by a layout above it, in
 *     the same request, because a render reads the request-scoped store and
 *     not the browser's jar;
 *   - the browser stores nothing, so the next request carries no refusal and
 *     no later screen can draw a stale one.
 *
 * THERE IS THEREFORE NOTHING TO CLEAR, which is the property a 30-second
 * expiry or a nonce in the query would both have had to buy back.
 *
 * PATTERNS (CLAUDE.md §3.3). Repository, narrowly: one named thing is written
 * and read through two functions, and the storage it uses is not the caller's
 * business.
 *
 * INVARIANT — a refusal written here is readable exactly once, by the render
 * of the request that wrote it.
 *
 * Depends on: `cookies` (next/headers), zod, `FormRefusal` (./formRefusal).
 */
import { cookies } from 'next/headers'
import { z } from 'zod'
import type { FormRefusal } from './formRefusal'

/**
 * The shape read back out of the cookie.
 *
 * PARSED, NOT TRUSTED, ALTHOUGH THIS PROCESS WROTE IT. `maxAge: 0` stops a
 * BROWSER sending the value back; it stops nothing hand-building a request
 * with a `td-form-refusal` header of its own, and what that value says is
 * printed on an admin screen. CLAUDE.md §3.1's boundary is the string, not its
 * provenance.
 */
const STORED = z.object({
  refused: z.array(z.object({ field: z.string(), message: z.string() })),
  kept: z.record(z.string(), z.array(z.string())),
})

/**
 * `JSON.parse` that answers `null` rather than throwing.
 *
 * @param stored - The cookie's value.
 * @returns Whatever it held, or `null`.
 */
const parseJson = (stored: string): unknown => {
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

/**
 * Parses a stored refusal.
 *
 * Exported so the carrier's shape is pinned by a case that needs no request —
 * and so a malformed value draws nothing rather than throwing inside a render.
 * @param stored - The cookie's value.
 * @returns The refusal, or `null` when the value is not one.
 * @example
 * readRefusal('{"refused":[],"kept":{}}')
 */
export const readRefusal = (stored: string): FormRefusal | null => {
  const parsed = STORED.safeParse(parseJson(stored))
  return parsed.success ? parsed.data : null
}

/**
 * The cookie the refusal travels in.
 *
 * Prefixed like every other cookie this repository sets, so an operator
 * reading a request can tell this one from Payload's and Next's.
 */
export const REFUSAL_COOKIE = 'td-form-refusal'

/**
 * Hands a refusal to the render that follows this Server Action.
 *
 * @param refusal - What the screen is to draw.
 * @returns Nothing.
 * @example
 * await handOffRefusal(refusalFrom(error, form))
 */
export const handOffRefusal = async (refusal: FormRefusal): Promise<void> => {
  const jar = await cookies()
  jar.set(REFUSAL_COOKIE, JSON.stringify(refusal), { path: '/admin', httpOnly: true, sameSite: 'lax', maxAge: 0 })
}

/**
 * The refusal this request's action left behind, if it left one.
 *
 * @returns The refusal, or `null` when the post was not refused — and `null`
 *   rather than a throw for a value that is not one, because a malformed
 *   cookie must not be the thing that breaks a screen.
 * @example
 * <RefusalNotice refusal={await refusalForThisRender()} />
 */
export const refusalForThisRender = async (): Promise<FormRefusal | null> => {
  const stored = (await cookies()).get(REFUSAL_COOKIE)?.value
  if (stored === undefined || stored === '') return null

  return readRefusal(stored)
}
