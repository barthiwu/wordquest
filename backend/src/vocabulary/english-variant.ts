/**
 * UK -> US English spelling-variant converter (2026-09 fairness
 * feature — see User.englishVariant's doc comment in schema.prisma).
 * WordQuest's vocabulary corpus is authored in UK spelling; this module
 * derives the US spelling for whichever words in it actually differ, so
 * words/sentences can be served in either the player's own preferred
 * variant.
 *
 * DESIGN: this is a curated dictionary, not a general-purpose spelling
 * transformer. The overwhelming majority of English words are spelled
 * identically in both regions ("adventure", "confidence", "beautiful"
 * all have zero UK/US difference) — the actual set of words that DO
 * differ is a well-documented, bounded list covering a handful of
 * families (see the section comments below). A blind regex like
 * /our$/ -> 'or' would wrongly rewrite "hour", "flour", "tour", "your"
 * — words that end the same way but aren't part of the -our/-or family
 * at all. So every entry here is either a) an explicit, individually
 * checked word pair, or b) mechanically generated from a curated BASE
 * word (via withInflections, below) whose few common suffixed forms
 * (colour -> coloured/colouring/colourful) are safe to derive by plain
 * string concatenation, because the difference lives entirely in the
 * stem, not the suffix.
 *
 * KNOWN LIMITATION: a handful of words are genuinely ambiguous without
 * part-of-speech context this module doesn't have — e.g. "analyses" is
 * both the plural noun of "analysis" (unchanged in US) and a verb form
 * of "analyse" ("analyzes" in US). Those are deliberately left OUT of
 * the table rather than guessed at; see the note near YSE_YZE_PAIRS.
 *
 * This is a V1 curated list, not an exhaustive one — extend the
 * category arrays below as real gaps turn up (e.g. from a corpus-wide
 * audit), rather than switching to blind pattern rules.
 */

/** Appends each of `suffixes` to both the UK and US base and pairs them
 * up — safe ONLY for families where the spelling difference is
 * entirely within the base and the suffix attaches identically to
 * both (true for every family this is used on below). `''` in the
 * list keeps the bare base pair itself. */
function withInflections(ukBase: string, usBase: string, suffixes: string[]): [string, string][] {
  return suffixes.map((suffix) => [`${ukBase}${suffix}`, `${usBase}${suffix}`]);
}

function manyWithInflections(bases: [string, string][], suffixes: string[]): [string, string][] {
  return bases.flatMap(([uk, us]) => withInflections(uk, us, suffixes));
}

// ── -our / -or (colour/color, favour/favor, honour/honor...) ───────────
// Deliberately NOT a blind /our$/ rule -- "hour", "flour", "tour",
// "your", "four", "pour", "sour", "detour", "contour", "amour",
// "velour" all end in "our" but are spelled identically in the US too.
const OUR_OR_BASES: [string, string][] = [
  ['colour', 'color'],
  ['favour', 'favor'],
  ['honour', 'honor'],
  ['labour', 'labor'],
  ['neighbour', 'neighbor'],
  ['humour', 'humor'],
  ['flavour', 'flavor'],
  ['behaviour', 'behavior'],
  ['harbour', 'harbor'],
  ['rumour', 'rumor'],
  ['armour', 'armor'],
  ['valour', 'valor'],
  ['vigour', 'vigor'],
  ['endeavour', 'endeavor'],
  ['saviour', 'savior'],
  ['splendour', 'splendor'],
  ['ardour', 'ardor'],
  ['clamour', 'clamor'],
  ['demeanour', 'demeanor'],
  ['odour', 'odor'],
  ['parlour', 'parlor'],
  ['rancour', 'rancor'],
  ['tumour', 'tumor'],
  ['vapour', 'vapor'],
  ['candour', 'candor'],
  ['fervour', 'fervor'],
  ['succour', 'succor'],
  ['misdemeanour', 'misdemeanor'],
  ['glamour', 'glamor'],
];
const OUR_OR_PAIRS: [string, string][] = [
  ...manyWithInflections(OUR_OR_BASES, ['', 's', 'ed', 'ing']),
  ['colourful', 'colorful'],
  ['colourless', 'colorless'],
  ['favourite', 'favorite'],
  ['favourites', 'favorites'],
  ['favourable', 'favorable'],
  ['favourably', 'favorably'],
  ['honourable', 'honorable'],
  ['honourably', 'honorably'],
  ['neighbourhood', 'neighborhood'],
  ['neighbourhoods', 'neighborhoods'],
  ['neighbourly', 'neighborly'],
  ['behavioural', 'behavioral'],
  ['labourer', 'laborer'],
  ['labourers', 'laborers'],
];

