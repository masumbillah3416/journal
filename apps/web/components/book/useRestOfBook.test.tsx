/**
 * useRestOfBook.test.tsx — the one request that completes a windowed book.
 *
 * Three decisions, and each has a way of going wrong that costs something
 * real: asking when the document is already whole is a pointless round trip
 * on every short book; asking twice is two; and asking before the caller
 * does puts 28,998 bytes and twenty-nine faces' worth of layout back into
 * the page's own load, which is most of what windowing the document saved
 * (measured; see the hook's header).
 *
 * `next/navigation` is stubbed, not mocked-what-we-own (CLAUDE.md §2.3): it
 * is the App Router, whose `useRouter` throws outside a mounted router rather
 * than reporting that there is none. What is asserted is the call this hook
 * makes to it, which is the whole of the hook's observable behaviour - and
 * `'/p/12?pages=all'` is asserted in full rather than loosely, because WHICH
 * url is asked for is the decision that keeps the book mounted.
 * Depends on: react, react-dom/client, vitest (jsdom).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRestOfBook } from './useRestOfBook'

const replace = vi.fn<(url: string, options: { readonly scroll: boolean }) => void>()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: (url: string, options: { readonly scroll: boolean }): void => {
      replace(url, options)
    },
  }),
  usePathname: () => '/p/12',
}))

const roots: Root[] = []

/** The request the last-rendered probe handed back, so a test can make it. */
let ask: (() => void) | null = null

/** Mounts the hook inside a component, the way `Book` holds it. */
const Probe = ({ complete }: { readonly complete: boolean }): null => {
  ask = useRestOfBook(complete)
  return null
}

/** Makes the request the hook handed back, asserted present so no test needs a non-null assertion. */
const askForTheRestOfTheBook = (): void => {
  if (ask === null) throw new Error('the hook handed back no request')
  act(ask)
}

/**
 * Renders the probe and hands back a re-render, so a test can let the answer
 * arrive the way the router delivers it - as a new `complete` on the same
 * mounted hook.
 * @param complete - Whether the document already holds the whole book.
 * @returns A function that re-renders the probe with a new value.
 */
const mountProbe = (complete: boolean): ((next: boolean) => void) => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  const render = (value: boolean): void => {
    act(() => {
      root.render(<Probe complete={value} />)
    })
  }
  render(complete)
  return render
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  ask = null
  document.body.innerHTML = ''
  replace.mockClear()
})

describe('useRestOfBook', () => {
  it('asks for nothing at all until it is called', () => {
    // Mounting must not fetch: the reader who arrives on a deep link and
    // reads the page they came for pays for the window and nothing else.
    mountProbe(false)

    expect(replace).not.toHaveBeenCalled()
  })

  it('asks the server for the rest of the book when it is called', () => {
    mountProbe(false)

    askForTheRestOfTheBook()

    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('asks on the path it is already on, so the book is not unmounted to answer it', () => {
    // A navigation to a different `/p/<n>` re-keys the route segment and
    // throws the flip state away (measured; see this hook's header). Only the
    // query may change.
    mountProbe(false)

    askForTheRestOfTheBook()

    expect(replace).toHaveBeenCalledWith('/p/12?pages=all', { scroll: false })
  })

  it('asks for nothing when the document already carries the whole book', () => {
    // A book short enough to fit inside the window is already complete, and
    // a request for its remainder would be a round trip that returns what
    // the reader is already looking at.
    mountProbe(true)

    askForTheRestOfTheBook()

    expect(replace).not.toHaveBeenCalled()
  })

  it('asks exactly once, however many pages the reader goes on to turn', () => {
    mountProbe(false)

    askForTheRestOfTheBook()
    askForTheRestOfTheBook()
    askForTheRestOfTheBook()

    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('does not ask again once the answer has arrived', () => {
    const render = mountProbe(false)
    askForTheRestOfTheBook()

    render(true)
    askForTheRestOfTheBook()

    expect(replace).toHaveBeenCalledTimes(1)
  })
})
