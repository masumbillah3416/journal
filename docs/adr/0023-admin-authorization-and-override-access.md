# 0023 — The admin's authorization scope, and `overrideAccess` decided once

## Context

Payload's Local API defaults `overrideAccess` to `true`. A call that passes nothing runs
with collection and field access control **skipped** — the rules in
`apps/web/collections/` are not consulted at all. For Phase 2 that was correct and
deliberate: every Local API call there is made by code that has already authenticated the
request itself (`apps/web/lib/auth/guard.ts`), and a read of the reader's own account
should not be refused by a rule written for an anonymous HTTP caller.

`docs/security.md`'s "What Phase 2 hands to Phase 4" section names it a **trap** for this
phase, and the trap has a shape: Phase 4's admin screens carry mutations written as
Server Actions, each calling `payload.find`, `findByID`, `create`, `update`, `delete`,
`findGlobal` or `updateGlobal` on behalf of a request. The guard answers "is this
somebody". Payload's access control answers "may this somebody do this". Without the
second, `guardedAction` admits an account and then every row in the database is writable
by it.

Two things had to be true before the second question could be asked at all, and Phase 4
Task 1 made them true: `journeys`, `pages`, `users`, `media` and the three globals now
carry access blocks, and `users` carries `ownAccountOnly` — the only one of them that
distinguishes between two signed-in accounts today. Until Task 1, passing
`overrideAccess: false` would have changed nothing except which default was consulted.

The remaining problem is not _what_ to pass. It is **who decides**. A convention —
"remember to pass `overrideAccess: false` and a `user`" — is a decision taken once per
call site, and this phase has enough call sites that one of them will be written without
it. The failure is silent: the write succeeds, the tests pass, and the rule that
was supposed to refuse it was simply never asked.

One further fact constrains the answer. `AuthenticatedSession` carries
`{ user: UserId }` — a **branded string**, not a Payload row — because that is all the
session table holds. Payload's access predicates read `req.user.id`, and `ownAccountOnly`
compares it against a row id. So the thing every call needs is not the session; it is the
account **row** the session names.

## Options considered

1. **A convention, documented in `docs/api.md`.** Rejected. This is the same argument
   `guardedAction` already settled for the guard itself, and
   `docs/adr/0018-admin-request-policy-and-the-guard-split.md` records why: a thing every
   action must remember is a thing one action will forget, and the one that forgets looks
   exactly like the ten that did not.

2. **A lint rule, over the parsed AST, requiring the option at every Local API call.**
   Rejected, though it is the mechanism `eslint-rules/guarded-server-actions.js` uses for
   the guard, and the precedent is real. Two differences decide it. The guard rule
   inspects a module's **exports** — a closed, enumerable shape. A rule over Local API
   calls would have to recognise every spelling of a call on a value obtained from
   `getPayload()`, through aliases, destructuring and helpers, which is enumeration where
   inversion is needed. And a lint rule can require the option to be _present_; it cannot
   supply the account row, which is the half that actually takes a database read. It
   would leave the harder half to a convention anyway.

3. **A wrapper around the whole Local API** that takes a session and re-exports the seven
   operations with the scope already applied. Rejected under `CLAUDE.md` §4. It is a
   facade over an API this repository does not own, it would have to be extended for
   every option and overload Payload adds, and every screen task would then be reading
   our documentation for Payload's methods instead of Payload's.

4. **Turning access control on globally**, by making `overrideAccess: false` the default
   in configuration or an operation hook. Rejected: Payload offers no such switch, and
   the one production site that legitimately needs the rules OFF —
   `apps/web/lib/auth/setNewPassword.ts:209`, where the reader holding a reset link is by
   definition not signed in, so the token IS the authorisation and Payload has no user to
   judge — would have to opt back out, inverting a correct decision into an exception.

5. **A module producing the scope, spread into every call.** Chosen.

## Decision

`apps/web/lib/admin/adminScope.ts`. `adminScope(session)` resolves the account row the
session's branded id names and answers:

```ts
export interface AdminScope {
  readonly user: TypedUser
  readonly overrideAccess: false
}
```

Every admin read and write spreads it:

