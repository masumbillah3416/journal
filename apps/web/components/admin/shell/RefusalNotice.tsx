/**
 * RefusalNotice — what a screen prints when the post it just made was refused.
 *
 * `docs/deviations.md` §104: every admin form parses its body with Zod and
 * none of them drew the refusal, so a reply-to of `not-an-address` answered
 * HTTP 500. `lib/auth/guard.ts` now catches that refusal and hands it to the
 * render; this is the half the author reads.
 *
 * A SERVER COMPONENT WITH NO STATE, which is the property the whole mechanism
 * was chosen for: the notice exists because a round trip happened, so there is
 * nothing for a client to hold. `lib/admin/shellShipsNoClientJs.test.ts` keeps
 * this directory that way.
 *
 * IT DRAWS NOTHING WHEN THERE IS NOTHING, and that is what keeps every
 * committed visual baseline where it is: a screen that was not refused renders
 * no extra node at all.
 *
 * THE FIELD'S NAME IS PRINTED AS THE FORM POSTED IT. There is no table of
 * human labels here on purpose — one would be a second list of every field in
 * the admin, drifting against the forms (standing orders §5), and the message
 * beside it is the sentence the schema wrote for the author to read.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It renders a value.
 * Depends on: react, `FormRefusal` (../../../lib/admin/formRefusal),
 * ./shell.module.css.
 */
import type React from 'react'
import type { FormRefusal } from '../../../lib/admin/formRefusal'
import styles from './shell.module.css'

/** What the notice needs to draw itself. */
export interface RefusalNoticeProps {
  /** This render's refusal, or `null` when the last post was not refused. */
  readonly refusal: FormRefusal | null
}

/**
 * The line a refusal with no field of its own is printed under.
 *
 * A body-level refine (`the highlight rows do not line up`) has an empty path,
 * and `data-refused-field=""` would be a hook no case could ask for.
 */
const WHOLE_FORM = 'the form'

/**
 * Renders the refusals of the post this render followed.
 *
 * @param props - See {@link RefusalNoticeProps}.
 * @returns The notice, or `null` when nothing was refused.
 * @example
 * <RefusalNotice refusal={await refusalForThisRender()} />
 */
export const RefusalNotice = ({ refusal }: RefusalNoticeProps): React.JSX.Element | null => {
  if (refusal === null || refusal.refused.length === 0) return null

  return (
    <div data-form-refusal role="alert" className={styles.refusal}>
      <p className={styles.refusalTitle}>That was not saved</p>
      <ul className={styles.refusalList}>
        {refusal.refused.map((one) => (
          <li key={`${one.field}:${one.message}`} data-refused-field={one.field} className={styles.refusalItem}>
            <span className={styles.refusalField}>{one.field === '' ? WHOLE_FORM : one.field}</span>
            {` — ${one.message}`}
          </li>
        ))}
      </ul>
    </div>
  )
}
