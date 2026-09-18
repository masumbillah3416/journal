/**
 * lighthouseSession.mjs — everything `run-lighthouse.mjs` DECIDES about the
 * session a collector carries, as pure functions with their own test.
 *
 * It sits beside `lighthouseAnnotations.mjs` for exactly the reason that module
 * exists: `run-lighthouse.mjs` spawns `npx lhci`, so no Vitest project can
 * execute it, so nothing in it may decide anything. Three decisions were
 * needed to give `/admin` a budget — which configurations need a session, how
 * to read the minted cookie off a pipe, and what to hand lhci — and all three
 * are here, where a test can drive them.
 *
 * ═══ WHY ANY CONFIGURATION COLLECTING `/admin…` GETS THE COOKIE ═══
 *
 * The narrow rule would be "only the addresses `isGuardedAdminPath` calls
 * guarded". That predicate is TypeScript, in `apps/web/lib/auth/adminAccess.ts`,
 * and `node` cannot import it — so the narrow rule means a SECOND spelling of
 * the guard, in a language that cannot check itself against the first.
 *
 * The broad rule needs no spelling of the guard at all, and it is safe because
 * the public admin screens do not read the cookie: neither
 * `app/(admin)/admin/sign-in/page.tsx` nor `app/(admin)/admin/reset/page.tsx`
 * calls the guard or redirects a reader who is already signed in, so the three
 * sign-in budgets measure exactly what they measured before. What would catch
 * it if that ever changed is the gate itself — `http-status-code` at
 * `minScore: 1`, asserted on those URLs — and a redirect away from a collected
 * address is what that assertion is for.
 *
 * ═══ THE COOKIE NAME IS SPELLED TWICE, AND THAT IS PINNED ═══
 *
 * {@link SESSION_COOKIE} repeats `packages/domain/src/auth/session.ts`'s
 * `SESSION_COOKIE_NAME` because this file is `.mjs`. `lighthouseSession.test.js`
 * imports the domain constant and refuses any other value here, so the two
 * cannot drift.
 *
 * Depends on: nothing.
 */

/**
 * The cookie an admin session travels in.
 *
 * A second spelling of `SESSION_COOKIE_NAME` — see this module's header, and
 * the case in `lighthouseSession.test.js` that pins it to the first.
 */
export const SESSION_COOKIE = 'td-session'

/**
 * Whether a Lighthouse configuration collects any address under `/admin`.
 *
 * @param {string} configText - The `lighthouserc*.json` file's contents.
 * @returns {boolean} `true` when at least one collected URL's path is `/admin`
 *   or sits beneath it.
 * @throws {SyntaxError} When the text is not JSON, which is a configuration
 *   this runner could not have run anyway.
 * @example
 * collectsAdmin(readFileSync('lighthouserc.admin.json', 'utf8')) // true
 */
export const collectsAdmin = (configText) => {
  const parsed = JSON.parse(configText)
  const urls = parsed?.ci?.collect?.url ?? []

  return urls.some((url) => {
    const { pathname } = new URL(url)
    return pathname === '/admin' || pathname.startsWith('/admin/')
  })
}

/**
 * The cookie header a minting run printed, out of everything it printed.
 *
 * READ AS THE LAST MATCHING LINE, not as the whole of stdout. `payload run`
 * boots Payload to execute the script, and a boot notice on the same stream
 * would otherwise become part of the credential — which fails silently, as a
 * collector that is answered with the sign-in screen.
 *
 * @param {string} stdout - Everything the minting command wrote to stdout.
 * @returns {string | null} The `td-session=…` header, or `null` when nothing
 *   printed one — which the caller must treat as fatal, because a run without
 *   it measures `/admin/sign-in` under `/admin`'s name.
 * @example
 * sessionCookie('booting…\ntd-session=abc\n') // 'td-session=abc'
 */
export const sessionCookie = (stdout) => {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(`${SESSION_COOKIE}=`) && line.length > SESSION_COOKIE.length + 1)

  return lines.at(-1) ?? null
}

/**
 * What to add to `lhci autorun` so the collector sends that cookie.
 *
 * ONE ARGUMENT PER HEADER, in yargs' dot notation, rather than one JSON blob:
 * `--collect.settings.extraHeaders={"Cookie":"…"}` reaches Lighthouse as a
 * STRING where its config expects an object, and Lighthouse then sends no
 * header at all. The dotted form builds the object yargs-side.
 *
 * @param {string} cookie - The header value, from {@link sessionCookie}.
 * @returns {readonly string[]} The override arguments.
 * @example
 * sessionOverrideArgs('td-session=abc') // ['--collect.settings.extraHeaders.Cookie=td-session=abc']
 */
export const sessionOverrideArgs = (cookie) => [`--collect.settings.extraHeaders.Cookie=${cookie}`]
