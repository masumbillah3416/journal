/**
 * securityRequirements.test.ts — every requirement the handoff's `SECURITY.md`
 * states has a discharge section in `docs/security.md`, and every discharge
 * section names a requirement the handoff actually states.
 *
 * Pattern (CLAUDE.md §3.3): none of the seven. Two extractions and a set
 * comparison in both directions.
 *
 * `docs/security.md` was one 642KB table until the Phase 3 standards task, and
 * a restructure of a document that size can silently drop a row. A dropped
 * security requirement is the failure nobody notices until it matters, and
 * reviewer inspection is not evidence over that many bytes. This is the check
 * that answers "did the rewrite lose one?" on every commit instead.
 *
 * It found three on its first run: keeping location opt-in per journey, the
 * diary served with no credentials attached, and separate credentials for the
 * media bucket. None had a row in the table it replaced, while that document's
 * first sentence said every requirement had a named home.
 *
 * INVARIANTS a future edit could break:
 *   - The requirement list is DERIVED from `handoff/**`, which is evidence and
 *     is never edited (CLAUDE.md §1.3, `.prettierignore`). Nothing here lists a
 *     known-good requirement: a bullet added to the handoff fails this file
 *     until a section quotes it.
 *   - Both directions are asserted. A marker quoting text the handoff does not
 *     contain fails too, so a requirement cannot be paraphrased into agreement.
 *   - Markers are matched against the whitespace-collapsed document, because a
 *     marker long enough to wrap is one phrase on the page and two lines in the
 *     file.
 *   - Exactly one notation difference is normalised, and it is Prettier's:
 *     see {@link withOneSpellingOfEmphasis}. Nothing else is - not case, not
 *     punctuation, not spacing between words.
 *
 * WHAT IT DOES NOT CATCH, stated rather than implied: the handoff states TWO
 * requirements as paragraphs rather than as bullets, and a paragraph has no
 * shape a derivation can separate from the prose around it. They are "Required:
 * the code step is required or not based on `users.otpRequired`…" and "Also: the
 * gallery's download action must serve a derivative through your own handler,
 * not a bucket URL", which is a distinct obligation from the bullet above it
 * (that one is about `Content-Disposition` and `Content-Type`). Both have a
 * section in `docs/security.md` — the second inside "Downloads through our
 * handler" — but this check is not what keeps either there. Nor does it judge
 * whether a discharge is TRUE: that is `securityCitations.test.ts`'s subject,
 * which requires every case name the document quotes to be a real declaration.
 *
 * Depends on: vitest, node:fs, node:path, ./markdownCorpus.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPOSITORY_ROOT } from './markdownCorpus'

/** The specification of record, never edited by this repository. */
const HANDOFF_SECURITY = path.join(REPOSITORY_ROOT, 'handoff/design_handoff_travel_diary/SECURITY.md')

/** The document that must discharge it. */
const DISCHARGE_DOCUMENT = path.join(REPOSITORY_ROOT, 'docs/security.md')

/** How a discharge section names the handoff sentence it answers. */
const MARKER = /^>\s+\*\*`SECURITY\.md`:\*\*\s+(.+?)\s*$/u

/** A handoff requirement: a top-level bullet of `SECURITY.md`. */
const BULLET = /^-\s+(.+?)\s*$/u

/** A discharge section's heading. */
const HEADING = /^###\s+(.+?)\s*$/u

/** An index row's link into this document. */
const INDEX_LINK = /\]\(#([a-z0-9_-]+)\)/gu

/**
 * A heading's anchor, the way a Markdown renderer derives one: lower-cased,
 * with everything but letters, digits, spaces, hyphens and underscores removed,
 * and the remaining spaces turned into hyphens.
 * @param heading - The heading's text, without its hashes.
 * @returns The anchor a link must name to reach it.
 * @example
 *   slug('`otpRequired` decided server-side') // 'otprequired-decided-server-side'
 */
const slug = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/gu, '')
    .trim()
    .replace(/ /gu, '-')

/**
 * A floor on the requirements found, so an extractor that stopped matching
 * fails here rather than passing every assertion trivially. There were 40 when
 * this was written.
 */
const AT_LEAST_THIS_MANY_REQUIREMENTS = 35

/** A sentence shaped exactly like a requirement and deliberately not one, so the search can answer "no". */
const NOT_A_REQUIREMENT_THE_HANDOFF_STATES = 'Delete the production database every Friday afternoon'

/** A sentence the handoff does state, asserted present so an empty extraction fails loudly. */
const A_REQUIREMENT_THE_HANDOFF_STATES = 'Generate the code server-side with a CSPRNG'

/**
 * The text with every run of whitespace collapsed to one space.
 *
 * A marker long enough to wrap is one phrase on the page and two lines in the
 * file; collapsing is what a Markdown renderer does with those newlines.
 * @param text - The text to flatten.
 * @returns The same text on one line.
 */
const collapsed = (text: string): string => text.replace(/\s+/gu, ' ')

/** A single asterisk, not one half of a `**` strong marker. */
const SINGLE_ASTERISK = /(?<!\*)\*(?!\*)/gu

