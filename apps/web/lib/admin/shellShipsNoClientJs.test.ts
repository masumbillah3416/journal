/**
 * shellShipsNoClientJs.test.ts — the admin shell ships no client JavaScript,
 * which is the whole of its budget claim. Since Phase 4 Task 5 it judges the
 * journey editor's components too, for the same reason and by the same means.
 *
 * THE EDITOR MAKES THE SAME CLAIM IN ITS OWN HEADERS — "the arrows ship no
 * JavaScript", "selection is an address, not state", "this screen ships no
 * JavaScript for its chrome" — and a claim in prose that nothing checks is the
 * species these standing orders exist to stop. `components/admin/editor/` is
 * therefore inside this guard from the commit that created it: every one of its
 * forms is a `POST` and a re-render, and a `'use client'` added there fails the
 * case below rather than being found by whichever later task finally exceeded
 * 320KB.
 *
 * SINCE TASK 7 THE EDITOR HAS EXACTLY ONE ISLAND, AND IT IS NAMED. §2.3's focal
 * point cannot be computed without the clicked element's measured width, so
 * `SlotPanel.tsx` carries the directive — and it is admitted by an ALLOWLIST OF
 * NAMED FILES ({@link ISLANDS}) rather than by dropping the directory, so the
 * other modules there are judged exactly as before and an undeclared island
 * fails this file by name. Two further cases keep the allowlist honest: each
 * entry must still carry the directive, and there must still be exactly as
 * many as the budget argument was made about.
 *
 * ═══ TASK 8 ADDED A DIRECTORY AND TWO ISLANDS, AND SAYS SO LOUDLY ═══
 *
 * `components/admin/media` joins the scan in the same commit that creates it,
 * because SCREENS.md §2.4 is the first admin screen that CANNOT be a form:
 * §9.1 puts an upload's bytes straight on the store through a capability URL,
 * so the page reads the picked `File`s, asks for slots, PUTs each body and
 * finalises each key — four round trips a `<form action>` has no way to make.
 * `Dropzone.tsx` is that, and `MediaGrid.tsx` is the selection §2.4's bulk bar
 * appears with, which is a `ReadonlySet<MediaId>` no address can hold without
 * a navigation per tick.
 *
 * **THE COUNT WENT FROM ONE TO THREE, and that is the number this file now
 * asserts.** The directory is in the scan rather than out of it precisely so
 * that a FOURTH island — the next `useState` somebody reaches for in there —
 * fails by name instead of being found by whichever task finally exceeded
 * 320KB.
 *
 * ═══ TASK 9 ADDED A FOURTH, AND IT IS THE WHOLE OF ITS SCREEN ═══
 *
 * `components/admin/galleries/FrameGrid.tsx`. SCREENS.md §2.5's grid is "Drag
 * to reorder", and there is no form post that carries "this tile now sits
 * before that one" — every other control on that screen hangs off the same
 * state, so drawing them apart would split one screen's state across a
 * boundary. Its two panels, `SelectedFrame.tsx` and `CaptionAll.tsx`, carry NO
 * directive and are not in the allowlist: a module imported by a client entry
 * is part of that entry, and the allowlist counts entries. **The count is now
 * four**, and `docs/api.md` says the same number.
 *
 * The task's phase-shaping claim is that nothing in the SHELL's own directory
 * is a client component, which is why
 * `/admin` ships one script request fewer than any sign-in pane and why the
 * report reads 189,694 bytes of headroom for the eleven screens to come.
 *
 * NOTHING ELSE ASSERTS IT, WHICH WAS MEASURED RATHER THAN ASSUMED. With
 * `'use client'` prepended to `NavRail.tsx`, every jsdom case in the shell
 * directory stays green (25 of them when this was measured, and the number is
 * left out of the claim because it is not the point and a later task would have
 * to edit it), because jsdom renders a component the same either way;
 * `e2e/admin.spec.ts`'s five cases stay green, because the route renders the
 * same either way; and the Lighthouse gate stays green, because one client
 * component costs a few KB against 189,694 bytes of headroom. So the property
 * that makes the headroom argument true had no failing case anywhere, and the
 * first task to notice would have been whichever one finally exceeded 320KB.
 * This is that assertion, and it fails on the commit that adds the directive.
 *
 * WHY A FILE READ RATHER THAN A BUNDLE MEASUREMENT. The honest subject is "does
 * Next.js emit a client entry for this module", and the only thing that answers
 * it exactly is a production build — minutes, and `lighthouserc.admin.json`
 * already pays for one. `'use client'` is what CAUSES that emission, and it is
 * a directive Next.js requires at the top of the file, so reading it is reading
 * the cause. A module that becomes a client entry because something it IMPORTS
 * carries the directive is not caught here; the script-request count in
 * `docs/testing.md` §7 is what would show that, and it is one measurement, not
 * a gate.
 *
 * The directory list is read off disk rather than written down, and RECURSIVELY,
 * so a component a later task adds to the shell — in a subdirectory of it too,
 * which is ordinary housekeeping once eleven screens have grown their parts —
 * is inside the claim from the commit that adds it. It was not recursive until
 * the second fix round, and a module in `shell/nested/` escaped the guard while
 * every suite stayed green.
 *
 * THE DIRECTIVE IS EXPECTED ON LINE 1, which is a convention rather than a
 * guarantee and is therefore said out loud. `'use client'` is a directive
 * prologue, so a bundler still honours one placed after a module header comment
 * — and this repository puts a header comment at the top of every module. All
 * seven client components here today put it on line 1, so the anchored pattern
 * matches the house style; a module that put it below its header would not be
 * seen. Loosening the pattern to skip a leading comment block is the fix if
 * that convention ever breaks, and this sentence is the record that it is a
 * convention.
 *
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Where the directories below are resolved from — `apps/web`. */
const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The files that carry the directive on purpose, each with the reason it could
 * not be written any other way.
 *
 * AN ALLOWLIST OF FILES, NOT AN EXCLUDED DIRECTORY, and that distinction is the
 * whole value of it. Dropping `components/admin/editor` or
 * `components/admin/media` from the scan would make the next `useState` in that
 * directory invisible; naming the files leaves every other module there judged,
 * and an UNDECLARED island fails the case below by name.
 *
 * `SlotPanel.tsx` — SCREENS.md §2.3's focal point is
 * `clamp(0, ((clientX − rect.left) / rect.width) × 100, 100)`, the pointer's
 * position and the element's MEASURED width in one expression. A server has
 * neither; `<input type="image">` posts a click's coordinates but not the box
 * they were measured against; and a slot's width is a `1fr` track, so there is
 * no constant to divide by.
 *
 * `Dropzone.tsx` — one upload is four round trips (slots, PUT, finalise, and
 * the page again), and spec §9.1 puts the bytes straight on the store, so
 * there is no form post that could carry it.
 *
 * `MediaGrid.tsx` — §2.4's bulk bar appears only with a selection, and the
 * selection is a `ReadonlySet<MediaId>`. As an address it would be a
 * navigation per tick, and the bar is in the same flex row as the search and
 * the chips, which is why they are drawn there too (still a `GET` form and
 * five links).
 *
 * `FrameGrid.tsx` — SCREENS.md §2.5 is "Drag to reorder", which is a pointer
 * gesture no form post carries, and the selection, the arrangement and the
 * bulk panel are one screen's state.
 *
 * The cost is four small client entries against the headroom below, and each
 * is recorded in `docs/deviations.md` rather than only here.
 */
