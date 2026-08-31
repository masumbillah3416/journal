/**
 * react-harness.test.tsx — proves the `.test.tsx` test harness actually runs.
 *
 * This file has no module under test, deliberately. It exists because neither
 * Vitest project's `include` matched `*.test.tsx` and neither set a DOM
 * environment, so Phase 1's first React component test would have been
 * collected by nobody — and a test collected by nobody does not fail, it
 * simply is not there. That is the failure mode this phase has already been
 * bitten by twice (a migration that looked real because dev-mode schema push
 * had already built the schema, and a concurrency test that kept passing with
 * its guarding clause deleted). A suite that silently does not run is the
 * worst of the family, because the report is green.
 *
 * So the guard is a test that would be impossible to pass without the harness
 * being real: it mounts an actual React component into an actual `document`
 * with `react-dom/client`, and reads the text back out of the DOM. If the
 * `unit-dom` project loses its `jsdom` environment, `document` is undefined
 * and this fails loudly. If it loses its `*.test.tsx` glob, this file stops
 * appearing in the run summary — which is why `docs/testing.md` names it.
 *
 * It is not a placeholder and does not get deleted when Phase 1 lands real
 * component tests: it is the only thing in the repository that asserts the
 * component-testing harness exists at all, independently of any component.
 * Depends on: react, react-dom/client, vitest (jsdom environment).
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * The smallest component that can prove a real render happened: it renders a
 * prop, so the assertion cannot pass against static markup written by the
 * test itself.
 * @param props - The caption to render.
 * @returns A paragraph carrying `caption`.
 */
const Caption = ({ caption }: { readonly caption: string }): React.JSX.Element => <p>{caption}</p>

// React's `act` requires this flag; it is set on the global object rather than
// imported because React reads it from there. The cast is needed only because
// the flag is not part of the ambient `globalThis` type (CLAUDE.md §3.1 —
// casts carry a justification).
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the .test.tsx harness', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('mounts a React component into a real document, which is only possible if this file is being collected and run in a DOM environment', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    // `act` with a synchronous callback flushes React's work before it
    // returns, and its return type is `void` - so this is deliberately not
    // awaited.
    act(() => {
      root.render(<Caption caption="nineteen tarts, no regrets" />)
    })

    expect(container.querySelector('p')?.textContent).toBe('nineteen tarts, no regrets')
  })
})
