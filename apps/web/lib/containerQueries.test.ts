/**
 * containerQueries.test.ts — no stylesheet makes an element the subject of an
 * `@container` block for a container that element itself declares.
 *
 * ═══ WHY THIS EXISTS, AND WHY A COMMENT WAS NOT ENOUGH ═══
 *
 * **An element cannot be its own query container.** A `container-type` on an
 * element establishes a containment context for its DESCENDANTS, so a rule
 * inside `@container` that targets the declaring element itself can never
 * match. Nothing warns: the stylesheet is valid, the build is clean, every
 * jsdom case stays green — jsdom performs no layout — and the screen simply
 * draws one column where the handoff asks for two.
 *
 * This repository has now made and fixed that defect in FOUR stylesheets:
 * `journeys.module.css` (which says so in its own header), `editor.module.css`,
 * `galleries.module.css` (GAL-004,
 * `docs/qa/2026-09-20-galleries-screen-sweep.md`) and `book.module.css` — the
 * last of those in the file whose header CITES GAL-004, four screens after the
 * lesson was written down. The countermeasure after each was another comment.
 * This is the countermeasure that runs.
 *
 * ═══ `composes` IS PART OF THE SUBJECT, AND IS THE MECHANISM THAT RE-MADE IT ═══
 *
 * `book.module.css`'s first draft did not put `container-type` and the grid in
 * one rule. It put the container on `.screen` and the grid on `.screenBook`,
 * which `composes: screen` — so a CSS Module emitted `class="screenBook screen"`
 * on ONE element and the two landed together anyway. A guard that read only the
 * declaring selector would have passed it. That is also why a shared
 * `screen.module.css` primitive is the weaker fix on its own: `composes` is
 * exactly how a shared primitive would be reached.
 *
 * ═══ WHAT THIS IS, AND WHAT IT IS NOT ═══
 *
 * It is a text scan, in the shape `shellShipsNoClientJs.test.ts` already uses:
 * the honest subject is "does this stylesheet declare a container and then query
 * it on the same selector", and that is answerable from the bytes. It needs no
 * browser and runs inside `npm run verify`.
 *
 * It is NOT a proof that every `@container` block matches something. A rule
 * targeting a descendant that does not exist is still dead, and only a browser
 * sees that — `e2e/admin.spec.ts` measures the column shapes of the screens
 * that have them. What this fails on is the one authoring mistake that has
 * happened four times.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Two extractions and a set
 * intersection.
 *
 * INVARIANT — the corpus is read off disk, so a stylesheet a later task adds is
 * inside this guard from the commit that adds it, and the first case refuses a
 * corpus that has stopped finding containers at all.
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Where the corpus below is resolved from — `apps/web`. */
const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The directories whose stylesheets are scanned.
 *
 * Every CSS Module in the app. `app/` holds the route groups' plain
 * stylesheets (`diary.css`, `admin.css`) as well, and those are scanned too:
 * nothing stops a container query being written in one.
 */
const STYLE_ROOTS = ['components', 'app'] as const

/** A class selector at the start of a rule, e.g. `.screenBook,` or `.row {`. */
const CLASS_SELECTOR = /\.([A-Za-z_][\w-]*)/gu

/**
 * One `composes` declaration. Global on purpose — a block may carry several.
 *
 * `composes: a b from './other.css'` is valid, so the tokens `from` and
 * `global` are dropped by the caller rather than treated as class names; a
 * container reached through ANOTHER file is out of this guard's scope and
 * `Not covered` in its header.
 */
const COMPOSES_DECLARATION = /composes\s*:\s*([^;]+);/gu

