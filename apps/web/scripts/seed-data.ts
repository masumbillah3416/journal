/**
 * seed-data — the ten journeys' content, transcribed verbatim from the prototype.
 *
 * Factory pattern (CLAUDE.md §3.3, "Factory: test fixtures, seed data"): a
 * single typed constant, `journeySeeds`, that `seed.ts` turns into `journeys`
 * and `pages` documents. Every string here — dates, weather, mood, the
 * highlights, the note, the sign-off, the tally key/value pairs, and the
 * hero/Frames I/Frames II photo captions — is lifted character-for-character
 * from `handoff/design_handoff_travel_diary/Travel Diary.dc.html`'s
 * `journeys`/`MORE` arrays (around line 592) via a small extraction script
 * run against that file, not retyped by hand or paraphrased.
 *
 * The handoff states the voice is deliberate: "nineteen tarts, no regrets"
 * and "the map was wrong by evening" are content, not placeholders
 * (`docs/deviations.md`). This module is the one place that copy lives, so a
 * future change to it is a content decision, not an implementation detail.
 *
 * `accent` is present only for the four journeys (Tokyo, Lisbon, Patagonia,
 * Marrakech) whose prototype entry sets its own tint explicitly; the other
 * six fall back to a round-robin over `packages/tokens`' `journeyAccents` in
 * `seed.ts`, per this task's brief — the prototype's own fallback cycles
 * through only four of the five tokens, which `seed.ts` does not reproduce.
 *
 * `bookGlobalSeed` and `aboutGlobalSeed` are the same treatment applied to
 * the `book` and `about` globals (Task 10/11 review finding 1): their
 * content is DATA_MODEL.md's own home for Cover's and About's fields, and
 * `seed.ts` writes them there directly rather than as `pages` rows.
 * Depends on nothing.
 */

/** One entry in a journey's four-cell tally ticket. */
export interface TallyEntry {
  /** The ticket's label, e.g. `"Custard tarts"`. Uppercased at render time. */
  readonly key: string
  /** The value, deliberately free text — journeys use "plenty" and "uncounted". */
  readonly value: string
}

/** A journey's content, as extracted from the prototype. */
export interface JourneySeed {
  /** URL-safe, unique identifier — the prototype's own `id`. */
  readonly slug: string
  /** Display name, e.g. `"Tokyo"`. */
  readonly name: string
  /** Country or region, e.g. `"Japan"`. */
  readonly place: string
  /** Free-text date range, e.g. `"12 – 24 March 2025"`. */
  readonly dates: string
  /** Free-text weather line, e.g. `"CLEAR 14C"`. */
  readonly weather: string
  /** Free-text mood line, e.g. `"WIDE EYED"`. */
  readonly mood: string
  /** Which weather glyph the Notes page draws beside `weather`. */
  readonly weatherGlyph: 'sun' | 'haze' | 'wind'
  /** Postage-stamp country line, e.g. `"NIPPON"`. */
  readonly stampCountry: string
  /** Postage-stamp face value, e.g. `"120"`. */
  readonly stampValue: string
  /** This journey's own accent tint, when the prototype sets one explicitly. */
  readonly accent?: string
  /** The closing line under the Notes page footer, e.g. "twelve days, one corner of it". */
  readonly signoff: string
  /** Up to four highlight lines (schema-capped at 4; every journey here has 3 or 4). */
  readonly highlights: readonly string[]
  /** The journey's prose note, shown under the highlights on the Notes page. */
  readonly note: string
  /** Exactly four key/value pairs for the tally ticket. */
  readonly tally: readonly TallyEntry[]
  /** Caption for the Notes page's hero photo slot. */
  readonly heroCaption: string
  /** Captions for Frames I's three photo slots, in order. */
  readonly frameOneCaptions: readonly string[]
  /** Captions for Frames II's four photo slots, in order. */
  readonly frameTwoCaptions: readonly string[]
}

