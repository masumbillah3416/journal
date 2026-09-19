/**
 * EditorGrid.test.tsx — the one structural fact SCREENS.md §2.3's layout rests
 * on: the element that changes shape is INSIDE the element that is measured.
 *
 * ═══ WHY THIS IS A CASE AND NOT A PARAGRAPH ═══
 *
 * EDITOR-003 had two causes and only one of them got a case in the round that
 * fixed it. The other — `container-type` on the grid itself, so no rung ever
 * fired — was the one the commit message called "the half that was doing all
 * the damage", and the exact revert that caused it passed every case in
 * `editorGrid.test.tsx` and left `npm run verify:full` green. A stylesheet
 * header explaining the rule at length is not a guard.
 *
 * So: the stylesheet's half is pinned in `editorGrid.test.tsx` (the measured
 * selector never appears inside a rung), and the markup's half is here.
 *
 * Depends on: react, react-dom/client, vitest (jsdom), ./EditorGrid.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { EditorGrid } from './EditorGrid'

const roots: Root[] = []

/**
 * Renders the frame around three marked children.
 * @returns The host element.
 */
const renderGrid = (): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <EditorGrid>
        <div data-column="rail" />
        <div data-column="pane" />
        <div data-column="pool" />
      </EditorGrid>,
    )
  })
  return host
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ''
})

describe('EditorGrid', () => {
  it('puts the shaped element inside the measured one, never on it', () => {
    // THE WHOLE POINT. An element is not matched by its own container query, so
    // a flatten — one `<section>` holding the three columns — or a merge of the
    // two classes onto one element takes every rung out of play at every width,
    // silently, exactly as EDITOR-003 shipped.
    const host = renderGrid()

    const measured = host.querySelector('[data-journey-editor]')
    const shaped = host.querySelector('[data-editor-grid]')
    expect(measured).not.toBeNull()
    expect(shaped).not.toBeNull()
    expect(shaped).not.toBe(measured)
    expect(measured?.contains(shaped ?? null)).toBe(true)
  })

  it('gives the two elements different classes, so one cannot carry both roles', () => {
    // The other way to reintroduce it: keep two elements in the JSX and put
    // `styles.screen` and `styles.grid` on the same one.
    const host = renderGrid()

    const measured = host.querySelector('[data-journey-editor]')?.className ?? ''
    const shaped = host.querySelector('[data-editor-grid]')?.className ?? ''
    expect(measured).not.toBe('')
    expect(shaped).not.toBe('')
    expect(measured).not.toBe(shaped)
  })

  it('puts every column inside the shaped element, not beside it', () => {
    // A child left outside the grid takes no track and lands under it — which
    // is what the pool did before the two elements existed.
    const host = renderGrid()

    const columns = [...host.querySelectorAll('[data-column]')]
    expect(columns).toHaveLength(3)
    expect(columns.every((column) => column.parentElement?.hasAttribute('data-editor-grid') === true)).toBe(true)
  })
})
