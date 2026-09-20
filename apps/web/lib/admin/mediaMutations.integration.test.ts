/**
 * mediaMutations.integration.test.ts — behaviour spec for SCREENS.md §2.4's
 * three bulk writes.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's. Whether a `where`-scoped update touches exactly the rows it
 * names and no others, whether `z.coerce.number()` keeps `NaN` out of the
 * driver, and — the one that matters most — whether re-pointing `media.journey`
 * really moves a photograph between two public galleries, are answers only a
 * real Payload and a real database give.
 *
 * ═══ THE GALLERY COUNTS COME FROM THE DIARY'S OWN QUERY ═══
 *
 * `moveMediaRows` changes which gallery a photograph is in, and the case that
 * says so counts frames through `apps/web/lib/galleryFrames.ts`'s
 * `galleryFrameWhere` — the predicate the public gallery itself is built from
 * — rather than by counting `media` rows with a `where` written here. A test
 * that spelled the rule again would agree with itself about a rule the diary
 * does not use.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here.
 * Depends on: vitest, payload (types), sharp (the fixtures' bytes), zod (the
 * refusal cases), ../galleryFrames, ../testPayload, ./adminScope,
 * ./mediaMutations.
 */
import { userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { galleryFrameWhere } from '../galleryFrames'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { MAX_BULK_MEDIA, addMediaToBook, captionMediaRows, moveMediaRows, readMediaIds } from './mediaMutations'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-media-mutations'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

let payload: Payload
let scope: AdminScope

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
  const journeys = await payload.find({
    collection: 'journeys',
    where: { slug: { like: MARKER } },
    pagination: false,
    depth: 0,
  })
  for (const journey of journeys.docs) {
    await payload.delete({ collection: 'media', where: { journey: { equals: journey.id } } })
  }
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/**
 * A published journey of this file's own.
 * @param label - What distinguishes this journey's slug from the others'.
 * @returns The journey's row id.
 */
const aJourney = async (label: string): Promise<number> => {
  const created = await payload.create({
    collection: 'journeys',
    ...scope,
    data: {
      name: `${MARKER} ${label}`,
      place: 'Iceland',
      slug: `${MARKER}-${label}`,
      dates: '8 – 19 May 2025',
      _status: 'published',
    },
  })
  return created.id
}

/**
 * A ready media row in a journey.
 * @param journey - The journey it belongs to.
 * @param label - What distinguishes this row.
 * @returns The media row's id.
 */
const aMediaRow = async (journey: number, label: string): Promise<number> => {
  const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 4, g: 4, b: 4 } } })
    .png()
    .toBuffer()
  const created = await payload.create({
    collection: 'media',
    ...scope,
    data: { journey, alt: `${MARKER} ${label}`, state: 'ready' },
    file: { data: png, mimetype: 'image/png', name: `${MARKER}-${label}.png`, size: png.length },
  })
  return created.id
}

/**
 * How many frames the public gallery for a journey holds.
 *
 * THROUGH `galleryFrameWhere`, which is what the gallery itself is built from.
 * @param journey - The journey's row id.
 * @returns The frame count.
 */
const galleryFramesIn = async (journey: number): Promise<number> => {
  const found = await payload.count({ collection: 'media', where: galleryFrameWhere([journey], []) })
  return found.totalDocs
}

/**
 * One row's fields, read back out of the database.
 * @param media - The row id.
 * @returns What the row now holds.
 */
const rowFacts = async (
  media: number,
): Promise<{ readonly inBook: boolean; readonly caption: string | null; readonly journey: number | null }> => {
  const row = await payload.findByID({
    collection: 'media',
    id: media,
    depth: 0,
    select: { inBook: true, caption: true, journey: true },
  })
  return {
    inBook: row.inBook === true,
    caption: row.caption ?? null,
    journey: typeof row.journey === 'number' ? row.journey : (row.journey?.id ?? null),
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  const account = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
  })
  scope = await adminScope({ user: anAccount(String(account.id)) })
  await clean()
})

afterAll(async () => {
  await clean()
})

