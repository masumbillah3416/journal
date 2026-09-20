/**
 * Dropzone.test.tsx — SCREENS.md §2.4's dashed zone: the floor the design
 * calls required, the note that must not promise what the pipeline refuses,
 * and the four seams one upload actually crosses.
 *
 * ═══ THE `min-width` IS READ OUT OF THE STYLESHEET ═══
 *
 * §2.4: "The `min-width` floor is required. Without it the text block absorbs
 * all shrink, the headline wraps to two lines and the zone grows to 300px
 * tall." jsdom applies no CSS module, so asserting a COMPUTED width here would
 * assert nothing; what this file can do honestly is read the declaration out
 * of `media.module.css` and require it to be there, at the value §2.4 gives.
 * The shrink itself is a visual baseline at the `mid` viewport, where it
 * happens.
 *
 * ═══ THE UPLOAD IS DRIVEN WITH STUBS OF THE TWO SERVER ACTIONS ═══
 *
 * They arrive as props (the component's own header says why), so no `'use
 * server'` module is pulled into jsdom. `fetch` is the one global replaced,
 * and it is replaced with a recorder rather than a mock of ours: what the
 * cases check is the REQUEST the component made, which is the thing
 * `uploadContract.ts` measured against a real browser.
 * Depends on: node:fs/node:path (the stylesheet read), react, react-dom/client,
 * vitest (jsdom), ./Dropzone, ./media.module.css's source.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinaliseResponse, UploadSlotResponse } from '../../../lib/media/uploadContract'
import { DROPZONE_HEADLINE, Dropzone, acceptedFormatsNote } from './Dropzone'

vi.mock('next/navigation', () => ({
  // THE FRAMEWORK BOUNDARY, not one of ours (CLAUDE.md §2.3). `router.refresh`
  // is how the grid learns an upload finished, and jsdom mounts no app router
  // for the real hook to find.
  useRouter: (): { refresh: () => void } => ({ refresh: refreshed }),
}))

/** Records that the component asked for the page again. */
let refreshed: () => void
let refreshes = 0

/** Where `media.module.css` is, for the declaration case. */
const STYLESHEET = path.join(path.dirname(fileURLToPath(import.meta.url)), 'media.module.css')

const roots: Root[] = []

/**
 * A branded journey id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aJourneyId = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** The one journey every case uploads into, in the shape `readMediaScreen` answers. */
const A_JOURNEY = [{ id: aJourneyId('7'), name: 'Kyoto' }] as const

/**
 * Renders the zone and hands back the host element.
 * @param actions - What the two Server Actions answer for this case.
 * @param accepted - What the pipeline takes. Defaults to `inline`'s two.
 * @returns The host element.
 */
const renderZone = (
  actions: {
    readonly requestSlots?: (request: { readonly journey: string }) => Promise<UploadSlotResponse>
    readonly finalise?: () => Promise<FinaliseResponse>
  } = {},
  accepted: readonly string[] = ['image/jpeg', 'image/png'],
): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <Dropzone
        journeys={[...A_JOURNEY]}
        accepted={accepted}
        requestSlots={
          actions.requestSlots ?? ((): Promise<UploadSlotResponse> => Promise.resolve({ ok: true, value: [] }))
        }
        finalise={
          actions.finalise ??
          ((): Promise<FinaliseResponse> => Promise.resolve({ ok: false, error: 'staged-bytes-missing' }))
        }
      />,
    )
  })
  return host
}

/**
 * Hands the picker one file, as a browser's own change event does.
 * @param host - The rendered host.
 * @param file - What was picked.
 */
const pick = async (host: HTMLElement, file: File): Promise<void> => {
  const input = host.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('the zone drew no file input')
  // `files` is read-only on the element, so it is defined over rather than
  // assigned — which is what a picker does from the browser's side.
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  })
}

