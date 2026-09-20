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
import { MAX_FILES_PER_REQUEST, MAX_UPLOAD_BYTES } from '@travel-diary/domain/media/uploadSlot'
import type {
  FinaliseFailure,
  FinaliseRequest,
  FinaliseResponse,
  SlotFailure,
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

/**
 * What the author is told, per refusal.
 *
 * MEDIA-002: the row used to print the refusal's own member name —
 * `tokyo.jpg — type-not-offered` — which is the domain's vocabulary in an
 * author's screen. `SCREENS.md` §2.4 specifies no error surface at all, so
 * every sentence here is this implementation's (`docs/deviations.md`).
 *
 * The two caps are read off the domain's own constants rather than typed as
 * numbers, so a cap that moves moves the sentence with it.
 */
const REFUSAL_SENTENCE: Readonly<Record<SlotFailure | FinaliseFailure, string>> = {
  'empty-request': 'nothing was selected',
  'too-many-files': `more than ${String(MAX_FILES_PER_REQUEST)} files at once`,
  'too-large': `larger than ${String(Math.round(MAX_UPLOAD_BYTES / 1_048_576))}MB`,
  'type-not-offered': 'not a kind of file this diary takes',
  'unnamed-file': 'the name has nothing usable in it',
  'invalid-journey': 'that journey is not one it can be filed under',
  'no-upload-url': 'the store would not offer somewhere to put it',
  'svg-rejected': 'an SVG, which is a document rather than a photograph',
  'video-deferred': 'a clip, and clips are not enabled on this deployment',
  'heic-unsupported': 'a HEIC, which this diary cannot read',
  'type-not-allowed': 'the bytes are not a kind of file this diary takes',
  'declared-mismatch': 'the bytes are not what the name says they are',
  unreadable: 'the bytes could not be read as a photograph',
  'key-not-staged': 'the upload could not be matched to the slot it was offered',
  'staged-bytes-missing': 'the bytes never reached the store',
  'not-queued': 'it could not be handed on for processing',
}

/**
 * Every way an upload can be refused, in one list.
 *
 * ═══ READ OFF THE TABLE, NOT WRITTEN OUT BESIDE IT ═══
 *
 * {@link REFUSAL_SENTENCE} is a `Record` over the whole
 * `SlotFailure | FinaliseFailure` union, so a member added to either fails
 * `tsc` there rather than reaching an author as its own name — the inversion
 * `eslint-rules/guarded-server-actions.js` is this repository's worked example
 * of, applied to copy: recognise what to say, do not enumerate what to hide.
 *
 * This WAS a second, hand-written enumeration of the same union sitting above
 * that table, which `tsc` type-checked and nothing kept complete: a member
 * added to the union and to the table, and forgotten here, was covered by the
 * type and tested by nobody. Reading the table's own keys removes the second
 * list, so the walk in `Dropzone.test.tsx` covers exactly what ships.
 */
export const UPLOAD_REFUSALS: readonly (SlotFailure | FinaliseFailure)[] = Object.keys(
  REFUSAL_SENTENCE,
) as readonly (keyof typeof REFUSAL_SENTENCE)[]

/** What the row says when the PUT itself never landed. Not a refusal of ours. */
const PUT_FAILED = 'the upload did not reach the store'

/** How many rows this page has minted an id for. Never read as a position. */
let mintedRows = 0

/**
 * Mints the id one upload row is addressed by, for this page's lifetime.
 *
 * TWO FILES IN ONE BATCH CAN SHARE A NAME. `event.dataTransfer.files` carries
 * whatever was dragged in, and `IMG_0001.jpg` dragged from two folders is two
 * files with one name — so the name cannot be the row's identity
 * (CLAUDE.md §0.9), and neither can the position, which is what §0.9 says
 * first.
 *
 * A COUNTER RATHER THAN `crypto.randomUUID()`, deliberately: `randomUUID` is
 * absent outside a secure context, so a deployment served over plain `http`
 * would throw here instead of uploading. Uniqueness within one document is all
 * a React key and a row update need.
 * @returns An id no other row of this page has.
 * @example
 * uploadRowId() // 'upload-1'
 */
const uploadRowId = (): string => {
  mintedRows += 1
  return `upload-${String(mintedRows)}`
}

/**
 * The sentence one refusal is told to the author as.
 *
 * @param refusal - What `requestUploadSlots` or `finaliseUpload` answered.
 * @returns The sentence. Never the member's own name.
 * @example
 * refusalSentence('type-not-offered') // 'not a kind of file this diary takes'
 */
export const refusalSentence = (refusal: SlotFailure | FinaliseFailure): string => REFUSAL_SENTENCE[refusal]

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
  /** Why it was refused, as a sentence, or `null` when it was not. */
  readonly refusal: string | null
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

    // THE BATCH IS BUILT ONCE, WITH AN ID PER FILE, and every update below
    // addresses a row by that id. The slot list comes back in request order,
    // which is the contract's own pairing, so `batch[index]` is the file the
    // slot at `index` was offered for — and the row it updates is named by id
    // rather than found by position or by filename.
    const batch = files.map((file) => ({ id: uploadRowId(), file }))

    setRows(
      batch.map(({ id, file }) => ({
        id,
        name: file.name,
        percent: 0,
        settled: false,
        duplicate: false,
        stored: false,
        refusal: null,
      })),
    )

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
      // THE NAME IS LEFT ALONE: the author needs to see which file it was, and
      // the reason goes in a cell wide enough to hold a sentence (MEDIA-002).
      setRows((current) => current.map((row) => ({ ...row, settled: true, refusal: refusalSentence(offered.error) })))
      return
    }

    for (const [index, slot] of offered.value.entries()) {
      const entry = batch[index]
      if (entry === undefined) continue
      const { id, file } = entry

      const put = await fetch(slot.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      }).catch(() => undefined)

      if (put === undefined || !put.ok) {
        setRows((current) =>
          current.map((row) => (row.id === id ? { ...row, settled: true, percent: 0, refusal: PUT_FAILED } : row)),
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
          row.id === id
            ? {
                ...row,
                settled: true,
                percent: finalised.ok ? 100 : 0,
                duplicate: finalised.ok && finalised.value.kind === 'duplicate',
                stored: finalised.ok && finalised.value.kind !== 'duplicate',
                refusal: finalised.ok ? null : refusalSentence(finalised.error),
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
