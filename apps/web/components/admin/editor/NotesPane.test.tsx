/**
 * NotesPane.test.tsx — SCREENS.md §2.3's Notes pane, and the seam that has the
 * most room to drift in this whole task.
 *
 * ═══ THE CASES HAND THE PANE'S OWN BODY TO THE PANE'S OWN PARSE ═══
 *
 * A form and the parse that reads it agree by convention and nothing else: a
 * field renamed on one side is a value that silently stops arriving on the
 * other, and every case that names its own fields — on both sides — would go on
 * passing (standing orders, species 4). So no case here writes down a field
 * name. Each renders the pane, builds `new FormData(form)` the way a browser
 * does, hands it to `lib/admin/notesMutations.ts`'s `readNotes`, and compares
 * the result with the notes the pane was GIVEN. A rename on either side fails
 * here.
 *
 * `new FormData(form, submitter)` is how the `op` cases are written, for the
 * same reason: a submit button contributes its own `name`/`value` only when it
 * is the button that submitted, so passing the button is what a browser does
 * and appending the pair by hand would be a shape no client produces.
 *
 * Depends on: react, react-dom/client, vitest (jsdom), @travel-diary/domain/ids,
 * ../../../lib/admin/notesMutations, ./NotesPane.
 */
import { journeyId, slotKey, type JourneyId, type SlotKey } from '@travel-diary/domain/ids'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { readNotes, type JourneyNotes } from '../../../lib/admin/notesMutations'
import type { EditorSlot } from '../../../lib/admin/readJourneyEditor'
import { NotesPane } from './NotesPane'

const roots: Root[] = []

/**
 * A branded journey id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aJourney = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** The seeded Tokyo journey's own notes, so the fixture reads like a journey. */
const TOKYO: JourneyNotes = {
  name: 'Tokyo',
  dates: '3 – 9 Mar 2025',
  weather: 'CLEAR 14C',
  mood: 'WIDE EYED',
  weatherGlyph: 'sun',
  highlights: [
    { id: 'h1', text: 'First train at 05:40' },
    { id: 'h2', text: 'Nineteen tarts, no regrets' },
  ],
  note: 'Tokyo is loud in a way that never quite becomes noise.',
  tally: [
    { key: 'Days', value: '12' },
    { key: 'Trains', value: 'plenty' },
    { key: 'Tarts', value: '19' },
    { key: 'Rain', value: 'uncounted' },
  ],
  signoff: 'twelve days, one corner of it',
  stampCountry: 'NIPPON',
  stampValue: '120',
  accent: '#3d817e',
  slug: 'tokyo',
}

/**
 * A branded cell key.
 * @param raw - The key as the pane spells it.
 * @returns The branded key.
 */
const aSlotKey = (raw: string): SlotKey => {
  const built = slotKey(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** What nothing in these cases does: no form here is ever submitted. */
const noAction = (): Promise<void> => Promise.resolve()

/**
 * The Notes page's two cells, as `readJourneyEditor` answers them.
 *
 * THE PANE DRAWS THEM INSIDE ITS OWN `<form>`, which is the reason this fixture
 * is here at all rather than in `SlotPanel.test.tsx` alone: the cases below ask
 * what the pane POSTS, and a cell whose controls were forms of their own would
 * have been dropped by the parser and taken the fields with them.
 */
const TOKYO_SLOTS: readonly EditorSlot[] = [
  {
    key: aSlotKey('7:0'),
    cell: 0,
    role: 'hero',
    label: 'Hero',
    media: null,
    previewSrc: null,
    caption: '',
    alt: '',
    focal: { x: 50, y: 50 },
    loops: false,
  },
  {
    key: aSlotKey('7:1'),
    cell: 1,
    role: 'ephemera',
    label: 'Ephemera',
    media: null,
    previewSrc: null,
    caption: '',
    alt: '',
    focal: { x: 50, y: 50 },
    loops: false,
  },
]

/**
 * Renders the pane and hands back its form element.
 * @param notes - Fields to override on the Tokyo fixture.
 * @returns The rendered `<form>`.
 */
const renderPane = (notes: Partial<JourneyNotes> = {}, slots: readonly EditorSlot[] = TOKYO_SLOTS): HTMLFormElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <NotesPane
        journey={aJourney('42')}
        title="Notes"
        notes={{ ...TOKYO, ...notes }}
        slots={slots}
        editorHref="/admin/journeys/42?page=7"
        targeted={null}
        save={noAction}
        setFocal={noAction}
        setText={noAction}
        clear={noAction}
      />,
    )
  })
  const form = host.querySelector('form')
  if (form === null) throw new Error('the pane rendered no form')
  return form
}

/**
 * What the save would receive if this button were pressed.
 *
 * @param form - The rendered pane.
 * @param submitter - The button pressed, or nothing for a plain Save draft.
 * @returns The parsed notes.
 */
