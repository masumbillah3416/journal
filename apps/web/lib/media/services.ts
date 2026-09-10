/**
 * services — the one place `MEDIA_PIPELINE` chooses a MediaProcessor.
 *
 * Written into each caller, "which adapter" would be several answers and one
 * of them would be wrong. Here it is one answer, and adding a caller cannot
 * change it by accident. Modelled on `apps/web/lib/auth/services.ts`, which
 * is the same decision for the sign-in surface's five services.
 *
 * NOT a singleton: it holds no state and returns a fresh stateless adapter per
 * call (CLAUDE.md §3.3's rejected anti-patterns). The `worker` branch is
 * handed the REAL `ffmpeg` toolchain - resolved off `PATH`, because a Fly.io
 * worker container installs both binaries system-wide - and this is the only
 * module that names it, which is what keeps every other module ignorant of
 * whether a subprocess exists.
 *
 * ═══ WHY THE CHOICE IS A FUNCTION OF THE MODE, AND NOT OF `env` DIRECTLY ═══
 *
 * `env` is parsed ONCE, at import, from the real `process.env` - which is the
 * whole point of `apps/web/lib/env.ts`. So a `mediaProcessor()` that read
 * `env` inline would have exactly one testable answer per run, and the other
 * branch could only be reached by stubbing our own module, which CLAUDE.md
 * §2.3 forbids. {@link mediaProcessorFor} takes the mode as an argument, so
 * BOTH answers are reachable without a mock; {@link mediaProcessor} is the
 * one line that supplies the configured one. It is not a speculative
 * extension point (CLAUDE.md §4): it has two real callers, and the smallest
 * honest proof that the flag is wired to something rather than declared is
 * "the two modes bind adapters that accept different types", which needs
 * both.
 *
 * PATTERN (CLAUDE.md §3.3): Ports & Adapters - this module names the concrete
 * adapters, and nothing above or below it does.
 * Depends on: `env` (../env), both MediaProcessor adapters, and
 * `createFfmpegToolchain` (./clipToolchain).
 */
import type { PipelineMode } from '@travel-diary/domain/media/ingestPolicy'
import { createInlineMediaProcessor } from '../adapters/inline-media-processor'
import { createWorkerMediaProcessor } from '../adapters/worker-media-processor'
import { env } from '../env'
import type { MediaProcessor } from '../ports/mediaProcessor'
import { createFfmpegToolchain } from './clipToolchain'

/**
 * The MediaProcessor one pipeline mode names.
 * @param mode - Which pipeline to bind. The configured value comes from
 *   {@link mediaProcessor}; a test supplies both.
 * @returns The `worker` adapter, handed the REAL `ffmpeg` toolchain resolved
 *   off `PATH` (a Fly.io worker container installs both binaries
 *   system-wide), or the `inline` adapter.
 * @example
 * mediaProcessorFor('inline').acceptedTypes // ['image/jpeg', 'image/png']
 */
export const mediaProcessorFor = (mode: PipelineMode): MediaProcessor =>
  mode === 'worker'
    ? createWorkerMediaProcessor({
        toolchain: createFfmpegToolchain({ ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' }),
      })
    : createInlineMediaProcessor()

/**
 * The MediaProcessor the configured `MEDIA_PIPELINE` names.
 * @returns The `worker` adapter under `MEDIA_PIPELINE=worker`, the `inline`
 *   adapter otherwise - which is the default, so this is `inline` unless
 *   somebody has provisioned the worker.
 * @example
 * mediaProcessor().acceptedTypes // ['image/jpeg', 'image/png'] by default
 */
export const mediaProcessor = (): MediaProcessor => mediaProcessorFor(env.MEDIA_PIPELINE)
