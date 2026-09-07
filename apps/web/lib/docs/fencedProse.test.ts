/**
 * fencedProse.test.ts — no Markdown file in this repository has prose trapped
 * inside a code fence, and no Markdown file has an odd number of fences.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * `docs/adr/0019-the-admin-performance-gate-and-the-css-seam.md` closed a code
 * block one line early, stranded the third row of a three-row measurement at
 * column 0, and reopened a block that ran to the end of the file. Everything
 * after that point — including the ADR's actionable recurrence check, "a FOURTH
 * stylesheet on `/p/1` means something new is shared across the seam" — rendered
 * as a pasted artefact in every Markdown view.
 *
 * That was found and reported fixed. The fix added three lines of prose SAYING
 * the fence had been moved, inside the block, and never touched either fence,
 * so the document then asserted in the past tense that a defect a reader was
 * looking at had been repaired. It survived another whole-branch review that
 * way, and the ninth found it (F9-1). The lesson is not about fences: **a
 * sentence cannot check itself, and a correction is exactly the kind of claim
 * whose failure spends the reader's trust in every other correction.** So the
 * check is a file read, in the pre-commit gate, and the ADR's own paragraph
 * about the fence now names this file rather than asserting its own state.
 *
 * ═══ WHAT IT ASKS ═══
 *
 * Every Markdown file git lists — the handoff and the skills included, because
 * a swallowed document is a defect wherever the document came from — is lexed
 * with `marked`, the same lexer a Markdown viewer runs, rather than scanned
 * with a regular expression. A regex over ``` lines cannot tell an opening
 * fence from a closing one in an indented block, which is the exact confusion
 * that produced the defect.
 *
 * Two questions, and neither subsumes the other:
 *
 *   1. **Does any code block hold prose?** The defect's fences were BALANCED —
 *      four of them — so counting alone can never have found it.
 *   2. **Does any file have an odd number of fence lines?** A block left open
 *      at the end of a file lexes as one code token with no prose in it at all,
 *      which question 1 cannot see.
 *
 * ═══ HOW "PROSE" IS DECIDED, AND WHY NOT BY WORD COUNT ═══
 *
 * A code block is prose when it carries **inline Markdown that only means
 * anything rendered** — `**bold**`, `` `code spans` ``, `_emphasis_`, links —
 * in quantity, alongside sentence punctuation and enough words to be a
 * paragraph. Nobody writes four code spans and a bold run into a shell
 * transcript on purpose; a paragraph that lost its fence carries them by
 * definition, because that is how this repository's prose is written.
 *
 * Measured against every Markdown file here rather than reasoned about. The
 * swallowed block scores {@link INLINE_MARKDOWN_LIMIT}+3 inline marks; the
 * highest-scoring legitimate untagged block in the repository — `CLAUDE.md`'s
 * command table — scores 2. A block with a language tag is skipped outright:
 * `mermaid`, `ts` and `markdown` blocks are full of the same marks on purpose,
 * and tagging a block is an author saying what it is.
 *
 * ═══ WHAT WALKS PAST IT, MEASURED RATHER THAN GUESSED ═══
 *
 * Two shapes were written and run against the check as it stands, and both are
 * green. They are stated here rather than in a report, because a disclosure
 * that lives outside the tree is not one (ruling F80):
 *
 *   - **A short swallowed paragraph.** Under {@link PARAGRAPH_WORDS} words, and
 *     the check says nothing. Deliberate: below that length the distinction
 *     between a paragraph and a line of annotated output stops being one a
 *     count can draw, and a threshold low enough to catch it flags the
 *     repository's own command tables.
 *   - **A swallowed paragraph inside a TAGGED fence** (```` ```text ````).
 *     Skipped by construction, because a language tag is an author saying what
 *     the block is, and every mermaid, ts and markdown block here would fail
 *     otherwise.
 *
 * Neither is the defect this exists for: the fence that produced F9-1 carried
 * no tag and swallowed the rest of the file.
 *
 * ═══ HOW IT AVOIDS BEING VACUOUS ═══
 *
 * A scan is the easiest kind of test to leave asserting nothing, and this
 * repository has found sixteen that did. Four ways:
 *
 *   1. {@link SWALLOWED_PROSE_FIXTURE} — the F9-1 block, byte-for-byte — must
 *      be REPORTED. A heuristic that stopped matching would otherwise pass
 *      every file silently.
 *   2. {@link COMMAND_TABLE_FIXTURE} — a real untagged block from `CLAUDE.md` —
 *      must NOT be reported, so the check is proved able to answer "no" and
 *      cannot be made to pass by matching everything.
 *   3. The number of code blocks actually lexed is asserted against a floor: a
 *      walker that returned nothing would report zero prose blocks and zero
 *      failures.
 *   4. The number of Markdown files read is asserted against a floor, for the
 *      same reason one directory up.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A lex and two predicates.
 *
 * Depends on: vitest, marked, node:fs, ./markdownCorpus.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { marked, type Token, type Tokens } from 'marked'
import { describe, expect, it } from 'vitest'
import { REPOSITORY_ROOT, markdownFiles } from './markdownCorpus'

/**
 * How many inline-Markdown marks a fenced block may carry before it reads as
 * prose that lost its fence.
 *
 * FOUR, with the corpus measured on both sides of it: the swallowed ADR
 * paragraph carries seven, and no legitimate untagged block in this repository
 * carries more than two. The gap is the margin, and it is stated here so that a
 * future block landing at three is a deliberate decision rather than a surprise.
 */
