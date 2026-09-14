/**
 * clipToolchain.integration.test.ts — what can be proven about the `ffmpeg`
 * boundary on a machine that has no `ffmpeg`.
 *
 * ═══ WHAT IS UNRESOLVED HERE, STATED RATHER THAN IMPLIED ═══
 *
 * `ffmpeg` and `ffprobe` are not installed on the authoring machine, so the
 * SUCCESS arms of `createFfmpegToolchain` - a duration parsed out of
 * `ffprobe`'s stdout, a transcoded MP4, an extracted poster frame - have never
 * been executed locally. **That is UNRESOLVED, and the tool that settles it is
 * `ffmpeg` itself.** Nothing was routed through an online transcoder to buy a
 * green tick (CLAUDE.md §7.1). CI installs both binaries and sets
 * `MEDIA_REQUIRE_CLIP_TOOLCHAIN=1`, so those arms run there and a runner
 * without them fails the build.
 *
 * ═══ WHAT IS PROVEN HERE, WHICH IS MORE THAN IT LOOKS ═══
 *
 * Every FAILURE arm, and it needs no `ffmpeg` at all: pointed at a binary that
 * does not exist, each of the three calls has to come back as a typed `err`
 * rather than a rejected promise or a crash. That covers the subprocess
 * helper, the temp-file round trip and each method's error return - which is
 * exactly the code path a real `ffmpeg` failure in production takes.
 *
 * The temp-directory cleanup is asserted for the same reason: it is in a
 * `finally`, so nothing else would ever notice it missing, and a leaked
 * directory per upload is a disk that fills up quietly.
 *
 * PATTERN (CLAUDE.md §3.3): none. A boundary driven at a binary that is not
 * there.
 * Depends on: vitest, node:fs/promises, node:os, ./clipToolchain, and the
 * domain's byte-level fixtures.
 */
import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { anIsoBmffHeader } from '@travel-diary/domain/testing/bytes'
import { clipToolchainAvailable, clipToolchainForTests, createFfmpegToolchain } from './clipToolchain'

/** Names no binary on any machine, so the spawn fails rather than transcoding. */
const ABSENT = {
  ffmpegPath: 'travel-diary-no-such-ffmpeg',
  ffprobePath: 'travel-diary-no-such-ffprobe',
} as const

/** The prefix `withClipOnDisk` gives its temp directories. */
const TEMP_PREFIX = 'diary-clip-'

/**
 * Which of those directories are currently lying around.
 *
 * The NAMES rather than a count, so the assertion is about the directories
 * this call left behind and not about a total that could stay equal while a
 * different directory leaked.
 * @returns Every entry in `os.tmpdir()` with the prefix.
 */
const strayTempDirectories = async (): Promise<readonly string[]> => {
  const entries = await readdir(tmpdir())
  return entries.filter((entry) => entry.startsWith(TEMP_PREFIX))
}

describe('the toolchain pointed at binaries that do not exist', () => {
  it('answers a typed error from probe rather than rejecting, so a caller can refuse the upload', async () => {
    const probed = await createFfmpegToolchain(ABSENT).probe(anIsoBmffHeader({ brand: 'isom' }))

    expect(probed.ok).toBe(false)
    expect(probed.ok ? '' : probed.error).toContain('ffprobe')
  })

  it('answers a typed error from transcode rather than rejecting', async () => {
    const transcoded = await createFfmpegToolchain(ABSENT).transcode(anIsoBmffHeader({ brand: 'isom' }))

    expect(transcoded.ok).toBe(false)
    expect(transcoded.ok ? '' : transcoded.error).toContain('ffmpeg')
  })

  it('answers a typed error from poster extraction rather than rejecting', async () => {
    const poster = await createFfmpegToolchain(ABSENT).poster(anIsoBmffHeader({ brand: 'isom' }), 0.5)

    expect(poster.ok).toBe(false)
    expect(poster.ok ? '' : poster.error).toContain('ffmpeg')
  })

  it('removes the temp directory it wrote the clip into, even when the binary never ran', async () => {
    // It is removed in a `finally`, so nothing else in the system would ever
    // notice it missing - and a leaked directory per upload is a disk that
    // fills up quietly.
    const before = new Set(await strayTempDirectories())

    await createFfmpegToolchain(ABSENT).transcode(anIsoBmffHeader({ brand: 'isom' }))

    const leaked = (await strayTempDirectories()).filter((entry) => !before.has(entry))
    expect(leaked).toEqual([])
  })
})

describe('which toolchain the contract suite is handed', () => {
  it('is the real one wherever the binaries exist, and the stand-in only where they do not', async () => {
    // THE MUTATION THIS EXISTS TO CATCH is an edit that returns the recorded
    // stand-in unconditionally. Nothing else would notice: the suite would
    // stay green on a runner WITH ffmpeg while never executing a line of it,
    // which is precisely the silent rot ADR 0004's non-negotiable is about.
    //
    // It discriminates with no environment branch of its own. A sixteen-byte
    // fake `ftyp` header is not a clip: a real `ffprobe` either exits
    // non-zero on it or reports no usable duration, and `probe` answers `err`
    // for both - while the stand-in reports a duration regardless of the
    // bytes. So `probed.ok` IS a direct read of which toolchain was chosen,
    // and it has to be the opposite of whether the binaries are installed.
    const probed = await clipToolchainForTests().probe(anIsoBmffHeader({ brand: 'isom' }))

    expect(probed.ok).toBe(!(await clipToolchainAvailable()))
  })
})

describe('the availability probe', () => {
  it('answers with a boolean rather than throwing, on a machine with neither binary', async () => {
    // Deliberately not asserted as `false`: it is `false` on the authoring
    // machine and `true` in CI, and pinning either would make this file pass
    // in one place and fail in the other for no defect. What is asserted is
    // that asking is safe - the whole point of the helper is that a missing
    // binary is an ANSWER rather than an exception.
    expect(typeof (await clipToolchainAvailable())).toBe('boolean')
  })
})
