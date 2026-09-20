/**
 * BookmarkOrder.test.tsx — SCREENS.md §2.6's bookmark list, and the properties
 * a screenshot of it cannot check.
 *
 * ═══ WHAT EACH ARROW POSTS, NOT ONLY THAT IT EXISTS ═══
 *
 * The arrows carry the WHOLE new order in hidden fields, so the case that
 * matters reads those fields out of the DOM React produced and compares them
 * against the order the domain's own `moveBookmark` answers for the same move.
 * A button that rendered and posted the order the book already had would look
 * identical in a photograph and would be a `POST` that did nothing.
 *
 * ═══ THE DISABLED ARROWS ARE TWO DIFFERENT RULES, AND BOTH ARE HERE ═══
 *
 * A fixed row refuses to move (SCREENS.md §2.6), and every arrow is off while
 * the book is sorted by date (`docs/deviations.md` §84). They are different
 * causes with the same appearance, so each has its own case.
 *
 * WHAT THIS FILE DOES NOT PROVE: the 66px page cell, the 9px square's rotation
 * and the 26px buttons are declared in `book.module.css` and jsdom performs no
 * layout, so nothing here measures them. They are pinned by declaration and by
 * the browser suites.
 *
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/admin/bookmarkOrder, ./BookmarkOrder.
 */
import { moveBookmark } from '@travel-diary/domain/admin/bookmarkOrder'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookScreenView } from '../../../lib/admin/readBookScreen'
import { BookmarkOrder } from './BookmarkOrder'

const roots: Root[] = []

/**
 * A book of three journeys, in the shape `readBookScreen` answers.
 *
 * THREE, so a swap is not the identity and so the middle journey has a journey
 * on both sides of it — the one row for which both arrows are live.
 */
const ROWS: BookScreenView['rows'] = [
  { id: 'cover', kind: 'cover', name: 'Cover', place: 'the front', tint: '#8a7a5f', pageNumber: 1 },
  { id: 'contents', kind: 'contents', name: 'Contents', place: 'index', tint: '#8a7a5f', pageNumber: 2 },
  { id: '7', kind: 'journey', name: 'Tokyo', place: 'Japan', tint: '#3d817e', pageNumber: 3 },
  { id: '4', kind: 'journey', name: 'Lisbon', place: 'Portugal', tint: '#a06b3e', pageNumber: 6 },
  { id: '11', kind: 'journey', name: 'Bergen', place: 'Norway', tint: '#5a72a8', pageNumber: 9 },
  { id: 'about', kind: 'about', name: 'About', place: 'colophon', tint: '#8a7a5f', pageNumber: 12 },
]

/**
 * Renders the list and hands back the host element.
 * @param arrangeable - Whether the arrows are live.
 * @returns The host element.
 */
const renderList = (arrangeable = true): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<BookmarkOrder rows={ROWS} arrangeable={arrangeable} setOrder={vi.fn()} />)
  })
  return host
}

/**
 * The hidden `journey` fields one arrow would post.
 * @param host - The rendered list.
 * @param id - The row.
 * @param direction - Which arrow.
 * @returns The ids, in document order.
 */
const posted = (host: HTMLElement, id: string, direction: 'up' | 'down'): readonly (string | null)[] => {
  const button = host.querySelector(`[data-bookmark-row="${id}"] [data-bookmark-move="${direction}"]`)
  const form = button?.closest('form')
  return [...(form?.querySelectorAll('input[name="journey"]') ?? [])].map((input) => input.getAttribute('value'))
}

/**
 * Whether one arrow is disabled.
 * @param host - The rendered list.
 * @param id - The row.
 * @param direction - Which arrow.
 * @returns True when the button refuses a press.
 */
const isOff = (host: HTMLElement, id: string, direction: 'up' | 'down'): boolean =>
  host.querySelector(`[data-bookmark-row="${id}"] [data-bookmark-move="${direction}"]`)?.hasAttribute('disabled') ??
  false

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ''
})

describe('BookmarkOrder', () => {
  it('draws one row per page-group of the book, fixed rows included', () => {
    const host = renderList()

    expect(host.querySelectorAll('[data-bookmark-row]')).toHaveLength(ROWS.length)
  })

  it('prints the derived page beside every row, rather than a number of its own', () => {
    const host = renderList()

    expect(
      [...host.querySelectorAll('[data-bookmark-row]')].map((row) => /p\. (\d+)/u.exec(row.textContent)?.[1]),
    ).toEqual(ROWS.map((row) => String(row.pageNumber)))
  })

  it('paints each row’s square in that row’s own tint', () => {
    const host = renderList()
    // READ OFF THE CUSTOM PROPERTY, which is what the component sets: a
    // `background` written as a hex colour comes back out of jsdom as
    // `rgb(...)`, so a case comparing the string it passed in would have been a
    // check that could never pass.
    const squares = [...host.querySelectorAll('[data-bookmark-row]')].map(
      (row) => row.querySelector('span[style]')?.getAttribute('style') ?? '',
    )

    expect(squares).toEqual(ROWS.map((row) => `--td-bookmark-tint: ${row.tint};`))
  })

  it('posts the whole new order the domain answers for a move, not only the row that moved', () => {
    // BOTH SIDES OF THIS COMPARISON ARE COMPUTED, and the right-hand one is the
    // domain's own rule rather than a list written in this file — so no edit
    // here can satisfy it, and a markup change that dropped a hidden field
    // fails.
    const host = renderList()

    expect(posted(host, '4', 'up')).toEqual(
      moveBookmark(ROWS, '4', 'up')
        .filter((row) => row.kind === 'journey')
        .map((row) => row.id),
    )
  })

  it('offers both arrows on a journey with a journey on each side of it', () => {
    const host = renderList()

    expect([isOff(host, '4', 'up'), isOff(host, '4', 'down')]).toEqual([false, false])
  })

  it('refuses to move the cover, which is fixed', () => {
    const host = renderList()

    expect([isOff(host, 'cover', 'up'), isOff(host, 'cover', 'down')]).toEqual([true, true])
  })

  it('refuses to move the first journey up, because Contents is above it', () => {
    const host = renderList()

    expect(isOff(host, '7', 'up')).toBe(true)
  })

  it('refuses to move the last journey down, because About is below it', () => {
    // THE OTHER END OF THE SAME RULE. An implementation that guarded only the
    // row above passes every upward case there is.
    const host = renderList()

    expect(isOff(host, '11', 'down')).toBe(true)
  })

  it('turns every arrow off while the book is sorted by date, and says why', () => {
    const host = renderList(false)
    const live = [...host.querySelectorAll('[data-bookmark-move]')].filter((button) => !button.hasAttribute('disabled'))

    expect({ live: live.length, note: host.querySelector('[data-arrange-locked]') !== null }).toEqual({
      live: 0,
      note: true,
    })
  })

  it('draws no locked note while the book is arranged by hand', () => {
    const host = renderList()

    expect(host.querySelector('[data-arrange-locked]')).toBeNull()
  })

  it('gives every arrow an accessible name that says which row it moves', () => {
    // Twelve buttons that all read "↑" are twelve unlabelled buttons to a
    // screen reader, and axe cannot tell two identical names apart.
    const host = renderList()
    const names = [...host.querySelectorAll('[data-bookmark-move]')].map(
      (button) => button.getAttribute('aria-label') ?? '',
    )

    expect({ total: names.length, distinct: new Set(names).size }).toEqual({
      total: ROWS.length * 2,
      distinct: ROWS.length * 2,
    })
  })
})
