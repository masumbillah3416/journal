'use client'
/**
 * SurfaceCorrection — corrects a served reading surface the viewport disagrees
 * with, once, and then gets out of the way.
 *
 * THE PIECE THAT MAKES A SERVER-SIDE SURFACE CHOICE SAFE. The diary renders
 * exactly one of its two surfaces per request, so that neither reader pays for
 * the other's markup or script (`docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`).
 * The server picks from a user-agent hint, which is right for a phone and for
 * a desktop at a normal window size and wrong for a desktop window narrowed
 * under 860px and for a tablet held the other way round. This component is
 * what makes those last two cases correct rather than merely unlucky: it
 * measures the real viewport, and where the measurement and the served surface
 * disagree it remembers the measurement and asks the server again.
 *
 * IT RENDERS NOTHING, deliberately. Neither surface should have to know that
 * the other exists, and a hook called from inside both would have put this
 * logic - and `useViewportSurface`'s listeners - into `Book.tsx` as well. As
 * a sibling of whichever surface is drawn, it is one small client component
 * the route mounts beside either.
 *
 * A COOKIE AND `router.refresh()`, NOT A SEARCH PARAMETER. `?pages=all` was
 * the right mechanism for the content window because that request is made once
 * per reading session and the book then takes the parameter back off the
 * address (ADR 0009). A surface is different: it has to survive every
 * subsequent `/p/<n>` navigation, or a corrected reader would flash the wrong
 * surface on every page they turn. A parameter would therefore have to be
 * threaded onto every link on the mobile surface AND merged into
 * `useRestOfBook`'s query, and any place that forgot would silently swap the
 * reader's surface mid-read. A cookie is read by the server on every request
 * with nothing threaded anywhere. It holds one of two literal strings and
 * nothing else - see `readingSurface.ts`'s header and docs/security.md.
 *
 * IT CANNOT LOOP, and the guard is a readback rather than a counter. If the
 * cookie does not stick - a reader with cookies blocked - the server would
 * answer the refresh with the same surface, this component would measure the
 * same disagreement, and it would refresh again forever. So the cookie is read
 * back immediately after it is written, and a write that did not take means
 * the reader stays on the surface they were served. That is a worse surface
 * for that reader, and an endless reload is worse than a worse surface.
 *
 * Once the cookie is in place the effect is a no-op: the server serves what
 * was remembered, the measurement agrees with it, and the only thing left
 * running is the measurement itself - which is what makes a reader who rotates
 * a tablet or drags a window across the breakpoint land on the right surface.
 * Depends on: react, next/navigation, `surfaceCookie`/`rememberedSurface`/
 * `ReadingSurface` (@travel-diary/domain/readingSurface), ./useViewportSurface.
 */
import { rememberedSurface, surfaceCookie, type ReadingSurface } from '@travel-diary/domain/readingSurface'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useViewportSurface } from './useViewportSurface'

/** What the correction needs to know. */
export interface SurfaceCorrectionProps {
  /** The surface this document was rendered for, from `servedReadingSurface` on the server. */
  readonly served: ReadingSurface
}

/**
 * Measures the viewport and, where it disagrees with the served surface,
 * remembers the measurement and re-renders the route on the server.
 *
 * @param props - The surface the server chose for this document.
 * @returns `null` - it draws nothing.
 * @example
 * <SurfaceCorrection served="book" />
 */
export const SurfaceCorrection = ({ served }: SurfaceCorrectionProps): null => {
  const router = useRouter()
  const measured = useViewportSurface(served)

  useEffect(() => {
    if (measured === served) return

    document.cookie = surfaceCookie(measured)
    // See this file's header: a write that did not take would otherwise
    // refresh forever.
    if (rememberedSurface(document.cookie) !== measured) return

    router.refresh()
  }, [measured, served, router])

  return null
}
