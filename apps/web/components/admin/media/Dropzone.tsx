'use client'

/**
 * Dropzone — SCREENS.md §2.4's dashed zone, and the upload it drives.
 *
 * ═══ THE FIRST OF THIS SCREEN'S TWO CLIENT ISLANDS, AND `'use client'` IS ON
 *     LINE 1 ═══
 *
 * An upload cannot be a form post. §9.1 and `docs/adr/0020` put the bytes
 * straight on the store through a capability URL, so the page has to read the
 * picked `File`s, ask for slots, PUT each body, and finalise each key — four
 * round trips a `<form action>` has no way to make. The directive is on line 1
 * by the repository's own convention (`shellShipsNoClientJs.test.ts` anchors
 * its pattern there), and this file and `MediaGrid.tsx` are named in that
 * file's `ISLANDS` allowlist so a THIRD island in this directory fails by name.
 *
 * ═══ THE ACTIONS ARRIVE AS PROPS ═══
 *
 * `requestSlots` and `finalise` are Server Actions passed down rather than
 * imported, for `CreatePanel.tsx`'s reason: a Server Action is serialisable
 * across this boundary, and a prop is what lets `Dropzone.test.tsx` render
 * this without pulling a `'use server'` module — and `getPayload` behind it —
 * into jsdom.
 *
 * ═══ THE NOTE IS DERIVED FROM THE PIPELINE, NOT TRANSCRIBED ═══
 *
 * The prototype's line reads "JPEG, PNG, HEIC, MP4 and MOV. Clips loop
 * silently wherever they land — no extra step." **This deployment accepts
 * neither HEIC nor clips**: `ingestDecision` refuses `image/heic` outright
 * (`docs/adr/0021`) and `acceptedIngestTypes('inline')` is JPEG and PNG, with
 * the clip half behind `MEDIA_PIPELINE=worker` and a worker ADR 0004 defers.
 * Printing the design's sentence would be the species these standing orders
 * exist to stop: a promise in prose the code does not keep, on the one control
 * whose whole job is to say what it will take. {@link acceptedFormatsNote}
 * builds the sentence from the list the server was given, so the day clips are
 * enabled the note gains them and nothing here changes.
 *
 * ═══ WHAT HAPPENS WHEN A WRITE FAILS ═══
 *
 * `docs/deviations.md` §60 records that the journey editor surfaces no write
 * error. This screen is different in one respect and the same in another: a
 * REFUSAL is a `Result` these actions return rather than throw, so a refused
 * slot request or a refused finalise is drawn — the file's row reads why, and
 * the batch carries on. What is NOT drawn is a THROW: an action that rejects
 * (the network went away mid-PUT, Next.js could not reach the server) reaches
 * the author as an unhandled rejection, exactly as §60 describes, because
 * §2.4 gives this screen no error surface to put one in and inventing one is
 * the abstraction CLAUDE.md §4 refuses. The PUT itself is the one place a
 * throw is caught, because a failed PUT is an ordinary outcome of a flaky
 * connection rather than a bug.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A picker, a loop and a list.
 *
 * INVARIANT — a file is counted `done` when its FINALISE has answered, never
 * when its PUT has. A staged object with no finalise is exactly the orphan
 * `apps/web/lib/media/sweepStagedUploads.ts` exists to remove, and a card that
 * called it finished would be telling the author their photograph is in the
 * library when it is not.
 * Depends on: react, next/navigation, the upload contract's types,
 * `JourneyChoice` (../../../lib/admin/readMediaScreen), ./UploadCard,
 * ./media.module.css.
 */
import type React from 'react'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  FinaliseRequest,
  FinaliseResponse,
  UploadSlotRequest,
  UploadSlotResponse,
} from '../../../lib/media/uploadContract'
import type { JourneyChoice } from '../../../lib/admin/readMediaScreen'
import { UploadCard, type UploadProgress } from './UploadCard'
import styles from './media.module.css'

/** The headline §2.4 prints, in Caveat 34px. */
export const DROPZONE_HEADLINE = 'Drop photographs and clips here'

/** How a MIME type is spelled in the note under the headline. */
const FORMAT_NAMES: Readonly<Record<string, string>> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'video/mp4': 'MP4',
  'video/quicktime': 'MOV',
}

/**
 * The italic note naming what this deployment will actually take.
 *
 * BUILT FROM THE LIST, NEVER TRANSCRIBED — see this module's header for the
 * two formats the design's own sentence promises and this pipeline refuses.
 * The clip half of the sentence is printed only when a clip type is in the
 * list, because "clips loop automatically" is a promise about files nothing
 * would accept otherwise.
 * @param accepted - `acceptedIngestTypes(mode)`, as the server read it.
 * @returns The sentence, ending in a full stop.
 * @example
 * acceptedFormatsNote(['image/jpeg', 'image/png']) // 'JPEG and PNG.'
 */
