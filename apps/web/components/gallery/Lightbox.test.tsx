/**
 * Lightbox.test.tsx — the open frame, and the four things a modal owes a
 * reader.
 *
 * TWO CASES HERE ARE THE POINT OF THE FILE, and both are defects the handoff
 * or SECURITY.md recorded rather than behaviours somebody thought of:
 *
 *   1. `keeps the same photograph open when the collection is reordered`.
 *      README's State section and DATA_MODEL's notes both describe the
 *      original: "`picked` was a positional index into the gallery; once
 *      'sort by date' reordered the list, the selected-frame panel showed a
 *      different photo than the grid highlighted." The case reorders the
 *      frames under an OPEN lightbox and requires the image to be unchanged
 *      and the counter to have moved - which is the only combination an index
 *      cannot produce.
 *   2. `downloads through a handler of ours rather than from the store`.
 *      SECURITY.md: "the gallery's download action must serve a derivative
 *      through your own handler, not a bucket URL. Direct URLs invite
 *      enumeration of everything in the bucket, including anything marked
 *      hidden." The prototype's own markup (`Travel Diary.dc.html`, the
 *      `lbSrc` binding) is a bare `<a href="{{ lbSrc }}" download>` onto the
 *      image itself, so this is a deliberate departure from it.
 *
 * The rest is what makes it a modal rather than a panel: Escape closes,
 * arrows step, focus is trapped while it is open, and the dialog announces
 * itself. `e2e/a11y.spec.ts` runs axe over the open lightbox with no
 * exclusions; these cases are what stop that from being the first place a
 * missing role is noticed.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import type { GalleryFrame, GalleryJourney } from '@travel-diary/domain/gallery'
import type { MediaId } from '@travel-diary/domain/ids'
import { aGalleryBundle, aGalleryFrame } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Lightbox } from './Lightbox'

const roots: Root[] = []

/** The seeded Tokyo journey, as the lightbox's metadata line prints it. */
const journey = (): GalleryJourney => aGalleryBundle().journey

/** Three frames, in the order the grid first showed them. */
const threeFrames = (): readonly GalleryFrame[] => [
  aGalleryFrame('doorway'),
  aGalleryFrame('market'),
  aGalleryFrame('ferry'),
]

/** What one render of the lightbox is given. */
interface RenderOptions {
  readonly frames?: readonly GalleryFrame[]
  readonly openId?: string
  readonly onOpen?: (id: MediaId) => void
  readonly onClose?: () => void
}

/**
 * Renders the lightbox into a host element and hands back a re-render
 * function, so a case can change the collection under an open frame.
 * @param options - The frames, the open id, and the two callbacks.
 * @returns The host element and a `rerender` that keeps the same React root.
 */
const renderLightbox = (
  options: RenderOptions = {},
): { readonly host: HTMLElement; readonly rerender: (next: RenderOptions) => void } => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)

  const draw = (current: RenderOptions): void => {
    act(() => {
      root.render(
        <Lightbox
          journey={journey()}
          frames={current.frames ?? threeFrames()}
          openId={(current.openId ?? 'market') as MediaId}
          onOpen={current.onOpen ?? (() => undefined)}
          onClose={current.onClose ?? (() => undefined)}
        />,
      )
    })
  }

  draw(options)
  return { host, rerender: (next) => { draw({ ...options, ...next }) } }
}

