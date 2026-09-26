/**
 * PromptsCard — SCREENS.md §2.1's "Needs a look": a terracotta eyebrow, then
 * an 8px rotated square, the sentence and the action link per prompt.
 *
 * ═══ THE ACTION IS A LINK, AND IT CARRIES THE WHOLE ADDRESS ═══
 *
 * §2.1 puts it in bold: "These must deep-link to the exact screen AND
 * selection." The prototype's action is an `onClick` that pushes state; here it
 * is an `<a href>` carrying `prompts`' own address, query string and all — so
 * the destination survives a reload, can be opened in a new tab, and is
 * something `e2e/admin.spec.ts` can read BEFORE the click and compare with what
 * the destination highlighted. A card that printed the action's words while
 * dropping the query string would look perfect.
 *
 * IT DECIDES NOTHING. Which prompts exist, what each says and where each leads
 * are `prompts`', a pure domain function at 100%.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A card and a list.
 * Depends on: react, `Prompt` (@travel-diary/domain/admin/prompts),
 * ./overview.module.css.
 */
import type { Prompt } from '@travel-diary/domain/admin/prompts'
import type React from 'react'
import styles from './overview.module.css'

/** What the card draws. */
export interface PromptsCardProps {
  /** What the diary is asking for, from `prompts`. */
  readonly prompts: readonly Prompt[]
}

/**
 * Renders SCREENS.md §2.1's "Needs a look" card.
 *
 * @param props - See {@link PromptsCardProps}.
 * @returns The eyebrow and one row per prompt, or one line when there is
 *   nothing to look at.
 * @example
 * <PromptsCard prompts={view.needsALook} />
 */
export const PromptsCard = ({ prompts }: PromptsCardProps): React.JSX.Element => (
  <section data-overview-prompts className={styles.card}>
    <h2 className={[styles.eyebrow, styles.eyebrowAccent].join(' ')}>Needs a look</h2>

    {prompts.length === 0 ? (
      <p data-prompts-empty className={styles.empty}>
        Nothing needs a look. The diary is in order.
      </p>
    ) : (
      <ul className={styles.prompts}>
        {prompts.map((prompt) => (
          // KEYED BY WHICH REQUEST IT IS, never by position (CLAUDE.md §0.9).
          <li key={prompt.kind} data-prompt={prompt.kind} className={styles.prompt}>
            <span data-prompt-mark aria-hidden="true" className={styles.promptMark} />
            <span className={styles.promptBody}>
              <span data-prompt-text className={styles.promptText}>
                {prompt.text}
              </span>
              <a data-prompt-action className={styles.promptAction} href={prompt.href}>
                {prompt.action}
              </a>
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
)
