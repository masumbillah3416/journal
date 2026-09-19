/* c8 ignore start -- Nothing can measure this file: it reads `apps/web/.next`,
 * a production build artefact, so it cannot run in either Vitest project (the
 * pre-commit gate must not depend on a `next build`). A `c8 ignore` carrying
 * its reason is CLAUDE.md §2.1's treatment where nothing can measure a file,
 * not an exclusion promising a pass somewhere else — `run-lighthouse.mjs`
 * carries the same wrapping for the same reason. It wraps the imports too: an
 * unimported file's imports are themselves uncovered lines. */
/**
 * route-client-js.mjs — how much JavaScript one route actually sends a browser,
 * for the routes Lighthouse cannot be pointed at.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * `CLAUDE.md` §6 caps the admin surface at 320KB of script, and
 * `lighthouserc.admin.json` enforces it with `resource-summary:script:size` on
 * five URLs. A bracketed route cannot join that list: `/admin/journeys/<id>`
 * needs a journey row id, and the config is static JSON that
 * `e2e/ciRegistration.test.ts` guards against exactly the kind of generated
 * file that would be needed. Phase 4 Task 5 therefore reported its budget as a
 * DEDUCTION — "the route ships the shell's chunks and nothing else" — and
 * marked the measurement UNRESOLVED.
 *
 * It was not unresolvable, which is the point of this file. §7.1 makes an
 * ABSENT tool an honest UNRESOLVED; a tool that was present and unfound is just
 * a tool nobody looked for. Next writes a per-route client-module manifest in
 * this version even though it prints no size table, and reading it needs no
 * network and nothing this machine lacks.
 *
 * ═══ WHAT IT MEASURES, EXACTLY ═══
 *
 * The shared root chunks every route loads, plus the chunks that route's own
 * client modules pull in, raw and gzipped. That is the script payload a cold
 * load fetches — the same quantity `resource-summary:script:size` sums, arrived
 * at from the build rather than from a browser, so the two are comparable but
 * not identical: Lighthouse counts what the page requested on the run it
 * observed, and this counts what the route declares.
 *
 * It prints, and exits 0 whatever it finds. It is an instrument, not a gate:
 * the gate is Lighthouse's, on the routes it can name, and the point of this is
 * the route it cannot.
 *
 * Usage, after `npm run build -w apps/web`:
 *   node scripts/route-client-js.mjs
 *
 * Depends on: node:fs, node:zlib. Nothing else, deliberately — a script that
 * reports a budget should not have a dependency tree of its own.
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

/** Where `next build` leaves its output. */
const NEXT = 'apps/web/.next'

/**
 * The routes worth reporting, and why these three.
 *
 * `/admin` is the shell with no screen in it — the floor every admin route
 * pays. `/admin/journeys` is the one route in this set that Lighthouse DOES
 * gate, so it is the yardstick. `/admin/journeys/[id]` is the one that needs
 * this script.
 */
const ROUTES = [
  ['/admin', `${NEXT}/server/app/(admin)/admin/page_client-reference-manifest.js`],
  ['/admin/journeys', `${NEXT}/server/app/(admin)/admin/journeys/page_client-reference-manifest.js`],
  ['/admin/journeys/[id]', `${NEXT}/server/app/(admin)/admin/journeys/[id]/page_client-reference-manifest.js`],
]

/**
 * One route's client-reference manifest.
 *
 * The file assigns to `globalThis.__RSC_MANIFEST`, so it is evaluated against a
 * scope object rather than parsed — the shape is Next's and not ours, and a
 * parser of our own would be a second thing to keep in step with it.
 * @param {string} file - The manifest's path.
 * @returns {object} The manifest.
 */
const manifestOf = (file) => {
  const scope = {}
  new Function('globalThis', fs.readFileSync(file, 'utf8'))(scope)
  const held = scope.__RSC_MANIFEST
  const raw = held[Object.keys(held)[0]]
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

/**
 * One chunk's size on the wire.
 * @param {string} chunk - The chunk's URL path, as the manifest spells it.
 * @returns {{ raw: number, gzip: number }} Its bytes, uncompressed and gzipped.
 */
const bytes = (chunk) => {
  const file = `${NEXT}${chunk.replace('/_next', '')}`
  if (!fs.existsSync(file)) return { raw: 0, gzip: 0 }
  const body = fs.readFileSync(file)
  return { raw: body.length, gzip: zlib.gzipSync(body).length }
}

const build = JSON.parse(fs.readFileSync(`${NEXT}/build-manifest.json`, 'utf8'))
const root = (build.rootMainFiles ?? []).map((name) => bytes(`/_next/${name}`))
const rootRaw = root.reduce((total, one) => total + one.raw, 0)
const rootGzip = root.reduce((total, one) => total + one.gzip, 0)
console.log(`shared root chunks: raw=${rootRaw} gzip=${rootGzip}`)

for (const [label, file] of ROUTES) {
  const manifest = manifestOf(file)
  const modules = Object.keys(manifest.clientModules ?? {})
  const chunks = new Set()
  for (const module of Object.values(manifest.clientModules ?? {})) {
    for (const chunk of module.chunks ?? []) if (typeof chunk === 'string' && chunk.endsWith('.js')) chunks.add(chunk)
  }
  const sized = [...chunks].map(bytes)
  const raw = sized.reduce((total, one) => total + one.raw, 0)
  const gzip = sized.reduce((total, one) => total + one.gzip, 0)
  console.log(
    `${label}: clientModules=${modules.length} routeChunks=${chunks.size} ` +
      `route(raw=${raw} gzip=${gzip}) total(raw=${raw + rootRaw} gzip=${gzip + rootGzip})`,
  )
  // OUR OWN client components, separated from Next's framework modules: the
  // claim these screens make is "this screen adds none", and this is the line
  // that shows it rather than asserting it.
  const ours = modules.filter((id) => id.includes('components') && !id.includes('node_modules/next'))
  console.log(`   our client components: ${ours.length === 0 ? 'none' : ours.join(', ')}`)
}
/* c8 ignore stop */