// ── -re / -er (centre/center, metre/meter, theatre/theater...) ─────────
// Not a blind /re$/ rule either -- "genre", "ogre", "acre", "mediocre",
// "macabre", "cadre", "timbre" all end in "re" and are unchanged in the
// US.
const RE_ER_BASES: [string, string][] = [
  ['centre', 'center'],
  ['metre', 'meter'],
  ['litre', 'liter'],
  ['fibre', 'fiber'],
  ['theatre', 'theater'],
  ['sombre', 'somber'],
  ['lustre', 'luster'],
  ['calibre', 'caliber'],
  ['sabre', 'saber'],
  ['spectre', 'specter'],
  ['kilometre', 'kilometer'],
  ['millimetre', 'millimeter'],
  ['centimetre', 'centimeter'],
  ['nitre', 'niter'],
];
// NOT manyWithInflections -- every UK base here ends in a silent 'e'
// (centre, metre...) while its US form never does (center, meter...,
// the re->er metathesis drops it), so 'd'/'ing' attach asymmetrically:
// UK "centre"+'d'="centred" but US "center" needs +'ed'="centered", and
// UK -ing drops the silent e ("centr"+"ing"="centring") while US does
// not ("center"+"ing"="centering"). Blindly concatenating the same
// suffix to both sides (as the -our/-or and -ise/-ize families safely
// do, since neither side of THOSE ends in a silent e) produced the
// wrong word "centerd" here -- caught by this module's own test suite.
function reErInflections([uk, us]: [string, string]): [string, string][] {
  const ukStem = uk.slice(0, -1); // drop UK's silent 'e'
  return [
    [uk, us],
    [`${uk}s`, `${us}s`],
    [`${uk}d`, `${us}ed`],
    [`${ukStem}ing`, `${us}ing`],
  ];
}
const RE_ER_PAIRS: [string, string][] = RE_ER_BASES.flatMap(reErInflections);