const INLINE_MARKDOWN_LIMIT = 4

/** How many words a block needs before it can be a paragraph rather than a line of output. */
const PARAGRAPH_WORDS = 40

/** A floor on the Markdown files read, so a listing that returned nothing fails here. */
const AT_LEAST_THIS_MANY_DOCUMENTS = 20

/** A floor on the code blocks lexed, so a walker that returned nothing fails here. */
const AT_LEAST_THIS_MANY_CODE_BLOCKS = 100

/**
 * The block `docs/adr/0019` swallowed, copied out of the commit that carried
 * the defect. Required to be reported as prose.
 */
const SWALLOWED_PROSE_FIXTURE = `
A stray fence closed that block one line early and reopened it around everything after
it, so the rest of this ADR — including the actionable line below — rendered as code in
any Markdown view (Phase 2's final review, finding 40).

\`/admin/sign-in\` serves three of the same shape: the same shared token chunk, its own
\`admin.css\` + \`@font-face\` merge, and its own modules.

**A FOURTH stylesheet on \`/p/1\` means something new is shared across the seam.** Two would
mean the token crossing had been closed, which nothing has decided to do.
`

/**
 * A real untagged block from `CLAUDE.md` §11 — long, dense, and not prose.
 * Required NOT to be reported, so the check is proved able to answer "no".
 */
const COMMAND_TABLE_FIXTURE = `npm run dev              # Next + Payload against local Postgres  (→ apps/web)
npm run verify           # typecheck + lint + format:check + unit tests + unit coverage gates  <- pre-commit
npm run verify:full      # verify, plus the integration suite and its own coverage gate  <- CI
npm run test             # every Vitest project, watch mode
npm run test:unit        # both Docker-free projects once — \`unit\` and \`unit-dom\` — with coverage
npm run db:migrate       # apply every pending migration  (→ apps/web)
npm run db:seed          # seed from the handoff prototype content  (→ apps/web)
`

/** One fenced or indented code block, with the 1-based source line it opens at. */
interface CodeBlock {
  readonly line: number
  readonly lang: string
  readonly text: string
}

/**
 * Every code token in a document, with the source line each one opens at.
 *
 * The offset is tracked rather than searched for: a token's `raw` appears
 * inside its parent's `raw`, and top-level `raw`s concatenate to the source, so
 * walking children with the parent's offset gives a line number for a block
 * nested inside a list item — which is where the defect this file exists for
 * lived.
 * @param source - The document's whole text.
 * @returns One entry per code block, in document order.
 */
const codeBlocks = (source: string): readonly CodeBlock[] => {
  const found: CodeBlock[] = []
  const lineAt = (offset: number): number => source.slice(0, offset).split('\n').length

  const walk = (tokens: readonly Token[], parentRaw: string, parentOffset: number): void => {
    let scan = 0
    for (const token of tokens) {
      const at = token.raw.length > 0 ? parentRaw.indexOf(token.raw, scan) : -1
      const offset = at < 0 ? parentOffset + scan : parentOffset + at
      if (at >= 0) scan = at + token.raw.length
      if (token.type === 'code') {
        const code = token as Tokens.Code
        found.push({ line: lineAt(offset), lang: code.lang ?? '', text: code.text })
      }
      const nested: readonly Token[] | undefined =
        'items' in token && Array.isArray(token.items)
          ? (token.items as readonly Token[])
          : 'tokens' in token && Array.isArray(token.tokens)
            ? token.tokens
            : undefined
      if (nested !== undefined && token.raw.length > 0) walk(nested, token.raw, offset)
    }
  }

  walk(marked.lexer(source), source, 0)
  return found
}