/** Presses a key on the document, the way a reader with no pointer would. */
const press = (key: string): void => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** Clicks an element addressed by one of the lightbox's own handles. */
const click = (host: HTMLElement, handle: string): void => {
  act(() => {
    host.querySelector(`[${handle}]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('Lightbox', () => {
  it('announces itself as a modal dialog', () => {
    const { host } = renderLightbox()
    const dialog = host.querySelector('[data-lightbox]')

    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
  })

  it('counts the open frame the way SCREENS.md §1.9 prints it', () => {
    const { host } = renderLightbox({ frames: threeFrames(), openId: 'ferry' })

    expect(host.querySelector('[data-counter]')?.textContent).toBe('003 / 003')
  })

  it('draws the full-size derivative, not the tile', () => {
    const { host } = renderLightbox()

    expect(host.querySelector('[data-lightbox-image]')?.getAttribute('src')).toBe(aGalleryFrame('market').fullSrc)
  })

  it('prints the open frame’s caption', () => {
    const { host } = renderLightbox()

    expect(host.querySelector('[data-lightbox-caption]')?.textContent).toBe('A market in the rain')
  })

  it('prints the journey, the place and the frame number under the caption', () => {
    const { host } = renderLightbox()

    expect(host.querySelector('[data-lightbox-meta]')?.textContent).toBe('Tokyo · Japan · frame 002')
  })

  it('keeps the same photograph open when the collection is reordered', () => {
    // The handoff's defect, at the level a reader would meet it.
    const asShot = threeFrames()
    const { host, rerender } = renderLightbox({ frames: asShot, openId: 'market' })
    const before = host.querySelector('[data-lightbox-image]')?.getAttribute('src')

    rerender({ frames: [...asShot].reverse() })

    expect(host.querySelector('[data-lightbox-image]')?.getAttribute('src')).toBe(before)
  })

  it('follows the reordered collection with its counter, so the grid and the modal agree', () => {
    const asShot = threeFrames()
    const { host, rerender } = renderLightbox({ frames: asShot, openId: 'doorway' })
    expect(host.querySelector('[data-counter]')?.textContent).toBe('001 / 003')

    rerender({ frames: [...asShot].reverse() })

    expect(host.querySelector('[data-counter]')?.textContent).toBe('003 / 003')
  })

  it('steps to the next frame’s id when the reader presses the right arrow', () => {
    const opened = vi.fn()
    renderLightbox({ openId: 'doorway', onOpen: opened })

    press('ArrowRight')

    expect(opened).toHaveBeenCalledWith('market')
  })

  it('steps to the previous frame’s id when the reader presses the left arrow', () => {
    const opened = vi.fn()
    renderLightbox({ openId: 'ferry', onOpen: opened })

    press('ArrowLeft')

    expect(opened).toHaveBeenCalledWith('market')
  })

  it('closes when the reader presses Escape', () => {
    const closed = vi.fn()
    renderLightbox({ onClose: closed })

    press('Escape')

    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('closes when the reader clicks the close control', () => {
    const closed = vi.fn()
    const { host } = renderLightbox({ onClose: closed })

    click(host, 'data-lightbox-close')

    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('steps forward when the reader clicks the next control', () => {
    const opened = vi.fn()
    const { host } = renderLightbox({ openId: 'doorway', onOpen: opened })

    click(host, 'data-lightbox-next')

    expect(opened).toHaveBeenCalledWith('market')
  })

  it('spends the previous control on the first frame rather than wrapping to the last', () => {
    const { host } = renderLightbox({ openId: 'doorway' })

    expect(host.querySelector('[data-lightbox-prev]')?.hasAttribute('disabled')).toBe(true)
  })

  it('spends the next control on the last frame', () => {
    const { host } = renderLightbox({ openId: 'ferry' })

    expect(host.querySelector('[data-lightbox-next]')?.hasAttribute('disabled')).toBe(true)
  })

  it('ignores an arrow press with nowhere to go, rather than closing or throwing', () => {
    const opened = vi.fn()
    renderLightbox({ openId: 'ferry', onOpen: opened })

    press('ArrowRight')

    expect(opened).not.toHaveBeenCalled()
  })

  it('downloads through a handler of ours rather than from the store', () => {
    const { host } = renderLightbox()
    const href = host.querySelector('[data-lightbox-download]')?.getAttribute('href')

    expect(href).toBe('/gallery/tokyo/download/market')
    expect(href).not.toMatch(/^[a-z][a-z0-9+.-]*:/i)
    expect(href).not.toContain('/api/media/file/')
  })

  it('asks the browser to save rather than to navigate', () => {
    const { host } = renderLightbox()

    expect(host.querySelector('[data-lightbox-download]')?.hasAttribute('download')).toBe(true)
  })

  it('offers no download for a frame the editor has withheld one for', () => {
    const withheld = [aGalleryFrame('market', { downloadable: false })]
    const { host } = renderLightbox({ frames: withheld, openId: 'market' })

    expect(host.querySelector('[data-lightbox-download]')).toBeNull()
  })

  it('moves focus into the dialog when it opens, so a keyboard reader is inside it', () => {
    const { host } = renderLightbox()

    expect(host.querySelector('[data-lightbox-close]')).toBe(document.activeElement)
  })

  it('wraps focus from the last control back to the first, rather than out of the dialog', () => {
    const { host } = renderLightbox()
    const controls = [...host.querySelectorAll<HTMLElement>('button, a[href]')]
    const last = controls.at(-1)
    last?.focus()

    act(() => {
      last?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })

    expect(document.activeElement).toBe(controls[0])
  })

  it('wraps focus backward from the first control to the last', () => {
    const { host } = renderLightbox()
    const controls = [...host.querySelectorAll<HTMLElement>('button, a[href]')]
    controls[0]?.focus()

    act(() => {
      controls[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    })

    expect(document.activeElement).toBe(controls.at(-1))
  })

  it('renders nothing at all for an id the gallery no longer holds', () => {
    const { host } = renderLightbox({ openId: 'deleted' })

    expect(host.querySelector('[data-lightbox]')).toBeNull()
  })
})

describe('Lightbox sharing', () => {
  /** Replaces `navigator.share`/`navigator.clipboard` for one case. */
  const withNavigator = (patch: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(patch)) {
      Object.defineProperty(navigator, key, { configurable: true, writable: true, value })
    }
  }

  afterEach(() => {
    withNavigator({ share: undefined, clipboard: undefined })
  })

  it('hands the frame’s own address to the platform share sheet when there is one', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve())
    withNavigator({ share })
    const { host } = renderLightbox()

    click(host, 'data-lightbox-share')
    await act(async () => {
      await Promise.resolve()
    })

    // Read off the call rather than matched with `expect.objectContaining`:
    // the asymmetric matchers are typed `any`, which CLAUDE.md §3.1 bans.
    expect(share.mock.calls[0]?.[0].url).toContain('#frame-market')
  })

  it('copies the address instead when the platform has no share sheet', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve())
    withNavigator({ share: undefined, clipboard: { writeText } })
    const { host } = renderLightbox()

    click(host, 'data-lightbox-share')
    await act(async () => {
      await Promise.resolve()
    })

    expect(writeText.mock.calls[0]?.[0]).toContain('#frame-market')
  })

  it('confirms a copy with a toast, since a clipboard write is otherwise invisible', async () => {
    withNavigator({ share: undefined, clipboard: { writeText: () => Promise.resolve() } })
    const { host } = renderLightbox()

    click(host, 'data-lightbox-share')
    await act(async () => {
      await Promise.resolve()
    })

    expect(host.querySelector('[data-toast]')?.textContent).toBe('Link copied')
  })

  it('announces the toast politely, so a screen reader hears the confirmation too', async () => {
    withNavigator({ share: undefined, clipboard: { writeText: () => Promise.resolve() } })
    const { host } = renderLightbox()

    click(host, 'data-lightbox-share')
    await act(async () => {
      await Promise.resolve()
    })

    expect(host.querySelector('[data-toast]')?.getAttribute('role')).toBe('status')
  })

  it('takes the toast away again rather than leaving it over the photograph', async () => {
    withNavigator({ share: undefined, clipboard: { writeText: () => Promise.resolve() } })
    const { host } = renderLightbox()

    click(host, 'data-lightbox-share')
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(3_000)
    })

    expect(host.querySelector('[data-toast]')).toBeNull()
  })

  it('says so rather than staying silent when neither route is available', async () => {
    withNavigator({ share: undefined, clipboard: undefined })
    const { host } = renderLightbox()

    click(host, 'data-lightbox-share')
    await act(async () => {
      await Promise.resolve()
    })

    expect(host.querySelector('[data-toast]')?.textContent).toBe('Copy the address from the bar')
  })

  it('says so rather than staying silent when the share sheet is dismissed or fails', async () => {
    withNavigator({ share: () => Promise.reject(new Error('dismissed')) })
    const { host } = renderLightbox()

    click(host, 'data-lightbox-share')
    await act(async () => {
      await Promise.resolve()
    })

    expect(host.querySelector('[data-toast]')?.textContent).toBe('Copy the address from the bar')
  })
})
