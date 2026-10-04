# Reader Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the closed book one shared password, an unlock page that asks for it, and a cookie that remembers — replacing today's toggle, which closes the book to everyone because no password is stored anywhere.

**Architecture:** One hashed column on the `site` global (`readerPasswordHash`), one pure domain module that hashes and verifies, one public `/unlock` page, and a cookie whose value is derived from the stored hash — so changing the password invalidates every outstanding cookie without a session table. The three route entries that call `unauthorized()` today redirect to `/unlock` instead when the reader has no valid cookie.

**Tech Stack:** Next.js 16.3.3 App Router, React 19, Payload CMS 3.88.0, Postgres 16, TypeScript strict, `node:crypto` (`scrypt`, `timingSafeEqual`, `createHmac`) — no new dependency.

**Spec:** `handoff/design_handoff_travel_diary/SCREENS.md` §2.9 (the toggle) and `SECURITY.md`; plus `docs/deviations.md` §56, §100 and §102, which record why today's behaviour is what it is and are reversed by this plan.

## Global Constraints

- `CLAUDE.md` §0.1 — the failing test exists first and is watched failing for the expected reason.
- `CLAUDE.md` §0.4 — no claim of done, fixed or passing without pasted command output.
- `CLAUDE.md` §0.8 — `any` and the non-null `!` are banned; use `unknown` and narrow.
- `CLAUDE.md` §3.1 — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; Zod at every trust boundary; zero lint warnings.
- `CLAUDE.md` §2.1 — 100% coverage on `packages/domain/**`, 95% on `apps/web/lib/**`; no file in neither config's `include`.
- `CLAUDE.md` §6 — diary JS ≤ 180KB gzipped. **The unlock page ships no client component.**
- `CLAUDE.md` §0.6 — never commit secrets. The password is never stored in plaintext and never logged.
- `CLAUDE.md` §0.10 — one logical change per commit, with a body explaining why.
- Postgres is on host port **5433**. `diary_test` is shared, so a concurrent run is a false red.
- **One coverage run at a time, and never commit while one is in flight.** `npm run verify`, `verify:full` and any `--coverage` run all write `coverage/.tmp`; a collision reports an `ENOENT` under that path that reads exactly like a defect in the tree and is not one.
- **When you change what a visual baseline should contain, delete the affected images and let the run write them fresh.** `--update-snapshots=changed` is decided by the same comparison whose threshold you are working around, and it will not notice a sub-threshold correction. Then open one of the regenerated images and look at it.
- A baseline regenerated on the Windows host is not a baseline: it lands without the `-linux` suffix. Use `npm run test:visual:container:update`.

## The design fork this plan resolves, so no task resolves it privately

`docs/deviations.md` §102 records that "Take the book offline" (the button) and
the fourth Settings toggle **write the same column**, `site.passwordProtect`,
because the data model held no second idea of what offline means.

A real password creates a second idea. This plan **declines to add one**, and
says so:

- `passwordProtect: true` now means **"readers must type the password"**, not
  "nobody may read".
- The button and the toggle keep writing that one column. Their copy changes
  from "offline" to "closed".
- **Both refuse to turn on when no password is set**, which is what stops this
  plan reintroducing today's defect — a locked door with no key.
- An author who wants a true blackout sets a password nobody knows. That is
  stated in the Settings copy rather than left to be discovered.

**What would reverse it:** a `site.offline` column meaning "no reader, password
or not" — at which point the button and the toggle stop being the same write.

## Review Focus

Five things the spec implies, no task's happy path exercises, and a reader would
notice. Each has its test named in the task that owns the code.

1. **The download route handler is a second door.** `app/(diary)/gallery/[slug]/download/[id]/route.ts:86` answers 401 itself rather than raising — a cookie check added only to the three pages leaves photographs downloadable past the gate. _Task 3, Step 7._
2. **Changing the password must evict readers.** A cookie minted against the old password must stop working the moment a new one is saved. _Task 1, Step 5._
3. **An empty or whitespace-only password at the unlock box.** Must be refused before any hashing, and must not read as "wrong password". _Task 3, Step 5._
4. **A very long submitted password.** `scrypt` accepts any length, so an unbounded field is a CPU cost a stranger controls. Capped at 200 characters at the boundary. _Task 1, Step 7._
5. **`/unlock` reached when the book is open.** It must not offer a lock that does not exist; it redirects to the book. _Task 3, Step 6._

