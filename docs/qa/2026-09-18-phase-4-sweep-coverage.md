# Phase 4 sweep coverage — which report covers which screen

The design spec's exit line asks for a "browser sweep committed per screen group", and the
plan named four groups. **Phase 4 swept at finer grain than that**: twelve reports, one per
screen or per hard part of a screen, rather than four reports each covering three or four
screens. This file is the index that makes the exit criterion checkable by a reader instead
of by a ledger.

Dated 2026-09-18 for the phase it belongs to; the last row was written on 2026-10-03.

| Group     | Screen                                                 | Report                                         | Result                                       |
| --------- | ------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------- |
| The desk  | the shell                                              | **no sweep of its own — see below**            | —                                            |
| The desk  | §2.1 Overview                                          | `docs/qa/2026-09-26-overview-sweep.md`         | 3 — S1:0 S2:0 S3:3 S4:0                      |
| The desk  | §2.8 Publish                                           | `docs/qa/2026-09-26-publish-sweep.md`          | 3 — S1:0 S2:0 S3:2 S4:1                      |
| Authoring | §2.2 Journeys                                          | `docs/qa/2026-10-03-journeys-sweep.md`         | 2 — S1:0 S2:1 S3:0 S4:1                      |
| Authoring | §2.3 Journey editor — the frame                        | `docs/qa/2026-09-19-journey-editor-sweep.md`   | 5 — S1:1 S2:2 S3:0 S4:2                      |
| Authoring | §2.3 Journey editor — the Notes pane                   | `docs/qa/2026-09-19-notes-pane-sweep.md`       | 2 — S1:0 S2:1 S3:0 S4:1                      |
| Authoring | §2.3 Journey editor — slots, focal point, Frames, pool | `docs/qa/2026-09-20-journey-slots-sweep.md`    | 2 — S1:0 S2:1 S3:0 S4:1                      |
| Authoring | §2.3 Journey editor — the slot panel's keyboard path   | `docs/qa/2026-09-21-slots-keyboard-sweep.md`   | 1 — S1:0 S2:0 S3:0 S4:1, plus one UNRESOLVED |
| Material  | §2.4 Media                                             | `docs/qa/2026-09-20-media-screen-sweep.md`     | see that file's own header                   |
| Material  | §2.5 Galleries                                         | `docs/qa/2026-09-20-galleries-screen-sweep.md` | 6 — S1:0 S2:2 S3:2 S4:2                      |
| Keeping   | §2.6 Book & bookmarks, §2.7 Cover & About              | `docs/qa/2026-09-20-book-and-cover-sweep.md`   | 3 — S1:0 S2:1 S3:1 S4:1                      |
| Keeping   | §2.9 Settings, §2.10 Trash                             | `docs/qa/2026-09-27-settings-trash-sweep.md`   | 3 — S1:0 S2:1 S3:2 S4:0                      |
| Keeping   | §2.11 Account                                          | `docs/qa/2026-09-29-account-sweep.md`          | 1 — S1:0 S2:1 S3:0 S4:0                      |

Eleven `SCREENS.md` §2 screens, twelve reports, and every screen named by one of them.

## Why the shell gets no sweep of its own, which is not an omission

The shell — the 238px rail, the 96px header, the chips, the profile footer — is on the
screen for every route of every sweep in the table. It was not walked once; it was walked on
eleven routes, at every width each of those sweeps used, by twelve different passes. At
least **eight of the eleven Phase 4 reports** name it explicitly — a grep for
`shell|NavRail|the rail` over `docs/qa/2026-09-*.md` on 2026-10-03 matches the journey
editor, notes pane, book & cover, galleries, slots keyboard, overview, publish and
settings & trash reports — and the defects they found in it were found **because** they were
found from eleven directions rather than one: a rail button's active state is only
interesting when some other button is current, and a header chip's hide-below-1040px rule is
only interesting on a screen that has something to put in the chip.

A twelfth pass that opened `/admin` and looked at the rail would be ceremony. It would walk
one route where the existing evidence walks eleven, and `CLAUDE.md` §10's point is the
triaged file, not the number of files.

What the shell does have of its own, separately from any sweep: a visual baseline at
`desktop`, `mid` and `mobile` (`e2e/visual.spec.ts`), an axe case (`e2e/a11y.spec.ts`), a
client-JavaScript allowlist asserted by name
(`apps/web/lib/admin/shellShipsNoClientJs.test.ts`), and five browser cases in
`e2e/admin.spec.ts` that drive the rail against `ADMIN_NAV` rather than against a list
written in the spec file.

## What no sweep on this branch could cover

Stated once here rather than eleven times in the reports that each say it:

- **A screen reader in browse mode.** There is no NVDA or JAWS on this machine, and
  `CLAUDE.md` §7.1 forbids routing the question to anything off it. **UNRESOLVED**, in every
  Phase 4 sweep.
- **Clips.** `ffmpeg` and `ffprobe` are absent and `MEDIA_PIPELINE=worker` is refused at
  boot (`docs/deviations.md` §109), so every clip path and the poster filmstrip are
  **UNRESOLVED**.
- **Anything that writes to the developer's own `diary` database.** Standing order §9: a
  Task 7 sweep pressed an arrow on a focused control and left a real value behind. Since
  then a sweep that can write dumps the rows it could touch and diffs them afterwards, and
  the write paths themselves are driven by `e2e/` against the isolated `diary_test`.
