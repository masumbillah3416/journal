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

/**
 * Why `MEDIA_PIPELINE=worker` is refused, and what removing this costs.
 *
 * Exported so `env.test.ts` asserts against this value rather than against a
 * substring of it, and so the message a refused boot prints is the message a
 * case has read. It names its own removal condition because a guard whose
 * removal condition lives only in a review is a guard somebody deletes for the
 * wrong reason.
 *
 * IT OPENS "accepted, and deliberately refused here" because `parseEnv`
 * prefixes it with `MEDIA_PIPELINE: ` and the whole line arrives as
 * `Invalid environment: …`. `'worker'` is not invalid — the enum takes it on
 * purpose, and the mode is real — so without that lead-in the operator's first
 * reading is "my value is malformed" and their first move is to fix a typo
 * that is not there.
 */
export const WORKER_NOT_DEPLOYED =
  'accepted, and deliberately refused here: MEDIA_PIPELINE=worker stores un-stripped originals, and no worker process exists in this repository to sniff, strip and re-encode them. Delete this refusal in the commit that deploys one - docs/adr/0004-media-pipeline-mode.md orders it provision, deploy, then set the flag.'

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
  /**
   * Public origin the bespoke admin is served at, and the origin every
   * emailed password-reset link is built against.
   *
   * REQUIRED, WITH NO DEFAULT, AND IT IS NOT THE SAME VALUE AS `MEDIA_ORIGIN`.
   * `apps/web/lib/auth/passwordReset.ts` refuses to take this off the request:
   * a link built from a `Host` header is a link an attacker points at their own
   * machine by setting that header while asking for somebody else's address,
   * and the reader who clicks it hands over a working reset token. So it has to
   * come from configuration — and a default here would be a plausible-looking
   * `http://localhost:3000` shipped to production, which is the one failure
   * mode worse than not booting. `MEDIA_ORIGIN` cannot stand in for it: in
   * production that is the media bucket's public origin, which serves no admin.
   */
  ADMIN_ORIGIN: z.string().min(1, 'ADMIN_ORIGIN is required'),
  /**
   * Which `MediaProcessor` adapter is bound, and with it: whether
   * `video/mp4`/`video/quicktime` are accepted at ingest, and whether the
   * admin shows clip affordances. One variable rather than three, so
   * "enable video" cannot be half-done (docs/adr/0004-media-pipeline-mode.md).
   *
   * ═══ `'worker'` PARSES AND IS THEN REFUSED, AND THAT IS THE POINT ═══
   *
   * Under `worker`, `apps/web/lib/media/ingestUpload.ts` does not run the
   * pipeline: ADR 0004's amendment puts the queue hop between the receiver and
   * the worker, so ingest records the STAGED ORIGINAL at `state: 'processing'`
   * and enqueues a `transcode` job for a process that would sniff, strip and
   * re-encode it. **No such process exists in this repository.** So setting
   * this to `worker` today writes the author's un-stripped JPEG - GPS EXIF
   * intact - into the media store, and `apps/web/collections/media.ts`'s
   * `read` access now withholds it from a signed-out reader on `state`, which
   * is the second of the two controls. This is the first, and it is a BOOT
   * failure rather than a request failure, so it cannot be reached with bytes
   * already stored.
   *
   * The value stays in the enum rather than being removed from it because the
   * mode itself is real: `mediaProcessorFor('worker')` and
   * `acceptedIngestTypes('worker')` both take the mode as an argument and are
   * exercised under it, and {@link Env}'s type is what the rest of the tree
   * passes around. What is refused is CONFIGURING the process into it.
   *
   * Deleting this refusal is a one-line change in the commit that deploys a
   * worker, which is ADR 0004's own order: provision the app, deploy the
   * container, then set the flag.
   */
  MEDIA_PIPELINE: z
    .enum(['inline', 'worker'])
    .default('inline')
    .refine((mode) => mode !== 'worker', {
      message: WORKER_NOT_DEPLOYED,
    }),
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
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
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
