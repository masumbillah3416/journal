/**
 * inline-media-processor.integration.test.ts — the shared MediaProcessor
 * contract, run against the adapter that actually deploys.
 *
 * Nothing adapter-specific is asserted here on purpose: every claim about
 * `inline` is a claim about the contract, and the file that holds it is
 * `./contract/media-processor-contract.ts`. An assertion that belonged only
 * here would be a behaviour the `worker` adapter is free to get wrong, which
 * is what ADR 0004's non-negotiable exists to prevent.
 *
 * An `*.integration.test.ts` rather than a unit test because it calls `sharp`,
 * which is native and does real I/O-shaped work; the unit project is
 * Docker-free and pure by design. It needs no database.
 * Depends on: ./inline-media-processor, ./contract/media-processor-contract.
 */
import { mediaProcessorContract } from './contract/media-processor-contract'
import { createInlineMediaProcessor } from './inline-media-processor'

mediaProcessorContract('inline', () => Promise.resolve(createInlineMediaProcessor()), { mode: 'inline' })
