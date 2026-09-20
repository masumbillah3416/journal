/**
 * readCoverScreen.integration.test.ts — behaviour spec for SCREENS.md §2.7's read.
 *
 * Integration test (CLAUDE.md §2): the questions here are Payload's. Whether a
 * `depth: 0` upload relationship comes back as a number or a document, whether
 * a `thumb` derivative exists for an upload smaller than the tier, what a
 * cleared array field reads as, and whether a portrait older than the choice
 * cap is still found, are answers only a real Payload and a real database give.
 *
 * ═══ THE PORTRAIT OUTSIDE THE CAP IS THE CASE THIS FILE EXISTS FOR ═══
 *
 * The first draft read the portrait and the choice list in ONE capped query
 * with an `or`, which looks right and is not: the cap applies to the whole
 * result, so a portrait older than the newest sixty photographs fell off the
 * end of its own clause and the 140px mount drew empty. The case below builds
 * exactly that library.
 *
 * ═══ THIS FILE WRITES SHARED GLOBALS, SO IT PUTS THEM BACK ═══
 *
 * `book` and `about` are one row each for the whole database (standing orders
 * §9). Restored in `beforeAll` as well as `afterEach`, so a mutation run leaves
 * the database as it found it.
 *
 * Depends on: vitest, payload (types), sharp (the fixtures' bytes),
 * `fitPreviewTitleSize` (@travel-diary/domain/coverTitle), `getTestPayload`
 * (../testPayload), `seed`/the two seeds (../../scripts/…), `adminScope`,
 * `ABOUT_PARAGRAPHS` (./coverMutations) and this module.
 */
import { fitPreviewTitleSize } from '@travel-diary/domain/coverTitle'
import { userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../../scripts/seed'
import { aboutGlobalSeed, bookGlobalSeed } from '../../scripts/seed-data'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { ABOUT_PARAGRAPHS } from './coverMutations'
import { MAX_PORTRAIT_CHOICES, readCoverScreen } from './readCoverScreen'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-read-cover-screen'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/** `seed()` rasterises ninety-plus placeholders on a cold database. */
const SETUP_TIMEOUT_MS = 180_000

/** Uploading sixty-one photographs through `sharp` is not a two-second fixture. */
const CAP_CASE_TIMEOUT_MS = 300_000

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
      ...(portraitBefore === null ? {} : { portrait: portraitBefore }),
    },
  })
}