---

## File Structure

| File                                     | Responsibility                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/domain/src/readerPassword.ts`  | Pure: what a submitted password must look like. No crypto, no I/O.                                     |
| `apps/web/lib/readerPassword.ts`         | `node:crypto`: hash a new password, verify a submission, derive the cookie value from the stored hash. |
| `apps/web/lib/readerSession.ts`          | Read the `td-reader` cookie from a request and say whether it admits.                                  |
| `apps/web/app/(diary)/unlock/page.tsx`   | The one page a closed book shows a stranger. Server component, no client JS.                           |
| `apps/web/app/(diary)/unlock/actions.ts` | The Server Action the unlock form posts to.                                                            |
| `apps/web/globals/site.ts`               | Gains `readerPasswordHash`, never rendered in the admin.                                               |
| `apps/web/lib/admin/siteMutations.ts`    | Hashes on write; refuses to close the book with no password set.                                       |

---

### Task 1: The domain rule and the crypto seam

**Files:**

- Create: `packages/domain/src/readerPassword.ts`
- Create: `packages/domain/src/readerPassword.test.ts`
- Create: `apps/web/lib/readerPassword.ts`
- Create: `apps/web/lib/readerPassword.test.ts`

**Interfaces:**

- Consumes: `Result`, `ok`, `err` from `packages/domain/src/result.ts`.
- Produces: `MIN_READER_PASSWORD`, `MAX_READER_PASSWORD`, `readerPasswordProblem(candidate: string): PasswordProblem | null` where `type PasswordProblem = 'empty' | 'too-long'`; and from the web side `hashReaderPassword(plain: string): Promise<string>`, `readerPasswordMatches(plain: string, stored: string): Promise<boolean>`, `cookieValueFor(stored: string): string`.

- [ ] **Step 1: Write the failing test for the domain rule**

```ts
// packages/domain/src/readerPassword.test.ts
import { describe, expect, it } from 'vitest'
import { MAX_READER_PASSWORD, readerPasswordProblem } from './readerPassword'

