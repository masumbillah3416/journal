/**
 * NavRail.test.tsx — the rail SCREENS.md §2 puts every admin screen beside.
 *
 * EVERY ASSERTION IS AGAINST A CAUSE OUTSIDE THE COMPONENT: the entry table and
 * the colour lookup in `@travel-diary/domain/admin/navigation`, and the counts
 * the caller handed in. A case naming a label or a hex value would be a second
 * spelling of the rail, and would pass for a rail drawn from a different table.
 *
 * Depends on: react, react-dom/client, vitest (jsdom), ./NavRail,
 * `@travel-diary/domain/admin/navigation`.
 */
import { ADMIN_NAV, activeNavId, sectionColour } from '@travel-diary/domain/admin/navigation'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { NavCounts } from '../../../lib/admin/readNavCounts'
import { NavRail, navCountFor } from './NavRail'

const roots: Root[] = []

/** Counts whose four numbers are all different, so no two can be confused. */
const COUNTS: NavCounts = { journeys: 3, media: 41, unpublished: 7, trashed: 2 }

/** What {@link renderRail} is asked. */
interface RailRequest {
  /** The address the rail is being drawn beside. */
  readonly pathname: string
  /** The four numbers; {@link COUNTS} unless a case needs others. */
  readonly counts?: NavCounts
  /** The site's name; a real one unless a case is about its absence. */
  readonly siteName?: string
  /** The publication date; a real one unless a case is about its absence. */
  readonly lastPublished?: string | null
}

/**
 * Renders the rail and hands back the host element.
 * @param request - See {@link RailRequest}.
 * @returns The host element the rail was rendered into.
 */
