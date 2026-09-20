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

/** How many rows these cases have minted an id for. Never read as a position. */
let mintedRows = 0

/**
 * One row the card draws, with an id of its own.
 *
 * THE ID IS MINTED, NOT DERIVED FROM THE NAME: `Dropzone.tsx` mints one per
 * file when the batch is built, because two files in one drop can share a
 * filename (CLAUDE.md §0.9). A fixture keying the id off the name would encode
 * a shape the zone never produces.
 * @param row - The name, and whatever else this case cares about.
 * @returns The row.
 * @example
 * aRow({ name: 'a.jpg', percent: 0 })
 */
const aRow = (row: { readonly name: string; readonly percent?: number; readonly refusal?: string }): UploadProgress => {
  mintedRows += 1
  return { id: `row-${String(mintedRows)}`, percent: 100, refusal: null, ...row }
}

/**
 * Renders the card and hands back the host element.
 * @param props - What the card is told.
 * @returns The host element.
 */
const renderCard = (props: {
  readonly done: number
  readonly total: number
  readonly stored: number
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
    const host = renderCard({ done: 0, total: 0, stored: 0, duplicates: 0, files: [] })

    expect(host.querySelector('[data-upload-card]')).toBeNull()
  })

  it('prints how many of the batch have finished, in §2.4’s own words', () => {
    const host = renderCard({
      done: 2,
      total: 34,
      stored: 2,
      duplicates: 0,
      files: [aRow({ name: 'MARRAKECH_0118.jpg', percent: 100 })],
    })

    expect(host.querySelector('[data-upload-count]')?.textContent).toBe('Uploading — 2 of 34')
  })

  it('stops saying the batch is uploading once every file has settled', () => {
    // MEDIA-001: the card kept reading "Uploading — 1 of 1" with the batch
    // finished, so the screen said an upload was in progress when none was.
    // The number changes with the verb: while files are in flight it counts
    // what has SETTLED, and once they have it counts what became a row.
    const host = renderCard({
      done: 2,
      total: 2,
      stored: 2,
      duplicates: 0,
      files: [aRow({ name: 'a.jpg', percent: 100 }), aRow({ name: 'b.jpg', percent: 100 })],
    })

    expect(host.querySelector('[data-upload-count]')?.textContent).toBe('Uploaded — 2 of 2')
  })

  it('still says the batch is uploading while one file is in flight', () => {
    // The other side, so the case above pins a transition rather than a word.
    const host = renderCard({
      done: 1,
      total: 2,
      stored: 1,
      duplicates: 0,
      files: [aRow({ name: 'a.jpg', percent: 100 }), aRow({ name: 'b.jpg', percent: 0 })],
    })

    expect(host.querySelector('[data-upload-count]')?.textContent).toBe('Uploading — 1 of 2')
  })

  it('counts what became a photograph, not what finished, once the batch has settled', () => {
    // A duplicate's bytes went up and no row came of it. A finished card that
    // counted settled files would say "Uploaded — 1 of 1" beside a notice
    // saying the one file was skipped.
    const host = renderCard({
      done: 1,
      total: 1,
      stored: 0,
      duplicates: 1,
      files: [aRow({ name: 'a.jpg', percent: 100 })],
    })

    expect(host.querySelector('[data-upload-count]')?.textContent).toBe('Uploaded — 0 of 1')
  })

  it('draws no duplicate notice when nothing was a duplicate', () => {
    const host = renderCard({
      done: 1,
      total: 1,
      stored: 1,
      duplicates: 0,
      files: [aRow({ name: 'a.jpg', percent: 100 })],
    })

    expect(host.querySelector('[data-upload-duplicates]')).toBeNull()
  })

  it('draws the duplicate notice when the pipeline reported some', () => {
    const host = renderCard({
      done: 3,
      total: 3,
      stored: 0,
      duplicates: 3,
      files: [aRow({ name: 'a.jpg', percent: 100 })],
    })

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
      stored: 1,
      duplicates: 0,
      files: [aRow({ name: 'MARRAKECH_0118.jpg', percent: 100 }), aRow({ name: 'MARRAKECH_0119.mov', percent: 0 })],
    })

    expect([...host.querySelectorAll('[data-upload-row]')].map((row) => row.textContent)).toEqual([
      'MARRAKECH_0118.jpg100%',
      'MARRAKECH_0119.mov0%',
    ])
  })

  it('fills the track to the percentage the row carries', () => {
    // The one inline style on this screen, and it is a measurement: no
    // stylesheet can know how far one upload has got.
    const host = renderCard({
      done: 0,
      total: 1,
      stored: 0,
      duplicates: 0,
      files: [aRow({ name: 'a.jpg', percent: 64 })],
    })
    const fill = host.querySelector('[data-upload-fill]')

    expect(fill instanceof HTMLElement ? fill.style.width : '').toBe('64%')
  })
})
