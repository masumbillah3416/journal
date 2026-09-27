/**
 * bookGateRegistration.test.ts — every route this repository serves to a
 * signed-out reader either spends `site.passwordProtect` or is named here with
 * the reason it does not.
 *
 * ═══ WHY THIS EXISTS, AND IT IS NOT A HYPOTHETICAL ═══
 *
 * Phase 4 Task 13 built the gate, spent it at the four addresses it had
 * written, and wrote in four places that those four were *"every address that
 * serves a reader anything"*. They were not. Payload's own REST route,
 * its GraphQL route and `/api/media/file/<name>` — the URL the diary's own
 * `<img>` tags resolve to — served a complete, paginated index of every
 * non-hidden photograph and then the bytes, on a book whose pages answered
 * 401. The review measured it. The count in prose was wrong by one, and the
 * one it was wrong by was the photographs.
 *
 * So the count is no longer in prose. It is this file, which reads the route
 * tree off disk: a public route file that neither applies the gate nor is
 * classified here fails, **by name**, on the commit that adds it.
 *
 * ═══ THE TWO MECHANISMS, AND WHY THERE ARE TWO ═══
 *
 * 1 · **A route this repository wrote** spends `bookIsGated` in its own body,
 *     the way `adminGuardRegistration.test.ts` requires a guard to be applied
 *     AT the route rather than inherited: a check that has to look elsewhere
 *     for its subject is one a neighbour can satisfy.
 * 2 · **A route Payload wrote** cannot be edited here at all, and there are
 *     three of them onto one collection. They are gated by
 *     `apps/web/collections/media.ts`'s `read` rule, which all three pass
 *     through — the fix is one predicate rather than three routes, because
 *     three routes is how the hole above came to exist.
 *
 * Both mechanisms are asserted: {@link PUBLIC_WITHOUT_THE_GATE} carries the
 * second, and the case below requires the media rule to be the one that
 * actually consults the setting.
 *
 * ═══ WHAT THIS IS NOT ═══
 *
 * It is not a proof that a gated request is refused — `e2e/bookGate.spec.ts`
 * asks a running server that, over all five surfaces, and
 * `apps/web/collections/adminAccess.integration.test.ts` asks the rule
 * directly. What this fails on is a public route landing with no decision
 * recorded about whether the gate reaches it.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A walk, a classification and
 * two comparisons.
 *
 * INVARIANT — the population is read off disk, so a route a later task adds is
 * inside this guard from the commit that adds it, and the first case refuses a
 * walk that has stopped finding routes at all.
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Where the route tree is resolved from — `apps/web`. */
const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The files Next.js serves an address from. */
const ROUTE_FILES = new Set(['page.tsx', 'route.ts'])