/**
 * The ten journeys the prototype ships with, in the prototype's own order:
 * the four fully hand-authored entries (Tokyo, Lisbon, Patagonia, Marrakech),
 * then the first six of its `MORE` table (Reykjavik, Kyoto, Hanoi, Porto,
 * Bergen, Seville).
 */
export const journeySeeds: readonly JourneySeed[] = [
  {
    slug: 'tokyo',
    name: 'Tokyo',
    place: 'Japan',
    dates: '12 – 24 March 2025',
    weather: 'CLEAR 14C',
    mood: 'WIDE EYED',
    weatherGlyph: 'sun',
    stampCountry: 'NIPPON',
    stampValue: '120',
    accent: '#3d817e',
    signoff: 'twelve days, one corner of it',
    highlights: [
      'First train at 05:40 — an empty carriage and a pink sky',
      'Standing ramen in Shinjuku, best eight hundred yen of the trip',
      'Got lost in Yanaka for two hours entirely on purpose',
      'Rain on the last night; bought a clear umbrella, kept it',
    ],
    note: 'Tokyo is loud in a way that never quite becomes noise. I kept a running list of small sounds — the chime at every crossing, the shopkeeper greeting nobody in particular, rain landing on cheap plastic. Twelve days and I still only walked a corner of it.',
    tally: [
      { key: 'Days', value: '12' },
      { key: 'Kilometres walked', value: '147' },
      { key: 'Rolls shot', value: '9' },
      { key: 'Bowls of ramen', value: '11' },
    ],
    heroCaption: 'Crossing at Shibuya, second attempt, still blurred',
    frameOneCaptions: [
      'Vending machine at 6am, Nakameguro',
      'The cat that runs the bookshop',
      'Train seats, upholstered like a sofa',
    ],
    frameTwoCaptions: [
      'Yanaka, the long slope down',
      'Plastic food, immaculate',
      'Kettle, ryokan, first morning',
      'Last night, the clear umbrella and everything behind it',
    ],
  },
  {
    slug: 'lisbon',
    name: 'Lisbon',
    place: 'Portugal',
    dates: '3 – 14 September 2025',
    weather: 'HAZY 27C',
    mood: 'UNHURRIED',
    weatherGlyph: 'haze',
    stampCountry: 'PORTUGAL',
    stampValue: '85',
    accent: '#a06b3e',
    signoff: 'nineteen tarts, no regrets',
    highlights: [
      'Tram 28 at seven, before the queue and the pickpockets',
      'Custard tart count: nineteen. Peak: four in one sitting',
      'Sunset at Graca — the whole terrace went quiet at once',
    ],
    note: 'Every street in Lisbon is either up or down. I stopped planning routes on the third day and just followed whichever hill looked kinder, which is how I found the tile shop, the wrong bus, and the best view I have ever had for two euros.',
    tally: [
      { key: 'Days', value: '11' },
      { key: 'Hills climbed', value: 'plenty' },
      { key: 'Rolls shot', value: '6' },
      { key: 'Custard tarts', value: '19' },
    ],
    heroCaption: 'Alfama, from a step I sat on for an hour',
    frameOneCaptions: [
      'Tiles, replaced badly, better for it',
      'Laundry as civic architecture',
      'Tram 28, empty, briefly',
    ],
    frameTwoCaptions: [
      'The tart, third of the day',
      'Graca terrace, ten minutes before',
      'Funicular, mid-groan',
      'River light at the end of Rua Augusta',
    ],
  },
  {
    slug: 'patagonia',
    name: 'Patagonia',
    place: 'Chile',
    dates: '8 – 19 January 2026',
    weather: 'GALE 4C',
    mood: 'HUMBLED',
    weatherGlyph: 'wind',
    stampCountry: 'CHILE',
    stampValue: '600',
    accent: '#5a72a8',
    signoff: 'eleven clear minutes',
    highlights: [
      'Wind strong enough to take the map out of my hands, twice',
      'Four layers, still cold, still grinning like an idiot',
      'Saw the towers clear for eleven minutes and nobody spoke',
    ],
    note: 'We waited two days for weather. On the third morning the cloud lifted like a curtain being pulled and the whole camp stood there doing nothing at all. Then everyone started making coffee at once, which is the Patagonian way of saying something.',
    tally: [
      { key: 'Days', value: '11' },
      { key: 'Kilometres walked', value: '198' },
      { key: 'Rolls shot', value: '8' },
      { key: 'Clear minutes', value: '11' },
    ],
    heroCaption: 'The towers, minute three of eleven',
    frameOneCaptions: ['Camp at first light, everything damp', 'Lenticular cloud, showing off', 'Boots, retired'],
    frameTwoCaptions: [
      'Guanaco, unbothered',
      'Lake the colour of toothpaste',
      'The trail sign nobody obeys',
      'Wind on the water, all afternoon',
    ],
  },
  {
    slug: 'marrakech',
    name: 'Marrakech',
    place: 'Morocco',
    dates: '2 – 11 May 2026',
    weather: 'DRY 33C',
    mood: 'OVERWHELMED',
    weatherGlyph: 'sun',
    stampCountry: 'MAROC',
    stampValue: '9.00',
    accent: '#a15a4e',
    signoff: 'the map was wrong by evening',
    highlights: [
      'Mint tea poured from an absurd height, twice, for effect',
      'Learned to say "just looking" in three languages, used it in none',
      'Rooftop at dusk — swifts over the entire medina at once',
    ],
    note: 'The medina rearranges itself the moment you stop watching. I drew a map on the back of a receipt and it was wrong by evening. Best to give up early, take the fourth left, and let the smell of the tanneries do the orienting for you.',
    tally: [
      { key: 'Days', value: '9' },
      { key: 'Wrong turns', value: 'uncounted' },
      { key: 'Rolls shot', value: '5' },
      { key: 'Glasses of tea', value: '23' },
    ],
    heroCaption: 'The souk at four, when the light gets in',
    frameOneCaptions: ['Dye pots, still wet', 'Door, studded, enormous', 'Tea, poured from a great height'],
    frameTwoCaptions: [
      'Rooftop, swifts, dusk',
      'Spice cones, engineered',
      'Cat asleep on a carpet stack',
      'Courtyard, shade, twenty degrees cooler',
    ],
  },
  {
    slug: 'reykjavik',
    name: 'Reykjavik',
    place: 'Iceland',
    dates: '4 – 11 June 2025',
    weather: 'WIND 9C',
    mood: 'SLEEPLESS',
    weatherGlyph: 'wind',
    stampCountry: 'ISLAND',
    stampValue: '160',
    signoff: 'back sooner than planned',
    highlights: [
      'Sun still up at midnight and nobody going home',
      'Swam outdoors in the rain, twice',
      'Bought a jumper I will never wear at home',
    ],
    note: 'The light never really left. I stopped checking the time on the third day and ate whenever I was hungry, which turned out to be constantly.',
    tally: [
      { key: 'Days', value: '8' },
      { key: 'Kilometres walked', value: '61' },
      { key: 'Rolls shot', value: '5' },
      { key: 'Coffees', value: '21' },
    ],
    heroCaption: 'Harbour at low tide',
    frameOneCaptions: ['Corrugated houses, repainted', 'Pool steam at midnight', 'The road out of town'],
    frameTwoCaptions: ['Doorway, morning', 'The long way back', 'Window seat', 'A very ordinary street'],
  },
  {
    slug: 'kyoto',
    name: 'Kyoto',
    place: 'Japan',
    dates: '28 Oct – 6 Nov 2025',
    weather: 'CRISP 12C',
    mood: 'QUIET',
    weatherGlyph: 'sun',
    stampCountry: 'NIPPON',
    stampValue: '84',
    signoff: 'I would go again tomorrow',
    highlights: [
      'Temple at opening time, entirely empty',
      'Followed a cat down an alley, no regrets',
      'Maple leaves on a bicycle seat',
    ],
    note: 'Kyoto asks you to slow down and then punishes you for hurrying. I walked the same river path four evenings running and it was different every time.',
    tally: [
      { key: 'Days', value: '10' },
      { key: 'Kilometres walked', value: '96' },
      { key: 'Rolls shot', value: '7' },
      { key: 'Wrong buses', value: '4' },
    ],
    heroCaption: 'River path, evening',
    frameOneCaptions: ['Gate, weathered', 'Moss, immaculate', 'Bicycle under maples'],
    frameTwoCaptions: ['The long way back', 'Window seat', 'A very ordinary street', 'Light through a gap'],
  },
  {
    slug: 'hanoi',
    name: 'Hanoi',
    place: 'Vietnam',
    dates: '13 – 21 February 2026',
    weather: 'HUMID 24C',
    mood: 'ALIVE',
    weatherGlyph: 'haze',
    stampCountry: 'VIET NAM',
    stampValue: '25',
    signoff: 'the notebook got wet',
    highlights: [
      'Breakfast on a plastic stool, four inches off the ground',
      'Crossing the road is a negotiation, not a dash',
      'Coffee with egg in it, and it works',
    ],
    note: 'Everything happens on the pavement here — cooking, haircuts, card games, sleeping. The road is for the motorbikes and the pavement is for living.',
    tally: [
      { key: 'Days', value: '9' },
      { key: 'Kilometres walked', value: '54' },
      { key: 'Rolls shot', value: '6' },
      { key: 'Postcards sent', value: '7' },
    ],
    heroCaption: 'Plastic stools at dawn',
    frameOneCaptions: ['Wires, uncountable', 'Market at six', 'Old quarter, wet'],
    frameTwoCaptions: ['Window seat', 'A very ordinary street', 'Light through a gap', 'The last evening'],
  },
  {
    slug: 'porto',
    name: 'Porto',
    place: 'Portugal',
    dates: '9 – 15 April 2025',
    weather: 'MILD 19C',
    mood: 'CONTENT',
    weatherGlyph: 'sun',
    stampCountry: 'PORTUGAL',
    stampValue: '75',
    signoff: 'all of it, again',
    highlights: [
      'Bridge at sunset, everyone facing the same way',
      'Bookshop queue: forty minutes, worth twelve',
      'Ate standing up on three separate occasions',
    ],
    note: 'A city built on a slope and entirely comfortable about it. I found one cafe I liked and went back every morning, which is not travelling but was very pleasant.',
    tally: [
      { key: 'Days', value: '6' },
      { key: 'Kilometres walked', value: '41' },
      { key: 'Rolls shot', value: '4' },
      { key: 'Rainy days', value: '3' },
    ],
    heroCaption: 'The bridge, from below',
    frameOneCaptions: ['Azulejo wall', 'Port lodge, cool and dark', 'Steep street, late sun'],
    frameTwoCaptions: ['Doorway, morning', 'The long way back', 'Window seat', 'A very ordinary street'],
  },
  {
    slug: 'bergen',
    name: 'Bergen',
    place: 'Norway',
    dates: '17 – 23 July 2025',
    weather: 'RAIN 14C',
    mood: 'DAMP',
    weatherGlyph: 'wind',
    stampCountry: 'NORGE',
    stampValue: '39',
    signoff: 'shorter than it should have been',
    highlights: [
      'It rained for five days and nobody mentioned it',
      'Funicular up, walked down, regretted the shoes',
      'Fish soup that ruined all other fish soup',
    ],
    note: 'Bergen has made peace with the weather in a way I found genuinely instructive. Waterproofs on, out you go, no comment.',
    tally: [
      { key: 'Days', value: '7' },
      { key: 'Kilometres walked', value: '48' },
      { key: 'Rolls shot', value: '3' },
      { key: 'Early starts', value: '5' },
    ],
    heroCaption: 'Wharf, wooden and leaning',
    frameOneCaptions: ['Rain on the fjord', 'Fish market, early', 'The hill, from the top'],
    frameTwoCaptions: ['The long way back', 'Window seat', 'A very ordinary street', 'Light through a gap'],
  },
  {
    slug: 'seville',
    name: 'Seville',
    place: 'Spain',
    dates: '2 – 9 May 2025',
    weather: 'HOT 34C',
    mood: 'MELTING',
    weatherGlyph: 'sun',
    stampCountry: 'ESPANA',
    stampValue: '1.40',
    signoff: 'still thinking about it',
    highlights: [
      'Nothing at all happens between two and five',
      'Orange trees everywhere, oranges inedible',
      'Flamenco in a room of thirty people',
    ],
    note: 'The heat organises the day for you. Out early, hidden at noon, out again at nine when the whole city appears at once as if summoned.',
    tally: [
      { key: 'Days', value: '8' },
      { key: 'Kilometres walked', value: '52' },
      { key: 'Rolls shot', value: '6' },
      { key: 'Bookshops', value: '6' },
    ],
    heroCaption: 'Courtyard, shaded',
    frameOneCaptions: ['Tiles and shadow', 'Rooftops at nine', 'Orange tree, bitter fruit'],
    frameTwoCaptions: ['Window seat', 'A very ordinary street', 'Light through a gap', 'The last evening'],
  },
]

