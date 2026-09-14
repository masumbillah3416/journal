# 3 · Code quality

The detail for `CLAUDE.md` §3. `CLAUDE.md` states the rule in short and points here; the
full text — including every sentence this repository quotes as `CLAUDE.md` §3 — is below.
The section numbers are `CLAUDE.md`'s and do not change.

### 3.1 Non-negotiable

- **TypeScript `strict`**, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- **`any` is banned.** Use `unknown` and narrow. Casts require a comment justifying them.
- **No non-null assertions (`!`)** — narrow properly, or make the state unrepresentable.
- Runtime validation at every trust boundary (Zod): request bodies, environment variables, external responses.
- Errors are typed and handled. No empty `catch`. No swallowed rejections — except the one the handoff mandates for autoplay, which carries a comment saying so.
- ESLint and Prettier enforced pre-commit and in CI. Zero warnings.

### 3.2 Readability

- Names say what a thing _is_. No `data`, `info`, `handle`, `tmp`, `x`.
- Functions do one thing. Past ~40 lines, ask what it is hiding.
- Files stay focused. Past ~300 lines, it is probably two modules.
- Nesting past three levels: use early returns and guard clauses.
- Boolean parameters are banned in public APIs — pass an options object with named fields.
- Prefer pure functions. Push side effects to the edges.
- Delete dead code. Git remembers it.

### 3.3 Design patterns — deliberate, named, documented

Chosen for this codebase. Each module header names the one it implements.

| Pattern                  | Applied to                            | Why                                                                                                |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Ports & Adapters**     | storage, mailer, transcode queue      | Local stand-ins now, cloud services at deploy, one shared contract suite                           |
| **State machine**        | page-flip lifecycle                   | The flip is four timers and a latch; as an explicit machine, illegal states become unrepresentable |
| **Repository**           | Payload access behind typed accessors | The diary never learns what a CMS row looks like                                                   |
| **Data Transfer Object** | `BookBundle`                          | One serialization boundary between server and diary client                                         |
| **Factory**              | test fixtures, seed data              | Overridable defaults, no shared mutable state                                                      |
| **Value objects**        | ids, slugs, focal points              | Branded types — a `JourneyId` cannot be passed where a `PageId` belongs                            |
| **Result type**          | fallible operations                   | Errors are values at boundaries; exceptions stay exceptional                                       |

**Anti-patterns, explicitly rejected:** singletons holding mutable state; god modules; a `utils` dumping ground; inheritance where composition works; premature abstraction — a pattern earns its place on the second real use, never the first.
