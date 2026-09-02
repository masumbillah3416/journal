/**
 * WashiTape — a torn strip of tape stuck across a photo mount.
 *
 * Presentational component (CLAUDE.md §3.3) with no hooks, no handlers and no
 * state. It is three attributes and nothing else, and that is the point: the
 * strip's size, offset, angle, colour and torn `clip-path` all differ per
 * placement (SCREENS.md gives Frames I's `top: -14px; right: 22px`
 * `rotate(4deg)`, Frames II's `top: -13px; left: 18px` `rotate(-5deg)` and
 * About's `top: -15px; left: -18px` `rotate(-9deg)`), so every one of those
 * values belongs in the printing page's own stylesheet, where the rest of its
 * absolute geometry lives. What does NOT vary — and what a page can therefore
 * get wrong — is the contract this file states once:
 *
 *   - `data-decoration="washi"` is the handle `e2e/frames.spec.ts`,
 *     `e2e/about.spec.ts` and any future sweep select on to prove the strip
 *     is drawn where SCREENS.md puts it. A strip that carried its own class
 *     and no data attribute would be invisible to every one of them.
 *   - `aria-hidden="true"` takes it out of the accessibility tree. It is tape.
 *     It carries no information a reader of the page needs, and an empty
 *     decorative `<span>` announced between a photograph and its caption is
 *     noise — the same policy `Cover.tsx` applies to its own furniture.
 *
 * WHETHER IT IS DRAWN AT ALL is the `book` global's `showDecorations` flag,
 * and this component does not read it: `PhotoMount` decides, so a mount with
 * no washi in the design and a mount whose washi is switched off go down the
 * same path.
 *
 * Cover's and the Notes page's own strips still inline this markup. Folding
 * them in is a refactor of two shipped pages rather than part of adding
 * three, so it is deliberately not done here.
 * Depends on: react.
 */
import type React from 'react'

/** What a washi strip needs to be drawn. */
export interface WashiTapeProps {
  /**
   * The class carrying this strip's own size, offset, angle, gradient and
   * torn `clip-path`, from the printing page's stylesheet. Admits `undefined`
   * because a CSS Module's generated type does - an unknown key resolves to
   * `undefined`, and `<span>` accepts that as "no class".
   */
  readonly className: string | undefined
}

/**
 * Renders one strip of washi tape.
 *
 * @param props - The class carrying the strip's own geometry.
 * @returns The strip, hidden from assistive technology.
 * @example
 * <WashiTape className={styles.washiOne} />
 */
export const WashiTape = ({ className }: WashiTapeProps): React.JSX.Element => (
  <span data-decoration="washi" aria-hidden="true" className={className} />
)
