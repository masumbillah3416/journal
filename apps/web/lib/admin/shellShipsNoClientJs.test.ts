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
 * forms is a `POST` and a re-render, and the first `'use client'` added there
 * fails the case below rather than being found by whichever later task finally
 * exceeded 320KB.
 *
 * The task's phase-shaping claim is that nothing under
 * `apps/web/components/admin/shell/` is a client component, which is why
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

/** Where the directories below are resolved from. */
const COMPONENTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../components/admin')

/**
 * The directories whose whole point is that nothing in them reaches the browser.
 *
 * A LIST RATHER THAN ONE PATH, because the claim is now made by two screens'
 * worth of components and a second copy of this file would be a second chance
 * for one of them to drift. `components/admin/journeys/` is deliberately NOT
 * here: that screen buys two client islands on purpose — the create panel's
 * open state and the `⋯` disclosure — and each says why in its own header.
 */
const NO_CLIENT_JS: readonly { readonly directory: string; readonly why: string }[] = [
  { directory: 'shell', why: 'the frame every admin screen hangs in' },
  { directory: 'editor', why: "SCREENS.md §2.3's rail, layout picker and pool, which are forms and links" },
]

/** The directive that turns a module into a client entry point. */
const DIRECTIVE = /^\s*['"]use client['"]/

/**
 * Every source module in one of these directories, tests excluded.
 * @param directory - The directory's name under `components/admin/`.
 * @returns The file paths, relative to `components/admin/`.
 */
const modulesOf = (directory: string): readonly string[] =>
  readdirSync(path.join(COMPONENTS, directory), { recursive: true })
    .map(String)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    .map((name) => path.join(directory, name))

describe.each(NO_CLIENT_JS)('$directory — $why', ({ directory }) => {
  it('has modules to judge, so the case below cannot pass by finding nothing', () => {
    expect(modulesOf(directory).length).toBeGreaterThan(0)
  })

  it('carries no client directive in any module, which is the whole of its budget claim', () => {
    const client = modulesOf(directory).filter((name) =>
      DIRECTIVE.test(readFileSync(path.join(COMPONENTS, name), 'utf8')),
    )

    expect(client).toEqual([])
  })
})
