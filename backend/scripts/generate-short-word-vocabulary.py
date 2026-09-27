#!/usr/bin/env python3
"""
One-off generator for the Vocabulary Vault short-word expansion (2026-09
product decision: Complete It/ScrambleQuest/Word Duel/Boss Battle each
need words shorter than the original 10,000-word production batch,
which is 100% 7+ letters -- see MIN_WORD_LENGTH's comment in
src/content/word-import.ts). Produced prisma/vocabulary-vault-3to6-letters.csv,
9,009 words of length 3-6, ready for:

    npm run import:words -- prisma/vocabulary-vault-3to6-letters.csv

Kept here for reproducibility/re-runs (a future top-up batch, or after
tightening a filter below), NOT wired into any npm script -- it needs
external data this repo doesn't vendor:

    mkdir -p ~/nltk_data/corpora && cd ~/nltk_data/corpora
    curl -sS -o wordnet.zip \
      https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet.zip
    unzip -q wordnet.zip

    # run from this script's own directory:
    curl -sS -o words_alpha.txt \
      https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt
    curl -sS -o google-10000-english.txt \
      https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt
    pip3 install nltk
    python3 generate-short-word-vocabulary.py

Method: candidate words come from words_alpha.txt filtered to length
3-6; each is looked up in WordNet (nltk's bundled corpus) and, if
found, gets its definition/part-of-speech/example sentence/synonyms all
pulled from the SAME synset (deliberately -- an earlier version of this
script mixed senses, e.g. pairing "race" the competition with
"subspecies", a synonym only for race's biological-taxonomy sense; see
git history if resurrecting that approach). google-10000-english.txt
ranks give a rough CEFR/difficulty/frequency-level heuristic. Known
limitations, for whoever runs this again:
  - Every row has a real WordNet-sourced definition and >=1 real
    WordNet synonym (word-import.ts hard-requires the latter), but only
    ~30% have a real WordNet example sentence -- the rest use one of a
    handful of generic per-part-of-speech template sentences, which can
    read oddly for some words (material adjectives like "hempen" don't
    fit "described it as hempen" naturally). Spot-check before a big
    top-up.
  - WordNet's own sense-ordering picks the "primary" definition, which
    is occasionally the less-common sense a player wouldn't expect
    (e.g. "med" -> "a Master's degree in Education", not "medication").
  - Filters applied: a small profanity/slur blocklist on the headword
    itself; a small marker-word check on the DEFINITION text for
    sexual/drug/violent content (catches things a headword blocklist
    alone wouldn't, e.g. "seduce" -> "induce to have sex"); WordNet's
    instance_hypernyms() to drop specific named individuals (planets,
    deities -- "Mars" is an instance of "planet"); wn.morphy() to
    prefer base/dictionary forms over inflections (skip "sacks"/"wove"
    in favor of "sack"/"weave" surfacing on their own); a hardcoded
    stopword list for function words. None of this is a substitute for
    a human moderation pass before the batch goes live to players.
"""
import csv
import re
import sys
from collections import defaultdict

import nltk
import os
nltk.data.path.insert(0, os.path.expanduser("~/nltk_data"))
from nltk.corpus import wordnet as wn

WORDS_ALPHA_PATH = "words_alpha.txt"
GOOGLE_10000_PATH = "google-10000-english.txt"
EXISTING_PRODUCTION_CSV = "../prisma/vocabulary-production.csv"
OUT_PATH = "vocabulary-vault-3to6.csv"

MIN_LEN, MAX_LEN = 3, 6

BLOCKLIST = {
    "ass", "cum", "cunt", "cock", "damn", "dick", "dyke", "fag", "fuk",
    "gook", "hoe", "hooker", "jerk", "kike", "kraut", "nazi", "nigga",
    "piss", "poon", "porn", "prick", "puss", "queer", "rape", "raped",
    "shit", "slut", "spic", "tit", "tits", "twat", "wank", "whore",
    "bitch", "bastard", "crap", "fart", "sluts", "boob", "boobs",
    "boner", "chink", "coon", "cocaine", "heroin", "meth", "opium",
    "gun", "guns", "rifle", "bomb", "bombs", "kill", "killed", "killer",
    "suicide", "drunk", "drugs", "sex", "sexy", "sperm", "vagina",
    "penis", "anal", "orgy", "pimp", "molest", "incest", "abuse",
}

