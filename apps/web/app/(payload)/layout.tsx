/**
 * layout.tsx — root layout for Payload's own admin UI and REST/GraphQL routes.
 *
 * Renders Payload's `RootLayout` around every route under this `(payload)` route
 * group (`/cms/**`, `/api/**`). The `(payload)` group keeps Payload's routes
 * isolated from the diary and bespoke `/admin` panel built in later phases.
 * Depends on: `@payloadcms/next/layouts`, `payload.config.ts`, the generated
 * `importMap.js` (written by `payload generate:importmap`).
 */
/* c8 ignore start -- Payload's own wiring around RootLayout; every branch
 * here needs a real Next.js request/render context Vitest cannot provide.
 * Runtime behaviour is covered by e2e/smoke.spec.ts's console-error
 * assertion against /cms, not a unit test. Wraps the imports too, not just
 * the exports: this file is never imported by any test, so every top-level
 * statement (including the imports) would otherwise show as an uncovered
 * line. See vitest.config.ts's coverage include comment for
 * apps/web/app/**. */
import type { ServerFunctionClient } from 'payload'
import config from '@payload-config'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'
import { importMap } from './cms/importMap.js'

type Args = {
  readonly children: React.ReactNode
}

/**
 * Payload's own Server Action dispatcher, and the ONE inline `'use server'`
 * this repository admits.
 *
 * `RootLayout` requires it: Payload's admin UI performs every mutation it makes
 * through this one function, and the directive has to be inside it because
 * Payload's own type is a function rather than a module. So it is a real POST
 * endpoint, mounted under an opaque action id, exactly like any other.
 *
 * WHY IT IS EXEMPT, WRITTEN OUT RATHER THAN DISABLED QUIETLY. It is not ours to
 * guard: `handleServerFunctions` authenticates the request itself against the
 * `payload-token` cookie and runs Payload's own collection access control on
 * whatever it dispatches. Wrapping it in `guardedAction` would demand a
 * `td-session` — the bespoke panel's cookie, which Payload knows nothing about
 * — and break `/cms` without adding a check. And since
 * `apps/web/collections/sealedUserAuth.ts` sealed every endpoint that could
 * mint a `payload-token`, no caller can hold one: this dispatcher's reachable
 * surface is whatever Payload grants an anonymous request, which is the same
 * surface `/api/**` already exposes and which `docs/api.md` documents.
 *
 * `apps/web/lib/auth/adminGuardRegistration.test.ts` holds an allowlist of the
 * files permitted to carry this disable, by exact path, so a SECOND one is a
 * failing test rather than a second quiet comment.
 */
// eslint-disable-next-line travel-diary/guarded-server-actions -- Payload's own dispatcher; it authenticates and access-controls itself, and cannot take our session. See the TSDoc above and docs/security.md.
const serverFunction: ServerFunctionClient = async (args) => {
  'use server'
  return handleServerFunctions({ ...args, config, importMap })
}

/** Wraps every Payload-owned route (`/cms`, `/api`) in Payload's admin chrome. */
const Layout = ({ children }: Args): React.JSX.Element => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
    {children}
  </RootLayout>
)

export default Layout
/* c8 ignore stop */