// ── -ise / -ize verbs (realise/realize, organise/organize...) ──────────
// This is the genuinely irregular family: MOST -ise words are spelled
// -ise in the US too and have no -ize form at all ("advertise",
// "surprise", "comprise", "compromise", "despise", "devise",
// "disguise", "exercise", "franchise", "improvise", "promise",
// "revise", "supervise", "televise", "wise", "precise", "concise",
// "expertise" -- none of these belong here). So this is a curated list
// of verbs that DO alternate, not a suffix rule.
const ISE_IZE_VERBS: [string, string][] = [
  ['realise', 'realize'],
  ['organise', 'organize'],
  ['recognise', 'recognize'],
  ['apologise', 'apologize'],
  ['criticise', 'criticize'],
  ['emphasise', 'emphasize'],
  ['minimise', 'minimize'],
  ['maximise', 'maximize'],
  ['characterise', 'characterize'],
  ['specialise', 'specialize'],
  ['standardise', 'standardize'],
  ['summarise', 'summarize'],
  ['memorise', 'memorize'],
  ['symbolise', 'symbolize'],
  ['sympathise', 'sympathize'],
  ['capitalise', 'capitalize'],
  ['categorise', 'categorize'],
  ['civilise', 'civilize'],
  ['colonise', 'colonize'],
  ['customise', 'customize'],
  ['dramatise', 'dramatize'],
  ['energise', 'energize'],
  ['familiarise', 'familiarize'],
  ['finalise', 'finalize'],
  ['fertilise', 'fertilize'],
  ['generalise', 'generalize'],
  ['harmonise', 'harmonize'],
  ['hospitalise', 'hospitalize'],
  ['idolise', 'idolize'],
  ['immunise', 'immunize'],
  ['industrialise', 'industrialize'],
  ['initialise', 'initialize'],
  ['internalise', 'internalize'],
  ['itemise', 'itemize'],
  ['legalise', 'legalize'],
  ['localise', 'localize'],
  ['magnetise', 'magnetize'],
  ['materialise', 'materialize'],
  ['mechanise', 'mechanize'],
  ['mobilise', 'mobilize'],
  ['modernise', 'modernize'],
  ['moralise', 'moralize'],
  ['nationalise', 'nationalize'],
  ['neutralise', 'neutralize'],
  ['normalise', 'normalize'],
  ['optimise', 'optimize'],
  ['patronise', 'patronize'],
  ['penalise', 'penalize'],
  ['personalise', 'personalize'],
  ['plagiarise', 'plagiarize'],
  ['polarise', 'polarize'],
  ['popularise', 'popularize'],
  ['prioritise', 'prioritize'],
  ['privatise', 'privatize'],
  ['publicise', 'publicize'],
  ['randomise', 'randomize'],
  ['rationalise', 'rationalize'],
  ['revitalise', 'revitalize'],
  ['ritualise', 'ritualize'],
  ['satirise', 'satirize'],
  ['scrutinise', 'scrutinize'],
  ['sensitise', 'sensitize'],
  ['sanitise', 'sanitize'],
  ['socialise', 'socialize'],
  ['stabilise', 'stabilize'],
  ['sterilise', 'sterilize'],
  ['stigmatise', 'stigmatize'],
  ['subsidise', 'subsidize'],
  ['synchronise', 'synchronize'],
  ['synthesise', 'synthesize'],
  ['tantalise', 'tantalize'],
  ['terrorise', 'terrorize'],
  ['theorise', 'theorize'],
  ['tranquilise', 'tranquilize'],
  ['traumatise', 'traumatize'],
  ['unionise', 'unionize'],
  ['urbanise', 'urbanize'],
  ['utilise', 'utilize'],
  ['victimise', 'victimize'],
  ['visualise', 'visualize'],
  ['vocalise', 'vocalize'],
];
// Regular verb inflections (drop final 'e' for -ing/-ed, keep it for
// plain 's' -- e.g. realise/realises/realised/realising) are safe to
// derive here because the -ise/-ize swap and the English -e-drop rule
// never interact: both variants end in a silent 'e' at exactly the
// same point.
function iseIzeInflections([uk, us]: [string, string]): [string, string][] {
  const ukStem = uk.slice(0, -1); // drop final 'e'
  const usStem = us.slice(0, -1);
  return [
    [uk, us],
    [`${uk}s`, `${us}s`],
    [`${ukStem}ed`, `${usStem}ed`],
    [`${ukStem}ing`, `${usStem}ing`],
  ];
}
const ISE_IZE_PAIRS: [string, string][] = ISE_IZE_VERBS.flatMap(iseIzeInflections);
// -isation/-ization noun forms don't derive cleanly from the verb stem
// (organise -> organisation isn't simple concatenation), so the most
// common ones are listed explicitly.
const ISATION_IZATION_PAIRS: [string, string][] = [
  ['organisation', 'organization'],
  ['organisations', 'organizations'],
  ['realisation', 'realization'],
  ['civilisation', 'civilization'],
  ['civilisations', 'civilizations'],
  ['specialisation', 'specialization'],
  ['standardisation', 'standardization'],
  ['characterisation', 'characterization'],
  ['familiarisation', 'familiarization'],
  ['globalisation', 'globalization'],
  ['industrialisation', 'industrialization'],
  ['localisation', 'localization'],
  ['modernisation', 'modernization'],
  ['mobilisation', 'mobilization'],
  ['normalisation', 'normalization'],
  ['optimisation', 'optimization'],
  ['privatisation', 'privatization'],
  ['rationalisation', 'rationalization'],
  ['stabilisation', 'stabilization'],
  ['sterilisation', 'sterilization'],
  ['urbanisation', 'urbanization'],
  ['utilisation', 'utilization'],
  ['visualisation', 'visualization'],
  ['minimisation', 'minimization'],
  ['maximisation', 'maximization'],
  ['colonisation', 'colonization'],
];

