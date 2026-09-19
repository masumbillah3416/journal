/**
 * EditorGrid — SCREENS.md §2.3's three columns, and the element that measures
 * the room they have.
 *
 * ═══ WHY TWO ELEMENTS, AND WHY THAT IS A COMPONENT RATHER THAN TWO DIVS IN A
 *     ROUTE ═══
 *
 * §2.3's rungs are container queries, and **an element is not matched by its
 * own container query** — only its descendants are. So the element that carries
 * `container-type` and the element that changes shape have to be different
 * ones, with the second inside the first.
 *
 * That is not a detail: it is the cause that did all the damage in EDITOR-003.
 * `container-type` was on the grid itself, so every rung's
 * `grid-template-columns` had never applied at any width, and the editor drew
 * one stacked column on every surface — while the `.pool` rules inside the same
 * rungs DID apply, because the pool is a descendant, which is what made the
 * stylesheet look like it was working. A browser sweep found it; correcting the
 * rung numbers alone changed nothing
 * (`docs/qa/2026-09-19-journey-editor-sweep.md`, EDITOR-003).
 *
 * The obvious JSX is one `<section>` holding the three columns, and that is
 * exactly what the route looked like when it was wrong. Naming the structure
 * puts it behind a case: `EditorGrid.test.tsx` asserts the shaped element is a
 * DESCENDANT of the measured one, so flattening the two — or merging their
 * classes onto one element — fails in the pre-commit gate rather than in a
 * browser somebody eventually looks at.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Two elements and a `children`.
 *
 * INVARIANT — `.screen` carries the measurement and no layout; `.grid` carries
 * the layout and no measurement. `editorGrid.test.tsx` holds the stylesheet's
 * half of that and this component's test holds the markup's.
 * Depends on: react, ./editor.module.css.
 */
import type React from 'react'
import styles from './editor.module.css'

/** What the editor's frame needs: the three columns to put inside it. */
export interface EditorGridProps {
  /** The rail column, the editing pane and the pool, in that order. */
  readonly children: React.ReactNode
}

/**
 * Renders SCREENS.md §2.3's grid inside the element that measures it.
 *
 * @param props - See {@link EditorGridProps}.
 * @returns The measured section, wrapping the shaped grid.
 * @example
 * <EditorGrid>
 *   <div />
 *   <div />
 *   <JourneyPool … />
 * </EditorGrid>
 */
export const EditorGrid = ({ children }: EditorGridProps): React.JSX.Element => (
  <section data-journey-editor className={styles.screen}>
    <div data-editor-grid className={styles.grid}>
      {children}
    </div>
  </section>
)
