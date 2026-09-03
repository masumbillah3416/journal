'use client'
/**
 * Lightbox — one frame of a gallery, full screen, as a modal dialog
 * (SCREENS.md §1.9).
 *
 * THE OPEN FRAME IS A MEDIA ID, AND THAT IS THE POINT. This component is
 * handed the whole collection and one {@link MediaId}, and resolves the pair
 * through `openFrameById` on every render. The index it prints in `003 / 061`
 * and `frame 007` is DERIVED from the collection's current order and stored
 * nowhere. The handoff records the alternative twice - README's State section
 * and DATA_MODEL's notes - as the same defect: "`picked` was a positional
 * index into the gallery; once 'sort by date' reordered the list, the
 * selected-frame panel showed a different photo than the grid highlighted."
 * Reordering `frames` under this component moves the counter and leaves the
 * photograph alone, which is the only behaviour an index cannot produce.
 *
 * DOWNLOAD GOES THROUGH A HANDLER OF OURS, NEVER THE STORE. SECURITY.md:
 * "the gallery's download action must serve a derivative through your own
 * handler, not a bucket URL. Direct URLs invite enumeration of everything in
 * the bucket, including anything marked hidden." The prototype's own markup
 * (`Travel Diary.dc.html`, the `lbSrc` binding) is a bare `<a href="<image>"
 * download>`, so this is a deliberate departure from it - `frame.downloadHref`
 * is `galleryDownloadPath`'s root-relative path, resolved by
 * `apps/web/lib/readGalleryDownload.ts`.
 *
 * IT IS A REAL MODAL, not a panel that happens to cover the screen, and that
 * is three separate obligations rather than one attribute: `role="dialog"`
 * with `aria-modal`, focus moved INTO the dialog on open and trapped there
 * while it is open, and Escape closing it. Restoring focus to the tile on
 * close is `Grid.tsx`'s - it owns the tiles, and this component is unmounted
 * by the time the restoration happens.
 *
 * THE KEY HANDLER IS ON THE DOCUMENT, the focus trap on the dialog. Escape
 * and the arrows have to work wherever focus happens to be (the browser puts
 * it on `<body>` after a click on a non-focusable area), so they are listened
 * for globally and removed on unmount; Tab is only meaningful inside the
 * dialog, so it is handled there.
 *
 * THE CLIP TRANSPORT IS NOT BUILT. SCREENS.md §1.9 gives clips a play/pause
 * control, a scrub track and an elapsed/total readout. Video is deferred
 * (`docs/adr/0004-media-pipeline-mode.md`, `MEDIA_PIPELINE=inline`), so no
 * `media` row can carry `kind: 'clip'` and that transport would be a control
 * bar over a photograph. It lands with video - see `docs/deviations.md`.
 * Depends on: react, `frameCounter`/`frameMetadata`/`frameShareUrl`/
 * `openFrameById`/`stepFrame` (@travel-diary/domain/gallery), `MediaId`
 * (@travel-diary/domain/ids), ./gallery.module.css.
 */
import type { GalleryFrame, GalleryJourney } from '@travel-diary/domain/gallery'
import { frameCounter, frameMetadata, frameShareUrl, openFrameById, stepFrame } from '@travel-diary/domain/gallery'
import type { MediaId } from '@travel-diary/domain/ids'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './gallery.module.css'

/** What the lightbox needs to show one frame of a gallery. */
export interface LightboxProps {
  /** The journey, for the metadata line under the caption. */
  readonly journey: GalleryJourney
  /** The gallery's frames, in their current order. */
  readonly frames: readonly GalleryFrame[]
  /** Which frame is open, BY ID - see this module's header. */
  readonly openId: MediaId
  /** Called with the id of the frame to open next, when the reader steps. */
  readonly onOpen: (id: MediaId) => void
  /** Called when the reader closes the lightbox. */
  readonly onClose: () => void
}

/** How long a share confirmation stays on screen. */
const TOAST_MS = 2_400

/** What the share control says once it has done something the reader cannot see. */
const COPIED = 'Link copied'

/** What it says when neither the share sheet nor the clipboard was available. */
const COPY_IT_YOURSELF = 'Copy the address from the bar'

/** Everything inside the dialog a reader can Tab to. */
const FOCUSABLE = 'a[href], button:not([disabled])'

/**
 * Renders the open frame full screen, with its counter, actions, stepping
 * controls, caption and metadata.
 *
 * @param props - The journey, the collection, the open frame's id, and the two callbacks.
 * @returns The dialog, or `null` when the gallery no longer holds `openId`.
 * @example
 * <Lightbox journey={journey} frames={frames} openId={openId} onOpen={setOpenId} onClose={close} />
 */