/** The call that spends the gate. A call, never a mention. */
const APPLIES_THE_GATE = /bookIsGated\(/u

/**
 * A route segment that contributes nothing to the address.
 *
 * Next.js route GROUPS are parenthesised and are erased from the URL, which is
 * how `app/(diary)/p/[n]/page.tsx` serves `/p/<n>`.
 */
const ROUTE_GROUP = /^\(.+\)$/u

/**
 * Where the admin lives. Everything under it is the author's, behind
 * `requireAdminSession` or `guarded`, and `adminGuardRegistration.test.ts` is
 * what holds that — a book gate there would be a second authority on a
 * question that already has one.
 */
const ADMIN_PREFIX = '/admin'

/** Payload's own generated admin, which authenticates with Payload's own cookie. */
const PAYLOAD_ADMIN_PREFIX = '/cms'

/**
 * The public routes that do NOT spend the gate in their own body, each with
 * the mechanism that covers them instead.
 *
 * FAIL-CLOSED IN BOTH DIRECTIONS: a route here that has since started applying
 * the gate fails too, so this list cannot outlive its reasons.
 */
const PUBLIC_WITHOUT_THE_GATE: readonly { readonly file: string; readonly why: string }[] = [
  {
    file: 'app/robots.ts',
    why: 'the crawl policy itself. Refusing it would hide the Disallow a closed book most wants a crawler to read, and it serves no content — SECURITY.md asks for this file by name',
  },
  {
    file: 'app/(payload)/api/[...slug]/route.ts',
    why: "Payload's own REST route, onto every collection. Gated by the collections' `read` rules — `media.ts` consults `passwordProtect`, and `journeys`, `pages` and the globals already refuse a signed-out caller outright",
  },
  {
    file: 'app/(payload)/api/graphql/route.ts',
    why: 'the second door onto those same rules. One predicate, not two routes',
  },
  {
    file: 'app/(payload)/api/graphql-playground/route.ts',
    why: "a development-only explorer for the route above; it serves no row of its own, and Payload disables it in production alongside the admin (`payload.config.ts`'s `admin.disable`)",
  },
]

/**
 * The address Next.js serves a route file at.
 *
 * @param file - The file's path relative to `apps/web`.
 * @returns The address, with route groups erased and the file name dropped.
 * @example
 *   addressOf('app/(diary)/p/[n]/page.tsx') // '/p/[n]'
 */
const addressOf = (file: string): string => {
  const segments = file.split('/').slice(1, -1)
  const kept = segments.filter((segment) => !ROUTE_GROUP.test(segment))
  return `/${kept.join('/')}`
}

/**
 * Every route file under `apps/web/app`, relative to `apps/web`.
 *
 * Read off disk rather than listed, so a route a later task adds is inside
 * this guard without anybody remembering it.
 * @returns The paths, sorted.
 */
const routeFiles = (): readonly string[] =>
  readdirSync(path.join(APP, 'app'), { recursive: true })
    .map(String)
    .map((entry) => `app/${entry.split(path.sep).join('/')}`)
    .filter((entry) => ROUTE_FILES.has(entry.split('/').slice(-1)[0] ?? ''))
    .sort()

/**
 * Every route file this repository serves to a signed-out reader.
 *
 * `app/robots.ts` is not under a directory, so it is added by name: it is a
 * metadata route rather than a `route.ts`, and it is as public as anything
 * here.
 * @returns The paths, sorted.
 */
const publicRouteFiles = (): readonly string[] =>
  [
    ...routeFiles().filter((file) => {
      const address = addressOf(file)
      return !address.startsWith(ADMIN_PREFIX) && !address.startsWith(PAYLOAD_ADMIN_PREFIX)
    }),
    'app/robots.ts',
  ].sort()

/**
 * One route file's source.
 * @param file - Its path relative to `apps/web`.
 * @returns The file, as written.
 */
const sourceOf = (file: string): string => readFileSync(path.join(APP, file), 'utf8')

describe('the addresses a signed-out reader can ask for', () => {
  it('are found at all, so the cases below cannot pass by walking an empty tree', () => {
    expect(routeFiles().length, 'the walk found no route files').toBeGreaterThan(20)
    expect(publicRouteFiles().length, 'the walk found no public route files').toBeGreaterThan(4)
  })

  it('each either spend the gate in their own body or are classified here', () => {
    // THE WHOLE FINDING IN ONE ASSERTION. A public route that neither asks
    // `bookIsGated` nor appears in `PUBLIC_WITHOUT_THE_GATE` fails BY NAME,
    // which is what "every address that serves a reader anything" has to mean
    // if it is going to be written down.
    const classified = new Set(PUBLIC_WITHOUT_THE_GATE.map((route) => route.file))
    const unclassified = publicRouteFiles().filter(
      (file) => !classified.has(file) && !APPLIES_THE_GATE.test(sourceOf(file)),
    )

    expect(
      unclassified,
      'these routes answer a signed-out reader and neither apply the book gate nor say why they do not',
    ).toEqual([])
  })

  it('spend it at the four this repository writes, and nowhere it was not meant to', () => {
    // THE OTHER DIRECTION, and it is what makes the count above a MEASUREMENT
    // rather than a list somebody keeps. The four are enumerated by the walk,
    // not by this array — the array is only what the walk must agree with.
    const applying = publicRouteFiles().filter((file) => APPLIES_THE_GATE.test(sourceOf(file)))

    expect(applying).toEqual([
      'app/(diary)/gallery/[slug]/download/[id]/route.ts',
      'app/(diary)/gallery/[slug]/page.tsx',
      'app/(diary)/m/[n]/page.tsx',
      'app/(diary)/p/[n]/page.tsx',
    ])
  })

  it('leave no classification standing for a route that has since started applying it', () => {
    // Fail-closed the other way: an entry here that is no longer needed is an
    // excuse nobody is using, and the reason it carries stops being read.
    const stale = PUBLIC_WITHOUT_THE_GATE.filter((route) => APPLIES_THE_GATE.test(sourceOf(route.file)))

    expect(stale.map((route) => route.file)).toEqual([])
  })

  it('cover Payload’s three routes with a media rule that really reads the setting', () => {
    // The classification above says the Payload routes are covered by the
    // collections' own rules. This is what makes that sentence checkable: the
    // rule has to CONSULT the column, not merely mention it in a comment.
    const rule = readFileSync(path.join(APP, 'collections/media.ts'), 'utf8')
    const body = rule.slice(rule.indexOf('read: async'), rule.indexOf('create: ({ req: { user } })'))

    expect(body).toContain("slug: 'site'")
    expect(body).toContain('passwordProtect')
    expect(body).toContain('return false')
  })

  it('names a reason for every classification, so none is a bare filename', () => {
    expect(PUBLIC_WITHOUT_THE_GATE.filter((route) => route.why.length < 40).map((route) => route.file)).toEqual([])
  })
})