```ts
await payload.update({ collection: 'journeys', id, ...(await adminScope(session)), data })
```

That spread is the whole interface. No screen task writes `overrideAccess`, and the
option's type is the literal `false` rather than `boolean`, so a call site that flips it
does not compile — the decision is enforced by the type, not by review.

Three details are load-bearing.

- **It resolves the row, not the brand.** `accountRowId` (`packages/domain/src/ids.ts`)
  converts the branded string to the integer Payload's Postgres adapter wants, answering
  `undefined` rather than `NaN` for a brand that names no row; `adminScope` throws on that
  `undefined` rather than letting the driver receive `NaN` and escape as a raw
  `Failed query`. That guard was already written twice, privately, in
  `apps/web/lib/auth/sessions.ts` and `apps/web/lib/auth/otpService.ts`; this is its third
  caller, which is where `CLAUDE.md` §4's "no abstraction for a single caller" stops
  applying, so it was promoted and both copies deleted.

- **The bootstrap lookup itself runs with the rules off**, and that is not an exception to
  the rule it implements — it is the reason the rule needs a module rather than a
  convention. The `findByID` inside `adminScope` passes no `overrideAccess`, so it takes
  Payload's default, because there is no `req.user` to judge it by until it has returned.
  Running it under `ownAccountOnly` would require the answer it is being asked for. It is
  therefore confined to one read of one row by primary key, in one place, where it can be
  read and reasoned about — instead of being reinvented per screen.

- **One `findByID` per action, not per row.** This is not the N+1 `CLAUDE.md` §6 forbids:
  the cost does not grow with the size of the result set, and an action that writes a
  hundred rows still pays for it once.

`apps/web/lib/auth/overrideAccessSites.test.ts` grows its production set from one path to
two, and gains a case that reads the **bytes** of each: `adminScope.ts` must contain
`overrideAccess: false` and must not contain `overrideAccess: true`; `setNewPassword.ts`
must contain `overrideAccess: true`. A list of paths cannot tell the two sites apart, and
they say opposite things — so without that case, the day `adminScope.ts` flips is a day
every Phase 4 mutation runs unchecked with the test still green.

## Consequences

- **`apps/web/lib/admin/adminScope.ts` is the second production site of `overrideAccess`,
  and the first that passes `false`.** `docs/security.md` and `docs/api.md` both name it;
  `overrideAccessSites.test.ts` fails if either stops.

- **The proof is behavioural, not structural.** `adminScope.integration.test.ts` makes the
  same `payload.update` against another account's row twice, differing only in the spread:
  without it the write lands (access control off), with it Payload answers `Forbidden`, 403. Asserting the shape of the returned object would have proved nothing — Task 1
  established that identity catches omission while only behaviour catches a rule that is
  present and wrong.

- **The permitted side is pinned too.** A scope carrying a user Payload judges as nobody —
  a wrong id, a missing `collection` key, an empty object — refuses the cross-account write
  exactly as `ownAccountOnly` does. A case asserts the account can still write its OWN row
  under the same scope, so a dead scope fails rather than looking like a working one.

- **A session naming a missing row throws, and it is a different throw.** `NotFound` from
  Payload, not the module's own "names no account row". A screen cannot draw that state:
  the guard has already authenticated the session, so a session pointing at a deleted
  account is a bug upstream, and failing loudly is the correct answer to it.

- **`adminScope` does NOT decide which operations a screen touches, and one pair is easy
  to get half right.** `journeys` and `pages` now carry `readVersions` rules of their own.
  A screen that narrows `read` — a per-account or per-journey rule — and leaves
  `readVersions` alone has left version history readable under the old rule, and **Task
  1's sweep will not notice**, because both are declared and it stays green either way.
  The scope makes every call run the rules; it cannot make the rules agree with each
  other. Task 11 owns this, and it is recorded here because `adminScope` is what every
  such screen will be built on and is therefore where a reader will look.

- **`adminScope` is not itself an authorization decision.** It makes Payload's rules run.
  What those rules say is `apps/web/collections/`'s business, and today only `users`
  distinguishes between two signed-in accounts — the rest are behaviour-identical to the
  default they replaced. A screen that needs a narrower rule writes it there, not here.