/**
 * A ready photograph this file can point a portrait at.
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

afterEach(restoreGlobals)

describe('readCoverScreen — the cover card', () => {
  it('reads back the four fields and the cloth the book holds', async () => {
    const view = await readCoverScreen(payload, scope)

    expect(view.cover).toMatchObject({
      title: bookGlobalSeed.title,
      subtitle: bookGlobalSeed.subtitle,
      owner: bookGlobalSeed.owner,
      yearsShown: bookGlobalSeed.yearsShown,
      coverCloth: bookGlobalSeed.coverCloth,
    })
  })

  it('sizes the preview’s title with the diary’s own fitter rather than at a fixed size', async () => {
    const view = await readCoverScreen(payload, scope)

    expect(view.cover.titleSizePx).toBe(fitPreviewTitleSize(bookGlobalSeed.title))
  })

  it('shrinks the preview’s title for a title long enough to need it', async () => {
    // THE PROPERTY, not the agreement: a long title comes back SMALLER than a
    // short one, which is what makes the preview worth looking at. jsdom cannot
    // assert this and neither can a screenshot threshold.
    const longTitle = 'Every Doorway I Have Ever Photographed'
    await payload.updateGlobal({ slug: 'book', ...scope, data: { title: longTitle } })
    const long = await readCoverScreen(payload, scope)

    await payload.updateGlobal({ slug: 'book', ...scope, data: { title: 'Rio' } })
    const short = await readCoverScreen(payload, scope)

    expect(long.cover.titleSizePx).toBeLessThan(short.cover.titleSizePx)
  })

  it('degrades every cleared cover field rather than failing the screen', async () => {
    await payload.updateGlobal({
      slug: 'book',
      data: { title: null, subtitle: null, owner: null, yearsShown: null, coverCloth: null },
    })

    const view = await readCoverScreen(payload, scope)

    expect(view.cover).toEqual({
      title: '',
      subtitle: '',
      owner: '',
      yearsShown: '',
      coverCloth: '',
      titleSizePx: fitPreviewTitleSize(''),
    })
  })
})

describe('readCoverScreen — the about card', () => {
  it('reads back the paragraphs, the kit and the address the global holds', async () => {
    const view = await readCoverScreen(payload, scope)

    expect({ paragraphs: view.about.paragraphs, kit: view.about.kit, replyTo: view.about.replyTo }).toEqual({
      paragraphs: [...aboutGlobalSeed.paragraphs],
      kit: [...aboutGlobalSeed.kit],
      replyTo: aboutGlobalSeed.replyTo,
    })
  })

  it('draws as many paragraph boxes as the card has, for a global holding fewer', async () => {
    // A SAVE THAT POSTS FEWER BOXES IS REFUSED by `coverMutations.ts`'s parse,
    // so a read that answered fewer would make the card unsavable.
    await payload.updateGlobal({ slug: 'about', ...scope, data: { paragraphs: [{ text: 'only one' }] } })

    const view = await readCoverScreen(payload, scope)

    expect(view.about.paragraphs).toEqual(['only one', ...Array.from({ length: ABOUT_PARAGRAPHS - 1 }, () => '')])
  })

  it('draws the portrait’s derivative, never its original', async () => {
    // ASSERTED AGAINST THE ROW'S OWN TWO URLS, not against a substring of the
    // filename: Payload names a derivative after its dimensions
    // (`…-400x400.png`), so a `/thumb/` pattern would have been a check that
    // could never pass, which is worse than one that could never fail.
    const view = await readCoverScreen(payload, scope)
    const stored = await payload.findGlobal({ slug: 'about', ...scope, depth: 0, select: { portrait: true } })
    const id = typeof stored.portrait === 'number' ? stored.portrait : stored.portrait?.id
    const row = await payload.findByID({ collection: 'media', ...scope, depth: 0, id: id ?? 0 })

    expect({
      isTheThumb: view.about.portraitSrc === row.sizes?.thumb?.url,
      isTheOriginal: view.about.portraitSrc === row.url,
    }).toEqual({ isTheThumb: true, isTheOriginal: false })
  })

  it('draws an empty mount for a global with no portrait at all', async () => {
    await payload.updateGlobal({ slug: 'about', ...scope, data: { portrait: null } })

    const view = await readCoverScreen(payload, scope)

    expect({ src: view.about.portraitSrc, alt: view.about.portraitAlt }).toEqual({ src: null, alt: '' })
  })

  it('reads a kit line an editor cleared as an empty box rather than dropping the row', async () => {
    // The card draws one input per STORED line, so a dropped row would move
    // every line below it up a box while the author watched. `readBookBundle`'s
    // `textLines` is what keeps the empty one off the About page.
    await payload.updateGlobal({ slug: 'about', ...scope, data: { kit: [{ text: 'a notebook' }, { text: null }] } })

    expect((await readCoverScreen(payload, scope)).about.kit).toEqual(['a notebook', ''])
  })

  it('reads a cleared reply-to address as an empty field rather than failing the screen', async () => {
    await payload.updateGlobal({ slug: 'about', ...scope, data: { replyTo: null } })

    expect((await readCoverScreen(payload, scope)).about.replyTo).toBe('')
  })

  it('draws an empty mount for a portrait too small to have a derivative', async () => {
    // `null` FOR A ROW THAT EXISTS, which is a different state from "no
    // portrait set" and reaches the card by a different path: an upload under
    // the `thumb` tier's own size produces no `thumb` at all, and §2.7's mount
    // has to draw empty rather than a broken image.
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 3, g: 3, b: 3 } } })
      .png()
      .toBuffer()
    const tiny = await payload.create({
      collection: 'media',
      ...scope,
      data: { alt: `${MARKER} tiny`, state: 'ready', kind: 'still' },
      file: { data: png, mimetype: 'image/png', name: `${MARKER}-tiny.png`, size: png.length },
    })
    await payload.updateGlobal({ slug: 'about', ...scope, data: { portrait: tiny.id } })

    const view = await readCoverScreen(payload, scope)

    expect({ src: view.about.portraitSrc, alt: view.about.portraitAlt }).toEqual({
      src: null,
      alt: `${MARKER} tiny`,
    })
  })

  it('offers replacements that do not include the portrait already in the mount', async () => {
    const chosen = await aPhotograph('already-the-portrait')
    await payload.updateGlobal({ slug: 'about', ...scope, data: { portrait: chosen } })

    const view = await readCoverScreen(payload, scope)

    expect(view.about.choices.some((choice) => choice.id === String(chosen))).toBe(false)
  })

  it('names every replacement by its row id and its filename', async () => {
    const view = await readCoverScreen(payload, scope)

    expect(view.about.choices.every((choice) => /^\d+$/u.test(choice.id) && choice.filename !== '')).toBe(true)
  })

  it(
    'offers no more replacements than the cap allows, and still draws a portrait older than it',
    async () => {
      // BOTH SIDES OF THE CAP IN ONE FIXTURE, because they are one library: the
      // list is capped AND the portrait that is no longer in it is still found.
      // This is the shape the first draft got wrong — see this file's header.
      const oldest = await aPhotograph('older-than-the-cap')
      await payload.updateGlobal({ slug: 'about', ...scope, data: { portrait: oldest } })
      for (let index = 0; index < MAX_PORTRAIT_CHOICES; index += 1) {
        await aPhotograph(`newer-${String(index)}`)
      }

      const view = await readCoverScreen(payload, scope)

      expect({
        offered: view.about.choices.length,
        stillDrawn: view.about.portraitSrc !== null,
        offersTheOldest: view.about.choices.some((choice) => choice.id === String(oldest)),
      }).toEqual({ offered: MAX_PORTRAIT_CHOICES, stillDrawn: true, offersTheOldest: false })
    },
    CAP_CASE_TIMEOUT_MS,
  )
})
