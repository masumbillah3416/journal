/**
 * inline-media-processor — the MediaProcessor adapter that runs the pipeline
 * in-process (Ports & Adapters, CLAUDE.md §3.3).
 *
 * The adapter that actually deploys: `MEDIA_PIPELINE` defaults to `'inline'`,
 * and `docs/adr/0004-media-pipeline-mode.md` defers the Fly.io worker until
 * clips are turned on. Stills need no worker and no queue hop, so this runs
 * as part of handling the upload request on Vercel.
 *
 * ═══ IT IS THIN, DELIBERATELY ═══
 *
 * Two lines of behaviour: which types it accepts, and delegating to
 * `../media/stillPipeline`. Everything a reader might look for here - the
 * sniff, the SVG refusal, the EXIF strip, the re-encode, the hash - is in
 * that one shared module, because ADR 0004's contract-suite requirement is
 * only honest if both adapters run the SAME still pipeline rather than two
 * that agree today.
 *
 * ═══ WHY CLIPS ARE REFUSED HERE AND NOT IN THE SCHEMA ═══
 *
 * `apps/web/collections/media.ts` still lists `video/mp4` and
 * `video/quicktime`, transcribed from `DATA_MODEL.md`, and deferring video
 * changes none of it. `acceptedIngestTypes('inline')` omits both, so
 * `ingestDecision` answers `'video-deferred'` for a clip - refused by the
 * PORT, with the schema untouched, which is what keeps enabling clips ONE
 * configuration change rather than a migration.
 *
 * Depends on: `acceptedIngestTypes` from the domain's ingest policy,
 * `runStillPipeline` from ../media/stillPipeline, and the MediaProcessor port.
 */
import { acceptedIngestTypes } from '@travel-diary/domain/media/ingestPolicy'
import type { MediaProcessor } from '../ports/mediaProcessor'
import { runStillPipeline } from '../media/stillPipeline'

/** The mode this adapter is, in the one place it is named. */
const MODE = 'inline' as const

/**
 * Builds the in-process MediaProcessor.
 *
 * NOT a singleton and holds no state (CLAUDE.md §3.3's rejected
 * anti-patterns): a fresh, stateless object per call.
 * @returns A processor that accepts stills only and refuses clips as
 *   `'video-deferred'`.
 * @example
 * createInlineMediaProcessor().acceptedTypes // ['image/jpeg', 'image/png']
 */
export const createInlineMediaProcessor = (): MediaProcessor => ({
  acceptedTypes: acceptedIngestTypes(MODE),
  process: (upload) => runStillPipeline(upload, { mode: MODE }),
})
