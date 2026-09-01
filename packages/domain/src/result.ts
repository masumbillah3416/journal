/**
 * Result — the Result type pattern.
 *
 * Fallible operations at module boundaries return a Result rather than throwing,
 * so callers must handle failure to reach the value. Exceptions stay reserved for
 * genuinely exceptional conditions. Depends on nothing.
 */

/** A successful outcome carrying a value, or a failed one carrying an error. */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

/**
 * Wraps a value as a successful Result.
 * @param value - The value the operation produced.
 */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

/**
 * Wraps an error as a failed Result.
 * @param error - What went wrong.
 */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

/**
 * Narrows a Result to its success branch.
 * @param result - The Result to inspect.
 * @returns True when the operation succeeded, narrowing `result.value` for the caller.
 */
export const isOk = <T, E>(result: Result<T, E>): result is { readonly ok: true; readonly value: T } => result.ok