/**
 * The one notation difference between the two files, removed before comparing.
 *
 * The handoff is in `.prettierignore` — it is evidence, not source (CLAUDE.md
 * §1.3) — so it keeps the designer's `*and*`. `docs/security.md` is formatted,
 * and Prettier rewrites single-asterisk emphasis to `_and_`. That is notation,
 * not a word: nothing else is normalised, so a paraphrase of any kind still
 * fails. `**strong**` is left alone, which is why the pattern refuses an
 * asterisk that has an asterisk on either side of it.
 * @param text - The text to normalise.
 * @returns The same text with single-asterisk emphasis spelled with underscores.
 * @example
 *   withOneSpellingOfEmphasis('Postgres *and* the bucket') // 'Postgres _and_ the bucket'
 */
const withOneSpellingOfEmphasis = (text: string): string => text.replace(SINGLE_ASTERISK, '_')

/**
 * Every requirement the handoff states as a bullet, in document order.
 * @returns One entry per bullet, verbatim.
 * @example
 *   handoffRequirements()[0] // 'Generate the code server-side with a CSPRNG'
 */
const handoffRequirements = (): readonly string[] =>
  readFileSync(HANDOFF_SECURITY, 'utf8')
    .split('\n')
    .map((line) => BULLET.exec(line)?.[1])
    .filter((requirement): requirement is string => requirement !== undefined)
    .map(withOneSpellingOfEmphasis)

/**
 * Every handoff sentence `docs/security.md` claims a section for.
 *
 * Read line by line rather than from the collapsed text, because a marker is
 * one line by construction and a line-anchored pattern is what refuses a marker
 * somebody wrapped by hand.
 * @returns One entry per marker, verbatim.
 */
const markers = (): readonly string[] =>
  readFileSync(DISCHARGE_DOCUMENT, 'utf8')
    .split('\n')
    .map((line) => MARKER.exec(line)?.[1])
    .filter((marker): marker is string => marker !== undefined)
    .map(withOneSpellingOfEmphasis)

describe('the requirements the handoff’s SECURITY.md states', () => {
  it('each have a discharge section in docs/security.md', () => {
    const required = handoffRequirements()
    expect(
      required.length,
      'no requirements were extracted from the handoff, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_REQUIREMENTS)

    const claimed = new Set(markers())
    const undischarged = required.filter((requirement) => !claimed.has(requirement))

    expect(
      undischarged,
      'the handoff states these requirements and docs/security.md names none of them, so each is a security obligation with no home',
    ).toEqual([])
  })

  it('are the only ones docs/security.md claims to discharge', () => {
    // The other direction, and it is not symmetry for its own sake: a marker
    // quoting words the handoff does not contain is a requirement paraphrased
    // into agreement, which reads as coverage and is not.
    const required = new Set(handoffRequirements())

    const claimed = markers()
    expect(
      claimed.length,
      'no markers were extracted, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_REQUIREMENTS)

    const invented = claimed.filter((marker) => !required.has(marker))

    expect(
      invented,
      'docs/security.md quotes these as handoff requirements and the handoff does not state them; a discharge of a sentence nobody wrote discharges nothing',
    ).toEqual([])
  })

  it('reach the document as whole sentences a reader can find', () => {
    // A marker is only useful if the phrase survives into the rendered page.
    // Without this, a marker line could hold a truncation that still matched
    // the extractor on both sides and told a reader nothing.
    const document = withOneSpellingOfEmphasis(collapsed(readFileSync(DISCHARGE_DOCUMENT, 'utf8')))

    const missing = handoffRequirements().filter((requirement) => !document.includes(collapsed(requirement)))

    expect(missing, 'these requirements do not appear in docs/security.md as continuous text').toEqual([])
  })

  it('are reachable from the index, whose every link names a heading in the file', () => {
    // The index replaced the table's first column, so its links are how a
    // reader gets from "which requirement" to "how is it discharged". Nothing
    // else in this repository resolves a Markdown anchor, and a link that
    // silently lands nowhere is the failure a restructure introduces.
    const document = readFileSync(DISCHARGE_DOCUMENT, 'utf8')
    const headings = new Set(
      document
        .split('\n')
        .map((line) => HEADING.exec(line)?.[1])
        .filter((heading): heading is string => heading !== undefined)
        .map(slug),
    )

    const links = [...document.matchAll(INDEX_LINK)].map((match) => match[1] ?? '')
    expect(links.length, 'no index links were found, so a green result here would mean nothing').toBeGreaterThanOrEqual(
      AT_LEAST_THIS_MANY_REQUIREMENTS,
    )

    const dangling = links.filter((anchor) => !headings.has(anchor))

    expect(dangling, 'these index links name no heading in docs/security.md, so they land nowhere').toEqual([])
  })

  it('are matched by a search that can actually answer no', () => {
    // Without this, an extraction that returned everything - or a comparison
    // that matched anything - would report every requirement discharged and
    // prove nothing.
    const required = new Set(handoffRequirements())

    expect(required.has(NOT_A_REQUIREMENT_THE_HANDOFF_STATES)).toBe(false)
    expect(required.has(A_REQUIREMENT_THE_HANDOFF_STATES)).toBe(true)
  })
})
