/**
 * page.tsx — catch-all route rendering every Payload admin screen under `/cms`.
 *
 * `routes.admin: '/cms'` in `payload.config.ts` moves Payload's generated admin
 * here so it never collides with `/admin`, the design's bespoke panel arriving
 * in a later phase. Depends on: `@payloadcms/next/views`, `payload.config.ts`,
 * the generated `importMap.js`.
 */
import type { Metadata } from 'next'
import config from '@payload-config'
import { generatePageMetadata, RootPage } from '@payloadcms/next/views'
import type React from 'react'
import { importMap } from '../importMap.js'

type Args = {
  readonly params: Promise<{ segments: string[] }>
  readonly searchParams: Promise<{ [key: string]: string | string[] }>
}

/** Builds the `<title>`/meta tags for the current admin screen. */
export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams })

/** Renders whichever admin screen `segments` addresses (dashboard, collection list, edit view, ...). */
const Page = ({ params, searchParams }: Args): Promise<React.JSX.Element> =>
  RootPage({ config, importMap, params, searchParams })

export default Page
