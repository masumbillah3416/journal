/**
 * formRefusal.test.ts — the pure half of docs/deviations.md §104's mechanism:
 * what a Zod refusal and the body that caused it amount to, and what a card
 * draws afterwards.
 *
 * THE ALLOWLIST IS THE SUBJECT OF HALF THESE CASES, because it is the half
 * that can leak. A Server Action's body is whatever was posted to it, and
 * `changePassword`'s body is two passwords; a refusal that kept everything
 * would put one in a response header. Every case below that names a field the
 * form did not ask for exists to pin that it is dropped.
 *
 * THE SCHEMAS ARE THE REAL ONES. `NEW_JOURNEY` and `SITE_FORM` are private to
 * their modules, so the refusals here are produced by the exported readers
 * (`readNewJourney`, `readSiteForm`) rather than by a hand-built `ZodError` —
 * a fixture that encoded what a refusal was expected to look like is the shape
 * standing orders §4 is about.
 * Depends on: vitest, zod, ../admin/journeyMutations, ../admin/siteMutations,
 * ./formRefusal.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { KEPT_FIELDS_NAME, keptValue, keptValues, refusalFrom, type FormRefusal } from './formRefusal'
import { readNewJourney } from './journeyMutations'
import { readSiteForm } from './siteMutations'

/**
 * A form body, with the kept-field allowlist appended.
 *
 * @param entries - The posted pairs, repeated names allowed.
 * @param keeps - The field names the form asks to have back.
 * @returns The body.
 */
const aBody = (entries: readonly (readonly [string, string])[], keeps: readonly string[] = []): FormData => {
  const form = new FormData()
  for (const [name, value] of entries) form.append(name, value)
  for (const name of keeps) form.append(KEPT_FIELDS_NAME, name)
  return form
}

/**
 * The refusal a reader throws for a body, as {@link refusalFrom} sees it.
 *
 * @param read - The production reader to run.
 * @param form - The body to run it on.
 * @returns The refusal.
 * @throws When the reader did not refuse, which would make the case vacuous.
 */
const refusalOf = (read: (form: FormData) => unknown, form: FormData): FormRefusal => {
  try {
    read(form)
  } catch (thrown) {
    if (thrown instanceof z.ZodError) return refusalFrom(thrown, form)
    throw thrown
  }
  throw new Error('the reader accepted this body, so there is no refusal to read')
}

