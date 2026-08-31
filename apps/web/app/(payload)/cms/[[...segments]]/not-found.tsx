/**
 * not-found.tsx — Payload's own 404 view for unmatched `/cms/**` routes.
 * Depends on: `@payloadcms/next/views`, `payload.config.ts`, `importMap.js`.
 */
import type { Metadata } from 'next'
import config from '@payload-config'
import { generatePageMetadata, NotFoundPage } from '@payloadcms/next/views'
import type React from 'react'
import { importMap } from '../importMap.js'

type Args = {
  readonly params: Promise<{ segments: string[] }>
  readonly searchParams: Promise<{ [key: string]: string | string[] }>
}

/** Builds the `<title>`/meta tags for the 404 view. */
export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams })

/** Renders Payload's 404 screen, styled consistently with the rest of `/cms`. */
const NotFound = ({ params, searchParams }: Args): Promise<React.JSX.Element> =>
  NotFoundPage({ config, importMap, params, searchParams })

export default NotFound
