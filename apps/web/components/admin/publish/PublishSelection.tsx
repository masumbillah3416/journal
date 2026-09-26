'use client'

/**
 * PublishSelection — SCREENS.md §2.8's left column: the headline card and the
 * Changes card, inside one form, with the selection they share.
 *
 * ═══ A CLIENT ISLAND, AND THE LABEL IS THE WHOLE REASON ═══
 *
 * §2.8 gives the primary button two forms — "Publish all 4" and "Publish 2 of
 * 4" — and an inert state when nothing is ticked, and it strikes a row's text
 * through the moment its box is cleared. All three are the tick state and the
 * text the page prints from it in ONE render, with no request between them: a
 * form post per tick would be a navigation per checkbox, and a `<form>` alone
 * cannot re-read its own boxes. `lib/admin/shellShipsNoClientJs.test.ts` names
 * this file in its allowlist with that reason, and judges every other module in
 * this directory exactly as before — `EditionsCard.tsx` beside it ships
 * nothing.
 *
 * ═══ THE STATE IS WHAT IS EXCLUDED, NOT WHAT IS INCLUDED ═══
 *
 * Everything waiting goes out unless the author says otherwise, which is the
 * prototype's own default (`s.outgoing === null` means all four are included).
 * Holding the INCLUDED set instead would need seeding from the props, and a
 * change arriving in a later render would arrive unticked — the author would
 * have to notice it and tick it, on a screen whose whole job is to ship what is
 * waiting.
 *
 * ═══ ONE FORM, TWO ACTIONS ═══
 *
 * The publish button submits to `publish`; each row's Revert is a submit button
 * carrying `formAction={revert}`, because a `<form>` inside a `<form>` is
 * invalid HTML and the browser drops the inner one. Both actions therefore
 * receive the same body, and each reads only its own half of it.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One `useState` over a set of
 * ids.
 *
 * INVARIANT — the button's label, its inert state and every row's strike
 * through are three readings of ONE set. A control that computed its own would
 * be a second place for "what is going out" to be decided.
 * Depends on: react, `publishButtonLabel`/`publishHeadline`/`PendingChange`
 * (@travel-diary/domain/admin/pendingChange), ./ChangesCard, ./Headline,
 * ./publish.module.css.
 */
import { publishButtonLabel, publishHeadline, type PendingChange } from '@travel-diary/domain/admin/pendingChange'
import type React from 'react'
import { useState } from 'react'
import { ChangesCard } from './ChangesCard'
import { Headline } from './Headline'
import styles from './publish.module.css'

/** What SCREENS.md §2.8's left column needs to draw itself. */
export interface PublishSelectionProps {
  /** Everything waiting to go out, newest first. */
  readonly changes: readonly PendingChange[]
  /** Publishes the ticked rows. Reads `change` off the body. */
  readonly publish: (form: FormData) => Promise<void>
  /** Discards one row's change. Reads `revert` off the same body. */
  readonly revert: (form: FormData) => Promise<void>
}

/**
 * Renders the headline card and the Changes card, and holds the selection
 * between them.
 *
 * @param props - See {@link PublishSelectionProps}.
 * @returns The form, with both cards inside it.
 * @example
 * <PublishSelection changes={waiting} publish={publishChanges} revert={revertOneChange} />
 */
export const PublishSelection = ({ changes, publish, revert }: PublishSelectionProps): React.JSX.Element => {
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())

  // COUNTED AGAINST THE ROWS ON SCREEN, not against the set: an id excluded
  // before a change was published would otherwise keep counting against a row
  // that is no longer there.
  const ticked = changes.filter((change) => !excluded.has(change.id)).length

  return (
    <form className={styles.outgoing} action={publish}>
      <Headline
        headline={publishHeadline(changes.length)}
        label={publishButtonLabel(changes.length, ticked)}
        inert={ticked === 0}
      />
      <ChangesCard
        changes={changes}
        excluded={excluded}
        revert={revert}
        onToggle={(id) => {
          setExcluded((current) => {
            const next = new Set(current)
            if (!next.delete(id)) next.add(id)
            return next
          })
        }}
      />
    </form>
  )
}