export const Lightbox = ({ journey, frames, openId, onOpen, onClose }: LightboxProps): React.JSX.Element | null => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [toast, setToast] = useState<string | null>(null)

  const open = openFrameById(frames, openId)
  const previousId = stepFrame(frames, openId, -1)
  const nextId = stepFrame(frames, openId, 1)

  // Stepping and closing are read by the document-level key handler below, so
  // they are memoized by identity (CLAUDE.md §6) rather than rebuilt every
  // render - otherwise the effect would detach and reattach its listener on
  // every keystroke.
  const step = useCallback(
    (to: MediaId | null) => {
      if (to !== null) onOpen(to)
    },
    [onOpen],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'ArrowLeft') step(previousId)
      if (event.key === 'ArrowRight') step(nextId)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, step, previousId, nextId])

  // Focus moves into the dialog once, when it opens - not on every step, which
  // would yank focus off the next/previous control the reader is holding down.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    if (toast === null) return undefined

    const timer = setTimeout(() => {
      setToast(null)
    }, TOAST_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [toast])

  /** Keeps Tab inside the dialog, which is what `aria-modal` promises. */
  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return

    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    const edge = event.shiftKey ? controls[0] : controls.at(-1)
    if (edge === undefined || document.activeElement !== edge) return

    event.preventDefault()
    ;(event.shiftKey ? controls.at(-1) : controls[0])?.focus()
  }

  /**
   * Offers the open frame's address to the platform, falling back to the
   * clipboard and then to telling the reader to copy it themselves. Every
   * branch ends in a toast, because all three are otherwise invisible.
   */
  const share = (): void => {
    if (open === null) return
    const url = frameShareUrl(window.location.origin, window.location.pathname, open.frame.id)

    // `lib.dom` declares both of these as always present, and neither is: the
    // Web Share API is absent on most desktop browsers, and
    // `navigator.clipboard` is absent outside a secure context. Reading the
    // platform through a `Partial` view is what makes the two guards below
    // real checks rather than ones the type system would call redundant -
    // validate at the boundary (CLAUDE.md §3.1), and this is the boundary.
    // Both are still CALLED on this object, so each keeps `navigator` as its
    // receiver.
    const platform: Partial<Pick<Navigator, 'share' | 'clipboard'>> = navigator

    void (async () => {
      try {
        if (platform.share !== undefined) {
          await platform.share({ title: journey.name, url })
          return
        }
        if (platform.clipboard !== undefined) {
          await platform.clipboard.writeText(url)
          setToast(COPIED)
          return
        }
        setToast(COPY_IT_YOURSELF)
      } catch {
        // A dismissed share sheet and a refused clipboard write are the same
        // thing to a reader: nothing happened. Saying so is better than a
        // silent no-op, which is the failure mode the handoff's own defect
        // log is mostly made of.
        setToast(COPY_IT_YOURSELF)
      }
    })()
  }

  // An id the gallery no longer holds - a shared address for a deleted frame,
  // or a collection that changed under an open lightbox - closes rather than
  // rendering an empty modal. Returning `null` leaves `Grid.tsx`'s own state
  // alone deliberately: the reader still has the grid behind it.
  if (open === null) return null

  const counter = frameCounter(open.index, frames.length)

  return (
    <div
      className={styles.lightbox}
      data-lightbox
      role="dialog"
      aria-modal="true"
      aria-label={`Frame ${counter}, ${journey.name}`}
      ref={dialogRef}
      onKeyDown={trapFocus}
    >
      <div className={styles.lightboxTop}>
        <p className={styles.counter} data-counter>
          {counter}
        </p>
        <span className={styles.topSpacer} />

        {open.frame.downloadable && (
          <a className={styles.action} data-lightbox-download href={open.frame.downloadHref} download>
            Download
          </a>
        )}

        <button type="button" className={styles.action} data-lightbox-share onClick={share}>
          Share
        </button>

        <button type="button" className={styles.close} data-lightbox-close aria-label="Close" ref={closeRef} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className={styles.lightboxMiddle}>
        <button
          type="button"
          className={styles.step}
          data-lightbox-prev
          aria-label="Previous frame"
          disabled={previousId === null}
          onClick={() => {
            step(previousId)
          }}
        >
          <span aria-hidden="true">←</span>
        </button>

        <span className={styles.lightboxStage}>
          <img className={styles.lightboxImage} data-lightbox-image src={open.frame.fullSrc} alt={open.frame.alt} />
        </span>

        <button
          type="button"
          className={styles.step}
          data-lightbox-next
          aria-label="Next frame"
          disabled={nextId === null}
          onClick={() => {
            step(nextId)
          }}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className={styles.lightboxBottom}>
        <p className={styles.lightboxCaption} data-lightbox-caption>
          {open.frame.caption}
        </p>
        <p className={styles.lightboxMeta} data-lightbox-meta>
          {frameMetadata(journey, open.index, frames.length)}
        </p>
      </div>

      {toast !== null && (
        <p className={styles.toast} data-toast role="status">
          {toast}
        </p>
      )}
    </div>
  )
}
