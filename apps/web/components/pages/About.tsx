/**
 * About — the diary's closing page, SCREENS.md §1.6 transcribed.
 *
 * Presentational component (CLAUDE.md §3.3) over the `about` global's own
 * fields: it prints what {@link AboutContent} hands it and decides nothing
 * except which blocks an editor has actually filled in. No hooks, no
 * handlers, no state — the whole page is one static subtree, and the diary
 * route pays no interactivity for it.
 *
 * EVERY MEASUREMENT IS ABSOLUTE inside the 1300x860 design box; see
 * `about.module.css`'s header, which also carries the reason the spacer
 * between the biography and the footer is an element rather than a margin.
 *
 * ITS CONTENT IS A GLOBAL, NOT A PAGE ROW — the same shape as the Cover's.
 * `docs/deviations.md` §5 records that Cover, Contents and About are not
 * `pages` rows: DATA_MODEL.md gives About its own global (`portrait,
 * portraitCaption, paragraphs, kit, replyTo`), so the content arrives on the
 * bundle beside `chrome` rather than on the `{ kind: 'about' }` page in the
 * reading sequence. That is why this is the one page component in the diary
 * that takes no {@link BookPage} at all.
 *
 * THE PORTRAIT'S FOCAL POINT COMES FROM ITS MEDIA ITEM, and this is the only
 * photograph in the book of which that is true. DATA_MODEL.md's rule is
 * "`media.focalPoint` is the default; the slot overrides it" — and the
 * `about` global holds a bare `upload` with no slot to override it with, so
 * `readBookBundle` reads the media item's own `focalX`/`focalY` and hands
 * this page an ordinary {@link Slot}. From here down the path is identical to
 * every other photograph's: `<PhotoMount>` gives it to `<Photograph>`, which
 * sets `object-position` inline. `e2e/about.spec.ts` screenshots the crop
 * twice to prove it actually moved.
 *
 * EMPTY FIELDS PRINT NOTHING, not an empty label — the same policy
 * `Cover.tsx` and `Notes.tsx` apply. None of the `about` global's fields is
 * `required: true`, so a cleared portrait, kit list, biography or address is
 * an ordinary editorial state. The kit block and the reply-to block are each
 * omitted WHOLE, eyebrow included, because an eyebrow with nothing under it
 * is worse than no eyebrow; the portrait's mount goes with it rather than
 * being drawn empty, since unlike the Notes page's ephemera slot it is not
 * load-bearing layout — the kit block below simply moves up.
 *
 * THE HEADING IS STATIC, AND DELIBERATELY SO. "About" is not editor content —
 * it is the page's name, the same string `pageLabel` derives for the bottom
 * bar — so it is printed whatever the global holds. That also keeps this
 * page's level-one heading present on a book whose `about` global has never
 * been filled in, which is what stops axe's `page-has-heading-one` from
 * turning an empty global into an accessibility violation.
 *
 * THE ADDRESS IS TEXT, NOT A `mailto:` LINK. SCREENS.md §1.6 draws it as the
 * address in Caveat 32px under a "Write to me" eyebrow and gives it no link
 * behaviour, and the prototype renders it as plain text; adding one would be
 * a design decision this task has no authority to make. It is also the only
 * page in the book that would otherwise put an outbound link inside the
 * flip's own subtree.
 * Depends on: react, `AboutContent` (@travel-diary/domain/bookBundle),
 * ./PhotoMount, ./PostageStamp, ./about.module.css.
 */
import type { AboutContent } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import { PhotoMount } from './PhotoMount'
import { PostageStamp } from './PostageStamp'
import styles from './about.module.css'

/** What the About page needs to print itself. */
export interface AboutProps {
  /** The `about` global's editor-supplied content, from the bundle. */
  readonly content: AboutContent
  /** The `book` global's decorations flag, gating the washi strip and the three stamps. */
  readonly showDecorations: boolean
  /** Which leaf of the book this page is printed on, for the image window to look up. */
  readonly leafIndex: number
}

/**
 * The three mini stamps SCREENS.md §1.6 puts beside the address, verbatim
 * from the prototype.
 *
 * They are DESIGN, not content: DATA_MODEL.md's `about` global has no field
 * for them, they are `aria-hidden` furniture, and their three tints are
 * `@travel-diary/tokens`' journey accents rather than any journey's own
 * accent. Keeping them here rather than in the stylesheet is what keeps their
 * two printed lines out of CSS `content`, where no test could read them and
 * no translation could reach them.
 */
const STAMPS: readonly { readonly country: string; readonly value: string; readonly className: string | undefined }[] =
  [
    { country: 'NIPPON', value: '120', className: styles.stampOne },
    { country: 'CHILE', value: '600', className: styles.stampTwo },
    { country: 'MAROC', value: '9.0', className: styles.stampThree },
  ]

/**
 * Renders the About page: the portrait and kit list on the left, the
 * colophon, biography and reply-to footer on the right.
 *
 * @param props - The about global's content, the book's decorations flag and
 *   the leaf it is printed on.
 * @returns The About page.
 * @example
 * <About content={bundle.about} showDecorations={bundle.chrome.showDecorations} leafIndex={32} />
 */
export const About = ({ content, showDecorations, leafIndex }: AboutProps): React.JSX.Element => (
  <section data-page="about" className={styles.about}>
    <div className={styles.leftColumn}>
      {content.portrait !== undefined && (
        <PhotoMount
          slot={content.portrait}
          leafIndex={leafIndex}
          handle="portrait"
          classes={{ mount: styles.portrait, caption: styles.portraitCaption, washi: styles.portraitWashi }}
          showDecorations={showDecorations}
        />
      )}

      {content.kit.length > 0 && (
        <div className={styles.kitBlock}>
          <p className={styles.kitEyebrow}>Kit</p>
          <ul data-kit="" className={styles.kitList}>
            {content.kit.map((line) => (
              // Keyed by the line itself: a kit line has no id of its own,
              // and its text is what identifies it to a reader.
              <li key={line} className={styles.kitLine}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>

    <div className={styles.rightColumn}>
      <p className={styles.eyebrow}>Colophon</p>
      <h1 className={styles.heading}>About</h1>
      <div data-about-rule="" aria-hidden="true" className={styles.rule} />

      {content.paragraphs.map((paragraph) => (
        <p data-about-paragraph="" key={paragraph} className={styles.paragraph}>
          {paragraph}
        </p>
      ))}

      <div aria-hidden="true" className={styles.spacer} />

      <footer className={styles.footer}>
        {content.replyTo !== '' && (
          <div className={styles.replyBlock}>
            <p className={styles.replyEyebrow}>Write to me</p>
            <p data-reply-to="" className={styles.replyTo}>
              {content.replyTo}
            </p>
          </div>
        )}

        {showDecorations && (
          <div className={styles.stamps}>
            {STAMPS.map((stamp) => (
              <PostageStamp
                key={stamp.country}
                country={stamp.country}
                value={stamp.value}
                className={stamp.className}
              />
            ))}
          </div>
        )}
      </footer>
    </div>
  </section>
)