/**
 * How many marks of inline Markdown a block's text carries — the marks that
 * only mean something when rendered, and therefore have no business inside a
 * block a reader is being shown verbatim.
 * @param text - The block's text.
 * @returns The count.
 */
const inlineMarkdownMarks = (text: string): number =>
  (text.match(/\*\*[^*\n]+\*\*/gu) ?? []).length +
  (text.match(/`[^`\n]+`/gu) ?? []).length +
  (text.match(/(?<![\w*])\*[^*\n]+\*(?![\w*])/gu) ?? []).length +
  (text.match(/(?<![\w_])_[^_\n]+_(?![\w_])/gu) ?? []).length +
  (text.match(/\[[^\]\n]+\]\([^)\n]+\)/gu) ?? []).length

/**
 * Whether a code block is plainly prose that lost its fence.
 *
 * A block with a language tag is never prose here: tagging it is the author
 * saying what it is, and `mermaid`, `ts` and `markdown` blocks carry the same
 * marks on purpose.
 * @param block - The block to judge.
 * @returns True when the block reads as a paragraph rather than as output.
 */
const readsAsProse = (block: CodeBlock): boolean => {
  if (block.lang.length > 0) return false
  const words = block.text.trim().split(/\s+/u).filter(Boolean).length
  const sentences = (block.text.match(/[a-z,)`][.!?]\s+[A-Z(“"`*]/gu) ?? []).length
  return words > PARAGRAPH_WORDS && sentences > 0 && inlineMarkdownMarks(block.text) >= INLINE_MARKDOWN_LIMIT
}

/** The count of fence-opening or fence-closing lines in a document. */
const fenceLines = (source: string): number =>
  source.split('\n').filter((line) => /^\s{0,3}(?:```|~~~)/u.test(line)).length

/** Every Markdown file, read once, as `[path, text]`. */
const documents = (): readonly (readonly [string, string])[] =>
  markdownFiles().map((file) => [file, readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')] as const)

describe('the fenced blocks in this repository’s Markdown', () => {
  it('never hold prose that lost its fence', () => {
    const read = documents()
    expect(read.length, 'no Markdown files were read, so nothing below asserts anything').toBeGreaterThanOrEqual(
      AT_LEAST_THIS_MANY_DOCUMENTS,
    )

    const blocks = read.flatMap(([file, text]) => codeBlocks(text).map((block) => ({ file, ...block })))
    expect(
      blocks.length,
      'the lexer produced no code blocks at all, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_CODE_BLOCKS)

    const trapped = blocks
      .filter((block) => readsAsProse(block))
      .map((block) => `${block.file}:${String(block.line)} — ${block.text.trim().slice(0, 70).replace(/\n/gu, ' ')}…`)

    expect(
      trapped,
      'these code blocks read as prose, which means a fence closed early or never opened; a reader of the rendered document sees this text as a pasted artefact',
    ).toEqual([])
  })

  it('open and close in pairs in every file', () => {
    // Balance cannot find the defect above - that document's fences were
    // balanced, four of them - and the prose check cannot find this one, since
    // a block left open at the end of a file swallows whatever is there without
    // necessarily being prose. Both, or neither is enough.
    const unbalanced = documents()
      .map(([file, text]) => ({ file, fences: fenceLines(text) }))
      .filter(({ fences }) => fences % 2 !== 0)
      .map(({ file, fences }) => `${file} (${String(fences)})`)

    expect(unbalanced, 'these files have an odd number of fence lines, so one block never closes').toEqual([])
  })

  it('are judged by a check that reports the block this file exists for', () => {
    // Without this, a heuristic that had stopped matching would report every
    // document clean and prove nothing. The fixture is the block that survived
    // two reviews.
    const [swallowed] = codeBlocks('```\n' + SWALLOWED_PROSE_FIXTURE + '```\n')

    expect(swallowed).toBeDefined()
    expect(readsAsProse(swallowed as CodeBlock)).toBe(true)
  })

  it('are judged by a check that can actually answer no', () => {
    // A command table is long, untagged and full of punctuation, and it is not
    // prose. If this ever fails, the threshold has been tightened past what the
    // repository's own legitimate blocks look like.
    const [commands] = codeBlocks('```\n' + COMMAND_TABLE_FIXTURE + '```\n')

    expect(commands).toBeDefined()
    expect(readsAsProse(commands as CodeBlock)).toBe(false)
  })
})
