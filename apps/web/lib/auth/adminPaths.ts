/**
 * adminPaths — every address the bespoke admin surface answers at, spelled
 * once.
 *
 * ═══ WHY THIS MODULE EXISTS: A DEFAULT-DENY ALLOWLIST MAKES DRIFT SILENT ═══
 *
 * `/admin/sign-in` was a separate literal in seven production files, none
 * importing another — `guard.ts`, `signInEndpoints.ts`, `newPasswordScreen.ts`,
 * `adminAccess.ts`, `CodeStep.tsx`, `ResetStep.tsx` and `NewPasswordStep.tsx` —
 * and the same held for every other address on this surface: each form's action
 * was a literal in a component AND a literal in `ADMIN_PUBLIC_PATHS`, with
 * nothing tying the two together.
 *
 * That matters more here than ordinary duplication does, because
 * `isGuardedAdminPath` (`./adminAccess.ts`) is DEFAULT-DENY. A component
 * constant that drifts from the allowlist does not 404: it posts to a path the
 * middleware treats as guarded, and the reader is redirected to sign-in with
 * nothing anywhere saying why. The failure is a silent redirect, which is the
 * hardest kind to see and the kind Phase 4 multiplies by ten screens. Phase 2's
 * final review named it seam S5.
 *
 * `./resetPath.ts` is the one address on this surface that was already done
 * this way, with the rationale below written at it, and it was not
 * generalised. This module generalises it, and `RESET_PATH` stays where it is:
 * it is also the prefix the emailed link is built on, which is a second job
 * this module does not have.
 *
 * ═══ WHY IT IMPORTS NOTHING, AND WHY THAT IS THE WHOLE DESIGN ═══
 *
 * Two sides of the client boundary need these strings.
 * `apps/web/lib/auth/signInEndpoints.ts` redirects to them and is server-only —
 * it pulls Payload and `node:crypto`, so importing it into a browser bundle is
 * not an option — while `apps/web/components/admin/*.tsx` are client components
 * whose forms post to them. A module that imports nothing and exports strings
 * is safe on both sides, and is the only shape that lets the two agree by
 * construction rather than by inspection.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven, the same declaration
 * `./resetPath.ts` makes. It is a set of constants and one list built from
 * them.
 *
 * INVARIANT — every address here is mounted. `adminPaths.test.ts` reads the
 * filesystem and fails if any one of them names no route file, which is the
 * direction `adminGuardRegistration.test.ts` cannot check: that test walks from
 * the routes to the policy, and this one walks from the constants a form
 * actually posts to back to the routes.
 *
 * Depends on: ./resetPath.
 */
import { RESET_PATH } from './resetPath'

/** SCREENS.md §3.1's password step, and where every refusal sends a reader. */
export const SIGN_IN_PATH = '/admin/sign-in'

/** Where SCREENS.md §3.1's form posts. */
export const PASSWORD_ENDPOINT = '/admin/sign-in/password'

/** SCREENS.md §3.2's one-time-code step. */
export const CODE_STEP_PATH = '/admin/sign-in/code'

/** Where SCREENS.md §3.2's six cells post. */
export const CODE_VERIFY_ENDPOINT = '/admin/sign-in/code/verify'

/** Where SCREENS.md §3.2's "Send a new code" posts. */
export const RESEND_ENDPOINT = '/admin/sign-in/code/resend'

/** SCREENS.md §3.4's signed-in state, where a completed sign-in lands. */
export const SIGNED_IN_PATH = '/admin/sign-in/done'

/**
 * The admin panel's root, which SCREENS.md §3.4's primary action opens.
 *
 * It had nothing mounted at it for the whole of Phase 2, so that action
 * answered a 404 (blocker B2). The INVARIANT above is what stops the next
 * address on this list being added the same way.
 */
export const ADMIN_PANEL_PATH = '/admin'

/** Where SCREENS.md §3.4's "Sign out and start again" posts. */
export const SIGN_OUT_ENDPOINT = '/admin/sign-out'

/** Where SCREENS.md §3.3's "Send the link" posts. */
export const RESET_REQUEST_ENDPOINT = `${RESET_PATH}/request`

/** Where the screen the mailed link lands on posts its new password. */
export const SET_PASSWORD_ENDPOINT = `${RESET_PATH}/set`

/**
 * Every address on this surface, so a check can walk the whole list.
 *
 * `${RESET_PATH}/[token]` is deliberately absent: it is a dynamic segment
 * rather than an address, and `resetPath.ts` owns the rules about what may sit
 * under it.
 */
export const ADMIN_SURFACE_PATHS: readonly string[] = [
  ADMIN_PANEL_PATH,
  SIGN_IN_PATH,
  PASSWORD_ENDPOINT,
  CODE_STEP_PATH,
  CODE_VERIFY_ENDPOINT,
  RESEND_ENDPOINT,
  SIGNED_IN_PATH,
  SIGN_OUT_ENDPOINT,
  RESET_PATH,
  RESET_REQUEST_ENDPOINT,
  SET_PASSWORD_ENDPOINT,
]