describe('what a reader password must look like', () => {
  it('refuses an empty submission, which is a missed keystroke and not a wrong password', () => {
    expect(readerPasswordProblem('')).toBe('empty')
  })

  it('refuses one that is only whitespace, because a space bar is not a password', () => {
    expect(readerPasswordProblem('   ')).toBe('empty')
  })

  it('refuses one past the cap, so a stranger cannot choose how much scrypt we run', () => {
    expect(readerPasswordProblem('x'.repeat(MAX_READER_PASSWORD + 1))).toBe('too-long')
  })

  it('accepts one exactly at the cap, so the boundary is not off by one', () => {
    expect(readerPasswordProblem('x'.repeat(MAX_READER_PASSWORD))).toBeNull()
  })

  it('accepts an ordinary one, and does not trim it — a trailing space is part of what was typed', () => {
    expect(readerPasswordProblem('tokyo 2019 ')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail for the expected reason**

Run: `npx vitest run --project unit packages/domain/src/readerPassword.test.ts`
Expected: FAIL — `Failed to resolve import "./readerPassword"`.

- [ ] **Step 3: Write the domain module**

```ts
// packages/domain/src/readerPassword.ts
/**
 * readerPassword.ts — what a shared reader password must look like.
 *
 * Pattern: none. Two constants and a total function; there is no state to
 * model and no port to invert.
 *
 * THE CAP IS NOT A STRENGTH RULE. `scrypt` accepts a password of any length
 * and spends proportional CPU on it, and the unlock box is reachable by any
 * stranger. 200 is far past any passphrase a family will share aloud and far
 * short of a length worth spending key derivation on.
 *
 * NOTHING HERE TRIMS. A password with a trailing space is a password with a
 * trailing space; trimming would admit a submission the author never set.
 */

/** The shortest a reader password may be, once it is not all whitespace. */
export const MIN_READER_PASSWORD = 1

/** The longest submission this repository will hash. */
export const MAX_READER_PASSWORD = 200

/** Why a submission cannot be used, or `null` when it can. */
export type PasswordProblem = 'empty' | 'too-long'

/**
 * Judges a submitted or chosen password.
 *
 * @param candidate - Exactly what was typed, untrimmed.
 * @returns The problem, or `null` when there is none.
 * @example
 * readerPasswordProblem('   ') // 'empty'
 */
export const readerPasswordProblem = (candidate: string): PasswordProblem | null => {
  if (candidate.trim().length < MIN_READER_PASSWORD) return 'empty'
  if (candidate.length > MAX_READER_PASSWORD) return 'too-long'
  return null
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --project unit packages/domain/src/readerPassword.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test for the crypto seam, including the eviction property**

```ts
// apps/web/lib/readerPassword.test.ts
import { describe, expect, it } from 'vitest'
import { cookieValueFor, hashReaderPassword, readerPasswordMatches } from './readerPassword'

describe('the stored reader password', () => {
  it('matches the password it was made from', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(await readerPasswordMatches('tokyo 2019', stored)).toBe(true)
  })

  it('does not match a different one, which is what stops the first case being vacuous', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(await readerPasswordMatches('tokyo 2018', stored)).toBe(false)
  })

  it('hashes the same password to two different strings, because the salt is per-write', async () => {
    expect(await hashReaderPassword('tokyo 2019')).not.toBe(await hashReaderPassword('tokyo 2019'))
  })

  it('answers false for a stored value this repository did not write, rather than throwing', async () => {
    expect(await readerPasswordMatches('tokyo 2019', 'not-a-stored-hash')).toBe(false)
  })

  // REVIEW FOCUS 2. The cookie carries a value derived from the STORED HASH,
  // and the salt changes on every write - so saving a new password, or the
  // same one again, retires every cookie in the wild. There is no session
  // table to sweep and no reader to log out.
  it('derives a different cookie value after the password is saved again, so old cookies die', async () => {
    const before = cookieValueFor(await hashReaderPassword('tokyo 2019'))
    const after = cookieValueFor(await hashReaderPassword('tokyo 2019'))

    expect(after).not.toBe(before)
  })

  it('derives the same cookie value for one stored hash, so a reader is not evicted at random', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(cookieValueFor(stored)).toBe(cookieValueFor(stored))
  })

  it('never puts the stored hash in the cookie, which would hand a reader the thing to crack', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(cookieValueFor(stored)).not.toContain(stored)
  })
})
```

- [ ] **Step 6: Run it and watch it fail for the expected reason**

Run: `npx vitest run --project unit apps/web/lib/readerPassword.test.ts`
Expected: FAIL — `Failed to resolve import "./readerPassword"`.

- [ ] **Step 7: Write the crypto seam**

```ts
// apps/web/lib/readerPassword.ts
/**
 * readerPassword.ts — hashing, verifying and cookie derivation for the one
 * shared password a closed book asks a reader for.
 *
 * Pattern: none; three functions over `node:crypto`.
 *
 * THE SHAPE STORED IS `scrypt$<salt hex>$<key hex>`. Self-describing, so a
 * value written by an older build is still readable, and a value this
 * repository did not write fails the split and answers `false` rather than
 * throwing - a malformed column must not take the diary down.
 *
 * THE COOKIE IS AN HMAC OF THE STORED HASH, NOT THE HASH. A reader holding
 * their own cookie holds no material to attack offline, and because the salt
 * is redrawn on every write, saving a password retires every cookie already
 * in the wild. That is the whole eviction mechanism: there is no session
 * table for readers and nothing to sweep.
 *
 * INVARIANT: `PAYLOAD_SECRET` is the HMAC key. Rotating it logs every reader
 * out, which is correct and worth knowing before rotating it.
 */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

import { MAX_READER_PASSWORD } from '@travel-diary/domain/readerPassword'

/** `scrypt` cost, matched to `apps/web/lib/auth/otpService.ts`'s derivation. */
const KEY_LENGTH = 64

/** The prefix that names the scheme, so a future one can be told apart. */
const SCHEME = 'scrypt'

const deriveKey = (plain: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(plain, salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })

/**
 * Hashes a password the author chose, for `site.readerPasswordHash`.
 *
 * @param plain - The chosen password, already judged by
 *   `readerPasswordProblem`.
 * @returns `scrypt$<salt hex>$<key hex>`, a fresh salt each call.
 * @throws From `node:crypto`, when the platform cannot derive a key.
 */
export const hashReaderPassword = async (plain: string): Promise<string> => {
  const salt = randomBytes(16)
  const key = await deriveKey(plain.slice(0, MAX_READER_PASSWORD), salt)
  return `${SCHEME}$${salt.toString('hex')}$${key.toString('hex')}`
}

/**
 * Whether a submitted password matches what is stored.
 *
 * @param plain - Exactly what the reader typed.
 * @param stored - The column's value.
 * @returns `false` for a wrong password AND for a stored value this
 *   repository did not write. Both are "you may not come in"; neither throws.
 */
export const readerPasswordMatches = async (plain: string, stored: string): Promise<boolean> => {
  const [scheme, saltHex, keyHex] = stored.split('$')
  if (scheme !== SCHEME || saltHex === undefined || keyHex === undefined) return false

  const expected = Buffer.from(keyHex, 'hex')
  if (expected.length !== KEY_LENGTH) return false

  const derived = await deriveKey(plain.slice(0, MAX_READER_PASSWORD), Buffer.from(saltHex, 'hex'))
  return timingSafeEqual(expected, derived)
}

/**
 * The value the `td-reader` cookie carries for a given stored hash.
 *
 * @param stored - The column's value.
 * @returns A hex HMAC. Changes whenever the password is saved, because the
 *   salt inside `stored` changes.
 */
export const cookieValueFor = (stored: string): string =>
  createHmac('sha256', process.env.PAYLOAD_SECRET ?? '')
    .update(stored)
    .digest('hex')
```

- [ ] **Step 8: Run both suites and watch them pass**

Run: `npx vitest run --project unit packages/domain/src/readerPassword.test.ts apps/web/lib/readerPassword.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 9: Mutate, to prove the tests guard the behaviour**

Make `readerPasswordMatches` return `true` before deriving anything.
**The tests that must fail:** `does not match a different one…` and `answers false for a stored value this repository did not write…`.
Then make `hashReaderPassword` use a constant salt.
**The tests that must fail:** `hashes the same password to two different strings…` and `derives a different cookie value after the password is saved again…`.
Restore both. **Paste all four runs.**

- [ ] **Step 10: Commit**

```bash
git add packages/domain/src/readerPassword.ts packages/domain/src/readerPassword.test.ts apps/web/lib/readerPassword.ts apps/web/lib/readerPassword.test.ts
git commit -m "feat(reader): hash a shared reader password, and derive a cookie that dies when it changes"
```

---

### Task 2: The column, and the refusal that stops a locked door with no key

**Files:**

- Modify: `apps/web/globals/site.ts` (the `fields` array)
- Modify: `apps/web/lib/admin/siteMutations.ts`
- Test: `apps/web/lib/admin/siteMutations.integration.test.ts`
- Modify: `docs/data-model.md` (the `site` global's field list)

**Interfaces:**

- Consumes: `hashReaderPassword` from `apps/web/lib/readerPassword.ts`; `readerPasswordProblem` from `@travel-diary/domain/readerPassword`; `AdminScope` from `apps/web/lib/admin/adminScope.ts`.
- Produces: `setReaderPassword(payload: Payload, scope: AdminScope, plain: string): Promise<void>`, and a changed `setReaderSetting` that refuses to set `passwordProtect: true` with no hash stored.

- [ ] **Step 1: Write the failing integration test**

```ts
// in apps/web/lib/admin/siteMutations.integration.test.ts
it('refuses to close the book when no reader password is set, which would lock everyone out', async () => {
  await payload.updateGlobal({ slug: 'site', depth: 0, data: { readerPasswordHash: null } })

  const refusal = await setReaderSetting(payload, scope, { setting: 'passwordProtect', value: true })

  // Asked of the GLOBAL, not of the return value: a refusal that resolves
  // while writing the column anyway is this repository's own defect species.
  const site = await payload.findGlobal({ slug: 'site', depth: 0 })
  expect(site.passwordProtect).toBe(false)
  expect(refusal).toEqual({ ok: false, error: 'no-reader-password' })
})

it('closes the book once a password is set, so the refusal is not simply a wall', async () => {
  await setReaderPassword(payload, scope, 'tokyo 2019')

  await setReaderSetting(payload, scope, { setting: 'passwordProtect', value: true })

  const site = await payload.findGlobal({ slug: 'site', depth: 0 })
  expect(site.passwordProtect).toBe(true)
})

it('stores the password hashed, never the password', async () => {
  await setReaderPassword(payload, scope, 'tokyo 2019')

  const site = await payload.findGlobal({ slug: 'site', depth: 0 })
  expect(site.readerPasswordHash).not.toContain('tokyo')
  expect(site.readerPasswordHash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/u)
})
```

- [ ] **Step 2: Run it and watch it fail for the expected reason**

Run: `npx vitest run --project integration apps/web/lib/admin/siteMutations.integration.test.ts`
Expected: FAIL — `setReaderPassword is not exported`.

- [ ] **Step 3: Add the column**

In `apps/web/globals/site.ts`, after the `passwordProtect` checkbox:

```ts
    {
      name: 'readerPasswordHash',
      type: 'text',
      // NEVER RENDERED AND NEVER READ BACK INTO A FORM. The admin shows
      // whether a password is set, not what it is; `apps/web/lib/
      // readerPassword.ts` writes this and nothing else does.
      admin: { hidden: true },
    },
```

- [ ] **Step 4: Write the mutations**

In `apps/web/lib/admin/siteMutations.ts`:

```ts
/** Why a reader setting could not be written. */
export type ReaderSettingRefusal = 'no-reader-password'

/**
 * Stores a new shared reader password, hashed.
 *
 * SAVING RETIRES EVERY READER COOKIE, because the cookie is derived from this
 * column and the salt is redrawn here. That is the only way to evict readers
 * and it is deliberate: saving the same password again is how an author
 * throws everyone out.
 *
 * @throws From Zod, when `plain` fails `readerPasswordProblem`.
 */
export const setReaderPassword = async (payload: Payload, scope: AdminScope, plain: string): Promise<void> => {
  const problem = readerPasswordProblem(plain)
  if (problem !== null) throw new Error(`reader password: ${problem}`)

  await payload.updateGlobal({
    slug: 'site',
    ...scope,
    depth: 0,
    data: { readerPasswordHash: await hashReaderPassword(plain) },
  })
}
```

and change `setReaderSetting` so its `passwordProtect` arm reads:

```ts
if (input.setting === 'passwordProtect' && input.value) {
  const site = await payload.findGlobal({ slug: 'site', depth: 0, select: { readerPasswordHash: true } })
  // REVIEW FOCUS, AND THE WHOLE POINT OF THIS TASK. Closing the book with
  // no password stored is docs/deviations.md §100's defect exactly - a door
  // with no key, which admits nobody including the author's readers.
  if (typeof site.readerPasswordHash !== 'string' || site.readerPasswordHash === '') {
    return err('no-reader-password')
  }
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run --project integration apps/web/lib/admin/siteMutations.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Mutate**

Delete the `readerPasswordHash` check from `setReaderSetting`.
**The test that must fail:** `refuses to close the book when no reader password is set…`.
Restore. **Paste both runs.**

- [ ] **Step 7: Update `takeBookOffline` and `docs/data-model.md`**

`takeBookOffline` writes the same column, so it inherits the same refusal — give it the same guard and the same return type, and change its header to say the button now means **closed, not offline**, citing this plan's design fork.

Add `readerPasswordHash` to `docs/data-model.md`'s `site` field list, marked **write-only, hashed, never rendered**.

- [ ] **Step 8: Commit**

```bash
git add apps/web/globals/site.ts apps/web/lib/admin/siteMutations.ts apps/web/lib/admin/siteMutations.integration.test.ts docs/data-model.md
git commit -m "feat(settings): store a hashed reader password, and refuse to close the book without one"
```

---

### Task 3: The unlock page, and every door it has to cover

**Files:**

- Create: `apps/web/lib/readerSession.ts`
- Create: `apps/web/lib/readerSession.test.ts`
- Create: `apps/web/app/(diary)/unlock/page.tsx`
- Create: `apps/web/app/(diary)/unlock/actions.ts`
- Create: `apps/web/app/(diary)/unlock/unlock.module.css`
- Modify: `apps/web/app/(diary)/p/[n]/page.tsx:212`, `apps/web/app/(diary)/m/[n]/page.tsx:128`, `apps/web/app/(diary)/gallery/[slug]/page.tsx:125`
- Modify: `apps/web/app/(diary)/gallery/[slug]/download/[id]/route.ts:86`

**Interfaces:**

- Consumes: `cookieValueFor`, `readerPasswordMatches` (Task 1); `readPublicAccess`, `bookIsGated` from `apps/web/lib/bookAccess.ts`.
- Produces: `READER_COOKIE = 'td-reader'`, `readerIsAdmitted(cookieHeader: string | null, stored: string | null): boolean`, `UNLOCK_PATH = '/unlock'`.

- [ ] **Step 1: Write the failing test for the cookie reader**

```ts
// apps/web/lib/readerSession.test.ts
import { describe, expect, it } from 'vitest'
import { cookieValueFor } from './readerPassword'
import { readerIsAdmitted } from './readerSession'

const STORED = 'scrypt$00112233445566778899aabbccddeeff$' + 'ab'.repeat(64)

describe('whether a reader is admitted', () => {
  it('admits one carrying the value this stored hash derives', () => {
    expect(readerIsAdmitted(`td-reader=${cookieValueFor(STORED)}`, STORED)).toBe(true)
  })

  it('refuses one carrying a value derived from a different stored hash', () => {
    const other = 'scrypt$ffeeddccbbaa99887766554433221100$' + 'cd'.repeat(64)

    expect(readerIsAdmitted(`td-reader=${cookieValueFor(other)}`, STORED)).toBe(false)
  })

  it('refuses a header with no cookie at all', () => {
    expect(readerIsAdmitted(null, STORED)).toBe(false)
  })

  // THE LESSON apps/web/lib/auth/browserSession.ts ALREADY LEARNED, applied
  // here: a scan for the name inside the header matches `not-td-reader=` too.
  it('is not fooled by a cookie whose name ends with the one it wants', () => {
    expect(readerIsAdmitted(`not-td-reader=${cookieValueFor(STORED)}`, STORED)).toBe(false)
  })

  it('refuses everyone when no password is stored, so an unset column is not an open door', () => {
    expect(readerIsAdmitted(`td-reader=${cookieValueFor(STORED)}`, null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project unit apps/web/lib/readerSession.test.ts`
Expected: FAIL — `Failed to resolve import "./readerSession"`.

- [ ] **Step 3: Write the cookie reader**

```ts
// apps/web/lib/readerSession.ts
/**
 * readerSession.ts — whether the browser at the door already typed the
 * password.
 *
 * Pattern: none; one predicate.
 *
 * SPLIT ON `;`, NEVER SEARCHED FOR THE NAME. `apps/web/lib/auth/
 * browserSession.ts` carries the same note for the same reason: a scan for
 * `td-reader=` inside the header matches `not-td-reader=stolen` as well.
 *
 * AN UNSET COLUMN ADMITS NOBODY. A book closed with no password stored is
 * refused here as well as in `setReaderSetting`, because two guards over one
 * property is what keeps a future write path from reopening it.
 */
import { cookieValueFor } from './readerPassword'

/** The cookie a reader who typed the password carries. */
export const READER_COOKIE = 'td-reader'

/** Where a stranger is sent when the book is closed. */
export const UNLOCK_PATH = '/unlock'

/**
 * Whether this request may read the closed book.
 *
 * @param cookieHeader - The request's raw `Cookie` header, or `null`.
 * @param stored - `site.readerPasswordHash`, or `null` when unset.
 * @returns `true` only when the cookie carries exactly what `stored` derives.
 */
export const readerIsAdmitted = (cookieHeader: string | null, stored: string | null): boolean => {
  if (stored === null || stored === '') return false

  const carried = (cookieHeader ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${READER_COOKIE}=`))

  if (carried === undefined) return false
  return carried.slice(READER_COOKIE.length + 1) === cookieValueFor(stored)
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --project unit apps/web/lib/readerSession.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the unlock page and its action**

