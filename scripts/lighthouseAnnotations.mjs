/**
 * lighthouseAnnotations — turns one `lhci autorun`'s assertion results into
 * GitHub workflow-command lines.
 *
 * ═══ WHY THIS EXISTS: THE NUMBERS NEVER LEAVE THE RUNNER ═══
 *
 * The Lighthouse gate has read red, green, red across three CI runs on a budget
 * with roughly 72ms of local margin, and each failure was diagnosed by
 * ELIMINATION rather than by reading a number. `/actions/jobs/<id>/logs`
 * answers `403 Must have admin rights` without a token and `gh` is not
 * installed on the authoring machine, so the measured LCP that failed a run is
 * not readable by anybody who does not already have CI's logs.
 *
 * Workflow commands become ANNOTATIONS, which are shown on the run's own page
 * without log access. So the fix is not a wider budget — it is putting the
 * number where it can be read. `values` is spread into the line deliberately:
 * a gate failing on a median is diagnosed by the spread of its five runs, and
 * a median alone cannot tell a slow machine from one slow run.
 *
 * A PASSING RUN EMITS ITS MARGIN TOO. A gate that fails intermittently is
 * diagnosed as much by how close it was when it passed as by the number when
 * it failed, and a notice costs nothing on a green run.
 *
 * ═══ WHY IT IS A PURE FUNCTION IN ITS OWN MODULE ═══
 *
 * `run-lighthouse.mjs` spawns `npx lhci` and no Vitest project can execute it,
 * so anything decided inside it is decided untested (CLAUDE.md §2). Everything
 * that decides — what counts as a failure, what each line says, what happens
 * when the file is missing — is here, where `lighthouseAnnotations.test.js`
 * drives it. The script is the I/O shell around it.
 *
 * **THE READ ARRIVES AS A FUNCTION, AND THAT IS THE POINT OF THE PARAMETER.**
 * The first version of this took an already-parsed `results`, which left the
 * script holding `try { JSON.parse(readFileSync(…)) } catch { parsed =
 * undefined }` — a decision about what an unreadable file MEANS, inside the one
 * file no test can execute, under a whole-file `c8 ignore`. Changing that
 * `undefined` to `[]` kept 1,604 tests, `tsc`, `eslint`, `prettier` and the
 * 100/100/100 `scripts/**` gate green while CI, on the run where `lhci` died
 * before writing its results, would have annotated `this configuration asserted
 * nothing` — an empty gate — instead of saying the annotation pipeline itself
 * failed. That is the one failure mode Ruling F86 exists to make visible.
 *
 * So the shell now hands over `readResults`, a function that returns the file's
 * TEXT or throws, and this module owns both failures. They are two different
 * events and they get two different lines: **nothing was written** (the read
 * threw — no file, no permission, a run that died first) and **what was written
 * is not a list of assertions** (text that will not parse, or parses to
 * something else). A reader who sees either knows which.
 *
 * NOTHING HERE ESCAPES ITS OUTPUT, and that is a decision about the inputs
 * rather than an omission. A workflow command escapes `%`, newlines and — in a
 * PROPERTY — `:` and `,`. The only property written here is `title`, whose
 * value is an lhci `auditId` (`largest-contentful-paint`,
 * `cumulative-layout-shift`: lowercase and hyphens) plus a configuration
 * filename. URLs and numbers go in the MESSAGE, where `:` and `,` are literal.
 *
 * PATTERN (CLAUDE.md §3.3): none of the seven. A mapping.
 *
 * IT IS PLAIN JAVASCRIPT because the script it serves is, and that script runs
 * through `node` with no loader in front of it. The consequence is stated
 * rather than hidden: nothing typechecks this file, the same treatment
 * `eslint-rules/` carries, so its shapes are asserted by its test instead.
 * Depends on: nothing.
 */

/**
 * The workflow-command lines one configuration's assertion results deserve.
 *
 * @param {{ config: string, readResults: () => string }} input - `config` is
 *   the `lighthouserc*.json` the run used, named in every line so a reader
 *   knows which of three gates spoke. `readResults` returns the TEXT of
 *   `.lighthouseci/assertion-results.json`, or throws — reading is the shell's
 *   job, and what a failed or unusable read MEANS is this module's.
 * @returns {string[]} One line per failed assertion, or a single summary line.
 *   Never empty: a run that says nothing is a run nobody can tell from one
 *   that never happened.
 * @example
 * annotationLines({ config: 'lighthouserc.book.json', readResults: () => readFileSync(path, 'utf8') })
 * // ['::error title=largest-contentful-paint lighthouserc.book.json::http://… expected 3000, measured 3212 (runs: 3100, 3212, 3240)']
 */
export const annotationLines = ({ config, readResults }) => {
  let text
  try {
    text = readResults()
  } catch {
    // The reason is deliberately not echoed: it is a filesystem path, and what
    // a reader needs is that no results exist at all, which this line says.
    return [
      `::warning title=lighthouse-annotations ${config}::no assertion results were written, so no measured number reached this log`,
    ]
  }

  const results = parsedResults(text)
  if (results === undefined) {
    return [
      `::warning title=lighthouse-annotations ${config}::the assertion results are not a list this can read, so no measured number reached this log`,
    ]
  }

  const failures = results.filter((result) => result.passed === false)
  if (failures.length > 0) {
    return failures.map(
      (failure) =>
        `::error title=${auditLabel(failure)} ${config}::${failure.url} expected ${failure.expected}, measured ${failure.actual} (runs: ${runValues(failure)})`,
    )
  }

  if (results.length === 0) {
    return [`::notice title=lighthouse ${config}::this configuration asserted nothing, so nothing was gated`]
  }

  return [
    `::notice title=lighthouse ${config}::${results
      .map((result) => `${auditLabel(result)} median ${result.actual} against ${result.expected} (${result.url})`)
      .join('; ')}`,
  ]
}

/**
 * The assertion entries a results file's text holds, or `undefined`.
 *
 * `undefined` means "this text is not a list of assertions" — it will not parse
 * at all, or it parses to something that is not an array. Both are the same
 * event for a reader: whatever lhci left behind, no measured number can be read
 * out of it.
 * @param {string} text - The results file's contents, exactly as read.
 * @returns {unknown[] | undefined} The entries, or `undefined`.
 */
const parsedResults = (text) => {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  return Array.isArray(parsed) ? parsed : undefined
}

/**
 * What one assertion is ABOUT, spelled as lhci's own output spells it.
 *
 * `auditProperty` is what separates `resource-summary:script:size` from
 * `resource-summary:image:size` — both are the `resource-summary` audit, and a
 * line naming only the audit says the wrong thing about which budget moved.
 * Found by running this against a real `.lighthouseci/`, where every
 * `resource-summary` assertion printed under one indistinguishable name.
 * @param {{ auditId?: string, auditProperty?: string }} assertion - One entry.
 * @returns {string} `audit` or `audit.property`.
 */
const auditLabel = (assertion) =>
  assertion.auditProperty ? `${assertion.auditId}.${assertion.auditProperty}` : `${assertion.auditId}`

/**
 * The individual run values behind one assertion, as text.
 *
 * @param {{ values?: unknown }} assertion - One assertion-results entry.
 * @returns {string} The values joined, or a phrase saying they are absent —
 *   never an empty string, which would read as "the runs measured nothing".
 */
const runValues = (assertion) => (Array.isArray(assertion.values) ? assertion.values.join(', ') : 'not reported')