describe('readMediaIds', () => {
  it('turns the strings the grid sends into row ids', () => {
    expect(readMediaIds(['4', '9'])).toEqual([4, 9])
  })

  it('refuses a selection of nothing, because a write with no subject is a silent no-op', () => {
    // Payload would take `{ id: { in: [] } }` as a `where` matching nothing,
    // so the honest answer is a refusal rather than a successful write that
    // changed no row.
    expect(() => readMediaIds([])).toThrow(ZodError)
  })

  it('refuses an id that is not a positive integer, so NaN never reaches the driver', () => {
    // `Number('nonsense')` is `NaN`, which escapes Postgres as a raw
    // `Failed query` rather than as anything a screen can draw.
    expect(() => readMediaIds(['nonsense'])).toThrow(ZodError)
    expect(() => readMediaIds(['-1'])).toThrow(ZodError)
  })

  it('accepts a selection of exactly the cap and refuses one more', () => {
    // BOTH SIDES OF THE ONE GATING CONSTANT HERE, and the boundary is read off
    // the constant rather than written as a literal, so it moves when the
    // constant does.
    const atTheCap = Array.from({ length: MAX_BULK_MEDIA }, (_unused, index) => String(index + 1))

    expect(readMediaIds(atTheCap)).toHaveLength(MAX_BULK_MEDIA)
    expect(() => readMediaIds([...atTheCap, '1'])).toThrow(ZodError)
  })
})

describe('addMediaToBook', () => {
  it('marks every named row and leaves the others alone', async () => {
    // `media.inBook` HAS NO OTHER WRITER IN THIS REPOSITORY (docs/deviations.md
    // §63), so the `false` side is what the collection's own default gives and
    // the `true` side is this function's.
    const journey = await aJourney('book')
    const named = await aMediaRow(journey, 'named')
    const bystander = await aMediaRow(journey, 'bystander')

    await addMediaToBook(payload, scope, [String(named)])

    expect((await rowFacts(named)).inBook).toBe(true)
    expect((await rowFacts(bystander)).inBook).toBe(false)
  })

  it('marks a whole selection in one write', async () => {
    const journey = await aJourney('bookmany')
    const first = await aMediaRow(journey, 'bookone')
    const second = await aMediaRow(journey, 'booktwo')

    await addMediaToBook(payload, scope, [String(first), String(second)])

    expect([(await rowFacts(first)).inBook, (await rowFacts(second)).inBook]).toEqual([true, true])
  })
})

describe('captionMediaRows', () => {
  it('writes one caption to every named row', async () => {
    const journey = await aJourney('caption')
    const first = await aMediaRow(journey, 'capone')
    const second = await aMediaRow(journey, 'captwo')

    await captionMediaRows(payload, scope, [String(first), String(second)], 'The last morning in Kyoto')

    expect([(await rowFacts(first)).caption, (await rowFacts(second)).caption]).toEqual([
      'The last morning in Kyoto',
      'The last morning in Kyoto',
    ])
  })

  it('clears a caption when it is handed the empty string', async () => {
    // Which is why the parse is `z.string()` and not `min(1)`: blanking a
    // caption is a thing an author can want, and a refusal would leave them
    // unable to take back words they had written.
    const journey = await aJourney('blank')
    const row = await aMediaRow(journey, 'blank')
    await captionMediaRows(payload, scope, [String(row)], 'something')

    await captionMediaRows(payload, scope, [String(row)], '')

    expect((await rowFacts(row)).caption).toBe('')
  })
})

describe('moveMediaRows', () => {
  it('moves a photograph out of one gallery and into another', async () => {
    // WHAT MAKES THIS THE INTERESTING CASE: the counts are taken through
    // `galleryFrameWhere`, the predicate the public gallery is built from, so
    // the assertion is about what a reader would see rather than about a
    // column.
    const source = await aJourney('source')
    const destination = await aJourney('destination')
    const moved = await aMediaRow(source, 'moved')
    await aMediaRow(source, 'stays')

    const before = { source: await galleryFramesIn(source), destination: await galleryFramesIn(destination) }
    await moveMediaRows(payload, scope, [String(moved)], String(destination))
    const after = { source: await galleryFramesIn(source), destination: await galleryFramesIn(destination) }

    expect(before).toEqual({ source: 2, destination: 0 })
    expect(after).toEqual({ source: 1, destination: 1 })
    expect((await rowFacts(moved)).journey).toBe(destination)
  })

  it('refuses a destination that is not a row id, rather than filing the selection under NaN', async () => {
    // REJECTS RATHER THAN THROWS: the parse runs inside an `async` function, so
    // the refusal is a rejected promise. It still happens before any write —
    // `Number('nonsense')` reaching the driver as `NaN` escapes as a raw
    // `Failed query`.
    await expect(moveMediaRows(payload, scope, ['1'], 'nonsense')).rejects.toThrow(ZodError)
  })

  it('refuses a selection the grid could not have produced, before it writes anything', async () => {
    const journey = await aJourney('refused')
    const row = await aMediaRow(journey, 'refused')

    await expect(addMediaToBook(payload, scope, [])).rejects.toThrow(ZodError)

    // Nothing was written: the parse runs before the update is dispatched.
    expect((await rowFacts(row)).inBook).toBe(false)
  })
})
