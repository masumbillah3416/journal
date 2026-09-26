import { describe, expect, it } from 'vitest'
import { journeyId, mediaId, type JourneyId, type MediaId } from '../ids'
import { activeNavId } from './navigation'
import { prompts, promptedSelection, type FrameNeed, type OverviewState } from './prompts'

/**
 * A branded media id, for a test that is about the prompt rather than about
 * branding.
 * @param raw - The row id as Postgres would have minted it.
 * @returns The branded id.
 */
const aMediaId = (raw: string): MediaId => {
  const built = mediaId(raw)
  if (!built.ok) throw new Error(`unbrandable media id in a fixture: ${raw}`)
  return built.value
}

/**
 * A branded journey id, as above.
 * @param raw - The row id as Postgres would have minted it.
 * @returns The branded id.
 */
const aJourneyId = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(`unbrandable journey id in a fixture: ${raw}`)
  return built.value
}

/**
 * One frame needing something, keyed by its journey (CLAUDE.md §0.9).
 * @param id - The frame's row id.
 * @param journey - Its journey's row id.
 * @param journeyName - That journey's name, which the prompt's text prints.
 * @returns The need.
 */
const aFrame = (id: string, journey = '3', journeyName = 'Marrakech'): FrameNeed => ({
  id: aMediaId(id),
  journey: aJourneyId(journey),
  journeyName,
})

/**
 * The state of a diary with nothing to look at.
 *
 * ═══ THE DEFAULTS ARE SPELLED OUT HERE, NOT IMPLIED ═══
 *
 * A factory whose defaults are invisible makes every case that omits a field
 * an assertion about something the reader cannot see. In particular
 * `publishedJourneys` DEFAULTS TO A PUBLISHED BOOK: the `nothing-published`
 * prompt fires on a diary where nothing is published, so a factory defaulting
 * it to zero would make "no prompts at all" impossible and that arm of
 * {@link PromptKind} unreachable. `PUBLISHED_BY_DEFAULT` names the choice, and
 * the case below asserts it rather than trusting it.
 */
const PUBLISHED_BY_DEFAULT = 3

/**
 * An overview state, with everything empty unless the case says otherwise.
 * @param over - The fields this case is about.
 * @returns The state.
 */
const anOverviewState = (over: Partial<OverviewState>): OverviewState => ({
  clipsWithoutPosters: [],
  framesWithoutCaptions: [],
  framesWithoutAltText: [],
  publishedJourneys: PUBLISHED_BY_DEFAULT,
  ...over,
})

