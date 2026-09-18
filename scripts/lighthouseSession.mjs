/**
 * lighthouseSession.mjs — everything `run-lighthouse.mjs` DECIDES about the
 * session a collector carries, as pure functions with their own test.
 *
 * It sits beside `lighthouseAnnotations.mjs` for exactly the reason that module
 * exists: `run-lighthouse.mjs` spawns `npx lhci`, so no Vitest project can
 * execute it, so nothing in it may decide anything. Everything giving `/admin`
 * a budget needed deciding — which configurations need a session, how to read
 * the minted cookie off a pipe, what to hand lhci, and whether the screens that
 * were measured are the screens that were asked for — and all of it is here,
 * where a test can drive it.
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
 * ═══ WHY MINTING SUCCESSFULLY IS NOT ENOUGH ═══
 *
 * `run-lighthouse.mjs` refuses to run when minting FAILS LOUDLY, and that was
 * the whole of the check until this module gained {@link collectorLanded}. It
 * had no answer for the case that matters more: the cookie mints, is not
 * honoured, Lighthouse follows the guard's redirect, and **every assertion
 * passes on the sign-in screen**. Measured: that screen reports
 * `http-status-code` 1, 140,763 bytes of script against 327,680, LCP 2,929ms
 * against 3,085 and CLS 0 — four green assertions on the wrong page, and
 * `docs/testing.md` goes on quoting the shell's number while eleven screens are
 * budgeted against a measurement of the sign-in pane.
 *
 * The one field that tells them apart is the run's own final URL, and it was
 * something a person read out of the JSON once. {@link collectorLanded} is that
 * reading, executed. The `redirects` AUDIT cannot do this job and was measured:
 * it scores 0 on all four admin URLs today, including the three gated since
 * Phase 2, because every admin address self-redirects once.
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
 * One report's addresses, with the difference that is not a redirect removed.
 *
 * A single trailing slash is normalised away: `/admin/` answered at `/admin` is
 * one screen, not two, and failing on it would be a false red on a gate whose
 * whole value is that it only goes red for a real one.
 * @param {string} url - A URL from a Lighthouse report.
 * @returns {string} The comparable form.
 */
const comparable = (url) => url.replace(/\/$/, '')

/**
 * Whether the collector measured the screens it asked for.
 *
 * @param {readonly string[]} reports - The contents of each `lhr-*.json` lhci
 *   wrote for the configuration that just ran.
 * @returns {{ok: boolean, message: string}} `ok` when every run ended on the
 *   address it requested. An EMPTY set is refused rather than accepted: "no
 *   report says otherwise" is the silence this function exists to remove.
 * @throws {SyntaxError} When a report is not JSON, which is lhci's to explain.
 * @example
 * collectorLanded([readFileSync('.lighthouseci/lhr-1.json', 'utf8')]).ok
 */
export const collectorLanded = (reports) => {
  if (reports.length === 0) {
    return {
      ok: false,
      message: 'no Lighthouse report was written, so nothing says which screen was measured',
    }
  }

  const moved = new Map()
  for (const text of reports) {
    const lhr = JSON.parse(text)
    const requested = String(lhr.requestedUrl)
    // NO THIRD FALLBACK. A report carrying neither field answers `'undefined'`
    // here, which equals no requested URL and is therefore refused — which is
    // the right answer for a report that does not say where it ended up.
    const final = String(lhr.finalDisplayedUrl ?? lhr.finalUrl)
    if (comparable(requested) !== comparable(final)) moved.set(requested, final)
  }

  if (moved.size === 0) return { ok: true, message: '' }

  const lines = [...moved].map(([requested, final]) => `${requested} -> ${final}`).join('; ')
  return {
    ok: false,
    message: `the collector was answered somewhere else than it asked: ${lines}`,
  }
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
