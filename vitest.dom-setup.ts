/**
 * vitest.dom-setup.ts — the one place React's act() environment flag is set.
 *
 * React refuses to run `act()` unless `IS_REACT_ACT_ENVIRONMENT` is true on
 * the global object, and it reads the flag from there rather than from an
 * import — so it cannot be set by importing anything. Setting it once here,
 * as the `unit-dom` project's `setupFiles` entry, keeps every component and
 * hook test from repeating the same four lines (and from silently forgetting
 * them, which surfaces as an inscrutable React warning rather than a failure).
 *
 * `apps/web/lib/react-harness.test.tsx` deliberately still sets the flag
 * itself: that file exists to prove the `.test.tsx` harness runs at all, and
 * a proof that depended on this file's own configuration being correct would
 * be a weaker proof. Depends on: nothing (a bare global assignment).
 */

// The cast is needed only because the flag is not part of the ambient
// `globalThis` type (CLAUDE.md §3.1 — casts carry a justification).
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