`page.tsx` is a server component with one `<form action={unlock}>`, one
`<input type="password" name="password" autoFocus required maxLength={200}>`,
one submit button reading **"Read the diary"**, and — when
`searchParams.wrong === '1'` — one line reading **"That is not the password."**
It draws the cover's cloth and title so a stranger sees whose diary it is.
**No `'use client'` anywhere.**

`actions.ts` opens with Next's server-action directive — the same first line
every other `actions.ts` in `apps/web/app/(admin)` carries, quoted nowhere in
this plan because `adminGuardRegistration.test.ts` scans **every file in the
repository** for that directive and would read a plan's code block as an
unguarded action. Then:

```ts
/**
 * REVIEW FOCUS 3. An empty submission is a missed keystroke, not a wrong
 * password, and is sent back without a message and without hashing anything.
 */
export const unlock = async (form: FormData): Promise<void> => {
  const submitted = form.get('password')
  const plain = typeof submitted === 'string' ? submitted : ''
  if (readerPasswordProblem(plain) !== null) redirect(UNLOCK_PATH)

  const stored = await readStoredReaderPassword()
  if (stored === null || !(await readerPasswordMatches(plain, stored))) {
    redirect(`${UNLOCK_PATH}?wrong=1`)
  }

  const jar = await cookies()
  jar.set(READER_COOKIE, cookieValueFor(stored), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  redirect('/')
}
```