// ── -yse / -yze (analyse/analyze, paralyse/paralyze) ────────────────────
// "analyses" is deliberately excluded: it's ambiguous between the
// unchanged plural noun ("analysis" -> "analyses") and the verb form
// ("analyse" -> "analyze" -> "analyzes"), and this module has no
// part-of-speech context to disambiguate it safely.
const YSE_YZE_PAIRS: [string, string][] = [
  ['analyse', 'analyze'],
  ['analysed', 'analyzed'],
  ['analysing', 'analyzing'],
  ['paralyse', 'paralyze'],
  ['paralysed', 'paralyzed'],
  ['paralysing', 'paralyzing'],
  ['paralyses', 'paralyzes'], // no noun-plural collision like "analyses" has
  ['catalyse', 'catalyze'],
  ['catalysed', 'catalyzed'],
  ['catalysing', 'catalyzing'],
];

// ── -ce / -se nouns (defence/defense, licence/license...) ──────────────
// UK distinguishes licence (noun) / license (verb); US uses "license"
// for both, so only the noun form needs converting. Same for
// practise(verb, UK)/practice(noun, both) -- "practice" is already
// identical, only "practise" itself needs a US form.
const CE_SE_PAIRS: [string, string][] = [
  ['defence', 'defense'],
  ['defences', 'defenses'],
  ['defenceless', 'defenseless'],
  ['offence', 'offense'],
  ['offences', 'offenses'],
  ['pretence', 'pretense'],
  ['pretences', 'pretenses'],
  ['licence', 'license'],
  ['licences', 'licenses'],
  ['licenced', 'licensed'],
  ['practise', 'practice'],
  ['practises', 'practices'],
  ['practised', 'practiced'],
  ['practising', 'practicing'],
];

// ── -ogue / -og (catalogue/catalog, dialogue/dialog) ────────────────────
// "epilogue" and "prologue" are unchanged in the US (no "-og" form in
// real use), so they're deliberately left out despite matching the
// pattern.
const OGUE_OG_PAIRS: [string, string][] = [
  ['catalogue', 'catalog'],
  ['catalogues', 'catalogs'],
  ['catalogued', 'cataloged'],
  ['cataloguing', 'cataloging'],
  ['analogue', 'analog'],
  ['analogues', 'analogs'],
  ['dialogue', 'dialog'],
  ['dialogues', 'dialogs'],
];

// ── Doubled-consonant verb forms (travelled/traveled, cancelled/canceled)
// UK doubles the final "l" before a vowel-initial suffix on an
// unstressed -el verb; US does not. The base form itself never
// changes (only travel/travelled/travelling/traveller-style
// inflections do), so these are listed as inflected forms only, not
// base pairs.
const DOUBLED_L_PAIRS: [string, string][] = [
  ['travelled', 'traveled'],
  ['travelling', 'traveling'],
  ['traveller', 'traveler'],
  ['travellers', 'travelers'],
  ['cancelled', 'canceled'],
  ['cancelling', 'canceling'],
  ['labelled', 'labeled'],
  ['labelling', 'labeling'],
  ['labeller', 'labeler'],
  ['modelled', 'modeled'],
  ['modelling', 'modeling'],
  ['modeller', 'modeler'],
  ['quarrelled', 'quarreled'],
  ['quarrelling', 'quarreling'],
  ['marvelled', 'marveled'],
  ['marvelling', 'marveling'],
  ['levelled', 'leveled'],
  ['levelling', 'leveling'],
  ['leveller', 'leveler'],
  ['signalled', 'signaled'],
  ['signalling', 'signaling'],
  ['totalled', 'totaled'],
  ['totalling', 'totaling'],
  ['equalled', 'equaled'],
  ['equalling', 'equaling'],
  ['counselled', 'counseled'],
  ['counselling', 'counseling'],
  ['counsellor', 'counselor'],
  ['counsellors', 'counselors'],
  ['channelled', 'channeled'],
  ['channelling', 'channeling'],
  ['fuelled', 'fueled'],
  ['fuelling', 'fueling'],
  ['dialled', 'dialed'],
  ['dialling', 'dialing'],
  ['rivalled', 'rivaled'],
  ['rivalling', 'rivaling'],
  ['tunnelled', 'tunneled'],
  ['tunnelling', 'tunneling'],
  ['panelled', 'paneled'],
  ['panelling', 'paneling'],
  ['jewelled', 'jeweled'],
  ['jeweller', 'jeweler'],
  ['jewellery', 'jewelry'],
  ['shovelled', 'shoveled'],
  ['shovelling', 'shoveling'],
  // The reverse single/double-L pattern (UK single -> US double):
  ['enrol', 'enroll'],
  ['enrols', 'enrolls'],
  ['enrolment', 'enrollment'],
  ['enrolments', 'enrollments'],
  ['fulfil', 'fulfill'],
  ['fulfils', 'fulfills'],
  ['fulfilment', 'fulfillment'],
  ['skilful', 'skillful'],
  ['wilful', 'willful'],
  ['instalment', 'installment'],
  ['instalments', 'installments'],
];

