/**
 * SurfaceCorrection.test.tsx — the correction that makes a server-side surface
 * guess safe.
 *
 * Four behaviours, and the last one is the reason this component is written
 * the way it is: a served surface the viewport agrees with is left alone; a
 * served surface it disagrees with is remembered in the cookie and re-asked
 * for; the cookie is written in the form `rememberedSurface` reads back on the
 * server; and a cookie that does not stick does NOT loop the reader through an
 * endless refresh.
 *
 * `next/navigation` is STOOD IN FOR, not mocked-what-we-own (CLAUDE.md §2.3):
 * it is the App Router, whose `useRouter` throws outside a mounted router
 * rather than returning something inert - the same treatment
 * `useRestOfBook.test.tsx` records for the same import.
 * Depends on: react, react-dom/client, vitest (jsdom environment).
 */
import { rememberedSurface, SURFACE_COOKIE_NAME, type ReadingSurface } from '@travel-diary/domain/readingSurface'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SurfaceCorrection } from './SurfaceCorrection'

/** How many times the component asked the server to render this route again. */
let refreshes = 0

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: (): void => {
      refreshes += 1
    },
  }),
}))

const roots: Root[] = []

const mountCorrection = (served: ReadingSurface): void => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(<SurfaceCorrection served={served} />)
  })
}

const widthIs = (width: number): void => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
}

/** The cookie jar this document is pretending to have. */
let jar = ''

/** Replaces `document.cookie` with a jar that either keeps writes or drops them. */
const cookiesAre = ({ accepted }: { readonly accepted: boolean }): void => {
  jar = ''
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => jar,
    set: (value: string) => {
      if (!accepted) return
      jar = value.split(';')[0] ?? ''
    },
  })
}

beforeEach(() => {
  refreshes = 0
  cookiesAre({ accepted: true })
})

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  widthIs(1024)
  document.body.innerHTML = ''
})

describe('SurfaceCorrection', () => {
  it('leaves a correctly-served reader alone, with no cookie and no round trip', () => {
    widthIs(1440)

    mountCorrection('book')

    expect({ refreshes, cookie: document.cookie }).toEqual({ refreshes: 0, cookie: '' })
  })

  it('leaves a correctly-served phone alone too', () => {
    widthIs(390)

    mountCorrection('mobile')

    expect({ refreshes, cookie: document.cookie }).toEqual({ refreshes: 0, cookie: '' })
  })

  it('remembers the measurement and asks the server again when a narrowed window was served the book', () => {
    widthIs(700)

    mountCorrection('book')

    expect({ refreshes, remembered: rememberedSurface(document.cookie) }).toEqual({
      refreshes: 1,
      remembered: 'mobile',
    })
  })

  it('corrects the other way for a tablet held in landscape', () => {
    widthIs(1180)

    mountCorrection('mobile')

    expect({ refreshes, remembered: rememberedSurface(document.cookie) }).toEqual({
      refreshes: 1,
      remembered: 'book',
    })
  })

  it('writes a cookie the server can actually read back', () => {
    widthIs(700)

    mountCorrection('book')

    expect(document.cookie.startsWith(`${SURFACE_COOKIE_NAME}=mobile`)).toBe(true)
  })

  it('leaves a reader whose cookies are blocked on the surface they were served, rather than reloading forever', () => {
    // Without the readback guard this is an infinite loop: the write is
    // dropped, the server answers with the same surface, and the measurement
    // disagrees again.
    cookiesAre({ accepted: false })
    widthIs(700)

    mountCorrection('book')

    expect(refreshes).toBe(0)
  })

  it('asks once, not once per render, when nothing about the disagreement changes', () => {
    widthIs(700)

    mountCorrection('book')
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(refreshes).toBe(1)
  })

  it('draws nothing at all', () => {
    widthIs(1440)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)

    act(() => {
      root.render(<SurfaceCorrection served="book" />)
    })

    expect(container.innerHTML).toBe('')
  })
})
