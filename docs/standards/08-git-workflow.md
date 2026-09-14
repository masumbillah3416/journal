# 8 · Git workflow

The detail for `CLAUDE.md` §8. `CLAUDE.md` states the rule in short and points here; the
full text — including every sentence this repository quotes as `CLAUDE.md` §8 — is below.
The section numbers are `CLAUDE.md`'s and do not change.

### 8.1 Step by step, every time

1. `git status` — confirm a clean tree before starting.
2. `git checkout main && git pull` — start from current.
3. `git checkout -b <type>/<short-slug>` — never commit directly to `main`.
4. Work in **small commits**, each one green: run `npm run verify` before every commit.
5. `git add -p` — stage deliberately. **Never `git add -A` without reading the diff.**
6. `git diff --staged` — read what you are about to commit, in full.
7. `git commit` — message per §8.2.
8. `git push -u origin <branch>`.
9. Open a PR describing what changed and why, with the verification output pasted.
10. Merge only with CI green.

### 8.2 Commit messages — Conventional Commits, with a real body

```
<type>(<scope>): <imperative summary, 72 chars or fewer>

<why this change exists — the problem, not the diff>
<what approach was taken, and what was rejected, if non-obvious>
<any consequence a future reader needs: migration, breaking change, perf note>

Tests: <what was added or changed>
Refs: <handoff section, ADR, or issue>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

`type`: `feat` `fix` `refactor` `test` `docs` `perf` `chore` `build` `ci` `revert`
`scope`: `diary` `admin` `auth` `media` `db` `tokens` `ui` `infra` `docs`

**Rules**

- One logical change per commit. A commit doing two things gets split.
- The body explains **why**. "Fixed bug" is not a commit message.
- Never `--no-verify`. Never skip hooks. A failing hook is a real signal.
- Never force-push a shared branch.
- Never amend a pushed commit.
- Never commit secrets, `.env`, or generated artefacts.
- Every commit builds and passes tests **on its own** — `git bisect` must stay useful.

### 8.3 Branch naming

`feat/page-flip-engine` · `fix/otp-expiry-race` · `docs/architecture-diagram` · `refactor/book-bundle-seam` · `test/gallery-visual-regression`
