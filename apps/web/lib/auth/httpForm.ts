/**
 * httpForm — what every endpoint on the bespoke sign-in surface does with a
 * raw `Request` before any decision is taken: read its fields, name the
 * address it came from, name the device, and answer with a redirect.
 *
 * IT EXISTS BECAUSE THE FIRST TWO OF THOSE WERE ALREADY WRITTEN TWICE. Task
 * 9's `newPasswordScreen.ts` had its own `submittedFields` and `seeOther`, and
 * Task 10 mounts four more endpoints that need the same two. A second copy of
 * a trust boundary is a second place for the throw `Request.formData()`
 * performs to go unhandled — which is the exact `500` the Task 9 re-review
 * found (`docs/api.md`) — so the two moved here and `newPasswordScreen.ts`
 * imports them. There is one definition of what an unparseable body means.
 *
 * PATTERNS (CLAUDE.md §3.3). None: four pure functions of a `Request`, with
 * no state between them and no collaborator to inject. This is not the `utils`
 * dumping ground §3.3 rejects — every function here is one step of turning an
 * HTTP request into the arguments the auth services take, and nothing that is
 * not that belongs in it.
 *
 * ═══ WHAT `clientAddress` CAN AND CANNOT PROMISE ═══
 *
 * `X-Forwarded-For` IS SET BY WHATEVER SPOKE LAST, AND ANY CLIENT CAN SEND
 * ONE. Behind a proxy that overwrites it — which is what Vercel, Cloudflare
 * and an nginx configured for it all do — the leftmost entry is the client. In
 * front of no proxy at all, it is whatever the client claimed. So the value
 * here is a RATE-LIMIT SUBJECT and a row on an abuse-review screen, never an
 * authorisation input: nothing in this repository admits or refuses a request
 * because of it. What a forged header buys an attacker is the ability to spend
 * somebody else's per-address budget, or to spread their own attempts across
 * many — and the second window `rateLimit.ts` keys on the claimed EMAIL is
 * what covers that case, which is why it exists.
 *
 * AN UNATTRIBUTABLE REQUEST GETS A NAMED LABEL RATHER THAN AN EMPTY STRING.
 * An empty subject would put every such request into one silent bucket; a
 * label puts them in one visible bucket, and `signInAttempts` rows carrying it
 * say what happened.
 *
 * INVARIANT — NOTHING HERE LOGS. Not the fields, not the address, not the user
 * agent (CLAUDE.md §7).
 *
 * Depends on: nothing.
 */

/**
 * What a request is attributed to when no proxy named an address.
 *
 * A label rather than `''` — see this module's header. It cannot collide with
 * a real address: no IPv4 or IPv6 text contains a hyphen followed by letters
 * in this shape.
 */
const UNATTRIBUTED_ADDRESS = 'unknown-address'

/**
 * The longest device label kept.
 *
 * A `User-Agent` is attacker-controlled text that ends up on the account
 * screen's session list, so its length is bounded here rather than in the
 * column: 200 characters is longer than every real user agent and short
 * enough that the header is a label rather than a way to write kilobytes into
 * a row per sign-in.
 */
const DEVICE_LABEL_LIMIT = 200

/**
 * The submission's fields, or none at all when the body is not a form.
 *
 * `Request.formData()` THROWS rather than returning empty for a body it
 * cannot parse — no `Content-Type`, or one naming anything but a form
 * encoding. Left unhandled, that throw becomes a `500` with an empty body at a
 * trust boundary, which is what CLAUDE.md §3.1 forbids and what this
 * repository shipped for one task.
 *
 * THE ERROR IS NOT INSPECTED, because there is nothing stable to inspect: the
 * runtime raises a plain `TypeError` whose message is its own wording, and
 * discriminating on that would be a contract this repository does not own.
 * Every unparseable body means one thing anyway — the request did not come
 * from one of our forms — so it is mapped to the empty submission each
 * endpoint's own schema already refuses, and there is ONE answer for every
 * request a screen did not make rather than two.
 *
 * ONE VALUE PER NAME, WHICH IS RIGHT FOR EVERY FIELD BUT ONE. `Object.fromEntries`
 * keeps the last of a repeated field, and every form on this surface sends each
 * of its fields once — except `SCREENS.md` §3.2's six code cells, which share a
 * name. That form's handler uses {@link submittedForm} instead, and that
 * function's header says what reading it through here cost.
 *
 * @param request - The `POST` as it arrived.
 * @returns The form's fields, or an empty object for a body that is not a
 *   form. Never throws.
 * @example
 * const submitted = signInSubmission.safeParse(await submittedFields(request))
 */