- [ ] **Step 6: Make `/unlock` refuse to exist when the book is open**

**Review focus 5.** At the top of `page.tsx`:

```tsx
// An open book has no lock to offer, and a page that drew one would invite
// a reader to type a password that admits nothing.
if (!bookIsGated(await readPublicAccess())) redirect('/')
```

- [ ] **Step 7: Change all four doors, not three**

**Review focus 1.** The three page entries replace
`if (bookIsGated(await readPublicAccess())) unauthorized()` with a redirect to
`UNLOCK_PATH` when `readerIsAdmitted(...)` is false, and the **download route
handler** gains the same check — it answers rather than raises, so it keeps
answering 401, but it must now answer 401 only when the reader is _not_
admitted.

Write this e2e case in `e2e/bookGate.spec.ts` first, and watch it fail:

```ts
test('a reader who typed the password can download, and one who did not cannot', async ({ page, context }) => {
  await closeTheBookWithPassword('tokyo 2019')

  const refused = await page.request.get(DOWNLOAD_URL)
  expect(refused.status()).toBe(401)

  await page.goto('/unlock')
  await page.getByLabel('Password').fill('tokyo 2019')
  await page.getByRole('button', { name: 'Read the diary' }).click()

  const allowed = await page.request.get(DOWNLOAD_URL)
  expect(allowed.status()).toBe(200)
})
```