const posted = (form: HTMLFormElement, submitter?: Element): JourneyNotes =>
  readNotes(submitter === undefined ? new FormData(form) : new FormData(form, submitter as HTMLElement)).notes

/**
 * The button that acts on one highlight row.
 * @param form - The rendered pane.
 * @param row - The highlight's id.
 * @param selector - Which of the row's controls.
 * @returns The button.
 */
const control = (form: HTMLFormElement, row: string, selector: string): Element => {
  const found = form.querySelector(`[data-highlight="${row}"] ${selector}`)
  if (found === null) throw new Error(`the row ${row} has no ${selector}`)
  return found
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ''
})

describe('NotesPane', () => {
  it('posts a body its own parse reads back as the notes it was given, so the form cannot drift from the parse', () => {
    const form = renderPane()

    expect(posted(form)).toEqual(TOKYO)
  })

  it('names the journey it is editing, so the save writes to the row the address named', () => {
    const form = renderPane()

    expect(readNotes(new FormData(form)).journey).toBe(42)
  })

  it('prints §2.3’s own instruction, which is the only place the cap is stated to the author', () => {
    const form = renderPane()

    expect(form.textContent).toContain('four maximum — they set the page rhythm')
  })

  it('posts a remove for the row whose × was pressed, and for no other', () => {
    const form = renderPane()

    const after = posted(form, control(form, 'h1', '[data-remove-highlight]'))

    expect(after.highlights).toEqual([TOKYO.highlights[1]])
  })

  it('posts a move for the half of the grip that was pressed', () => {
    const form = renderPane()

    const after = posted(form, control(form, 'h1', '[data-move="down"]'))

    expect(after.highlights.map((row) => row.id)).toEqual(['h2', 'h1'])
  })

  it('disables the grip at each end of the list, so no control posts a move that cannot happen', () => {
    const form = renderPane()

    expect([
      (control(form, 'h1', '[data-move="up"]') as HTMLButtonElement).disabled,
      (control(form, 'h1', '[data-move="down"]') as HTMLButtonElement).disabled,
      (control(form, 'h2', '[data-move="up"]') as HTMLButtonElement).disabled,
      (control(form, 'h2', '[data-move="down"]') as HTMLButtonElement).disabled,
    ]).toEqual([true, false, false, true])
  })

  it('adds a line when "Add highlight" is pressed, keeping what the author had typed', () => {
    const form = renderPane()
    const add = form.querySelector('[data-add-highlight]')
    if (add === null) throw new Error('the pane draws no add button')

    const after = posted(form, add)

    expect(after.highlights.slice(0, 2)).toEqual(TOKYO.highlights)
    expect(after.highlights).toHaveLength(3)
  })

  it('draws "Add highlight" on a full list too, because the cap is refused by the save and not by the markup', () => {
    // A button hidden at the cap would be the ONLY thing stopping a fifth, and a
    // `POST` does not press buttons. `notesMutations.integration.test.ts` holds
    // the refusal; this holds that the pane does not pretend to.
    const form = renderPane({
      highlights: [
        { id: 'a', text: 'one' },
        { id: 'b', text: 'two' },
        { id: 'c', text: 'three' },
        { id: 'd', text: 'four' },
      ],
    })

    expect(form.querySelectorAll('[data-add-highlight]')).toHaveLength(1)
  })

  it('draws a row per highlight and no rows at all for a journey with none', () => {
    expect(renderPane({ highlights: [] }).querySelectorAll('[data-highlight]')).toHaveLength(0)
    expect(renderPane().querySelectorAll('[data-highlight]')).toHaveLength(TOKYO.highlights.length)
  })

  it('posts an empty highlight list for a journey with none, rather than a list the parse refuses', () => {
    const form = renderPane({ highlights: [] })

    expect(posted(form).highlights).toEqual([])
  })

  it('keeps the tally as text inputs, because DATA_MODEL.md stores "plenty" and "uncounted" in them', () => {
    // A number input here would refuse the seeded data, which is why this is a
    // case rather than a comment.
    const form = renderPane()
    const values = [...form.querySelectorAll('input[name="tallyValue"]')]

    expect(values.map((input) => (input as HTMLInputElement).type)).toEqual(['text', 'text', 'text', 'text'])
  })

  it('gives every control a name a screen reader can read, so the pane is not a grid of blank boxes', () => {
    const form = renderPane()
    const fields = [...form.querySelectorAll('input:not([type="hidden"]), textarea')]

    const unnamed = fields.filter((field) => {
      const label = field.getAttribute('aria-label') ?? field.closest('label')?.textContent ?? ''
      return label.trim().length === 0
    })

    expect(unnamed).toEqual([])
  })
})