export const acceptedFormatsNote = (accepted: readonly string[]): string => {
  const names = accepted.map((type) => FORMAT_NAMES[type] ?? type)
  const last = names[names.length - 1] ?? ''
  const list = names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${last}`
  const clips = accepted.some((type) => type.startsWith('video/'))
  return clips ? `${list}. Clips loop silently wherever they land — no extra step.` : `${list}.`
}

/** What the zone needs to draw itself and to upload what it is given. */
export interface DropzoneProps {
  /** Every journey an upload can be added to — the "Add to — {journey}" select. */
  readonly journeys: readonly JourneyChoice[]
  /** What this deployment's pipeline accepts, as `acceptedIngestTypes(mode)`. */
  readonly accepted: readonly string[]
  /** Asks for somewhere to PUT each file. Phase 3's action, called not rewritten. */
  readonly requestSlots: (request: UploadSlotRequest) => Promise<UploadSlotResponse>
  /** Turns one staged upload into a row. Phase 3's action, called not rewritten. */
  readonly finalise: (request: FinaliseRequest) => Promise<FinaliseResponse>
}

/** One file's row while the batch is in flight, plus what became of it. */
interface UploadRow extends UploadProgress {
  /** `true` once the finalise has answered, whatever it answered. */
  readonly settled: boolean
  /** `true` when the finalise answered `duplicate`. */
  readonly duplicate: boolean
  /**
   * `true` when the finalise created a photograph.
   *
   * A duplicate and a refusal both settle and neither becomes a row, which is
   * the distinction the finished card's count rests on (MEDIA-001).
   */
  readonly stored: boolean
}

/**
 * Renders SCREENS.md §2.4's dropzone and the card beneath it.
 *
 * @param props - See {@link DropzoneProps}.
 * @returns The zone, and the upload card while a batch is in flight.
 * @example
 * <Dropzone journeys={view.journeys} accepted={accepted} requestSlots={requestUploadSlots} finalise={finaliseUpload} />
 */
export const Dropzone = ({ journeys, accepted, requestSlots, finalise }: DropzoneProps): React.JSX.Element => {
  const router = useRouter()
  const picker = useRef<HTMLInputElement>(null)
  const [journey, setJourney] = useState(journeys[0]?.id ?? '')
  const [rows, setRows] = useState<readonly UploadRow[]>([])
  const [over, setOver] = useState(false)

  /**
   * Uploads one batch: one slot request, then a PUT and a finalise each.
   * @param files - What the picker or the drop handed over.
   */
  const upload = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0 || journey === '') return

    setRows(files.map((file) => ({ name: file.name, percent: 0, settled: false, duplicate: false, stored: false })))

    const offered = await requestSlots({
      journey,
      // THE THREE CLAIMS A BROWSER CAN MAKE, and every one of them is a claim:
      // `type` is derived from the NAME by the file picker (measured, Task 2),
      // and `size` is weighed again at the receiver.
      files: files.map((file) => ({ filename: file.name, declaredType: file.type, byteLength: file.size })),
    })

    if (!offered.ok) {
      // THE WHOLE REQUEST IS REFUSED WHEN ONE FILE IS (`planUploadSlots`'s own
      // invariant), so the refusal is drawn against every row rather than one.
      setRows((current) => current.map((row) => ({ ...row, settled: true, name: `${row.name} — ${offered.error}` })))
      return
    }

    for (const [index, slot] of offered.value.entries()) {
      const file = files[index]
      if (file === undefined) continue

      const put = await fetch(slot.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      }).catch(() => undefined)

      if (put === undefined || !put.ok) {
        setRows((current) =>
          current.map((row) => (row.name === file.name ? { ...row, settled: true, percent: 0 } : row)),
        )
        continue
      }

      const finalised = await finalise({
        stagingKey: slot.stagingKey,
        declaredType: slot.declaredType,
        filename: slot.filename,
        journey,
      })

      setRows((current) =>
        current.map((row) =>
          row.name === file.name
            ? {
                ...row,
                settled: true,
                percent: finalised.ok ? 100 : 0,
                duplicate: finalised.ok && finalised.value.kind === 'duplicate',
                stored: finalised.ok && finalised.value.kind !== 'duplicate',
              }
            : row,
        ),
      )
    }

    // The grid is a server render, so the new rows arrive by asking for the
    // page again rather than by this component knowing what was created.
    router.refresh()
  }

  return (
    <>
      <section
        data-dropzone
        aria-label="Upload photographs and clips"
        className={[styles.dropzone, over ? styles.dropzoneOver : ''].join(' ')}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => {
          setOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          void upload([...event.dataTransfer.files])
        }}
      >
        <span aria-hidden="true" className={styles.mark}>
          <span className={styles.markSquare} />
        </span>

        <div className={styles.dropzoneText}>
          <p data-dropzone-headline className={styles.headline}>
            {DROPZONE_HEADLINE}
          </p>
          <p data-dropzone-note className={styles.note}>
            {acceptedFormatsNote(accepted)}
          </p>
        </div>

        <label className={styles.filePicker} htmlFor="td-media-picker">
          Photographs and clips to upload
        </label>
        <input
          id="td-media-picker"
          ref={picker}
          type="file"
          multiple
          accept={accepted.join(',')}
          className={styles.filePicker}
          onChange={(event) => {
            void upload([...(event.target.files ?? [])])
          }}
        />

        <select
          data-dropzone-journey
          aria-label="Add uploads to"
          className={styles.journeySelect}
          value={journey}
          onChange={(event) => {
            setJourney(event.target.value)
          }}
        >
          {journeys.map((choice) => (
            <option key={choice.id} value={choice.id}>
              Add to — {choice.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          data-dropzone-browse
          className={styles.browse}
          disabled={journeys.length === 0}
          onClick={() => {
            picker.current?.click()
          }}
        >
          Browse
        </button>
      </section>

      <UploadCard
        done={rows.filter((row) => row.settled).length}
        total={rows.length}
        stored={rows.filter((row) => row.stored).length}
        duplicates={rows.filter((row) => row.duplicate).length}
        files={rows}
      />
    </>
  )
}