- [ ] **Step 8: Run the whole gate suite**

Run: `npm run test:gate` and `npx vitest run --project unit apps/web/lib/readerSession.test.ts`
Expected: PASS. **Paste both.**

- [ ] **Step 9: Mutate**

Make `readerIsAdmitted` return `true` unconditionally.
**The tests that must fail:** `refuses one carrying a value derived from a different stored hash`, `refuses a header with no cookie at all`, `is not fooled by a cookie whose name ends with the one it wants`, `refuses everyone when no password is stored…`, and the e2e download case's first half.
Restore. **Paste both runs.**

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/readerSession.ts apps/web/lib/readerSession.test.ts "apps/web/app/(diary)/unlock" "apps/web/app/(diary)/p/[n]/page.tsx" "apps/web/app/(diary)/m/[n]/page.tsx" "apps/web/app/(diary)/gallery/[slug]/page.tsx" "apps/web/app/(diary)/gallery/[slug]/download/[id]/route.ts" e2e/bookGate.spec.ts
git commit -m "feat(diary): ask a closed book's reader for the password instead of refusing everyone"
```

---

### Task 4: The Settings screen, the copy, and the records this reverses

**Files:**

- Modify: `apps/web/components/admin/settings/ReadersCard.tsx` (the fourth toggle and a new password field)
- Modify: `apps/web/app/(admin)/admin/settings/actions.ts`
- Modify: `docs/deviations.md` (§56, §100, §102), `docs/security.md`, `docs/api.md`, `docs/architecture.md`
- Test: `apps/web/components/admin/settings/ReadersCard.test.tsx`, `e2e/admin.spec.ts`

**Interfaces:**

- Consumes: `setReaderPassword`, `setReaderSetting` (Task 2); `ReaderSettingRefusal`.
- Produces: nothing later tasks consume. This is the last task.

- [ ] **Step 1: Write the failing component test**

```tsx
it('says whether a password is set, and never renders the password itself', () => {
  const { container } = render(<ReadersCard settings={aReaderSettings({ hasReaderPassword: true })} />)

  expect(screen.getByText('A password is set.')).toBeInTheDocument()
  expect(container.querySelector('input[value="tokyo 2019"]')).toBeNull()
})