// ── ae / oe digraphs (encyclopaedia/encyclopedia, foetus/fetus...) ──────
const AE_OE_PAIRS: [string, string][] = [
  ['encyclopaedia', 'encyclopedia'],
  ['encyclopaedic', 'encyclopedic'],
  ['anaemia', 'anemia'],
  ['anaemic', 'anemic'],
  ['paediatric', 'pediatric'],
  ['paediatrician', 'pediatrician'],
  ['oesophagus', 'esophagus'],
  ['gynaecology', 'gynecology'],
  ['gynaecologist', 'gynecologist'],
  ['haemoglobin', 'hemoglobin'],
  ['haemorrhage', 'hemorrhage'],
  ['leukaemia', 'leukemia'],
  ['orthopaedic', 'orthopedic'],
  ['foetus', 'fetus'],
  ['foetal', 'fetal'],
  ['oestrogen', 'estrogen'],
  ['archaeological', 'archeological'],
];

// ── One-off irregular pairs (no suffix family — spelled differently
// throughout) ────────────────────────────────────────────────────────
const IRREGULAR_PAIRS: [string, string][] = [
  ['tyre', 'tire'],
  ['tyres', 'tires'],
  ['grey', 'gray'],
  ['greyish', 'grayish'],
  ['greying', 'graying'],
  ['kerb', 'curb'],
  ['kerbs', 'curbs'],
  ['mould', 'mold'],
  ['moulds', 'molds'],
  ['moulded', 'molded'],
  ['moulding', 'molding'],
  ['mouldy', 'moldy'],
  ['plough', 'plow'],
  ['ploughs', 'plows'],
  ['ploughed', 'plowed'],
  ['ploughing', 'plowing'],
  ['sceptic', 'skeptic'],
  ['sceptics', 'skeptics'],
  ['sceptical', 'skeptical'],
  ['scepticism', 'skepticism'],
  ['aeroplane', 'airplane'],
  ['aeroplanes', 'airplanes'],
  ['draught', 'draft'],
  ['draughts', 'drafts'],
  ['draughty', 'drafty'],
  ['gaol', 'jail'],
  ['gaoler', 'jailer'],
  ['storey', 'story'],
  ['storeys', 'stories'],
  ['manoeuvre', 'maneuver'],
  ['manoeuvres', 'maneuvers'],
  ['manoeuvred', 'maneuvered'],
  ['manoeuvring', 'maneuvering'],
  ['aluminium', 'aluminum'],
  ['sulphur', 'sulfur'],
  ['sulphate', 'sulfate'],
  ['sulphide', 'sulfide'],
  ['programme', 'program'],
  ['programmes', 'programs'],
  ['woollen', 'woolen'],
  ['moustache', 'mustache'],
  ['moustaches', 'mustaches'],
  ['cheque', 'check'],
  ['cheques', 'checks'],
  ['chequebook', 'checkbook'],
];

/**
 * The full UK -> US lookup, built once at module load. Keys are
 * lowercase; callers handle casing themselves (see toUsSpelling).
 */
export const UK_TO_US_WORDS: ReadonlyMap<string, string> = new Map([
  ...OUR_OR_PAIRS,
  ...RE_ER_PAIRS,
  ...ISE_IZE_PAIRS,
  ...ISATION_IZATION_PAIRS,
  ...YSE_YZE_PAIRS,
  ...CE_SE_PAIRS,
  ...OGUE_OG_PAIRS,
  ...DOUBLED_L_PAIRS,
  ...AE_OE_PAIRS,
  ...IRREGULAR_PAIRS,
]);

