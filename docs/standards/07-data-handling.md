# 7 · Data handling

The detail for `CLAUDE.md` §7. `CLAUDE.md` states the rule in short and points here; the
full text — including every sentence this repository quotes as `CLAUDE.md` §7 — is below.
The section numbers are `CLAUDE.md`'s and do not change.

- **Key everything by journey id.** The handoff records five separate defects caused by per-journey state held in one global value. This is the single most important structural rule here.
- **Address rows by id, never by array position.** Sorting reorders; indices desync from what is highlighted.
- **Derive, never store**, what the data model lists as derived: page numbers, the `03 / 33` counter, contents entries, bookmark spans, media counts, storage totals.
- **Soft delete from the first migration** — `deletedAt` and drafts are painful to retrofit.
- Free-text `dates` always travels with a sortable `startsOn`.
- Select only the fields needed; set `depth` explicitly on every Payload query.
- All migrations are reversible and tested in both directions.
- Validate at the boundary, then trust the type inside.
- Never log secrets, tokens, OTP codes, or full email addresses.

### 7.1 Repository content never leaves this machine without explicit approval

**Repository content is never sent to an external or third-party service.** Content
means all of it: source, configuration, schema, migrations, data, seed content,
diagrams, and excerpts of any of them. Services means all of them: rendering and
diagram services, online validators and linters, formatters, paste and gist sites,
translation services, search engines, LLM APIs — anything that receives the bytes over
a network to somebody else's machine. The only exception is content the repository
owner has been asked about and has explicitly approved sending, for that specific
purpose, in that specific request.

**Why.** Sending content to an external service publishes it. It may be logged, cached,
indexed, retained after the request, or used as training data, and it may stay
retrievable long after anything was "deleted" — the service's retention is not ours to
know or to revoke. Whether this repository's content becomes public is the owner's
decision to make, and taking it on their behalf is not a shortcut, it is a disclosure.
The cost is asymmetric: asking costs one question, and getting it wrong cannot be
undone.

**When the local tool is missing, the verification is UNRESOLVED.** This is the case the
rule exists for. If a diagram cannot be rendered, a schema cannot be validated, or a
format cannot be checked because the tool for it is not installed here, the correct
outcome is to report that check as unresolved and say which tool would settle it. It is
never to route the content through an online equivalent to get a green tick. An
unresolved check is honest and costs a follow-up; a check bought by publishing the
repository is a §0.4 violation dressed as diligence, and the disclosure is permanent.

This is not advisory and it is not scoped to one phase. It was written after repository
content was sent to a public diagram-rendering service during Phase 0 to validate a
Mermaid diagram, without asking.
