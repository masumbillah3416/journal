/**
 * readingSurface — which of the diary's two reading surfaces a request gets.
 *
 * Pure decision function (CLAUDE.md §3.2), and the single definition of a
 * decision that is otherwise taken twice: once on the server, which must pick
 * a surface before it has ever seen the viewport, and once in the browser,
 * which has measured it. Both halves read this module, so they cannot drift
 * apart - the same shape `contentWindow.ts` uses for the `?pages=all` signal,
 * and for the same reason.
 *
 * THE DIARY HAS TWO SURFACES, NOT ONE SURFACE WITH BREAKPOINTS. SCREENS.md
 * §1.10 replaces the book below 860px: "No book, no flip, no scaling." A
 * scaled 1300x860 design box and a scrolling column are different documents,
 * not two states of one, so exactly ONE of them is rendered per request -
 * which is what keeps the mobile reader from paying for the book's markup and
 * the desktop reader from paying for the mobile mode's. See
 * `docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`.
 *
 * THE SERVER CANNOT MEASURE A VIEWPORT, so it guesses and is corrected:
 *
 *   1. what a previous correction REMEMBERED, in a cookie - a real
 *      measurement, taken by the reader's own browser, and therefore the
 *      strongest signal available to a server render;
 *   2. failing that, the user-agent's device kind, which gets a phone the
 *      mobile mode on its very first paint rather than a flash of the book;
 *   3. failing that, the book - the wider surface, and the one the LCP gate
 *      measures (`docs/adr/0008-lcp-budget-and-the-framework-floor.md`).
 *
 * The user-agent hint is a GUESS AND IS TREATED AS ONE. It is right for a
 * phone and for a desktop at a normal window size, and wrong for a desktop
 * window narrowed under 860px and for a tablet held the other way round;
 * `apps/web/components/mobile/SurfaceCorrection.tsx` measures the real
 * viewport and, only where the two disagree, writes the cookie above and asks
 * the server again. It is a guess that saves the common case a round trip,
 * never the thing that decides what a reader gets.
 *
 * THE COOKIE'S VALUE IS UNTRUSTED INPUT. A reader can write anything into it,
 * so {@link rememberedSurface} validates rather than casts (CLAUDE.md §3.1:
 * runtime validation at every trust boundary), and an unrecognised value is
 * "nothing remembered" rather than an error - the guess below it is a
 * perfectly good answer.
 *
 * IT IS A SESSION COOKIE, deliberately. What it remembers is the size of the
 * window in front of the reader right now, which is not a fact worth carrying
 * into next month; a session's length is as long as it is true for. It carries
 * no `Secure` flag because it must also be set over plain HTTP on a
 * developer's machine, and it holds no secret, no identifier and nothing
 * personal - it holds one of two literal strings, `book` or `mobile`
 * (docs/security.md).
 * Depends on nothing.
 */

/**
 * Which surface the diary draws. `'book'` is SCREENS.md §1.1-§1.7's scaled,
 * flipping book; `'mobile'` is §1.10's scrolling column.
 */
export type ReadingSurface = 'book' | 'mobile'

/**
 * The viewport width, in CSS pixels, at and above which the diary draws the
 * book. SCREENS.md §1.10 is written as "< 860px", so the breakpoint itself
 * belongs to the book - see {@link surfaceForWidth}.
 */
export const MOBILE_READING_MAX_WIDTH_PX = 860

/** The cookie a viewport measurement is remembered in - see this module's header. */
export const SURFACE_COOKIE_NAME = 'td-reading-surface'

/**
 * Which surface a measured viewport width asks for.
 *
 * @param width - The viewport's width in CSS pixels, as measured in the browser.
 * @returns The surface that width belongs to.
 * @example
 * surfaceForWidth(390) // 'mobile'
 * surfaceForWidth(860) // 'book' - the handoff's breakpoint is `< 860px`
 */
export const surfaceForWidth = (width: number): ReadingSurface =>
  width < MOBILE_READING_MAX_WIDTH_PX ? 'mobile' : 'book'

/**
 * Narrows an untrusted string to a surface.
 * @param value - Any string, or nothing.
 * @returns The surface it names, or `undefined` when it names neither.
 */
const asSurface = (value: string | undefined): ReadingSurface | undefined =>
  value === 'book' || value === 'mobile' ? value : undefined

/**
 * The device kinds a user-agent parser can report that the design draws the
 * mobile reading mode for. A tablet is included because its portrait width
 * (820px on the common ones) is under the breakpoint; a tablet held in
 * landscape is exactly the case the browser's own measurement corrects.
 */
const HANDHELD_DEVICES: readonly string[] = ['mobile', 'tablet']

/** The signals a server render has to choose a surface from. */
export interface SurfaceSignals {
  /**
   * The surface a previous correction in this reader's browser remembered,
   * from {@link rememberedSurface}. A real measurement, so it wins outright.
   */
  readonly remembered: ReadingSurface | undefined
  /**
   * The device kind a user-agent parser reported, e.g. `'mobile'`,
   * `'tablet'`, `'console'`, or nothing at all for a desktop browser.
   * Typed as a bare string because it arrives from a third-party parser at a
   * trust boundary, and is narrowed here rather than asserted.
   */
  readonly device: string | undefined
}

/**
 * Picks the surface a request is served, from the strongest signal available.
 *
 * @param signals - What a previous correction remembered, and what the
 *   user-agent suggests. See this module's header for the order and why.
 * @returns The surface to render for this request.
 * @example
 * servedReadingSurface({ remembered: undefined, device: 'mobile' }) // 'mobile'
 * servedReadingSurface({ remembered: 'mobile', device: undefined }) // 'mobile'
 * servedReadingSurface({ remembered: undefined, device: undefined }) // 'book'
 */
export const servedReadingSurface = ({ remembered, device }: SurfaceSignals): ReadingSurface => {
  if (remembered !== undefined) return remembered

  return device !== undefined && HANDHELD_DEVICES.includes(device) ? 'mobile' : 'book'
}

/**
 * Reads the remembered surface out of a `Cookie` header or a `document.cookie`
 * string - the same format, which is why one function serves both sides.
 *
 * @param header - The cookie string, or nothing when there are no cookies.
 * @returns The surface remembered there, or `undefined` when nothing valid is.
 * @example
 * rememberedSurface('a=1; td-reading-surface=mobile') // 'mobile'
 * rememberedSurface('td-reading-surface=tablet') // undefined - not a surface
 */
export const rememberedSurface = (header: string | undefined): ReadingSurface | undefined => {
  if (header === undefined) return undefined

  // Split on the separator and compare whole names: a substring search for
  // `td-reading-surface=` would also match `not-td-reading-surface=mobile`,
  // which is a different cookie.
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue
    if (pair.slice(0, separator).trim() !== SURFACE_COOKIE_NAME) continue

    return asSurface(pair.slice(separator + 1).trim())
  }

  return undefined
}

/**
 * The `document.cookie` assignment that remembers a measured surface for the
 * rest of this browsing session.
 *
 * @param surface - The surface the browser actually measured.
 * @returns The cookie string to assign to `document.cookie`.
 * @example
 * document.cookie = surfaceCookie('mobile')
 */
export const surfaceCookie = (surface: ReadingSurface): string =>
  `${SURFACE_COOKIE_NAME}=${surface}; Path=/; SameSite=Lax`
