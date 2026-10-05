/**
 * page.tsx — the one page a closed book shows a stranger.
 *
 * Pattern: none; a server component and a form.
 *
 * NO CLIENT JAVASCRIPT, which is why the refusal arrives as a query parameter
 * rather than as state, and why the form posts to a route handler at
 * `/unlock/enter` rather than calling a Server Action. `CLAUDE.md` §6 budgets
 * the diary at 180KB gzipped and this page is the first thing a stranger
 * loads; a client island here would ship React to a reader who may be about
 * to be told no. With scripting off entirely, this page still works.
 *
 * IT NAMES NOTHING ABOUT THE DIARY. No title, no owner, no cover. A closed
 * book should not tell a stranger whose it is or what is in it, and reading
 * the `book` global here would also put a database query on a page anybody on
 * the internet can ask for.
 *
 * IT DOES NOT SAY WHETHER A PASSWORD IS EVEN SET. `setReaderSetting` refuses
 * to close a book with no password, so the case should not arise — and if it
 * ever did, "there is no password" is a sentence that helps only a stranger.
 *
 * REACHED ONLY WHEN THE BOOK IS CLOSED. An open book redirects away below: a
 * page offering a lock that admits everybody would invite a reader to type
 * something that means nothing.
 */
import { pagePath } from '@travel-diary/domain/pageAddress'
import { redirect } from 'next/navigation'
import type React from 'react'

import { readPublicAccess } from '../../../lib/bookAccess'
import styles from './unlock.module.css'

/** What Next passes a page with a query string. */
interface UnlockPageProps {
  /** `?wrong=1` after a refused attempt, and nothing otherwise. */
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>
}

/** The lock screen: one line, one box, one button. */
const UnlockPage = async ({ searchParams }: UnlockPageProps): Promise<React.JSX.Element> => {
  const { passwordProtect } = await readPublicAccess()
  // `pagePath(0)` RATHER THAN `/`. This application has no root route, so
  // sending an open book's visitor to `/` would answer 404 — see the latch's
  // own note.
  if (!passwordProtect) redirect(pagePath(0))

  const wasWrong = (await searchParams).wrong === '1'

  return (
    <main className={styles.room}>
      <form action="/unlock/enter" className={styles.card} method="post">
        <h1 className={styles.heading}>This diary is private.</h1>
        <p className={styles.line}>Type the password to read it.</p>

        <label className={styles.label} htmlFor="password">
          Password
        </label>
        <input
          className={styles.input}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          maxLength={200}
          aria-describedby={wasWrong ? 'unlock-wrong' : undefined}
        />

        {wasWrong ? (
          <p className={styles.wrong} id="unlock-wrong" role="alert">
            That is not the password.
          </p>
        ) : null}

        <button className={styles.button} type="submit">
          Read the diary
        </button>
      </form>
    </main>
  )
}

export default UnlockPage
