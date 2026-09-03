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
