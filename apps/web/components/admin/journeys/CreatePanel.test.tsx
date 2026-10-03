/**
 * CreatePanel.test.tsx — SCREENS.md §2.2's "A new journey" panel: the button
 * that opens it, the three fields, and the line it promises.
 *
 * The panel's OPEN STATE is one of the two client islands this screen buys
 * (`docs/testing.md` and `JourneyTable.test.tsx`'s header for the other), so
 * these cases press the real button and read the real DOM rather than asserting
 * against a prop.
 *
 * THE COPY IS ASSERTED VERBATIM, and that is the point of the last case rather
 * than incidental to it. SCREENS.md §2.2 prints "Starts as a draft — no
 * bookmark until you publish." and the panel's own note promises what
 * `createJourney` does; a paraphrase would be a claim the screen makes that
 * nothing checks. The em dash is the design's own character.
 *
 * Depends on: react, react-dom/client, vitest (jsdom), ./CreatePanel.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { FormRefusal } from '../../../lib/admin/formRefusal'
import { CreatePanel, CREATE_PANEL_NOTE, CREATE_PANEL_PROMISE } from './CreatePanel'

const roots: Root[] = []

/** What nothing in these cases does: the form is never submitted. */
const noAction = (): Promise<void> => Promise.resolve()

/**
 * Renders the panel and hands back the host element.
 * @param refusal - The refusal to draw it under, if the last create was refused.
 * @returns The host element.
 */
const renderPanel = (refusal: FormRefusal | null = null): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <CreatePanel create={noAction} refusal={refusal}>
        {null}
      </CreatePanel>,
    )
  })
  return host
}

/**
 * Presses a button inside the host.
 * @param host - Where to look.
 * @param selector - Which button.
 */
const press = (host: HTMLElement, selector: string): void => {
  act(() => {
    host.querySelector<HTMLButtonElement>(selector)?.click()
  })
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('CreatePanel', () => {
  it('draws only the New journey button until it is pressed', () => {
    const host = renderPanel()

    expect(host.querySelector('[data-create-open]')?.textContent).toBe('New journey')
    expect(host.querySelector('[data-create-panel]')).toBeNull()
  })

  it('opens the panel on the button, and closes it again on Cancel', () => {
    const host = renderPanel()

    press(host, '[data-create-open]')
    expect(host.querySelector('[data-create-panel]')).not.toBeNull()

    press(host, '[data-create-cancel]')
    expect(host.querySelector('[data-create-panel]')).toBeNull()
  })

  it('asks for where, country and dates, under the names the action parses', () => {
    const host = renderPanel()
    press(host, '[data-create-open]')

    const fields = [...host.querySelectorAll<HTMLInputElement>('[data-create-panel] input[name]:not([type="hidden"])')]
    expect(fields.map((field) => field.name)).toEqual(['name', 'place', 'dates'])
    // Required at the boundary AND in the browser: Zod refuses an empty field
    // in the action, and this is what stops the round trip that finds out.
    expect(fields.every((field) => field.required)).toBe(true)
  })

  it('prints SCREENS.md §2.2’s promise word for word, because it is what the action does', () => {
    const host = renderPanel()
    press(host, '[data-create-open]')

    expect(CREATE_PANEL_PROMISE).toBe('Starts as a draft — no bookmark until you publish.')
    expect(host.querySelector('[data-create-promise]')?.textContent).toBe(CREATE_PANEL_PROMISE)
    expect(host.querySelector('[data-create-note]')?.textContent).toBe(CREATE_PANEL_NOTE)
  })

  it('hands the three fields to the action it was given, as the FormData a browser sends', async () => {
    // THE CASE THAT WAS WRONG FIRST, and it is left in the file with its
    // measurement. It asserted the form carried NO `action` attribute, on the
    // reasoning that a hand-written one would POST somewhere React never
    // dispatched. React 19 does set one — a `javascript:throw ...` sentinel —
    // so the assertion was about a shape React does not produce, and it failed
    // the moment it first ran. What it was trying to say is asserted directly
    // instead: the form dispatches, and what arrives is the FormData a browser
    // would have built from these three inputs.
    const sent: FormData[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => {
      root.render(
        <CreatePanel
          create={(form) => {
            sent.push(form)
            return Promise.resolve()
          }}
          refusal={null}
        >
          {null}
        </CreatePanel>,
      )
    })
    press(host, '[data-create-open]')

    for (const [name, value] of [
      ['name', 'Kyoto'],
      ['place', 'Japan'],
      ['dates', '28 Oct – 6 Nov 2026'],
    ]) {
      const field = host.querySelector<HTMLInputElement>(`[data-create-panel] input[name="${name ?? ''}"]`)
      if (field !== null) field.value = value ?? ''
    }
    await act(async () => {
      host.querySelector<HTMLFormElement>('[data-create-panel] form')?.requestSubmit()
      await Promise.resolve()
    })

    expect(sent).toHaveLength(1)
    // `refusalKeeps` is dropped here: it is the panel's own allowlist for
    // docs/deviations.md §104, and `NEW_JOURNEY` strips it the way Zod strips
    // every key an object schema does not declare.
    expect([...(sent[0] ?? new FormData()).entries()].filter(([name]) => name !== 'refusalKeeps')).toEqual([
      ['name', 'Kyoto'],
      ['place', 'Japan'],
      ['dates', '28 Oct – 6 Nov 2026'],
    ])
  })
})

describe('CreatePanel, after a refused create (docs/deviations.md §104)', () => {
  /** A refusal of a name that was three spaces, carrying all three values. */
  const REFUSED: FormRefusal = {
    refused: [{ field: 'name', message: 'where it went cannot be blank' }],
    kept: { name: ['   '], place: ['Norway'], dates: ['1 - 2 May 2026'] },
  }

  it('names every field it will take back, and no other', () => {
    expect(
      [...renderPanel(REFUSED).querySelectorAll('input[type="hidden"][name="refusalKeeps"]')].map((input) =>
        input.getAttribute('value'),
      ),
    ).toEqual(['name', 'place', 'dates'])
  })

  it('opens itself, because a round trip is a fresh mount', () => {
    // The panel's `open` is client state, and the refusal arrives on a new
    // render of the page. Without this the author is told what was wrong
    // about a form they can no longer see.
    expect(renderPanel(REFUSED).querySelector('[data-create-panel]')).not.toBeNull()
    expect(renderPanel().querySelector('[data-create-panel]')).toBeNull()
  })

  it('redraws all three boxes with what was typed', () => {
    const host = renderPanel(REFUSED)
    const valueOf = (name: string): string | undefined =>
      host.querySelector<HTMLInputElement>(`[data-create-panel] input[name="${name}"]`)?.value

    expect([valueOf('name'), valueOf('place'), valueOf('dates')]).toEqual(['   ', 'Norway', '1 - 2 May 2026'])
  })
})