SENSITIVE_DEFINITION_MARKERS = (
    "have sex", "sexual intercourse", "sexual activity", "genitals",
    "genital", "masturbat", "copulat", "orgasm", "erotic", "porn",
    "narcotic", "heroin", "cocaine", "amphetamine", "suicide", "rape",
    "incest", "molest", "prostitut", "fellat", "ejaculat", "penis",
    "vagina", "testicle", "pedophil",
)

LEXNAME_TO_CATEGORY = {
    "noun.animal": "Nature",
    "noun.plant": "Nature",
    "noun.weather": "Nature",
    "noun.natural_object": "Nature",
    "noun.food": "General",
    "noun.substance": "General",
    "noun.body": "General",
    "noun.feeling": "Emotion",
    "verb.emotion": "Emotion",
    "noun.cognition": "Personal Development",
    "verb.cognition": "Personal Development",
    "noun.communication": "Communication",
    "verb.communication": "Communication",
    "noun.social": "Society & Culture",
    "noun.group": "Society & Culture",
    "noun.person": "Society & Culture",
    "noun.event": "Society & Culture",
    "verb.social": "Society & Culture",
    "noun.act": "General",
    "noun.artifact": "General",
    "noun.time": "General",
    "noun.quantity": "General",
    "noun.attribute": "General",
    "noun.location": "Travel & Places",
    "verb.motion": "General",
    "verb.body": "Health & Wellness",
    "verb.creation": "Arts & Creativity",
    "noun.state": "Personal Development",
    "verb.stative": "General",
    "verb.change": "General",
    "verb.contact": "General",
    "verb.consumption": "General",
    "verb.perception": "General",
    "verb.possession": "General",
    "verb.competition": "General",
    "verb.weather": "Nature",
    "adj.all": "General",
    "adj.pert": "General",
    "adv.all": "General",
}

POS_MAP = {"n": "Noun", "v": "Verb", "a": "Adjective", "s": "Adjective", "r": "Adverb"}
POS_PRIORITY = ["n", "v", "a", "s", "r"]

# Function words -- grammatically essential but not "vocabulary" in the
# sense this game teaches (nobody plays ScrambleQuest to learn "the").
STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on",
    "at", "by", "for", "with", "as", "is", "was", "were", "are", "am",
    "be", "been", "being", "has", "have", "had", "do", "does", "did",
    "this", "that", "these", "those", "he", "she", "it", "they", "we",
    "you", "who", "whom", "him", "her", "its", "our", "their", "not",
    "no", "so", "up", "out", "off", "over", "under", "again", "then",
    "once", "here", "there", "when", "where", "why", "how", "all",
    "any", "both", "each", "few", "more", "most", "other", "some",
    "such", "only", "own", "same", "than", "too", "very", "can",
    "will", "just", "now", "yes", "yet", "nor", "us", "me", "my",
    "your", "his", "hers", "mine", "ours", "theirs", "myself",
    "yourself", "himself", "herself", "itself", "ourselves",
    "themselves", "what", "which", "whose", "shall", "should",
    "would", "could", "must", "may", "might", "ain",
}


def load_word_pool():
    with open(WORDS_ALPHA_PATH) as f:
        return [w.strip() for w in f if w.strip()]


def load_rank():
    rank = {}
    with open(GOOGLE_10000_PATH) as f:
        for i, w in enumerate(f):
            w = w.strip().lower()
            if w and w not in rank:
                rank[w] = i
    return rank


def load_existing_words():
    existing = set()
    with open(EXISTING_PRODUCTION_CSV, newline="") as f:
        for row in csv.DictReader(f):
            w = row.get("Word", "").strip().lower()
            if w:
                existing.add(w)
    return existing


def synsets_by_pos_priority(word):
    all_syn = wn.synsets(word)
    ordered = []
    for pos in POS_PRIORITY:
        ordered.extend([s for s in all_syn if s.pos() == pos])
    return ordered