beforeEach(() => {
  refreshes = 0
  refreshed = (): void => {
    refreshes += 1
  }
})

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('the dropzone’s shape', () => {
  it('declares the 300px min-width §2.4 calls required', () => {
    // READ OUT OF THE STYLESHEET, because jsdom applies no CSS module and a
    // computed value here would be `''` whatever the file said. §2.4's own
    // sentence is why this has a case at all.
    const declared = /\.dropzoneText\s*\{[^}]*min-width:\s*300px/.test(readFileSync(STYLESHEET, 'utf8'))

    expect(declared).toBe(true)
  })

  it('prints §2.4’s headline', () => {
    const host = renderZone()

    expect(host.querySelector('[data-dropzone-headline]')?.textContent).toBe(DROPZONE_HEADLINE)
  })

  it('names only the formats this pipeline accepts, and promises no clips it would refuse', () => {
    // THE DESIGN'S OWN SENTENCE NAMES HEIC AND TWO CLIP TYPES, and this
    // pipeline refuses all three (`ingestDecision`, ADR 0021, ADR 0004). The
    // note is built from the list the server read, so it cannot promise them.
    const host = renderZone({}, ['image/jpeg', 'image/png'])

    expect(host.querySelector('[data-dropzone-note]')?.textContent).toBe('JPEG and PNG.')
  })

  it('gains the clip sentence on the day clip types are accepted', () => {
    // The other side: one configuration change (`MEDIA_PIPELINE=worker`) and
    // the note says what §2.4 says, with nothing here edited.
    expect(acceptedFormatsNote(['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])).toBe(
      'JPEG, PNG, MP4 and MOV. Clips loop silently wherever they land — no extra step.',
    )
  })

  it('offers every journey as a destination, in §2.4’s own wording', () => {
    const host = renderZone()

    expect([...host.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Add to — Kyoto'])
  })

  it('refuses to open the picker when there is nowhere to put an upload', () => {
    // A library with no journeys. Browse would offer a file picker whose
    // result could not be staged under anything.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => {
      root.render(
        <Dropzone
          journeys={[]}
          accepted={['image/jpeg']}
          requestSlots={(): Promise<UploadSlotResponse> => Promise.resolve({ ok: true, value: [] })}
          finalise={(): Promise<FinaliseResponse> => Promise.resolve({ ok: false, error: 'staged-bytes-missing' })}
        />,
      )
    })

    const browse = host.querySelector('[data-dropzone-browse]')
    expect(browse instanceof HTMLButtonElement ? browse.disabled : false).toBe(true)
  })
})

describe('the upload one picked file drives', () => {
  it('asks for a slot with the three claims a browser can make, keyed by the chosen journey', async () => {
    const asked: {
      journey?: string
      files?: readonly { filename: string; declaredType: string; byteLength: number }[]
    } = {}
    const host = renderZone({
      requestSlots: (request): Promise<UploadSlotResponse> => {
        Object.assign(asked, request)
        return Promise.resolve({ ok: true, value: [] })
      },
    })

    await pick(host, new File([new Uint8Array([1, 2, 3])], 'tokyo.jpg', { type: 'image/jpeg' }))

    // The right side is the File this case built; the left is what the
    // component read off it.
    expect(asked.journey).toBe('7')
    expect(asked.files).toEqual([{ filename: 'tokyo.jpg', declaredType: 'image/jpeg', byteLength: 3 }])
  })

  it('PUTs the bytes to the URL the slot offered, with the method the contract measured', async () => {
    const requests: { url: string; method: string; type: string }[] = []
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      requests.push({
        url,
        method: init.method ?? '',
        type: new Headers(init.headers).get('Content-Type') ?? '',
      })
      return Promise.resolve(new Response(null, { status: 200 }))
    })

    const host = renderZone({
      requestSlots: (): Promise<UploadSlotResponse> =>
        Promise.resolve({
          ok: true,
          value: [
            {
              stagingKey: 'staging/7/abc-tokyo.jpg',
              declaredType: 'image/jpeg',
              filename: 'tokyo.jpg',
              uploadUrl: 'http://localhost/admin/media/upload?token=t',
            },
          ],
        }),
      finalise: (): Promise<FinaliseResponse> => Promise.resolve({ ok: true, value: { kind: 'ready', media: '12' } }),
    })

    await pick(host, new File([new Uint8Array([1])], 'tokyo.jpg', { type: 'image/jpeg' }))

    expect(requests).toEqual([
      { url: 'http://localhost/admin/media/upload?token=t', method: 'PUT', type: 'image/jpeg' },
    ])
  })

  it('counts a file done only once its finalise has answered, and asks for the page again', async () => {
    // THE INVARIANT THIS COMPONENT'S HEADER STATES: a staged object with no
    // finalise is exactly the orphan the sweep removes, so a card that called
    // a finished PUT "done" would be telling the author their photograph is in
    // the library when it is not.
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 200 })))
    const host = renderZone({
      requestSlots: (): Promise<UploadSlotResponse> =>
        Promise.resolve({
          ok: true,
          value: [
            {
              stagingKey: 'staging/7/abc-tokyo.jpg',
              declaredType: 'image/jpeg',
              filename: 'tokyo.jpg',
              uploadUrl: 'http://localhost/put',
            },
          ],
        }),
      finalise: (): Promise<FinaliseResponse> => Promise.resolve({ ok: true, value: { kind: 'ready', media: '12' } }),
    })

    await pick(host, new File([new Uint8Array([1])], 'tokyo.jpg', { type: 'image/jpeg' }))

    expect(host.querySelector('[data-upload-count]')?.textContent).toBe('Uploading — 1 of 1')
    expect(host.querySelector('[data-upload-state]')?.textContent).toBe('100%')
    expect(refreshes).toBe(1)
  })

  it('counts a duplicate the pipeline reported, and leaves it out of the percentages', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 200 })))
    const host = renderZone({
      requestSlots: (): Promise<UploadSlotResponse> =>
        Promise.resolve({
          ok: true,
          value: [
            {
              stagingKey: 'staging/7/abc-tokyo.jpg',
              declaredType: 'image/jpeg',
              filename: 'tokyo.jpg',
              uploadUrl: 'http://localhost/put',
            },
          ],
        }),
      finalise: (): Promise<FinaliseResponse> => Promise.resolve({ ok: true, value: { kind: 'duplicate', of: '9' } }),
    })

    await pick(host, new File([new Uint8Array([1])], 'tokyo.jpg', { type: 'image/jpeg' }))

    expect(host.querySelector('[data-upload-duplicates]')?.textContent).toContain('1 looks like a duplicate')
  })

  it('draws the whole batch as refused when the slot request was refused, because it is refused whole', async () => {
    // `planUploadSlots`'s own invariant: one bad file refuses the request, so
    // there is no partial success for this card to misreport.
    const host = renderZone({
      requestSlots: (): Promise<UploadSlotResponse> => Promise.resolve({ ok: false, error: 'too-large' }),
    })

    await pick(host, new File([new Uint8Array([1])], 'tokyo.jpg', { type: 'image/jpeg' }))

    expect(host.querySelector('[data-upload-row]')?.textContent).toContain('too-large')
  })

  it('does not finalise a PUT the store refused', async () => {
    // A staged key with no bytes finalises to `staged-bytes-missing`, and
    // asking is a round trip for an answer the component already has.
    let finalised = 0
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 403 })))
    const host = renderZone({
      requestSlots: (): Promise<UploadSlotResponse> =>
        Promise.resolve({
          ok: true,
          value: [
            {
              stagingKey: 'staging/7/abc-tokyo.jpg',
              declaredType: 'image/jpeg',
              filename: 'tokyo.jpg',
              uploadUrl: 'http://localhost/put',
            },
          ],
        }),
      finalise: (): Promise<FinaliseResponse> => {
        finalised += 1
        return Promise.resolve({ ok: true, value: { kind: 'ready', media: '12' } })
      },
    })

    await pick(host, new File([new Uint8Array([1])], 'tokyo.jpg', { type: 'image/jpeg' }))

    expect(finalised).toBe(0)
  })
})
