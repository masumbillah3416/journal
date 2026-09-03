/**
 * useTurnKeys.test.tsx — the keyboard's four page-turn keys, and the three
 * situations in which the book must keep its hands off them.
 *
 * The four bindings are the handoff's own (README, "Triggers":
 * ArrowLeft/ArrowRight, PageUp/PageDown). The refusals matter as much as the
 * bindings and are the reason this hook exists rather than an inline listener:
 * a window-level `keydown` handler that does not check where the key came
 * from will eat a reader's arrow keys inside a search box, and one that calls
 * `preventDefault` unconditionally will break every browser shortcut and
 * every scroll the page did not intend to claim.
 * Depends on: react, react-dom/client, vitest (jsdom environment via the
 * `unit-dom` project, whose setup file sets IS_REACT_ACT_ENVIRONMENT).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTurnKeys, type TurnKeyHandlers } from './useTurnKeys'

const roots: Root[] = []

/** A component with no markup, whose only job is to install the hook's listener. */
const Probe = ({ handlers }: { readonly handlers: TurnKeyHandlers }): null => {
  useTurnKeys(handlers)
  return null
}

/** What each test observes: which way the book was asked to turn, and whether the browser kept the key. */
interface KeyOutcome {
  readonly forward: number
  readonly backward: number
  readonly defaultPrevented: boolean
}

/** Mounts the hook, dispatches one `keydown`, and reports what it did. */
const pressKey = (
  key: string,
  options: { readonly on?: HTMLElement; readonly modifier?: 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' } = {},
): KeyOutcome => {
  let forward = 0
  let backward = 0

  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <Probe
        handlers={{
          onForward: () => {
            forward += 1
          },
          onBackward: () => {
            backward += 1
          },
        }}
      />,
    )
  })

  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...(options.modifier === undefined ? {} : { [options.modifier]: true }),
  })
  act(() => {
    ;(options.on ?? document.body).dispatchEvent(event)
  })

  return { forward, backward, defaultPrevented: event.defaultPrevented }
}

/** A focusable element the reader could be typing into, attached to the document so events bubble. */
const aTypingTarget = (build: () => HTMLElement): HTMLElement => {
  const element = build()
  document.body.appendChild(element)
  return element
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('useTurnKeys', () => {
  it('turns the page forward on ArrowRight', () => {
    expect(pressKey('ArrowRight')).toMatchObject({ forward: 1, backward: 0 })
  })

  it('turns the page back on ArrowLeft', () => {
    expect(pressKey('ArrowLeft')).toMatchObject({ forward: 0, backward: 1 })
  })

  it('turns the page forward on PageDown', () => {
    expect(pressKey('PageDown')).toMatchObject({ forward: 1, backward: 0 })
  })

  it('turns the page back on PageUp', () => {
    expect(pressKey('PageUp')).toMatchObject({ forward: 0, backward: 1 })
  })

  it('stops the browser scrolling as well as turning, on a key it acts on', () => {
    expect(pressKey('PageDown').defaultPrevented).toBe(true)
  })

  it('leaves a key it does not bind entirely to the browser', () => {
    expect(pressKey('Home')).toEqual({ forward: 0, backward: 0, defaultPrevented: false })
  })

  it('leaves the arrow keys to a reader typing in a text field', () => {
    const field = aTypingTarget(() => document.createElement('input'))

    expect(pressKey('ArrowRight', { on: field })).toEqual({ forward: 0, backward: 0, defaultPrevented: false })
  })

  it('leaves the arrow keys to a reader typing in a multi-line field', () => {
    const field = aTypingTarget(() => document.createElement('textarea'))

    expect(pressKey('ArrowLeft', { on: field })).toEqual({ forward: 0, backward: 0, defaultPrevented: false })
  })

  it('leaves the arrow keys to a reader inside a rich-text region', () => {
    const region = aTypingTarget(() => {
      const element = document.createElement('div')
      // The attribute, not the `contentEditable` property: jsdom implements
      // neither that property nor `isContentEditable`, so a test written
      // through the property would pass against a hook that checks nothing.
      element.setAttribute('contenteditable', 'true')
      return element
    })

    expect(pressKey('ArrowRight', { on: region })).toEqual({ forward: 0, backward: 0, defaultPrevented: false })
  })

  it('leaves the arrow keys to a reader typing inside a rich-text region, not only at its root', () => {
    const region = aTypingTarget(() => {
      const element = document.createElement('div')
      element.setAttribute('contenteditable', 'true')
      element.innerHTML = '<span>a caption being edited</span>'
      return element
    })
    const inner = region.querySelector('span')
    if (inner === null) throw new Error('the rich-text region rendered nothing to type inside')

    expect(pressKey('ArrowRight', { on: inner })).toEqual({ forward: 0, backward: 0, defaultPrevented: false })
  })

  it('turns the page for a reader beside a region explicitly marked NOT editable', () => {
    const region = aTypingTarget(() => {
      const element = document.createElement('div')
      element.setAttribute('contenteditable', 'false')
      return element
    })

    expect(pressKey('ArrowRight', { on: region })).toMatchObject({ forward: 1 })
  })

  it('leaves a key the reader is choosing an option with to its select', () => {
    const field = aTypingTarget(() => document.createElement('select'))

    expect(pressKey('ArrowRight', { on: field })).toEqual({ forward: 0, backward: 0, defaultPrevented: false })
  })

  it('leaves a modified key to the browser, since a shortcut is never a page turn', () => {
    expect(pressKey('ArrowRight', { modifier: 'ctrlKey' })).toEqual({
      forward: 0,
      backward: 0,
      defaultPrevented: false,
    })
  })

  it('leaves a platform-modified key to the operating system', () => {
    expect(pressKey('ArrowLeft', { modifier: 'metaKey' })).toEqual({
      forward: 0,
      backward: 0,
      defaultPrevented: false,
    })
  })

  it('leaves an alt-modified key to the browser, which reads it as history navigation', () => {
    expect(pressKey('ArrowLeft', { modifier: 'altKey' })).toEqual({
      forward: 0,
      backward: 0,
      defaultPrevented: false,
    })
  })

  it('leaves a shift-modified key alone, since that is a selection gesture', () => {
    expect(pressKey('PageDown', { modifier: 'shiftKey' })).toEqual({
      forward: 0,
      backward: 0,
      defaultPrevented: false,
    })
  })

  it('turns the page when the reader has focus on a control that is not a text field', () => {
    // The bookmark tabs and the bottom arrows are buttons; a reader who has
    // just clicked one must still be able to turn with the keyboard.
    const button = aTypingTarget(() => document.createElement('button'))

    expect(pressKey('ArrowRight', { on: button })).toMatchObject({ forward: 1 })
  })

  it('stops listening once the book unmounts', () => {
    let forward = 0
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        <Probe
          handlers={{
            onForward: () => {
              forward += 1
            },
            onBackward: () => undefined,
          }}
        />,
      )
    })

    act(() => {
      root.unmount()
    })
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })

    expect(forward).toBe(0)
  })
})
