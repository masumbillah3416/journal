/**
 * coverMutations.integration.test.ts — behaviour spec for SCREENS.md §2.7's two
 * writes.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's. Whether a global write merges, whether an `email` column takes an
 * empty string, whether an array field REPLACES rather than appends, and
 * whether the About page a reader opens then prints what was saved, are answers
 * only a real Payload and a real database give.
 *
 * ═══ THE RESULT IS READ BACK THROUGH THE DIARY'S OWN READER ═══
 *
 * `readBookBundle` is what `/p/<n>` renders from, and it is what these cases
 * read. A test that `findGlobal`'d the column back would agree with itself
 * about a value the About page might narrow differently — `textLines` drops
 * every blank row on the way out, which is the whole reason a blank paragraph
 * can be stored at all.
 *
 * ═══ THIS FILE WRITES SHARED GLOBALS, SO IT PUTS THEM BACK ═══
 *
 * `book` and `about` are one row each for the whole database, and
 * `readBookBundle.integration.test.ts` asserts both against their seeds. Every
 * case here restores what it wrote, in `beforeAll` as well as `afterEach`, so
 * that a deliberate mutation run leaves the database as it found it too
 * (standing orders §9).
 *
 * Depends on: vitest, payload (types), zod (the refusal cases), `readBookBundle`
 * (../readBookBundle), `getTestPayload` (../testPayload), `seed`/the two global
 * seeds (../../scripts/…), `adminScope` and this module.
 */
import { userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { seed } from '../../scripts/seed'
import { aboutGlobalSeed, bookGlobalSeed } from '../../scripts/seed-data'
import { readBookBundle } from '../readBookBundle'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import {
  ABOUT_PARAGRAPHS,
  MAX_KIT_LINES,
  readAbout,
  saveAbout,
  saveCover,
  type AboutFields,
  type CoverFields,
} from './coverMutations'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-cover-mutations'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/** `seed()` rasterises ninety-plus placeholders on a cold database. */
const SETUP_TIMEOUT_MS = 180_000

let payload: Payload
let scope: AdminScope
/** The media row the `about` global pointed at before this file ran. */
let portraitBefore: number | null = null

/**
 * A branded account id for a row id.
 * @param raw - The id as a session would spell it.
 * @returns The branded id.
 */
const anAccount = (raw: string): UserId => {
  const built = userId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** Removes every row this file has ever written. */
const clean = async (): Promise<void> => {
  await payload.delete({ collection: 'media', where: { alt: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/**
 * Both globals exactly as `seed()` leaves them.
 *
 * RUN BEFORE AS WELL AS AFTER: a mutation run leaves whatever the mutated write
 * put there, and the next honest run would then fail on a column nothing in it
 * touched.
 * @returns Nothing.
 */
const restoreGlobals = async (): Promise<void> => {
  await payload.updateGlobal({
    slug: 'book',
    data: {
      title: bookGlobalSeed.title,
      subtitle: bookGlobalSeed.subtitle,
      owner: bookGlobalSeed.owner,
      yearsShown: bookGlobalSeed.yearsShown,
      coverCloth: bookGlobalSeed.coverCloth,
    },
  })
  await payload.updateGlobal({
    slug: 'about',
    data: {
      paragraphs: aboutGlobalSeed.paragraphs.map((text) => ({ text })),
      kit: aboutGlobalSeed.kit.map((text) => ({ text })),
      replyTo: aboutGlobalSeed.replyTo,
      portraitCaption: aboutGlobalSeed.portraitCaption,
      ...(portraitBefore === null ? {} : { portrait: portraitBefore }),
    },
  })
}

/**
 * The cover the seeded book has, as §2.7's card would post it.
 * @param overrides - What this case is changing.
 * @returns A complete cover payload.
 */
const theCover = (overrides: Partial<CoverFields> = {}): CoverFields => ({
  title: bookGlobalSeed.title,
  subtitle: bookGlobalSeed.subtitle,
  owner: bookGlobalSeed.owner,
  yearsShown: bookGlobalSeed.yearsShown,
  coverCloth: bookGlobalSeed.coverCloth,
  ...overrides,
})

/**
 * The About card the seeded global has, as §2.7's card would post it.
 * @param overrides - What this case is changing.
 * @returns A complete About payload.
 */
const theAbout = (overrides: Partial<AboutFields> = {}): AboutFields => ({
  paragraphs: [...aboutGlobalSeed.paragraphs],
  kit: [...aboutGlobalSeed.kit],
  replyTo: aboutGlobalSeed.replyTo,
  portrait: '',
  ...overrides,
})

/**
 * A ready media row this file can point a portrait at.
 * @param label - What distinguishes this row.
 * @returns The media row's id.
 */
const aPhotograph = async (label: string): Promise<number> => {
  const png = await sharp({ create: { width: 900, height: 900, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .png()
    .toBuffer()
  const created = await payload.create({
    collection: 'media',
    ...scope,
    data: { alt: `${MARKER} ${label}`, state: 'ready', kind: 'still' },
    file: { data: png, mimetype: 'image/png', name: `${MARKER}-${label}.png`, size: png.length },
  })
  return created.id
}

beforeAll(async () => {
  payload = await getTestPayload()
  await seed(payload)
  await clean()
  const account = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
  })
  scope = await adminScope({ user: anAccount(String(account.id)) })

  const about = await payload.findGlobal({ slug: 'about', ...scope, depth: 0, select: { portrait: true } })
  portraitBefore = typeof about.portrait === 'number' ? about.portrait : (about.portrait?.id ?? null)
  await restoreGlobals()
}, SETUP_TIMEOUT_MS)

afterAll(async () => {
  await restoreGlobals()
  await clean()
})

describe('saveCover', () => {
  afterEach(restoreGlobals)

  it('prints the title the cover screen saved, on the diary’s own cover', async () => {
    await saveCover(payload, scope, theCover({ title: 'Long Way Round the Houses' }))

    const bundle = await readBookBundle()

    expect(bundle.chrome.title).toBe('Long Way Round the Houses')
  })

  it('leaves the contents note alone, because §2.6 owns that column and this write merges', async () => {
    await saveCover(payload, scope, theCover({ owner: 'Somebody Else' }))

    const bundle = await readBookBundle()

    expect({ owner: bundle.chrome.owner, note: bundle.chrome.contentsNote }).toEqual({
      owner: 'Somebody Else',
      note: bookGlobalSeed.contentsNote,
    })
  })

  it('takes the cloth the four swatches offer', async () => {
    await saveCover(payload, scope, theCover({ coverCloth: '#5c4a2b' }))

    expect((await readBookBundle()).chrome.coverCloth).toBe('#5c4a2b')
  })

  it('refuses a cloth that is not a colour, because the value is interpolated into CSS', async () => {
    await expect(saveCover(payload, scope, theCover({ coverCloth: 'teal' }))).rejects.toThrow(ZodError)
  })

  it('stores a cleared title rather than refusing it, because none of these columns is required', async () => {
    await saveCover(payload, scope, theCover({ title: '', subtitle: '', owner: '', yearsShown: '' }))

    const bundle = await readBookBundle()

    expect(bundle.chrome).toMatchObject({ title: '', subtitle: '', owner: '', yearsShown: '' })
  })
})

describe('saveAbout', () => {
  afterEach(restoreGlobals)

  it('prints the paragraphs the about card saved, on the diary’s own About page', async () => {
    await saveAbout(payload, scope, theAbout({ paragraphs: ['first thoughts', 'second thoughts'] }))

    expect((await readBookBundle()).about.paragraphs).toEqual(['first thoughts', 'second thoughts'])
  })

  it('replaces the kit list rather than appending to it', async () => {
    // AN ARRAY FIELD IS THE ONE SHAPE WHERE "MERGE" WOULD BE WRONG. The card
    // draws the whole list and posts the whole list, so a write that appended
    // would double it on every save — and the About page would print each line
    // twice with nothing failing.
    await saveAbout(payload, scope, theAbout({ kit: ['one thing'] }))

    expect((await readBookBundle()).about.kit).toEqual(['one thing'])
  })

  it('keeps the portrait when the select posted nothing, because that save was about the prose', async () => {
    const before = (await readBookBundle()).about.portrait

    await saveAbout(payload, scope, theAbout({ replyTo: 'someone@example.test' }))

    const after = (await readBookBundle()).about
    expect({ src: after.portrait?.src, replyTo: after.replyTo }).toEqual({
      src: before?.src,
      replyTo: 'someone@example.test',
    })
  })

  it('replaces the portrait with the media row the select named', async () => {
    const chosen = await aPhotograph('replacement')

    await saveAbout(payload, scope, theAbout({ portrait: String(chosen) }))

    const after = await payload.findGlobal({ slug: 'about', ...scope, depth: 0, select: { portrait: true } })
    expect(typeof after.portrait === 'number' ? after.portrait : after.portrait?.id).toBe(chosen)
  })

  it('drops a blank kit line rather than storing one, which is what makes the trailing input an "add"', () => {
    const form = new FormData()
    form.append('paragraph', 'one')
    form.append('paragraph', 'two')
    form.append('kit', 'a notebook')
    form.append('kit', '   ')
    form.append('kit', '')
    form.append('replyTo', 'hello@example.test')
    form.append('portrait', '')

    expect(readAbout(form)).toEqual({
      paragraphs: ['one', 'two'],
      kit: ['a notebook'],
      replyTo: 'hello@example.test',
      portrait: '',
    })
  })

  it('drops a field that arrived as a file rather than treating it as a value', () => {
    // A `FormData` entry is a string OR a `File`, and this card's own `<form>`
    // sends only strings — so this is the shape a crafted `POST` sends, and the
    // one where "read the value" and "read a filename" differ. The kit entry
    // disappears; the portrait reads as "leave it alone" rather than as an id.
    const form = new FormData()
    form.append('paragraph', 'one')
    form.append('paragraph', 'two')
    form.append('kit', new File(['bytes'], 'not-a-line.txt'))
    form.append('kit', 'a notebook')
    form.append('replyTo', 'hello@example.test')
    form.append('portrait', new File(['bytes'], 'not-an-id.png'))

    expect(readAbout(form)).toEqual({
      paragraphs: ['one', 'two'],
      kit: ['a notebook'],
      replyTo: 'hello@example.test',
      portrait: '',
    })
  })

  it('keeps a cleared paragraph as a row, so the second box does not slide into the first', async () => {
    await saveAbout(payload, scope, theAbout({ paragraphs: ['', 'still here'] }))

    const stored = await payload.findGlobal({ slug: 'about', ...scope, depth: 0, select: { paragraphs: true } })

    expect({
      rows: stored.paragraphs?.length,
      printed: (await readBookBundle()).about.paragraphs,
    }).toEqual({ rows: ABOUT_PARAGRAPHS, printed: ['still here'] })
  })

  it('clears the reply-to address when the field is emptied, rather than refusing an empty email', async () => {
    await saveAbout(payload, scope, theAbout({ replyTo: '' }))

    expect((await readBookBundle()).about.replyTo).toBe('')
  })

  it('refuses a reply-to that is not an address', async () => {
    await expect(saveAbout(payload, scope, theAbout({ replyTo: 'not an address' }))).rejects.toThrow(ZodError)
  })

  it('refuses a portrait that is not a row id, rather than asking Postgres about NaN', async () => {
    await expect(saveAbout(payload, scope, theAbout({ portrait: 'nonsense' }))).rejects.toThrow(ZodError)
  })

  it('refuses a body with fewer paragraph boxes than the card draws', async () => {
    await expect(
      saveAbout(payload, scope, theAbout({ paragraphs: Array.from({ length: ABOUT_PARAGRAPHS - 1 }, () => 'x') })),
    ).rejects.toThrow(ZodError)
  })

  it('refuses a body with more paragraph boxes than the card draws', async () => {
    await expect(
      saveAbout(payload, scope, theAbout({ paragraphs: Array.from({ length: ABOUT_PARAGRAPHS + 1 }, () => 'x') })),
    ).rejects.toThrow(ZodError)
  })

  it('accepts a kit list exactly as long as the cap', async () => {
    const full = Array.from({ length: MAX_KIT_LINES }, (_, index) => `line ${String(index)}`)

    await saveAbout(payload, scope, theAbout({ kit: full }))

    expect((await readBookBundle()).about.kit).toEqual(full)
  })

  it('refuses the first kit list longer than the cap', async () => {
    const past = Array.from({ length: MAX_KIT_LINES + 1 }, (_, index) => `line ${String(index)}`)

    await expect(saveAbout(payload, scope, theAbout({ kit: past }))).rejects.toThrow(ZodError)
  })
})