/**
 * The `book` global's content, transcribed verbatim from the Cover screen in
 * `Travel Diary.dc.html` (the `bookTitle`/`ownerName`/`coverCloth` prop
 * defaults, and the static text rendered around them: the subtitle line,
 * the "2025 — 2026" years line, and the Contents screen's header note).
 */
export interface BookGlobalSeed {
  /** The cover's title, e.g. `"Wanderings"`. */
  readonly title: string
  /** The italic line under the title. */
  readonly subtitle: string
  /** The name after "Kept by" on the cover. */
  readonly owner: string
  /** The cover cloth colour, one of `packages/tokens`' `coverCloths`. */
  readonly coverCloth: string
  /** The years line under "Kept by {owner}" on the cover. */
  readonly yearsShown: string
  /** The right-aligned italic note in the Contents page header. */
  readonly contentsNote: string
}

/** The `book` global's seed content. */
export const bookGlobalSeed: BookGlobalSeed = {
  title: 'Wanderings',
  subtitle: 'field notes, photographs and other scraps',
  owner: 'M. Alvarez',
  coverCloth: '#2f4a47',
  yearsShown: '2025 — 2026',
  contentsNote: 'Each journey runs three pages — notes, then two spreads of frames. The rest lives in the galleries.',
}

/**
 * The `about` global's content, transcribed verbatim from the About screen
 * in `Travel Diary.dc.html`: the portrait caption, the two biography
 * paragraphs, the three packing-kit lines, and the reply-to address
 * (`hello@{{ handle }}.travel` with `handle: 'wanderings'`).
 */
export interface AboutGlobalSeed {
  /** Caption under the portrait mount. */
  readonly portraitCaption: string
  /** The two biography paragraphs, in order. */
  readonly paragraphs: readonly string[]
  /** The packing-kit list, in order. */
  readonly kit: readonly string[]
  /** The address a reader's reply is addressed to. */
  readonly replyTo: string
}

/** The `about` global's seed content. */
export const aboutGlobalSeed: AboutGlobalSeed = {
  portraitCaption: 'Somewhere with bad coffee and a good window',
  paragraphs: [
    'This is a paper habit that ended up on a screen. I keep one page of notes per journey, then paste in whatever frames survive the edit. Everything else goes into the gallery behind each entry — sometimes a hundred photographs, most of them of doorways.',
    'Nothing here is a recommendation. The notes are written the same evening, badly, and left that way on purpose. If a page looks crooked, that is the tape.',
  ],
  kit: ['35mm rangefinder, one lens', 'Pocket notebook, blue ink', 'Roll of washi tape, always'],
  replyTo: 'hello@wanderings.travel',
}