function isUpperCase(char: string): boolean {
  return char !== char.toLowerCase() && char === char.toUpperCase();
}

/** Re-applies `original`'s capitalization pattern to `converted` for the
 * one case this corpus actually needs: a Title-Case headword ("Colour")
 * whose US form should also be Title-Case ("Color"). Suffix changes can
 * shift word length (colour -> color), so this only ever looks at
 * whether the FIRST letter was capitalized, not a position-by-position
 * copy. */
function matchCase(original: string, converted: string): string {
  if (original.length === 0 || !isUpperCase(original[0])) return converted;
  return converted.charAt(0).toUpperCase() + converted.slice(1);
}

/**
 * Returns the US spelling of `word` if it differs from its UK spelling,
 * or null if this module has no distinct US form for it (the correct,
 * expected answer for the large majority of English words, which don't
 * differ at all -- null here means "same in both", not "unknown").
 */
export function toUsSpelling(word: string): string | null {
  const us = UK_TO_US_WORDS.get(word.toLowerCase());
  if (!us) return null;
  return matchCase(word, us);
}

/**
 * Converts every word-token in `sentence` to its US spelling where one
 * exists, leaving punctuation and spacing untouched. Applied to the
 * whole sentence (not just the target headword) so a Complete It
 * sentence reads consistently in one variant rather than mixing UK
 * spelling everywhere except the blanked word.
 */
export function toUsSentence(sentence: string): string {
  return sentence.replace(/[A-Za-z]+/g, (token) => toUsSpelling(token) ?? token);
}

/** normalizedWord-style lowercasing for a US spelling, kept as its own
 * helper so callers never have to remember to re-derive it consistently
 * with Word.normalizedWord's own convention (see csv-word-import.ts). */
export function toUsNormalizedWord(word: string): string | null {
  const us = toUsSpelling(word);
  return us ? us.toLowerCase() : null;
}

/** The minimal shape every serving surface needs from a Word row to
 * render it in either variant -- deliberately not `import type { Word }`
 * from @prisma/client, so this module (and its test suite) never needs
 * the generated Prisma client just to describe a plain data shape. */
export interface VariantWordFields {
  word: string;
  normalizedWord: string;
  exampleSentence: string;
  wordUS: string | null;
  normalizedWordUS: string | null;
  exampleSentenceUS: string | null;
}

export interface RenderedWord {
  text: string;
  normalizedText: string;
  sentence: string;
}

/**
 * Picks the UK or US triple off a Word row for one player, by their
 * englishVariant preference. This is the ONE place every serving
 * surface (ScrambleQuest, Complete It, Word Duel, Boss Battle, Daily
 * Quest) should go through to show a word or check an answer, rather
 * than each game re-deciding "which spelling" on its own -- see
 * User.englishVariant's doc comment in schema.prisma.
 *
 * `variant` is nullable/undefined ON PURPOSE: a player who was never
 * asked (or skipped the signup step) has no preference recorded, and
 * that falls back to UK -- the corpus's original authored spelling --
 * exactly like a word with no US form at all falls back to its UK
 * fields below. Both "no preference" and "no variant for this word"
 * collapse to the same UK answer, which is what makes this safe to
 * call unconditionally rather than needing a null-check at every call
 * site.
 */
export function renderWord(
  word: VariantWordFields,
  variant: 'US' | 'UK' | null | undefined,
): RenderedWord {
  // Each field falls back to its UK original INDEPENDENTLY, mirroring
  // usVariantFields' independent nulling (csv-word-import.ts): a
  // headword with no US spelling of its own can still sit in a
  // sentence that mentions a word that does, so `text` staying UK
  // while `sentence` switches to its US form is a real, expected case
  // -- not a bug.
  const useUS = variant === 'US';
  return {
    text: useUS && word.wordUS ? word.wordUS : word.word,
    normalizedText: useUS && word.normalizedWordUS ? word.normalizedWordUS : word.normalizedWord,
    sentence: useUS && word.exampleSentenceUS ? word.exampleSentenceUS : word.exampleSentence,
  };
}
