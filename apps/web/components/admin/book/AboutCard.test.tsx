/**
 * AboutCard.test.tsx — SCREENS.md §2.7's About card, and the two shapes that
 * look right in a photograph and are wrong in a form body.
 *
 * ═══ THE KIT DRAWS ONE INPUT MORE THAN IT HOLDS ═══
 *
 * That trailing empty input is the only way to ADD a line without JavaScript,
 * and it is invisible in a screenshot of a card that already has three lines.
 * A case counts the inputs against the stored lines rather than against a
 * number written here.
 *
 * ═══ THE PARAGRAPH BOXES ARE A FIXED COUNT ═══
 *
 * `coverMutations.ts`'s parse refuses a body with any other number of them, so
 * a card that drew one box for a global holding one paragraph would be a card
 * that cannot be saved. The case reads `ABOUT_PARAGRAPHS`, which is the same
 * constant the parse uses.
 *
 * ═══ THE PORTRAIT'S EMPTY MOUNT IS A STATE, NOT AN ABSENCE ═══
 *
 * `readCoverScreen.ts` answers `null` both for a global with no portrait and
 * for an upload too small to have a derivative, and §2.7's column has to keep
 * its shape either way.
 *
 * WHAT THIS FILE DOES NOT PROVE: the 140px mount and the Caveat 26px reply-to
 * line are declared in `book.module.css` and jsdom performs no layout.
 *
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../lib/admin/coverMutations, ./AboutCard.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ABOUT_PARAGRAPHS } from '../../../lib/admin/coverMutations'
import type { AboutCardContent } from '../../../lib/admin/readCoverScreen'
import { AboutCard } from './AboutCard'

const roots: Root[] = []

/** The About content the seed holds, so a fixture reads like a diary. */
const SEEDED: AboutCardContent = {
  portraitSrc: '/api/media/file/portrait-400x400.png',
  portraitAlt: 'The author, somewhere with bad coffee',
  paragraphs: ['This is a paper habit that ended up on a screen.', 'Nothing here is a recommendation.'],
  kit: ['35mm rangefinder, one lens', 'Pocket notebook, blue ink', 'Roll of washi tape, always'],
  replyTo: 'hello@wanderings.travel',
  choices: [
    { id: '12', filename: 'TOKYO_004.jpg' },
    { id: '19', filename: 'LISBON_011.jpg' },
  ],
}

/**
 * Renders the card and hands back the host element.
 * @param overrides - Content to override on the fixture.
 * @returns The host element.
 */
const renderCard = (overrides: Partial<AboutCardContent> = {}): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<AboutCard about={{ ...SEEDED, ...overrides }} save={vi.fn()} />)
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

describe('AboutCard', () => {
  it('draws as many paragraph boxes as the parse demands, whatever the global holds', () => {
    const host = renderCard({ paragraphs: ['only one', ''] })

    expect(host.querySelectorAll('[data-paragraph]')).toHaveLength(ABOUT_PARAGRAPHS)
  })

  it('fills each paragraph box from its own stored line', () => {
    const boxes = [...renderCard().querySelectorAll<HTMLTextAreaElement>('[data-paragraph]')]

    expect(boxes.map((box) => box.value)).toEqual([...SEEDED.paragraphs])
  })

  it('draws one kit input per stored line and one more to add by', () => {
    const inputs = [...renderCard().querySelectorAll<HTMLInputElement>('[data-kit-line]')]

    expect({ count: inputs.length, values: inputs.map((input) => input.value) }).toEqual({
      count: SEEDED.kit.length + 1,
      values: [...SEEDED.kit, ''],
    })
  })

  it('still draws an empty kit input for a diary with no kit at all, or the list could never be started', () => {
    const inputs = renderCard({ kit: [] }).querySelectorAll('[data-kit-line]')

    expect(inputs).toHaveLength(1)
  })

  it('names the trailing kit input as an add, and the rest by their place', () => {
    // Five identical `<input>`s with no label are five unlabelled fields to a
    // screen reader, and the last one does something different from the others.
    const names = [...renderCard().querySelectorAll('[data-kit-line]')].map((input) => input.getAttribute('aria-label'))

    expect(names).toEqual(['Kit line 1', 'Kit line 2', 'Kit line 3', 'Add a kit line'])
  })

  it('posts every field under the name the parse reads it by', () => {
    // THE NAMES ARE THE CONTRACT with `readAbout`, and a renamed field would
    // render identically and save nothing.
    const host = renderCard()
    const names = [...host.querySelectorAll('[name]')].map((field) => field.getAttribute('name'))

    expect(new Set(names)).toEqual(new Set(['portrait', 'paragraph', 'kit', 'replyTo']))
  })

  it('draws the portrait’s derivative when there is one', () => {
    const host = renderCard()
    const portrait = host.querySelector('[data-portrait]')

    expect([portrait?.getAttribute('src'), portrait?.getAttribute('alt')]).toEqual([
      SEEDED.portraitSrc,
      SEEDED.portraitAlt,
    ])
  })

  it('draws an empty mount rather than a broken image when there is no derivative', () => {
    const host = renderCard({ portraitSrc: null })

    expect({
      image: host.querySelector('[data-portrait]') !== null,
      mount: host.querySelector('[data-portrait-empty]') !== null,
    }).toEqual({ image: false, mount: true })
  })

  it('offers "keep the current portrait" first, so a save about the prose changes nothing', () => {
    // THE `''` OPTION IS THE WHOLE OF THAT GUARANTEE — `coverMutations.ts` reads
    // it as "leave the portrait alone" — and it has to be the DEFAULT, or every
    // save would silently repoint the portrait at whichever row sorted first.
    const select = renderCard().querySelector<HTMLSelectElement>('[data-portrait-choices]')

    expect({ value: select?.value, first: select?.options[0]?.value }).toEqual({ value: '', first: '' })
  })

  it('offers each replacement by its filename, under its row id', () => {
    const select = renderCard().querySelector<HTMLSelectElement>('[data-portrait-choices]')
    const options = [...(select?.options ?? [])].slice(1)

    expect(options.map((option) => [option.value, option.textContent])).toEqual(
      SEEDED.choices.map((choice) => [choice.id, choice.filename]),
    )
  })

  it('carries the reply-to address the global holds', () => {
    const field = renderCard().querySelector<HTMLInputElement>('[data-reply-to]')

    expect(field?.value).toBe(SEEDED.replyTo)
  })
})