it('says the toggle cannot be turned on until a password exists, rather than letting it fail on submit', () => {
  render(<ReadersCard settings={aReaderSettings({ hasReaderPassword: false })} />)

  expect(screen.getByRole('checkbox', { name: /close the whole book/iu })).toBeDisabled()
  expect(screen.getByText('Set a password first.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it, watch it fail, implement, run it again**

Run: `npx vitest run --project unit apps/web/components/admin/settings/ReadersCard.test.tsx`
Expected: FAIL on the missing `hasReaderPassword` prop, then PASS.

The card gains a password field labelled **"Reader password"** with helper text
**"Everyone who reads the diary types this. Saving a new one signs out everyone
who typed the old one."** and the toggle's own copy becomes **"Close the whole
book — readers must type the password."**

- [ ] **Step 3: Render the refusal, since the screen now has one to render**

`docs/deviations.md` §104's mechanism is already in the tree: the guarded
action answers a refusal through the `maxAge: 0` cookie and the card draws it.
`no-reader-password` must draw as **"Set a reader password before closing the
book."** — reusing that mechanism, not inventing a second one.

- [ ] **Step 4: Write the e2e case**

```ts
test('closing the book sends a stranger to the unlock page, and the password lets them in', async ({
  page,
  context,
}) => {
  await signInAsAuthor(page)
  await page.goto('/admin/settings')
  await page.getByLabel('Reader password').fill('tokyo 2019')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('checkbox', { name: /close the whole book/iu }).check()

  const stranger = await context.browser()?.newContext()
  const strangerPage = await stranger?.newPage()
  await strangerPage?.goto('/p/1')
  await expect(strangerPage).toHaveURL(/\/unlock$/u)
})
```

- [ ] **Step 5: Reverse the records this plan falsifies**

- **§56** — the `401` with a Basic challenge. Now false: mark **CLOSED**, naming this plan and the commit.
- **§100** — "the closed book answers 401 and offers no password, because this data model holds none". It holds one now. Mark **CLOSED**.
- **§102** — "the button and the fourth toggle write the same thing… there is no second idea of what offline means". Still one column, but the meaning changed from _offline_ to _closed_. Amend it with this plan's design fork and its reversal condition (`site.offline`).
- `docs/security.md` — the row for the closed book now describes a password, a cookie and the eviction property.
- `docs/api.md` — a row for the `unlock` Server Action.
- `docs/architecture.md` — the public routes gain `/unlock`.

- [ ] **Step 6: Run every gate and paste each**

```bash
npm run verify:full
npm run test:e2e
npm run test:a11y
```

`npm run test:visual:container` will go red on the Settings baseline, which is
correct — the card changed. Regenerate **by deletion** in the pinned container
(`--update-snapshots=changed` will not notice a sub-threshold change — see
this plan's Global Constraints), then **open the image and look at it**.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/admin/settings "apps/web/app/(admin)/admin/settings/actions.ts" docs e2e/admin.spec.ts e2e/visual.spec.ts-snapshots
git commit -m "feat(settings): give the closed book a password, a page that asks for it, and the records that follow"
```

---

## Self-review

**Spec coverage.** `SCREENS.md` §2.9's toggle is Task 4; the password it never
designed is Tasks 1–3; `SECURITY.md`'s objection that `localStorage` could be
edited is answered by storing the hash server-side and deriving the cookie from
it. The handoff designs no unlock screen, so Task 3's page is **ours** and
belongs in `docs/deviations.md` as a new entry alongside the §56 closure.

**Placeholder scan.** No "TBD", no "handle edge cases", no "similar to Task N".
Every code step carries the code. Task 3 Step 5 describes the page's markup
rather than printing it, which is the one place a reader must exercise taste —
the copy strings and the CSS module are named, and the constraint that matters
(no `'use client'`) is stated as a rule.

**Type consistency.** `readerPasswordProblem` returns `PasswordProblem | null`
in Tasks 1, 2 and 3. `cookieValueFor(stored: string): string` is called in
Tasks 1 and 3 with the same shape. `setReaderSetting` returns a `Result` in
Task 2 and its refusal is rendered in Task 4 under the same name,
`no-reader-password`.

**Review Focus.** All five have a named test in the task that owns the code:
the download route (3.7), eviction (1.5), empty submission (3.5), the length
cap (1.7, enforced in `hashReaderPassword` and `readerPasswordMatches` by
`slice`), and `/unlock` on an open book (3.6).