describe('prompts', () => {
  it('links "Pick posters" at the first clip with no poster, naming it by id', () => {
    const state = anOverviewState({ clipsWithoutPosters: [aFrame('41'), aFrame('67')] })
    const prompt = prompts(state).find((candidate) => candidate.kind === 'pick-posters')

    const url = new URL(prompt?.href ?? '', 'https://example.test')
    expect(url.searchParams.get('frame')).toBe('41')
  })

  it('names the gallery the first clip is in, so the destination draws that journey’s grid', () => {
    // THE FRAME IS NOT ENOUGH. §2.5's screen is journey-scoped and falls back to
    // the first journey for an address that names none, so a link carrying only
    // `frame` opens somebody else's gallery and selects its first tile instead
    // — a dead deep link that renders perfectly (CLAUDE.md §0.9).
    const state = anOverviewState({ clipsWithoutPosters: [aFrame('41', '9', 'Bergen')] })
    const prompt = prompts(state).find((candidate) => candidate.kind === 'pick-posters')

    expect(new URL(prompt?.href ?? '', 'https://example.test').searchParams.get('journey')).toBe('9')
  })

  it('links "Caption them" with the bulk panel already asked for', () => {
    const state = anOverviewState({ framesWithoutCaptions: [aFrame('12'), aFrame('13')] })
    const prompt = prompts(state).find((candidate) => candidate.kind === 'caption-them')

    expect(new URL(prompt?.href ?? '', 'https://example.test').searchParams.get('captionAll')).toBe('1')
  })

  it('sends every prompt to an address the rail itself recognises', () => {
    // The left side is each prompt's own href; the right side is the
    // navigation module's answer for it. A prompt pointing at a screen that
    // does not exist is a dead link that renders perfectly.
    //
    // THE COUNT IS ASSERTED FIRST, because `[].every(…)` is `true`: without it
    // this case passes against a `prompts` that returns nothing at all, which
    // is exactly the implementation the mutation below targets.
    const state = anOverviewState({
      clipsWithoutPosters: [aFrame('41')],
      framesWithoutCaptions: [aFrame('12')],
      framesWithoutAltText: [aFrame('15')],
      publishedJourneys: 0,
    })
    const offered = prompts(state)

    expect(offered).toHaveLength(4)
    expect(
      offered.every((prompt) => activeNavId(new URL(prompt.href, 'https://example.test').pathname) !== undefined),
    ).toBe(true)
  })

  it('offers no prompt when there is nothing to look at, rather than an empty card', () => {
    // The published book with nothing outstanding — see PUBLISHED_BY_DEFAULT.
    expect(prompts(anOverviewState({}))).toEqual([])
  })

  it('treats a published book as the default, so "nothing to look at" is reachable at all', () => {
    // The factory's own default, asserted rather than implied: if this ever
    // became zero the case above would be testing a diary that has a prompt.
    expect(anOverviewState({}).publishedJourneys).toBeGreaterThan(0)
  })

  it('asks for something to be published when nothing is', () => {
    // The fourth arm of PromptKind, which fires on exactly the state the case
    // above excludes. An arm nothing exercises is an enumeration with a hole in
    // it (standing orders, species 6).
    const offered = prompts(anOverviewState({ publishedJourneys: 0 }))

    expect(offered.map((prompt) => prompt.kind)).toEqual(['nothing-published'])
  })

  it('offers nothing to publish once one journey is out, however small the book', () => {
    // The other side of the `publishedJourneys` boundary: one is enough.
    expect(prompts(anOverviewState({ publishedJourneys: 1 }))).toEqual([])
  })

  it('counts only the clips in the gallery it names, not every clip in the diary', () => {
    // A prompt reading "3 clips in the Marrakech gallery" over a list whose
    // third clip is in Bergen is a sentence the data does not support. The
    // journey is taken from the FIRST clip and the count is that journey's.
    const state = anOverviewState({
      clipsWithoutPosters: [aFrame('41'), aFrame('67'), aFrame('90', '9', 'Bergen')],
    })
    const prompt = prompts(state).find((candidate) => candidate.kind === 'pick-posters')

    expect(prompt?.text).toBe('2 clips in the Marrakech gallery have no poster frame chosen.')
  })

  it('writes the single clip in the singular', () => {
    const state = anOverviewState({ clipsWithoutPosters: [aFrame('41')] })

    expect(prompts(state).find((candidate) => candidate.kind === 'pick-posters')?.text).toBe(
      'One clip in the Marrakech gallery has no poster frame chosen.',
    )
  })

  it('writes the uncaptioned frames in the journey’s own voice', () => {
    const state = anOverviewState({
      framesWithoutCaptions: [aFrame('12', '9', 'Bergen'), aFrame('13', '9', 'Bergen')],
    })

    expect(prompts(state).find((candidate) => candidate.kind === 'caption-them')?.text).toBe(
      'Bergen has 2 uncaptioned frames in its gallery.',
    )
  })

  it('writes a single uncaptioned frame in the singular too', () => {
    const state = anOverviewState({ framesWithoutCaptions: [aFrame('12', '9', 'Bergen')] })

    expect(prompts(state).find((candidate) => candidate.kind === 'caption-them')?.text).toBe(
      'Bergen has one uncaptioned frame in its gallery.',
    )
  })

  it('selects the first frame with no alt text by id, on the screen that writes one', () => {
    const state = anOverviewState({ framesWithoutAltText: [aFrame('15', '9', 'Bergen'), aFrame('16', '9', 'Bergen')] })
    const prompt = prompts(state).find((candidate) => candidate.kind === 'no-alt-text')

    const url = new URL(prompt?.href ?? '', 'https://example.test')
    expect([url.pathname, url.searchParams.get('journey'), url.searchParams.get('frame')]).toEqual([
      '/admin/galleries',
      '9',
      '15',
    ])
  })

  it('gives every prompt an action to press, because a prompt with no way on is a sentence', () => {
    const state = anOverviewState({
      clipsWithoutPosters: [aFrame('41')],
      framesWithoutCaptions: [aFrame('12')],
      framesWithoutAltText: [aFrame('15')],
      publishedJourneys: 0,
    })

    expect(prompts(state).map((prompt) => prompt.action)).toEqual([
      'Pick posters',
      'Caption them',
      'Add alt text',
      'Review what is waiting',
    ])
  })

  it('offers each kind at most once, so one gallery cannot fill the card', () => {
    const state = anOverviewState({
      clipsWithoutPosters: [aFrame('41'), aFrame('67'), aFrame('68')],
    })

    expect(prompts(state).map((prompt) => prompt.kind)).toEqual(['pick-posters'])
  })
})

