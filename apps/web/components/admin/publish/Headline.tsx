/**
 * Headline — SCREENS.md §2.8's first card: the washi strip, "{n} changes
 * waiting", the line beneath it and the primary button.
 *
 * NO DIRECTIVE, AND IT IS STILL PART OF A CLIENT ENTRY. `PublishSelection.tsx`
 * carries the `'use client'` and renders this, so this module is compiled into
 * that entry — the same relationship `SelectedFrame.tsx` has to `FrameGrid.tsx`
 * one screen over, and the reason `lib/admin/shellShipsNoClientJs.test.ts`
 * counts ENTRIES rather than files. The directive is not repeated here because
 * a second entry is what the allowlist exists to catch.
 *
 * ═══ THE BUTTON'S LABEL IS NOT COMPUTED HERE ═══
 *
 * `publishButtonLabel` is the domain's, and this card is handed its answer.
 * The label and the inert state are two readings of one fact — how many rows
 * are ticked — and a card that derived either itself would be a second place
 * for "nothing is ticked" to be decided.
 *
 * ═══ THERE IS NO "PREVIEW DRAFT" ═══
 *
 * // HANDOFF-DEVIATION (docs/deviations.md §88): §2.8 puts Preview draft beside
 * the primary button. The diary renders PUBLISHED rows — `readBookBundle`
 * filters `_status` on journeys and on pages — so there is no address at which
 * a draft can be seen, and no route in this repository serves one. A control
 * that went somewhere showing the published book would be a lie about what it
 * previews. `NotesPane.tsx` leaves out "Preview page" for the same reason
 * (§59), and `AdminShell` hands the shell header `previewHref={null}` on every
 * screen.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One card of markup over three
 * props.
 * Depends on: react, ./publish.module.css.
 */
import type React from 'react'
import styles from './publish.module.css'

/** What SCREENS.md §2.8's headline card needs to draw itself. */
export interface HeadlineProps {
  /** "{n} changes waiting", from `publishHeadline`. */
  readonly headline: string
  /** The button's copy, from `publishButtonLabel`. */
  readonly label: string
  /** Whether nothing is ticked — the button's inert state. */
  readonly inert: boolean
}

/** The line SCREENS.md §2.8 prints under the headline, in its own words. */
export const PUBLISH_NOTE = 'Nothing below is visible to readers until you publish.'

/**
 * Renders the headline card.
 *
 * @param props - See {@link HeadlineProps}.
 * @returns The washi strip, the headline, the note and the submit button.
 * @example
 * <Headline headline="4 changes waiting" label="Publish all 4" inert={false} />
 */
export const Headline = ({ headline, label, inert }: HeadlineProps): React.JSX.Element => (
  <section data-publish-headline className={[styles.card, styles.headline].join(' ')}>
    {/* Decoration, exactly as the cover's washi is: it says nothing the
     * heading does not, so a screen reader is not read a shape. */}
    <span aria-hidden="true" data-washi className={styles.washi} />

    <div className={styles.headlineText}>
      <h2 data-publish-count className={styles.headlineTitle}>
        {headline}
      </h2>
      <p className={styles.headlineNote}>{PUBLISH_NOTE}</p>
    </div>

    <button data-publish-now className={styles.publish} type="submit" disabled={inert}>
      {label}
    </button>
  </section>
)
