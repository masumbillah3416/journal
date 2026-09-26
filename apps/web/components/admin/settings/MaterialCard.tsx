/**
 * MaterialCard — SCREENS.md §2.9's "Your material": the explanatory
 * paragraph, Export everything / Import a backup, then "Space used".
 *
 * A SERVER COMPONENT with no form of its own. Export is an `<a>` to
 * `/admin/export`, because the response is a stream of bytes rather than a
 * value — a Server Action cannot hand a browser a file, which is why that
 * route is a route (see its own header).
 *
 * ═══ TWO OF §2.9'S THREE FIGURES DO NOT EXIST IN THIS DATA MODEL ═══
 *
 * "Import a backup" and "the last backup date" are drawn and cannot be
 * answered. `DATA_MODEL.md` records no backup anywhere — no table, no column,
 * no timestamp — and restoring one is a `docs/runbook.md` procedure against a
 * scratch database, not something a browser can do to a live one. So the
 * Import control is rendered INERT, with a `:disabled` rule so it looks inert
 * (`docs/deviations.md` §92's lesson), and the backup line says what is true
 * instead of printing a date nothing records. `docs/deviations.md` §103
 * carries both, and the copy names the runbook so the author is not left
 * guessing where the answer is.
 *
 * ═══ THE BAR IS THREE WIDTHS, AND NONE OF THEM IS DECIDED HERE ═══
 *
 * `storageSegments` (`@travel-diary/domain/admin/storageBar`) answers them and
 * `readSettingsScreen` calls it. This component draws what it is given — which
 * is why an over-quota library is a property of that module's tests rather
 * than of this one's.
 *
 * THE TWO INKS ARE PASSED AS A CUSTOM PROPERTY, not as a `background` written
 * inline: `ChangesCard.tsx`'s shape, and the only spelling a jsdom case can
 * read back, since a `background` is normalised there.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A card and a bar.
 * Depends on: react, `StorageUsed` (../../../lib/admin/readSettingsScreen),
 * `StorageKind` (@travel-diary/domain/admin/storageBar),
 * ./settings.module.css.
 */
import type { StorageKind } from '@travel-diary/domain/admin/storageBar'
import type React from 'react'
import type { StorageUsed } from '../../../lib/admin/readSettingsScreen'
import styles from './settings.module.css'

/** What SCREENS.md §2.9's "Your material" card needs to draw itself. */
export interface MaterialCardProps {
  /** The line and the bar's three widths. */
  readonly storage: StorageUsed
  /** Where "Export everything" points. */
  readonly exportHref: string
}

/**
 * One segment's width, as a CSS percentage.
 *
 * ROUNDED, because floating-point division does not give round numbers:
 * 29 of 100 comes back as `28.999999999999996`, and that is what reached the
 * `style` attribute. Four decimal places of a 7px bar is far under a
 * thousandth of a pixel, so nothing is lost and the markup is readable — and
 * the rounding is HERE rather than in `storageSegments`, whose own invariant
 * is that the three widths sum to exactly 100.
 * @param percent - What the domain answered.
 * @returns The width, e.g. `29%`.
 */
const width = (percent: number): string => `${String(Math.round(percent * 10000) / 10000)}%`

/** What each segment of the bar is called, and the token it is drawn in. */
const SEGMENTS: Readonly<Record<StorageKind, { readonly label: string; readonly ink: string }>> = {
  // §2.9's `#2f6b68` and `#845825`, which are these two tokens' values. See
  // `settings.module.css`'s header for why the tokens rather than the hexes.
  stills: { label: 'Photographs', ink: 'var(--td-status-published)' },
  clips: { label: 'Clips', ink: 'var(--td-status-edited)' },
  free: { label: 'Free', ink: 'rgb(120 98 60 / 20%)' },
}

/**
 * Renders SCREENS.md §2.9's "Your material" card.
 *
 * @param props - See {@link MaterialCardProps}.
 * @returns The card.
 * @example
 * <MaterialCard storage={view.storage} exportHref="/admin/export" />
 */
export const MaterialCard = ({ storage, exportHref }: MaterialCardProps): React.JSX.Element => (
  <section data-settings-material className={styles.card}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>Your material</h2>
    </div>

    <p className={styles.body}>
      Everything you have written and everything you have uploaded lives in one database and one bucket. Take a copy of
      the first whenever you like; the photographs themselves are backed up where they are stored.
    </p>

    <div className={styles.materialActions}>
      <a data-export-everything href={exportHref} className={styles.export}>
        Export everything
      </a>
      {/* INERT, AND DRAWN INERT. See this module's header: restoring a backup
       * is a runbook procedure against a scratch database, and a live button
       * that did nothing would be worse than a disabled one that says why. */}
      <button type="button" data-import-backup disabled className={styles.rowAction}>
        Import a backup
      </button>
    </div>
    <p data-import-note className={styles.hint}>
      Importing is done from the runbook, against a scratch database, so that a bad restore cannot land on the live one.
    </p>

    <div className={styles.spaceUsed}>
      <p className={styles.eyebrow}>Space used</p>
      <p data-space-line className={styles.spaceLine}>
        {storage.line}
      </p>

      <div data-space-bar className={styles.bar}>
        {storage.segments.map((segment) => (
          <span
            key={segment.kind}
            data-space-segment={segment.kind}
            className={styles.segment}
            // The assertion is `ChangesCard.tsx`'s, for its reason: React's
            // `CSSProperties` has no index signature for custom properties,
            // and a custom property is the only spelling a jsdom case can read
            // back.
            style={
              { width: width(segment.percent), '--td-segment-ink': SEGMENTS[segment.kind].ink } as React.CSSProperties
            }
          />
        ))}
      </div>

      <ul className={styles.legend}>
        {storage.segments.map((segment) => (
          <li key={segment.kind} data-space-legend={segment.kind} className={styles.legendItem}>
            <span
              aria-hidden="true"
              className={styles.swatch}
              style={{ '--td-segment-ink': SEGMENTS[segment.kind].ink } as React.CSSProperties}
            />
            {SEGMENTS[segment.kind].label}
          </li>
        ))}
      </ul>

      <p data-last-backup className={styles.lastBackup}>
        No backup date is recorded here: backups run against the database and the bucket themselves, on the schedule in
        the runbook, and nothing in this diary writes down when one last finished.
      </p>
    </div>
  </section>
)