describe('promptedSelection', () => {
  /**
   * The query a prompt's own href carries, as Next.js hands a page component.
   * @param href - The prompt's href.
   * @returns The parsed query, in Next's own shape.
   */
  const queryOf = (href: string): Record<string, string | string[] | undefined> =>
    Object.fromEntries(new URL(href, 'https://example.test').searchParams.entries())

  it('reads back the frame the "Pick posters" prompt named, without it being typed anywhere', () => {
    // THE ROUND TRIP, which is the only thing that can say the writer and the
    // reader agree — `changeId`/`parsedChangeId`'s shape one module along. A
    // case asserting the literal `'41'` on both sides would pass for two
    // modules that disagree about the parameter's NAME.
    const state = anOverviewState({ clipsWithoutPosters: [aFrame('41', '9', 'Bergen')] })
    const prompt = prompts(state).find((candidate) => candidate.kind === 'pick-posters')

    expect(promptedSelection(queryOf(prompt?.href ?? '')).frame).toBe(aFrame('41').id)
  })

  it('opens the bulk panel for the "Caption them" prompt’s own address', () => {
    const state = anOverviewState({ framesWithoutCaptions: [aFrame('12', '9', 'Bergen')] })
    const prompt = prompts(state).find((candidate) => candidate.kind === 'caption-them')

    expect(promptedSelection(queryOf(prompt?.href ?? '')).captionAll).toBe(true)
  })

  it('leaves the bulk panel shut for a prompt that did not ask for it', () => {
    const state = anOverviewState({ clipsWithoutPosters: [aFrame('41')] })
    const prompt = prompts(state).find((candidate) => candidate.kind === 'pick-posters')

    expect(promptedSelection(queryOf(prompt?.href ?? '')).captionAll).toBe(false)
  })

  it('selects nothing for an address that names no frame', () => {
    expect(promptedSelection({})).toEqual({ frame: null, captionAll: false })
  })

  it('refuses a frame that is not a row id Postgres could have minted', () => {
    // AN INVERSION (standing orders, species 6): the value has to BE a row id
    // rather than not be one of a list of bad spellings. `41x`, `-1`, `041`
    // and the empty string are all addresses anybody can type.
    expect(['41x', '-1', '041', '0', '', ' 41'].map((frame) => promptedSelection({ frame }).frame)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ])
  })

  it('takes the first entry when a key repeats, because an address can say anything', () => {
    // `?frame=41&frame=67` is an address anybody can type, and Next.js hands it
    // over as an array. Refusing it outright would 500 on a typo.
    expect(promptedSelection({ frame: ['41', '67'] }).frame).toBe(aFrame('41').id)
  })

  it('opens the bulk panel only for the value the prompt writes, not for any truthy string', () => {
    expect(
      [promptedSelection({ captionAll: '1' }), promptedSelection({ captionAll: 'yes' })].map((s) => s.captionAll),
    ).toEqual([true, false])
  })
})