export const submittedFields = async (request: Request): Promise<Record<string, FormDataEntryValue>> => {
  const form = await submittedForm(request)
  return form === null ? {} : Object.fromEntries(form)
}

/**
 * The submission as a `FormData`, or `null` when the body is not a form.
 *
 * ═══ WHY THIS EXISTS BESIDE {@link submittedFields} (FIX ROUND 1) ═══
 *
 * `Object.fromEntries` keeps ONE value per name: a form that sends the same
 * field six times collapses to its last. `SCREENS.md` §3.2's one-time-code pane
 * is exactly that form — six `<input name="code" maxLength={1}>` cells — so a
 * handler reading it through `submittedFields` receives a ONE-CHARACTER code
 * and refuses every correct one.
 *
 * That is what happened. `docs/api.md` had recorded the shape from Task 8 ("the
 * code is posted as six repeated `code` fields, not one"), and the endpoint's
 * own integration cases sent a single `code` field — so the suite agreed with
 * the handler and neither agreed with the form. It was found by driving the
 * real pane in a browser, which is the only thing that could have.
 *
 * @param request - The `POST` as it arrived.
 * @returns The form, or `null` for a body that is not one. Never throws.
 * @example
 * const form = await submittedForm(request)
 * const code = form === null ? '' : form.getAll('code').map(String).join('')
 */
export const submittedForm = async (request: Request): Promise<FormData | null> => {
  try {
    return await request.formData()
  } catch {
    return null
  }
}

/**
 * A `303 See Other` pointing at `location`.
 *
 * 303 IN PARTICULAR, NEVER 302. 303 is the one status that requires the
 * browser to follow with a `GET`, and every endpoint on this surface spends
 * something — a link, an attempt, a session. A reader who reloaded a 302
 * would repeat the `POST`.
 *
 * @param location - Where the browser should go, as a root-relative path.
 * @param headers - Anything else the response must carry, typically a
 *   `Set-Cookie`. A redirect that carried no cookie would be a sign-in that
 *   established no session.
 * @returns The response, with no body at all.
 * @example
 * seeOther('/admin/sign-in/done', { 'Set-Cookie': issued.cookie })
 */
export const seeOther = (location: string, headers: Record<string, string> = {}): Response =>
  new Response(null, { status: 303, headers: { ...headers, Location: location } })

/**
 * The address a request came from, as far as anything can tell.
 *
 * @param request - The request as it arrived.
 * @returns The leftmost entry of `X-Forwarded-For`, else `X-Real-IP`, else
 *   {@link UNATTRIBUTED_ADDRESS}. See this module's header for what this value
 *   may and may not be used for.
 * @example
 * await limiter.admitPasswordAttempt({ ip: clientAddress(request), email })
 */
export const clientAddress = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  if (forwarded !== '') return forwarded

  const real = request.headers.get('x-real-ip')?.trim() ?? ''
  return real === '' ? UNATTRIBUTED_ADDRESS : real
}

/**
 * The device label the account screen shows beside a session.
 *
 * @param request - The request as it arrived.
 * @returns The `User-Agent`, clipped to {@link DEVICE_LABEL_LIMIT}
 *   characters, or `null` when the request sent none. `null` rather than a
 *   placeholder, because `sessions.device` is nullable and a row that says
 *   nothing is more honest than one that says "unknown" in a column a reader
 *   reads as a device.
 * @example
 * await sessions.startSession({ user, previous, keepSignedIn, device: deviceLabel(request), location: null })
 */
export const deviceLabel = (request: Request): string | null => {
  const agent = request.headers.get('user-agent')
  return agent === null || agent === '' ? null : agent.slice(0, DEVICE_LABEL_LIMIT)
}