/** One `@container` block's header: an optional name, then its condition. */
const CONTAINER_AT_RULE = /@container\s+([A-Za-z_][\w-]*)?\s*\(/gu

/** Every stylesheet under {@link STYLE_ROOTS}, as repository-relative paths. */
const stylesheets = (): readonly string[] =>
  STYLE_ROOTS.flatMap((root) =>
    readdirSync(path.join(APP, root), { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('.css'))
      .map((name) => path.join(root, name)),
  )

/** What one stylesheet declares about containers, and what it queries. */
interface Sheet {
  /** The file, as written. */
  readonly source: string
  /** Selector → the container names it establishes (`''` for an unnamed container). */
  readonly declares: ReadonlyMap<string, ReadonlySet<string>>
  /** Selector → the class names it reaches through `composes`. */
  readonly composes: ReadonlyMap<string, ReadonlySet<string>>
  /** Container name (`''` when the at-rule names none) → the selectors it styles. */
  readonly queries: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * The body of the block that opens at `from`, by counting braces.
 *
 * Written rather than pulled in: a CSS parser for three facts would be a
 * dependency, and `@container` bodies nest exactly one level here.
 * @param source - The whole stylesheet.
 * @param from - The index of the opening brace.
 * @returns The text between that brace and its match.
 */
const blockAt = (source: string, from: number): string => {
  let depth = 0
  for (let at = from; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1
    if (source[at] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(from + 1, at)
    }
  }
  /* c8 ignore next -- An unbalanced stylesheet does not build, so a `{` with no
   * `}` after it is a state the corpus cannot be in; the arm exists because the
   * loop has to end somewhere and CLAUDE.md §0.8 bans the assertion that would
   * skip it. */
  return source.slice(from + 1)
}

/**
 * Reads one stylesheet into the three facts this guard compares.
 *
 * COMMENTS ARE STRIPPED FIRST, so a container query quoted in a header — and
 * this repository's headers quote them constantly — is not mistaken for one.
 * @param file - Its path under `apps/web`.
 * @returns What it declares, composes and queries.
 */
const read = (file: string): Sheet => {
  const source = readFileSync(path.join(APP, file), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '')
  const declares = new Map<string, Set<string>>()
  const composes = new Map<string, Set<string>>()
  const queries = new Map<string, Set<string>>()

  // EVERY RULE OUTSIDE AN AT-RULE, plus every rule inside an `@container`. The
  // scan walks top-level blocks: an `@container`'s body is walked again, so a
  // rule inside one is attributed to that container rather than to the file.
  const walk = (text: string, within: string | null): void => {
    let at = 0
    while (at < text.length) {
      const brace = text.indexOf('{', at)
      if (brace === -1) return
      const header = text.slice(at, brace)
      const body = blockAt(text, brace)
      const after = brace + body.length + 2

      const container = [...header.matchAll(CONTAINER_AT_RULE)][0]
      if (container !== undefined) {
        walk(body, container[1] ?? '')
      } else if (!header.trim().startsWith('@')) {
        const selectors = [...header.matchAll(CLASS_SELECTOR)].map((found) => found[1] ?? '')
        for (const selector of selectors) {
          if (within !== null) {
            queries.set(within, (queries.get(within) ?? new Set()).add(selector))
            continue
          }
          const type = /container-type\s*:/u.test(body)
          const named = /container-name\s*:\s*([A-Za-z_][\w-]*)/u.exec(body)
          if (type) declares.set(selector, (declares.get(selector) ?? new Set()).add(named?.[1] ?? ''))
          // EVERY `composes` DECLARATION IN THE BLOCK, not the first: CSS
          // Modules allows several, and a guard that read one would miss a
          // container reached through the second.
          for (const composed of body.matchAll(COMPOSES_DECLARATION)) {
            for (const reached of (composed[1] ?? '').trim().split(/\s+/u)) {
              if (reached !== '' && reached !== 'from' && reached !== 'global') {
                composes.set(selector, (composes.get(selector) ?? new Set()).add(reached))
              }
            }
          }
        }
      }
      at = after
    }
  }

  walk(source, null)
  return { source, declares, composes, queries }
}

/**
 * Every container name a selector establishes, following `composes`.
 *
 * @param sheet - The stylesheet it is declared in.
 * @param selector - The class name.
 * @returns The names, with `''` standing for an unnamed container.
 */
const establishedBy = (sheet: Sheet, selector: string): ReadonlySet<string> => {
  const found = new Set<string>(sheet.declares.get(selector) ?? [])
  const seen = new Set<string>([selector])
  const pending = [...(sheet.composes.get(selector) ?? [])]

  while (pending.length > 0) {
    const next = pending.pop() ?? ''
    if (seen.has(next)) continue
    seen.add(next)
    for (const name of sheet.declares.get(next) ?? []) found.add(name)
    pending.push(...(sheet.composes.get(next) ?? []))
  }
  return found
}

/**
 * Every selector that is queried for a container it establishes itself.
 *
 * @param file - The stylesheet's path under `apps/web`.
 * @returns One line per offence, naming the file, the selector and the container.
 */
const selfQueried = (file: string): readonly string[] => {
  const sheet = read(file)
  const offences: string[] = []

  for (const [name, selectors] of sheet.queries) {
    for (const selector of selectors) {
      const established = establishedBy(sheet, selector)
      // AN UNNAMED `@container` MATCHES THE NEAREST CONTAINER OF ANY NAME, so a
      // selector that establishes any container at all is its own subject there.
      const collides = name === '' ? established.size > 0 : established.has(name)
      if (collides) offences.push(`${file}: .${selector} is queried for a container it declares (${name || 'unnamed'})`)
    }
  }
  return offences
}

describe('container queries', () => {
  it('finds stylesheets that declare a container at all, so the case below cannot pass by finding nothing', () => {
    // THE SENTINEL. A walk that matched nothing, or a corpus that moved, would
    // make the intersection below empty and report every stylesheet clean —
    // which is worse than no guard, because it reports "all clear".
    const declaring = stylesheets().filter((file) => read(file).declares.size > 0)

    expect(declaring.length).toBeGreaterThan(0)
  })

  it('finds `@container` blocks with subjects in them, which is the other half of the sentinel', () => {
    const querying = stylesheets().filter((file) => read(file).queries.size > 0)

    expect(querying.length).toBeGreaterThan(0)
  })

  it('makes no element the subject of a query for a container it declares itself', () => {
    // THE WHOLE FINDING. An element cannot be its own query container, so such a
    // rule never matches and the screen silently draws its narrow shape. It has
    // happened four times in this repository; see this module's header.
    expect(stylesheets().flatMap(selfQueried)).toEqual([])
  })
})