const ISLANDS: readonly { readonly file: string; readonly why: string }[] = [
  {
    file: 'components/admin/editor/SlotPanel.tsx',
    why: "SCREENS.md §2.3's focal point needs the clicked element's measured width",
  },
  {
    file: 'components/admin/media/Dropzone.tsx',
    why: 'an upload is four round trips a form cannot make (§9.1, docs/adr/0020)',
  },
  {
    file: 'components/admin/media/MediaGrid.tsx',
    why: "SCREENS.md §2.4's bulk bar appears with a selection, which is a set of ids",
  },
  {
    file: 'components/admin/galleries/FrameGrid.tsx',
    why: "SCREENS.md §2.5's grid is 'Drag to reorder', which no form post carries",
  },
]

/**
 * The directories whose whole point is that nothing in them reaches the browser.
 *
 * A LIST RATHER THAN ONE PATH, because the claim is now made by two screens'
 * worth of files and a second copy of this file would be a second chance for
 * one of them to drift. The journeys screen's own components are deliberately
 * NOT here: that screen buys two client islands on purpose — the create panel's
 * open state and the `⋯` disclosure — and each says why in its own header.
 *
 * THE LIST REACHES OUTSIDE `components/`, and it has to. The journey editor's
 * claim is made by five files and two of them are the route's own, so a later
 * task reaching for a `useState` in its `page.tsx` would leave `docs/api.md`'s
 * "the screen ships no client JavaScript" false with nothing failing — the only
 * other instrument is a Lighthouse run on a URL that config cannot name (see
 * `scripts/route-client-js.mjs`). Tasks 6 and 7 both edit that route.
 *
 * The route's `actions.ts` is inside the scan and is not a problem: its line 1
 * is `'use server'`, which the pattern below does not match.
 */
