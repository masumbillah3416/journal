/**
 * layout.tsx — root layout for Payload's own admin UI and REST/GraphQL routes.
 *
 * Renders Payload's `RootLayout` around every route under this `(payload)` route
 * group (`/cms/**`, `/api/**`). The `(payload)` group keeps Payload's routes
 * isolated from the diary and bespoke `/admin` panel built in later phases.
 * Depends on: `@payloadcms/next/layouts`, `payload.config.ts`, the generated
 * `importMap.js` (written by `payload generate:importmap`).
 */
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
