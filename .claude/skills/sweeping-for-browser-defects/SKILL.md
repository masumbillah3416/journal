---
name: sweeping-for-browser-defects
description: Use when asked to QA, test in the browser, check a screen works, verify a phase is complete, or find bugs in the running Travel Diary app — public diary, admin panel, or sign-in.
---

# Sweeping for Browser Defects

## Overview

Automated suites catch the regressions someone already thought of. A browser sweep catches the ones nobody did. Undisciplined, it degrades into clicking around and reporting "looks fine".

**The output of a sweep is a triaged defect report file.** Not a chat summary, not a verbal "all good". If a sweep produces no file, it did not happen.

## The report contract

Write to `docs/qa/YYYY-MM-DD-<area>-sweep.md`. It has exactly these parts, in this order:

```markdown
# Sweep: <area> — YYYY-MM-DD

**Build:** <git sha> **Engine:** <playwright-headed | chrome> **Routes walked:** <n>
**Result:** <n> defects — S1:<n> S2:<n> S3:<n> S4:<n>

## Defects

### <ID> · <S1|S2|S3|S4> · <one-line title>

- **Route:** <url + viewport>
- **Steps:** <numbered, minimal, reproducible from a cold load>
- **Expected:** <what the handoff says, with the file and section cited>
- **Actual:** <what happened>
- **Evidence:** <screenshot path> · <console/network excerpt, verbatim>

## Clean

<routes walked with no findings — so a later reader knows what was covered>

## Not covered

<what this sweep did not reach, and why>
```

IDs are `<AREA>-<nnn>`, e.g. `DIARY-004`, and never reused.

## Procedure

1. **Start the app.** `npm run dev`. Confirm it responds before driving it.
2. **Pick the engine.** Playwright headed by default — scriptable, screenshots, repeatable. Use the `claude-in-chrome` skill instead for exploratory poking where the next click depends on what you just saw.
3. **Instrument before walking.** Attach listeners for `console` (all levels), `pageerror`, and failed responses. **Most defects here are silent** — a swallowed click, a 404 derivative, a rejected autoplay promise. A sweep that only looks at pixels misses them.
4. **Walk the route checklist** for the area (below).
5. **At every screen, check four axes:** does it match the handoff spec section · do the interactions work · does it hold at each breakpoint · does axe report violations.
6. **Record every finding immediately,** with evidence, before moving on. Findings recalled at the end are findings lost.
7. **Triage** by the ladder below, then write the file.

## Severity ladder

|        | Meaning                                                            |
| ------ | ------------------------------------------------------------------ |
| **S1** | Blocks reading or authoring, loses data, or is a security hole     |
| **S2** | Wrong behaviour — the feature works but does the wrong thing       |
| **S3** | Visual drift from the handoff — wrong token, spacing, weight, copy |
| **S4** | Polish — real, but nobody is blocked                               |

Copy drift is **S3, never S4**. The handoff states the voice is deliberate: "nineteen tarts, no regrets" is content, not a placeholder.

## Hotspots — check these every sweep

The handoff documents defects that already happened once. They are the likeliest to happen again.

**Diary**

- Click page content near the fold — a back face with `pointer-events` unset silently swallows every click; Contents links and gallery buttons look dead while their handlers are fine
- Flip fast, repeatedly, both directions — does the `_busy` latch always release, or does the book seize
- Flip, then look for mirrored or stranded content — `visibility` must be hidden on any page not current, turning, or being revealed
- Open a gallery, go back — the URL must restore `#/p/<n>`, not `#/`
- Resize across 860px both ways; check the book rescales and mobile mode swaps cleanly
- Swipe on touch: ≥60px horizontal **and** 1.4× the vertical delta
- Clips in page slots: playing, looping, muted, **no** controls and **no** play badge. Gallery tiles: badge and duration **present**
- At ≥2× DPR, confirm the `hero2x` derivative is served, not a soft upscale

**Admin**

- Switch journeys and re-check every panel — per-journey state leaking into a global is the handoff's most-repeated defect, five separate times
- Sort a gallery by date, then click a tile — does the selected-frame panel show the same photo the grid highlights, or did a positional index desync
- Toggle a switch twice — nested toggle state read stale and toggles appeared dead
- Set a focal point, then load that photo in the diary — if it doesn't move, the control is decorative
- Uncheck rows on Publish — button must read "Publish 2 of 4" and go inert at zero
- Drop each table below 1180 / 900 / 860 / 780px — columns shed by priority, actions cell stays

**Sign-in**

- Below 820px the OTP cells must not collapse (they went to 7px)
- Run reset and verify in overlapping order — a shared timeout handle left "Checking…" stuck forever
- Wrong code three times: shake, clear, and the limit must hold **server-side**
- Confirm the code never appears in any response body, and `otpRequired` is never read from `localStorage`

## Common mistakes

| Mistake                          | Instead                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| Reporting "the flip feels janky" | Record fps, the exact steps, and the property being animated         |
| Sweeping only the happy path     | Cold load, deep link, back button, refresh mid-flow                  |
| One viewport                     | Every breakpoint the handoff names for that file                     |
| Fixing bugs as you find them     | Finish the sweep first. Fixing mid-sweep loses the rest of the route |
| Skipping the console             | It is where the silent half of the defects live                      |

When the report is written, fix the defects with the `fixing-browser-defects` skill. Never patch straight from the sweep.