const renderRail = ({
  pathname,
  counts = COUNTS,
  siteName = 'A Travel Diary',
  lastPublished = '12 March',
}: RailRequest): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <NavRail
        pathname={pathname}
        counts={counts}
        siteName={siteName}
        accountName="keeper@example.test"
        lastPublished={lastPublished}
      />,
    )
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('NavRail', () => {
  it('draws one button per rail entry, in the order navigation declares', () => {
    const host = renderRail({ pathname: '/admin' })

    const labels = [...host.querySelectorAll('a[data-nav-id]')].map((node) => node.getAttribute('data-nav-id'))
    expect(labels).toEqual(ADMIN_NAV.map((entry) => entry.id))
  })

  it('sends each button to the address its entry names', () => {
    const host = renderRail({ pathname: '/admin' })

    const addresses = ADMIN_NAV.map((entry) => host.querySelector(`a[data-nav-id="${entry.id}"]`)?.getAttribute('href'))
    expect(addresses).toEqual(ADMIN_NAV.map((entry) => entry.href))
  })

  it('paints each button’s bar with the colour sectionColour gives its section', () => {
    const host = renderRail({ pathname: '/admin' })

    const painted = ADMIN_NAV.map((entry) => {
      const bar = host.querySelector(`a[data-nav-id="${entry.id}"] [data-section-bar]`)
      return bar?.getAttribute('style') ?? ''
    })
    expect(
      painted.every((style, index) => style.includes(sectionColour(ADMIN_NAV[index]?.section ?? 'overview'))),
    ).toBe(true)
  })

  it('draws as many distinct colours as there are sections, so two sections never look alike', () => {
    const host = renderRail({ pathname: '/admin' })

    // THE CASE ABOVE CANNOT CATCH A COLLISION and the plan said it would: both
    // its sides read `sectionColour`, so giving two sections one colour moves
    // them together and it stays green (watched). This one counts what reached
    // the DOM against how many sections the table declares — two numbers with
    // different causes, which is what a collision moves apart.
    const painted = new Set(
      ADMIN_NAV.map(
        (entry) => host.querySelector(`a[data-nav-id="${entry.id}"] [data-section-bar]`)?.getAttribute('style') ?? '',
      ),
    )
    const sections = new Set(ADMIN_NAV.map((entry) => entry.section))

    expect(painted.size).toBe(sections.size)
  })

  it('marks exactly one button current, and it is the one activeNavId names', () => {
    const host = renderRail({ pathname: '/admin/journeys/7' })

    const current = [...host.querySelectorAll('a[aria-current="page"]')].map((node) => node.getAttribute('data-nav-id'))
    expect(current).toEqual([activeNavId('/admin/journeys/7')])
  })

  it('marks no button current on an address no entry owns', () => {
    const host = renderRail({ pathname: '/admin/nothing-here' })

    expect(host.querySelectorAll('a[aria-current="page"]')).toHaveLength(0)
    expect(activeNavId('/admin/nothing-here')).toBeUndefined()
  })

  it('prints beside each button the count its entry is given, and no number beside the others', () => {
    const host = renderRail({ pathname: '/admin' })

    const printed = ADMIN_NAV.map((entry) => ({
      id: entry.id,
      count: host.querySelector(`a[data-nav-id="${entry.id}"] [data-nav-count]`)?.textContent ?? null,
    }))
    const expected = ADMIN_NAV.map((entry) => ({
      id: entry.id,
      count: navCountFor(entry.id, COUNTS)?.toString() ?? null,
    }))

    expect(printed).toEqual(expected)
    // Non-vacuous: at least one entry really does carry a number, so the case
    // could not pass by every side being null.
    expect(printed.filter(({ count }) => count !== null).length).toBeGreaterThan(0)
  })

  it('moves a number when the counts move, so the rail is not printing a constant', () => {
    const host = renderRail({ pathname: '/admin', counts: { ...COUNTS, journeys: COUNTS.journeys + 5 } })

    expect(host.querySelector('a[data-nav-id="journeys"] [data-nav-count]')?.textContent).toBe(
      String(COUNTS.journeys + 5),
    )
  })

  it('carries the masthead and the footer SCREENS.md §2 gives the rail', () => {
    const host = renderRail({ pathname: '/admin' })

    expect(host.textContent).toContain('A Travel Diary')
    expect(host.textContent).toContain('The back room')
    expect(host.querySelector('[data-profile]')?.textContent).toContain('keeper@example.test')
    expect(host.querySelector('[data-last-published]')?.textContent).toContain('12 March')
  })

  it('prints no publication line when the screen named no date, rather than answering for it', () => {
    const host = renderRail({ pathname: '/admin', lastPublished: null })

    expect(host.querySelector('[data-last-published]')).toBeNull()
  })

  it('prints no site name when the site global has none, rather than an empty eyebrow', () => {
    const host = renderRail({ pathname: '/admin', siteName: '' })

    expect(host.textContent).toContain('The back room')
    expect(host.textContent).not.toContain('A Travel Diary')
  })

  it('puts the whole rail inside a landmark, not only its buttons', () => {
    const host = renderRail({ pathname: '/admin' })
    const rail = host.querySelector('aside')

    // A plain `<div>` here left the masthead and the footer outside every
    // landmark, which axe reports as "Some page content is not contained by
    // landmarks" — found by e2e/a11y.spec.ts against a real browser, not here.
    expect(rail?.getAttribute('aria-label')).toBe('Admin panel')
    expect(rail?.querySelector('[data-profile]')).not.toBeNull()
    expect(rail?.querySelector('nav')).not.toBeNull()
  })

  it('points the profile button at the Account screen', () => {
    // SCREENS.md §2's rail footer gives the profile block a target. Task 3
    // built it with none, deliberately — "a primary control pointing at an
    // unmounted address is the defect this repository already paid for once" —
    // and Task 14 mounted §2.11, so it has one.
    const host = renderRail({ pathname: '/admin' })

    expect(host.querySelector('[data-profile]')?.getAttribute('href')).toBe('/admin/account')
  })

  it('rings the profile button on the Account screen and nowhere else', () => {
    // BOTH SIDES. §2 gives it "a terracotta ring when active", and a class
    // applied unconditionally looks identical on the one screen anybody would
    // check it on.
    const onAccount = renderRail({ pathname: '/admin/account' })
    const elsewhere = renderRail({ pathname: '/admin' })

    expect(onAccount.querySelector('[data-profile]')?.getAttribute('aria-current')).toBe('page')
    expect(elsewhere.querySelector('[data-profile]')?.getAttribute('aria-current')).toBeNull()
    expect(onAccount.querySelector('[data-profile]')?.className).not.toBe(
      elsewhere.querySelector('[data-profile]')?.className,
    )
  })

  it('leaves every nav button unlit on the Account screen, because Account is not a nav entry', () => {
    const host = renderRail({ pathname: '/admin/account' })

    expect(host.querySelectorAll('a[aria-current="page"][data-nav-id]')).toHaveLength(0)
  })

  it('signs out by POST, never by a link a prefetch can follow', () => {
    const host = renderRail({ pathname: '/admin' })
    const form = host.querySelector('form')

    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBe('/admin/sign-out')
  })
})

describe('navCountFor', () => {
  it('prints nothing beside Publish, because a bare digit there cannot say what it counts', () => {
    // OVR-003 (`docs/qa/2026-09-26-overview-sweep.md`). This button used to
    // carry `counts.unpublished` — journeys that have never been published —
    // while the header's crumb and the Publish screen counted every ROW whose
    // newest version is a draft. The rail printed 0 beside "Publish · WHAT
    // GOES OUT" on a diary with one change waiting.
    //
    // The other three counts are unambiguous because each counts rows of the
    // thing its button names. "Publish" names an ACTION, so the only number
    // that belongs beside it is the waiting count — which the chrome cannot
    // afford: it is four queries on every screen that mounts `AdminShell`
    // (`docs/deviations.md` §91). Drawing nothing is honest; drawing a
    // different number is not.
    expect(navCountFor('publish', COUNTS)).toBeUndefined()
  })

  it('still prints the three counts that name rows of their own button’s subject', () => {
    // The other side: a fix that silenced every count would satisfy the case
    // above.
    expect([navCountFor('journeys', COUNTS), navCountFor('media', COUNTS), navCountFor('trash', COUNTS)]).toEqual([
      COUNTS.journeys,
      COUNTS.media,
      COUNTS.trashed,
    ])
  })

  it('leaves `unpublished` for the header chip, which says in words what it counts', () => {
    // The datum survives; only the unlabelled digit goes. `ScreenHeader` draws
    // it as "n journeys never published".
    expect(COUNTS.unpublished).toBeGreaterThan(0)
    expect(navCountFor('publish', COUNTS)).toBeUndefined()
  })
})
