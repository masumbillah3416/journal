'use client'

/**
 * CopyLink — SCREENS.md §2.1's "Copy link", beside "Open live" on the book
 * card.
 *
 * ═══ THIS SCREEN'S ONE CLIENT ISLAND, AND WHY IT HAS TO BE ONE ═══
 *
 * Putting an address on the clipboard is `navigator.clipboard.writeText`, and
 * there is no form post, no link and no server render that does it — the
 * whole control is a browser capability. Everything else on §2.1 is a server
 * component, so `/admin` ships this and nothing else of its own. It is named
 * in `lib/admin/shellShipsNoClientJs.test.ts`'s `ISLANDS` allowlist, so a
 * SECOND directive in this directory fails that file by name.
 *
 * ═══ IT COPIES AN ABSOLUTE ADDRESS, RESOLVED IN THE BROWSER ═══
 *
 * A copied `/p/1` is not something anybody can paste anywhere. The origin is
 * the browser's own rather than a server-rendered constant, because the value
 * that must be pasted is the one THIS reader reached the panel at — a
 * `MEDIA_ORIGIN` or an `ADMIN_ORIGIN` baked in at build time is the admin's
 * address, and behind a proxy or on a second hostname it is the wrong one.
 * `new URL(href, location.href)` is the resolution, so the `href` prop stays
 * the same relative path `Open live` uses and the two cannot drift.
 *
 * ═══ THE CONFIRMATION IS THE REASON IT IS WORTH AN ISLAND AT ALL ═══
 *
 * A copy that says nothing is indistinguishable from a copy that failed — the
 * silent-failure species `docs/deviations.md` §43 names. The button's own label
 * becomes "Copied" and returns, and a refused clipboard (a browser that
 * withholds the API, a page without a secure context) says "Press ⌘C" rather
 * than pretending.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One `useState` and one call.
 * Depends on: react, ./overview.module.css.
 */
import type React from 'react'
import { useState } from 'react'
import styles from './overview.module.css'

/** What the control copies. */
export interface CopyLinkProps {
  /** The diary's address, relative — the same one "Open live" links to. */
  readonly href: string
}

/** What the button says before anything has been pressed. */
export const COPY_IDLE = 'Copy link'

/** What it says once the address is on the clipboard. */
export const COPY_DONE = 'Copied'

/** What it says when the browser will not put anything on the clipboard. */
export const COPY_REFUSED = 'Press ⌘C'

/** How long the confirmation stays up, in ms. Long enough to read, short enough not to linger. */
export const COPY_FEEDBACK_MS = 1600

/**
 * Renders SCREENS.md §2.1's "Copy link".
 *
 * @param props - See {@link CopyLinkProps}.
 * @returns The button, whose label is its own state.
 * @example
 * <CopyLink href="/p/1" />
 */
export const CopyLink = ({ href }: CopyLinkProps): React.JSX.Element => {
  const [label, setLabel] = useState(COPY_IDLE)

  return (
    <button
      data-copy-link
      data-copy-href={href}
      type="button"
      className={styles.tertiary}
      onClick={() => {
        /**
         * Says what happened, then goes back to offering the control.
         * @param said - The label to show.
         */
        const say = (said: string): void => {
          setLabel(said)
          window.setTimeout(() => {
            setLabel(COPY_IDLE)
          }, COPY_FEEDBACK_MS)
        }

        // `navigator.clipboard` is TYPED as always present and is NOT: a page
        // served without a secure context has no `clipboard` property at all,
        // and reading `.writeText` off it throws rather than returning
        // `undefined`. Asked with `in` rather than narrowed with a cast, which
        // CLAUDE.md §0.8's reasoning extends to.
        if (!('clipboard' in navigator)) {
          say(COPY_REFUSED)
          return
        }

        // RESOLVED AGAINST THE PAGE THE READER IS ON — see this module's
        // header for why the origin is not a server value.
        const absolute = new URL(href, window.location.href).toString()
        void navigator.clipboard
          .writeText(absolute)
          .then(() => {
            say(COPY_DONE)
          })
          .catch(() => {
            // A REFUSAL IS SAID OUT LOUD. A clipboard write is refused by a
            // browser whose permission was declined, and a button that redrew
            // itself unchanged would be the silent failure §43 names.
            say(COPY_REFUSED)
          })
      }}
    >
      {label}
    </button>
  )
}