def gather_synonyms(word, primary):
    # Deliberately scoped to the PRIMARY synset only (the same sense the
    # shown definition/example come from) -- pulling from a different
    # sense's synset is how you get a wrong-sense synonym attached to the
    # right-sense definition (e.g. "race" (competition) paired with
    # "subspecies", which is only a synonym of race's biological-taxonomy
    # sense). Words whose primary sense has no synonym of its own are
    # dropped by the caller rather than reaching into another sense.
    seen = []
    for n in [ln.replace("_", " ") for ln in primary.lemma_names()]:
        if n.lower() != word.lower() and n not in seen:
            seen.append(n)
    return seen[:2]


def gather_examples(primary):
    # Same reasoning as gather_synonyms: an example borrowed from a
    # different sense describes a different meaning than the definition
    # shown above it, which is actively misleading in a language-learning
    # context (e.g. "sacks" defined as a carrying bag, illustrated with a
    # sentence about a mining air pocket). No cross-sense fallback --
    # build_row falls back to a template sentence instead.
    ex = primary.examples()
    return ex[0] if ex else None


def gather_antonyms(primary):
    out = []
    for lemma in primary.lemmas():
        for ant in lemma.antonyms():
            name = ant.name().replace("_", " ")
            if name not in out:
                out.append(name)
    return out[:2]


def gather_related(primary):
    out = []
    for h in primary.hypernyms()[:1]:
        out.extend([l.replace("_", " ") for l in h.lemma_names()[:1]])
    for h in primary.hyponyms()[:2]:
        out.extend([l.replace("_", " ") for l in h.lemma_names()[:1]])
    seen = []
    for w in out:
        if w not in seen:
            seen.append(w)
    return seen[:3]


def gather_word_family(primary, word):
    out = []
    for lemma in primary.lemmas():
        for rel in lemma.derivationally_related_forms():
            name = rel.name().replace("_", " ")
            if name.lower() != word.lower() and name not in out:
                out.append(name)
    return out[:3]


def category_for(primary):
    return LEXNAME_TO_CATEGORY.get(primary.lexname(), "General")


TEMPLATES = {
    "Noun": [
        "People often talk about the {w}.",
        "The word {w} came up in our lesson.",
        "She read more about the {w} online.",
        "We learned about the {w} in class today.",
        "The teacher explained what a {w} is.",
    ],
    "Verb": [
        "They agreed to {w} together after class.",
        "She tried to {w} before anyone else woke up.",
        "We plan to {w} again next weekend.",
        "He learned to {w} when he was young.",
        "Please {w} before the meeting starts.",
    ],
    "Adjective": [
        "They described it as {w}.",
        "That seemed like a {w} idea to her.",
        "The book described the scene as {w}.",
        "It was hard to explain something so {w}.",
        "Everyone agreed the result was {w}.",
    ],
    "Adverb": [
        "She answered the question {w}, without pausing.",
        "He walked {w} toward the door.",
        "They finished the project {w} this time.",
        "He explained the rule {w} to the class.",
        "We waited {w} for the results to arrive.",
    ],
}


def pick_template(word, pos_label):
    options = TEMPLATES[pos_label]
    return options[hash(word) % len(options)]


def cefr_bucket(rank):
    if rank is None:
        return "B1", 45, "Common"
    if rank < 1000:
        return "A1", 15, "Very Common"
    if rank < 3000:
        return "A2", 28, "Very Common"
    if rank < 6000:
        return "B1", 42, "Common"
    if rank < 10000:
        return "B2", 58, "Common"
    return "B1", 45, "Common"


