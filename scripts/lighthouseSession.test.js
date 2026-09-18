/**
 * lighthouseSession.test.js — behaviour spec for the three decisions behind
 * `/admin`'s performance budget.
 *
 * Plain JavaScript, matching the module it serves, which `node` runs with no
 * loader in front of it — and collected by `vitest.config.ts`'s `unit` project
 * through its `scripts/**\/*.test.js` glob.
 *
 * TWO OF THE CASES READ THE REAL FILES rather than a fixture string: the
 * `lighthouserc*.json` configurations this repository actually ships, and the
 * domain's own cookie name. A fixture would prove the parser parses a fixture.
 *
 * Depends on: node:fs, node:path, node:url, vitest,
 * ./lighthouseSession, `@travel-diary/domain/auth/session`.
 */
import { SESSION_COOKIE_NAME } from '@travel-diary/domain/auth/session'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  collectorLanded,
  collectsAdmin,
  SESSION_COOKIE,
  sessionCookie,
  sessionOverrideArgs,
} from './lighthouseSession.mjs'

/** The repository root, so the real configurations can be read. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * One of this repository's own Lighthouse configurations.
 * @param {string} name - The file's name at the repository root.
 * @returns {string} Its contents.
 */
const config = (name) => readFileSync(path.join(REPO_ROOT, name), 'utf8')

describe('SESSION_COOKIE', () => {
  it('is the same cookie the domain says a session travels in', () => {
    // This file is `.mjs` and cannot import the TypeScript constant, so the
    // name is spelled twice. This is the pin that stops the second spelling
    // drifting — the only thing that would otherwise notice is a collector
    // quietly measuring the sign-in screen.
    expect(SESSION_COOKIE).toBe(SESSION_COOKIE_NAME)
  })
})

describe('collectsAdmin', () => {
  it('says yes to the admin configuration this repository actually ships', () => {
    expect(collectsAdmin(config('lighthouserc.admin.json'))).toBe(true)
  })

  it('says no to both diary configurations, so no diary run carries a session', () => {
    expect(collectsAdmin(config('lighthouserc.json'))).toBe(false)
    expect(collectsAdmin(config('lighthouserc.book.json'))).toBe(false)
  })

  it('says no to a configuration that collects nothing at all', () => {
    expect(collectsAdmin('{"ci":{"collect":{}}}')).toBe(false)
  })

  it('matches the panel root itself, which has no path segment after admin', () => {
    // The defect this exists for: `/admin` is exactly the address whose
    // budget this whole mechanism is about, and a rule written as
    // `startsWith('/admin/')` misses it.
    expect(collectsAdmin('{"ci":{"collect":{"url":["http://localhost:3000/admin"]}}}')).toBe(true)
  })

  it('is not fooled by a diary address that merely contains the word', () => {
    expect(collectsAdmin('{"ci":{"collect":{"url":["http://localhost:3000/p/1?from=/admin"]}}}')).toBe(false)
    expect(collectsAdmin('{"ci":{"collect":{"url":["http://localhost:3000/administration"]}}}')).toBe(false)
  })
})

describe('sessionCookie', () => {
  it('takes the header off a stream that also carried a boot notice', () => {
    expect(sessionCookie('booting the app\ntd-session=abcdef\n')).toBe('td-session=abcdef')
  })

  it('takes the LAST one, because a rerun prints another below the first', () => {
    expect(sessionCookie('td-session=first\ntd-session=second\n')).toBe('td-session=second')
  })

  it('answers null when nothing printed a cookie, so the caller can refuse to run', () => {
    expect(sessionCookie('Error: no database\n')).toBeNull()
  })

  it('answers null for the cookie name with no value, which authenticates nothing', () => {
    expect(sessionCookie('td-session=\n')).toBeNull()
  })

  it('answers null for a different cookie, rather than sending it as a session', () => {
    expect(sessionCookie('td-keep-signed-in=yes\n')).toBeNull()
  })
})

describe('collectorLanded', () => {
  /**
   * One Lighthouse report, reduced to the two fields this decision reads.
   * @param {string} requested - The URL lhci asked for.
   * @param {string} final - The URL the browser ended on.
   * @returns {string} The report, as it sits on disk.
   */
  const report = (requested, final) => JSON.stringify({ requestedUrl: requested, finalDisplayedUrl: final })

  it('accepts a run that ended on the address it asked for', () => {
    const landed = collectorLanded([report('http://localhost:3000/admin', 'http://localhost:3000/admin')])

    expect(landed.ok).toBe(true)
  })

  it('refuses a run the guard sent to the sign-in screen, which is the whole reason it exists', () => {
    // THE FAILURE THIS CATCHES IS A GREEN ONE. A cookie that mints and is not
    // honoured leaves every assertion passing on the wrong screen: the sign-in
    // pane measures `http-status-code` 1, 140,763 bytes against 327,680, LCP
    // 2,929ms against 3,085 and CLS 0. The only difference is this field.
    const landed = collectorLanded([report('http://localhost:3000/admin', 'http://localhost:3000/admin/sign-in')])

    expect(landed.ok).toBe(false)
    expect(landed.message).toContain('/admin/sign-in')
    expect(landed.message).toContain('/admin')
  })

  it('refuses when no report was written at all, rather than passing on an empty set', () => {
    const landed = collectorLanded([])

    expect(landed.ok).toBe(false)
    expect(landed.message).toContain('no Lighthouse report')
  })

  it('names every address that moved, not only the first', () => {
    const landed = collectorLanded([
      report('http://localhost:3000/admin', 'http://localhost:3000/admin/sign-in'),
      report('http://localhost:3000/admin/journeys', 'http://localhost:3000/admin/sign-in'),
    ])

    expect(landed.message).toContain('/admin/journeys')
  })

  it('reports one address once, however many runs it was collected over', () => {
    const five = Array.from({ length: 5 }, () =>
      report('http://localhost:3000/admin', 'http://localhost:3000/admin/sign-in'),
    )

    expect(collectorLanded(five).message.match(/localhost:3000\/admin ->/g)).toHaveLength(1)
  })

  it('does not call a bare trailing slash a redirect, because that is not a different screen', () => {
    const landed = collectorLanded([report('http://localhost:3000/admin/', 'http://localhost:3000/admin')])

    expect(landed.ok).toBe(true)
  })

  it('refuses a report that says nowhere it ended up, rather than reading that as agreement', () => {
    const silent = JSON.stringify({ requestedUrl: 'http://localhost:3000/admin' })

    expect(collectorLanded([silent]).ok).toBe(false)
  })

  it('reads `finalUrl` when a report carries no `finalDisplayedUrl`', () => {
    const older = JSON.stringify({
      requestedUrl: 'http://localhost:3000/admin',
      finalUrl: 'http://localhost:3000/admin/sign-in',
    })

    expect(collectorLanded([older]).ok).toBe(false)
  })
})

describe('sessionOverrideArgs', () => {
  it('builds the header object yargs-side, one argument per header', () => {
    // Not `--collect.settings.extraHeaders={"Cookie":"…"}`: that reaches
    // Lighthouse as a string where its config expects an object, and no header
    // is sent at all.
    expect(sessionOverrideArgs('td-session=abc')).toEqual(['--collect.settings.extraHeaders.Cookie=td-session=abc'])
  })

  it('carries the value whole, including the `=` inside it', () => {
    expect(sessionOverrideArgs('td-session=a=b')[0]?.endsWith('td-session=a=b')).toBe(true)
  })
})