const NO_CLIENT_JS: readonly { readonly directory: string; readonly why: string }[] = [
  { directory: 'components/admin/shell', why: 'the frame every admin screen hangs in' },
  {
    directory: 'components/admin/editor',
    why: "SCREENS.md §2.3's rail, layout picker and pool, which are forms and links",
  },
  { directory: 'app/(admin)/admin/journeys/[id]', why: 'the editor route itself, and the actions its forms post to' },
  {
    directory: 'components/admin/media',
    why: "SCREENS.md §2.4's two islands are declared above, and a third is not",
  },
  { directory: 'app/(admin)/admin/media', why: 'the media route itself, and the actions its bulk bar dispatches' },
  {
    directory: 'components/admin/galleries',
    why: "SCREENS.md §2.5's one island is declared above, and its two panels are not",
  },
  { directory: 'app/(admin)/admin/galleries', why: 'the galleries route itself, and the five actions it dispatches' },
]

/** The directive that turns a module into a client entry point. */
const DIRECTIVE = /^\s*['"]use client['"]/

/**
 * Every source module in one of these directories, tests excluded.
 * @param directory - The directory's path under `apps/web/`, as
 *   {@link NO_CLIENT_JS} spells it — the base moved up two levels when the list
 *   grew past `components/`.
 * @returns The file paths, relative to `apps/web/`.
 */
const modulesOf = (directory: string): readonly string[] =>
  readdirSync(path.join(APP, directory), { recursive: true })
    .map(String)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    .map((name) => path.join(directory, name))

describe.each(NO_CLIENT_JS)('$directory — $why', ({ directory }) => {
  it('has modules to judge, so the case below cannot pass by finding nothing', () => {
    expect(modulesOf(directory).length).toBeGreaterThan(0)
  })

  it('carries no client directive in any module but the islands declared here, which is the whole of its budget claim', () => {
    const allowed = new Set(ISLANDS.map((island) => island.file.split('/').join(path.sep)))
    const client = modulesOf(directory).filter((name) => DIRECTIVE.test(readFileSync(path.join(APP, name), 'utf8')))

    expect(client.filter((name) => !allowed.has(name))).toEqual([])
  })
})

describe('the declared client islands', () => {
  it('has each of them still carrying the directive, so the allowlist cannot outlive its reason', () => {
    // WITHOUT THIS, the allowlist is a free pass keyed on a filename: an island
    // refactored back into a server component would leave an entry admitting a
    // directive nobody writes any more, and the next one to need it would find
    // the door already open.
    const withoutOne = ISLANDS.filter((island) => !DIRECTIVE.test(readFileSync(path.join(APP, island.file), 'utf8')))

    expect(withoutOne.map((island) => island.file)).toEqual([])
  })

  it('keeps the list to the files the budget argument was made about', () => {
    // A NUMBER IN PROSE IS A FLOOR OR IT IS DELETED (standing orders, species
    // 5) — so this is the number itself, asserted, rather than a sentence in a
    // header claiming it. `docs/api.md` says the editor ships ONE client entry
    // and the media screen two; a further island has to change those
    // sentences, and this is what makes it.
    expect(ISLANDS).toHaveLength(4)
  })
})