def build_row(word, rank_map, row_id):
    if not re.fullmatch(r"[a-z]+", word):
        return None
    if word in BLOCKLIST or word in STOPWORDS:
        return None

    ordered = synsets_by_pos_priority(word)
    if not ordered:
        return None
    primary = ordered[0]
    pos_char = primary.pos()

    # WordNet marks a specific named individual (a planet, a deity, a
    # particular person) via instance_hypernyms() rather than ordinary
    # hypernyms() -- that is precisely the "is a specific instance of"
    # relation, so it is a reliable proper-noun signal ("Mars" is an
    # instance of "planet"; "dog" is not an instance of anything, it IS
    # the class). Skip these -- not what a vocabulary game means by "a
    # word".
    if primary.instance_hypernyms():
        return None

    definition_lower = primary.definition().lower()
    if any(marker in definition_lower for marker in SENSITIVE_DEFINITION_MARKERS):
        return None

    # Prefer base/dictionary forms over inflections (plurals, past tense,
    # etc.) -- e.g. skip "sacks"/"wove"/"races" in favor of "sack"/
    # "weave"/"race" surfacing on their own merits. wn.morphy() uses
    # WordNet's own exception lists so it catches irregulars ("wove" ->
    # "weave"), not just suffix-stripping.
    base = wn.morphy(word, pos_char)
    if base and base != word:
        return None

    synonyms = gather_synonyms(word, primary)
    if not synonyms:
        return None

    example = gather_examples(primary)
    has_real_example = example is not None
    if example is None:
        example = pick_template(word, POS_MAP[pos_char]).format(w=word)

    definition = primary.definition().strip()
    if not definition:
        return None
    definition = definition[0].upper() + definition[1:]
    if not definition.endswith((".", "!", "?")):
        definition += "."

    example = example[0].upper() + example[1:]
    if not example.endswith((".", "!", "?")):
        example += "."

    rank = rank_map.get(word)
    cefr, score, freq = cefr_bucket(rank)

    return {
        "ID": row_id,
        "Word": word.capitalize(),
        "Definition": definition,
        "Part of Speech": POS_MAP[pos_char],
        "Example Sentence": example,
        "Synonym 1": synonyms[0] if len(synonyms) > 0 else "",
        "Synonym 2": synonyms[1] if len(synonyms) > 1 else "",
        "CEFR Level": cefr,
        "Difficulty Score": score,
        "Category": category_for(primary),
        "Frequency Level": freq,
        "Word Family": ", ".join(gather_word_family(primary, word)),
        "Usage Note": "",
        "Related Words": ";".join(gather_related(primary)),
        "_len": len(word),
        "_rank": rank if rank is not None else 999999,
        "_has_real_example": has_real_example,
    }


def main():
    pool = load_word_pool()
    rank_map = load_rank()
    existing = load_existing_words()

    buckets = defaultdict(list)
    seen_words = set()
    for w in pool:
        if len(w) < MIN_LEN or len(w) > MAX_LEN:
            continue
        if w in existing or w in seen_words:
            continue
        seen_words.add(w)
        row = build_row(w, rank_map, 0)
        if row:
            buckets[row["_len"]].append(row)

    for length in sorted(buckets):
        print(f"length {length}: {len(buckets[length])} candidates", file=sys.stderr)

    for length in buckets:
        buckets[length].sort(key=lambda r: (not r["_has_real_example"], r["_rank"]))

    TARGET_TOTAL = 10000
    selected = []
    for length in (3, 4):
        selected.extend(buckets.get(length, []))

    remaining = max(0, TARGET_TOTAL - len(selected))
    pool_5 = buckets.get(5, [])
    pool_6 = buckets.get(6, [])
    half = remaining // 2
    take_5 = min(len(pool_5), half)
    take_6 = min(len(pool_6), remaining - take_5)
    if take_5 + take_6 < remaining:
        take_5 = min(len(pool_5), remaining - take_6)

    selected.extend(pool_5[:take_5])
    selected.extend(pool_6[:take_6])

    print(f"\nFinal selection: {len(selected)} words", file=sys.stderr)
    for length in (3, 4, 5, 6):
        n = sum(1 for r in selected if r["_len"] == length)
        print(f"  {length} letters: {n}", file=sys.stderr)
    real_ex = sum(1 for r in selected if r["_has_real_example"])
    if selected:
        print(f"  with real WordNet example sentence: {real_ex} ({100*real_ex/len(selected):.1f}%)", file=sys.stderr)

    fieldnames = [
        "ID", "Word", "Definition", "Part of Speech", "Example Sentence",
        "Synonym 1", "Synonym 2", "CEFR Level", "Difficulty Score",
        "Category", "Frequency Level", "Word Family", "Usage Note",
        "Related Words",
    ]
    with open(OUT_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for i, row in enumerate(selected, start=10001):
            row["ID"] = i
            writer.writerow(row)

    print(f"\nWrote {len(selected)} rows to {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
