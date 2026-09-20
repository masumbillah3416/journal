/**
 * UploadCard.test.tsx — SCREENS.md §2.4's upload card: the count, the
 * duplicate notice, and one row per file.
 *
 * WHAT PRODUCED EACH SIDE: the props here are the shape `Dropzone.tsx` builds
 * — `done` counts rows whose FINALISE has answered, `duplicates` counts the
 * `{ kind: 'duplicate' }` answers Phase 3's `finaliseUpload` really returns —
 * so a case about the notice is about an outcome the pipeline produces rather
 * than a number invented here.
 * Depends on: react, react-dom/client, vitest (jsdom), ./UploadCard.
 */
import type React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { UploadCard, duplicateNotice, type UploadProgress } from './UploadCard'

const roots: Root[] = []

/**
 * Renders the card and hands back the host element.
 * @param props - What the card is told.
 * @returns The host element.
 */
const renderCard = (props: {
  readonly done: number
  readonly total: number
  readonly duplicates: number
  readonly files: readonly UploadProgress[]
}): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<UploadCard {...props} />)
  })
  return host
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.replaceChildren()
})

describe('UploadCard', () => {
  it('draws nothing at all when no batch is in flight', () => {
    // The screen's ordinary state. An empty card with "Uploading — 0 of 0" in
    // it would be a permanent fixture claiming something is happening.
    const host = renderCard({ done: 0, total: 0, duplicates: 0, files: [] })

    expect(host.querySelector('[data-upload-card]')).toBeNull()
  })

  it('prints how many of the batch have finished, in §2.4’s own words', () => {
    const host = renderCard({
      done: 2,
      total: 34,
      duplicates: 0,
      files: [{ name: 'MARRAKECH_0118.jpg', percent: 100 }],
    })

    expect(host.querySelector('[data-upload-count]')?.textContent).toBe('Uploading — 2 of 34')
  })

  it('draws no duplicate notice when nothing was a duplicate', () => {
    const host = renderCard({ done: 1, total: 1, duplicates: 0, files: [{ name: 'a.jpg', percent: 100 }] })

    expect(host.querySelector('[data-upload-duplicates]')).toBeNull()
  })

  it('draws the duplicate notice when the pipeline reported some', () => {
    const host = renderCard({ done: 3, total: 3, duplicates: 3, files: [{ name: 'a.jpg', percent: 100 }] })

    expect(host.querySelector('[data-upload-duplicates]')?.textContent).toContain('3 look like duplicates — skipped')
  })

  it('says it in the singular for one, because a notice is a sentence', () => {
    expect(duplicateNotice(1)).toBe('1 looks like a duplicate — skipped')
    expect(duplicateNotice(2)).toBe('2 look like duplicates — skipped')
  })

  it('draws one row per file, with the client’s own filename', () => {
    const host = renderCard({
      done: 1,
      total: 2,
      duplicates: 0,
      files: [
        { name: 'MARRAKECH_0118.jpg', percent: 100 },
        { name: 'MARRAKECH_0119.mov', percent: 0 },
      ],
    })

    expect([...host.querySelectorAll('[data-upload-row]')].map((row) => row.textContent)).toEqual([
      'MARRAKECH_0118.jpg100%',
      'MARRAKECH_0119.mov0%',
    ])
  })

  it('fills the track to the percentage the row carries', () => {
    // The one inline style on this screen, and it is a measurement: no
    // stylesheet can know how far one upload has got.
    const host = renderCard({ done: 0, total: 1, duplicates: 0, files: [{ name: 'a.jpg', percent: 64 }] })
    const fill = host.querySelector('[data-upload-fill]')

    expect(fill instanceof HTMLElement ? fill.style.width : '').toBe('64%')
  })
})
