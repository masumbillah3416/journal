/**
 * env — validated access to process environment variables.
 *
 * Runtime validation at a trust boundary (CLAUDE.md §3.1): environment variables
 * arrive as untyped strings from the OS, so they are parsed and validated with
 * Zod before anything in the application trusts their shape. `parseEnv` returns
 * a `Result` so a caller (the env.test.ts suite) can assert on failure without
 * a thrown exception; the module-level `env` export throws on import when the
 * environment is invalid, because failing at boot is correct here — a mis-set
 * secret must never reach a request. Loads `.env` via `@next/env` (the same
 * loader Payload's own CLI uses) before validating, from the repository root
 * rather than `process.cwd()` — this file runs with three different working
 * directories (`next dev` and the Payload CLI both run from `apps/web`, via
 * `-w apps/web`; Vitest runs from the repo root), so one `.env` file next to
 * `.env.example` backs all three rather than needing a copy per directory.
 * Vitest's `unit` project overrides these three variables directly (see
 * vitest.config.ts) so unit tests never depend on `.env` or Docker at all.
 * Depends on: zod, Result from `@travel-diary/domain/result`, `@next/env`.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'
import nextEnv from '@next/env'
import { z } from 'zod'

// `@next/env` ships as CJS; destructuring after a default import (rather than
// a named import) is the interop-safe form Payload's own CLI uses internally.
const { loadEnvConfig } = nextEnv

// apps/web/lib/env.ts -> apps/web/lib -> apps/web -> apps -> repo root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

// Idempotent and additive: never overrides a variable already set in the
// process (e.g. by Vitest's `test.env`, or the shell).
loadEnvConfig(repoRoot)

const envSchema = z.object({
  /** Postgres connection string. Required — there is no meaningful default. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /**
   * Symmetric secret Payload uses to sign auth tokens. A short secret is
   * brute-forceable, so 32 characters is enforced rather than merely recommended.
   */
  PAYLOAD_SECRET: z.string().min(32, 'PAYLOAD_SECRET must be at least 32 characters'),
  /** Public origin the diary client fetches media derivatives from. */
  MEDIA_ORIGIN: z.string().min(1, 'MEDIA_ORIGIN is required'),
})

/** The application's validated environment shape. */
export type Env = z.infer<typeof envSchema>

/**
 * Validates a raw environment record against {@link envSchema}.
 * @param raw - Candidate environment variables, e.g. `process.env`.
 * @returns `ok` with the validated {@link Env}, or `err` with a message naming
 * every field that failed and why, joined so a single log line is diagnosable.
 */
export const parseEnv = (raw: Record<string, string | undefined>): Result<Env, string> => {
  const parsed = envSchema.safeParse(raw)
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    return err(message)
  }
  return ok(parsed.data)
}

const parsed = parseEnv(process.env)
if (!parsed.ok) {
  // Fail at boot, not at first use — a mis-set secret must never reach a request.
  throw new Error(`Invalid environment: ${parsed.error}`)
}

/** The process's validated environment. Throws on import if invalid. */
export const env: Env = parsed.value