describe('refusalFrom', () => {
  it('names the field each message is about, as the body posted it', () => {
    const refusal = refusalOf(
      readSiteForm,
      aBody([
        ['name', 'Wanderings'],
        ['domain', ''],
        ['description', ''],
        ['replyTo', 'a@b'],
      ]),
    )

    expect(refusal.refused).toEqual([{ field: 'replyTo', message: 'that is not an email address' }])
  })

  it('reports every refusal in the body, not only the first', () => {
    // A body with three empty fields is three things to fix, and a screen that
    // showed one would send the author round three times.
    const refusal = refusalOf(
      readNewJourney,
      aBody([
        ['name', '   '],
        ['place', ' '],
        ['dates', ''],
      ]),
    )

    expect(refusal.refused.map((one) => one.field)).toEqual(['name', 'place', 'dates'])
  })

  it('keeps a value only when the form named it', () => {
    const refusal = refusalOf(
      readSiteForm,
      aBody(
        [
          ['name', 'Wanderings'],
          ['domain', 'wanderings.example'],
          ['description', ''],
          ['replyTo', 'a@b'],
          ['current', 'a password nobody asked to keep'],
        ],
        ['name', 'replyTo'],
      ),
    )

    expect(refusal.kept).toEqual({ name: ['Wanderings'], replyTo: ['a@b'] })
  })

  it('keeps nothing at all when the form named nothing', () => {
    const refusal = refusalOf(
      readSiteForm,
      aBody([
        ['name', ''],
        ['domain', ''],
        ['description', ''],
        ['replyTo', 'a@b'],
      ]),
    )

    expect(refusal.kept).toEqual({})
  })

  it('keeps every value of a repeated field, in the order the browser sent them', () => {
    const refusal = refusalOf(
      readSiteForm,
      aBody(
        [
          ['name', ''],
          ['domain', ''],
          ['description', ''],
          ['replyTo', 'a@b'],
          ['kit', 'one'],
          ['kit', 'two'],
        ],
        ['kit'],
      ),
    )

    expect(refusal.kept['kit']).toEqual(['one', 'two'])
  })

  it('answers an empty list for a named field the body did not carry', () => {
    // NOT `undefined`, AND THE DIFFERENCE IS DRAWN. `keptValues` reads the
    // absence of a key as "the form did not ask", and an empty list as "the
    // author cleared every line" — the About card's kit depends on it.
    const refusal = refusalOf(
      readSiteForm,
      aBody(
        [
          ['name', ''],
          ['domain', ''],
          ['description', ''],
          ['replyTo', 'a@b'],
        ],
        ['kit'],
      ),
    )

    expect(refusal.kept['kit']).toEqual([])
  })

  it('drops a file posted as the name of a kept field', () => {
    // A hidden text input cannot send one; a hand-built body can, and a `File`
    // is not a field name.
    const form = aBody([
      ['name', ''],
      ['domain', ''],
      ['description', ''],
      ['replyTo', 'a@b'],
    ])
    form.append(KEPT_FIELDS_NAME, new File(['x'], 'name'))

    expect(refusalOf(readSiteForm, form).kept).toEqual({})
  })

  it('drops a file a form posted under a kept name', () => {
    // A `File` is not a string, and putting one in a cookie is not a thing
    // this mechanism can do.
    const form = aBody(
      [
        ['name', ''],
        ['domain', ''],
        ['description', ''],
        ['replyTo', 'a@b'],
      ],
      ['portrait'],
    )
    form.append('portrait', new File(['x'], 'portrait.jpg'))

    expect(refusalOf(readSiteForm, form).kept['portrait']).toEqual([])
  })

  it('stores a field called __proto__ as a field, not as a prototype', () => {
    // `kept[name] = …` with the posted body's keys calls the inherited
    // `__proto__` setter for that one name, which changes the object instead of
    // storing anything. The whole map is built with `Object.fromEntries`, which
    // defines an own property for every key.
    const refusal = refusalOf(
      readSiteForm,
      aBody(
        [
          ['name', ''],
          ['domain', ''],
          ['description', ''],
          ['replyTo', 'a@b'],
          ['__proto__', 'nothing to see'],
        ],
        ['__proto__'],
      ),
    )

    expect(Object.getPrototypeOf(refusal.kept)).toBe(Object.prototype)
    expect(Object.getOwnPropertyNames(refusal.kept)).toEqual(['__proto__'])
  })

  it('names a refusal of the whole body with the empty field', () => {
    // A body-level `refine` has an empty path. The notice draws it as "the
    // form" rather than inventing a field name for it.
    const refusal = refusalFrom(
      new z.ZodError([{ code: 'custom', path: [], message: 'the highlight rows do not line up', input: undefined }]),
      aBody([]),
    )

    expect(refusal.refused).toEqual([{ field: '', message: 'the highlight rows do not line up' }])
  })
})

describe('keptValue', () => {
  const REFUSAL: FormRefusal = { refused: [], kept: { replyTo: ['a@b'], cleared: [''] } }

  it('answers what was typed when the refusal carried the field', () => {
    expect(keptValue(REFUSAL, 'replyTo', 'hello@example.test')).toBe('a@b')
  })

  it('answers the empty box the author left, not the stored value', () => {
    expect(keptValue(REFUSAL, 'cleared', 'what the database holds')).toBe('')
  })

  it('answers the stored value for a field the refusal did not carry', () => {
    expect(keptValue(REFUSAL, 'domain', 'wanderings.example')).toBe('wanderings.example')
  })

  it('answers the stored value when there was no refusal at all', () => {
    expect(keptValue(null, 'replyTo', 'hello@example.test')).toBe('hello@example.test')
  })
})

describe('keptValues', () => {
  it('answers what was typed when the refusal carried the field', () => {
    expect(keptValues({ refused: [], kept: { kit: ['one', 'two'] } }, 'kit', ['stored'])).toEqual(['one', 'two'])
  })

  it('answers an empty list for a field the author emptied, not the stored lines', () => {
    expect(keptValues({ refused: [], kept: { kit: [] } }, 'kit', ['stored'])).toEqual([])
  })

  it('answers the stored list for a field the refusal did not carry', () => {
    expect(keptValues({ refused: [], kept: {} }, 'kit', ['stored'])).toEqual(['stored'])
  })

  it('answers the stored list when there was no refusal at all', () => {
    expect(keptValues(null, 'kit', ['stored'])).toEqual(['stored'])
  })
})
