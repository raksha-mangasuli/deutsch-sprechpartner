// Adds capital letters, commas and full stops to dictated German. Browsers
// return speech as plain words, so this uses simple rules. It will not be
// perfect, but it handles the common cases and leaves text alone when the
// engine has already punctuated it.

// Conjunctions that start a subordinate or contrasting clause: a comma comes before them.
const COMMA_BEFORE = new Set([
  'dass', 'weil', 'obwohl', 'obgleich', 'ob', 'wenn', 'falls', 'bevor', 'nachdem',
  'sodass', 'indem', 'sondern', 'aber', 'denn'
]);

// Words that mean something else without a following pronoun ("damit kann ich"),
// so they only get a comma before "damit ich", "während er" and so on.
const COMMA_BEFORE_IF_PRONOUN = new Set(['damit', 'während', 'solange', 'sobald']);
const PRONOUNS = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man']);

// "Ich komme, auch wenn ..." keeps the comma in front of these.
const LEAD_INS = new Set(['auch', 'nur', 'selbst', 'sogar', 'erst']);

// A comma after a short opener: "Ja, ich komme."
const OPENERS = new Set(['ja', 'nein', 'doch', 'tja', 'also', 'übrigens']);

const QUESTION_WORDS = new Set([
  'wie', 'was', 'wo', 'wann', 'warum', 'wieso', 'weshalb', 'wer', 'wen', 'wem', 'wessen',
  'welche', 'welcher', 'welches', 'welchen', 'welchem', 'woher', 'wohin', 'womit', 'wozu',
  'wofür', 'worüber', 'wodurch', 'wieviel', 'wieviele'
]);

// A yes/no question starts with the verb followed by a pronoun: "Hast du ...", "Gibt es ...".
const VERB_FIRST = new Set([
  'bin', 'bist', 'ist', 'sind', 'seid', 'habe', 'hast', 'hat', 'haben', 'habt',
  'kann', 'kannst', 'können', 'könnt', 'könntest', 'könnten', 'will', 'willst', 'wollen', 'wollt',
  'möchte', 'möchtest', 'möchten', 'möchtet', 'muss', 'musst', 'müssen', 'müsst',
  'soll', 'sollst', 'sollen', 'sollt', 'darf', 'darfst', 'dürfen', 'dürft',
  'werde', 'wirst', 'wird', 'werden', 'würde', 'würdest', 'würden', 'würdet',
  'hätte', 'hättest', 'wäre', 'wärst', 'gibt', 'geht', 'gehst', 'gehen', 'kommst', 'kommt',
  'magst', 'mag', 'machst', 'macht', 'weißt', 'weiß', 'siehst', 'kennst', 'denkst', 'glaubst',
  'findest', 'brauchst', 'spielst', 'arbeitest', 'wohnst', 'lebst', 'bleibst', 'fährst', 'isst', 'trinkst'
]);
const AFTER_VERB = new Set(['du', 'ihr', 'sie', 'er', 'es', 'das', 'man', 'wir', 'ich', 'mir', 'dir', 'euch', 'jemand']);

// "..., oder?" and similar tags turn a statement into a question.
const TAGS = [['oder'], ['nicht', 'wahr'], ['ne'], ['gell'], ['stimmt\'s']];

const SENTENCE_END = /[.!?]$/;
const ANY_PUNCTUATION = /[,.!?;]|:(?!\d)/;

const clean = (word) => word.toLowerCase().replace(/[^\p{L}']/gu, '');

function isQuestion(words) {
  const first = clean(words[0]);
  if (QUESTION_WORDS.has(first)) return true;
  if (VERB_FIRST.has(first) && words.length > 1 && AFTER_VERB.has(clean(words[1]))) return true;
  const tail = words.map(clean);
  return TAGS.some((tag) => tag.every((w, i) => tail[tail.length - tag.length + i] === w));
}

function addCommas(words) {
  const out = [...words];
  const comma = (index) => {
    if (index >= 0 && !/[,.!?;:]$/.test(out[index])) out[index] += ',';
  };

  if (out.length > 1 && OPENERS.has(clean(out[0]))) comma(0);

  for (let i = 1; i < out.length; i++) {
    const w = clean(out[i]);
    const wanted =
      COMMA_BEFORE.has(w) ||
      (COMMA_BEFORE_IF_PRONOUN.has(w) && i + 1 < out.length && PRONOUNS.has(clean(out[i + 1])));
    if (!wanted) continue;
    // "auch wenn": the comma goes before "auch".
    const target = i > 1 && LEAD_INS.has(clean(out[i - 1])) ? i - 2 : i - 1;
    comma(target);
  }
  return out;
}

// text is one phrase, the words between two pauses. final is true once the
// phrase is complete, which is when a full stop or question mark is added.
export function punctuate(text, { final = true } = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  // The engine already added punctuation (some phones do): only fix the capital.
  if (ANY_PUNCTUATION.test(trimmed)) return trimmed[0].toUpperCase() + trimmed.slice(1);

  const words = trimmed.split(/\s+/);
  const joined = addCommas(words).join(' ');
  let result = joined[0].toUpperCase() + joined.slice(1);

  if (final && !SENTENCE_END.test(result)) result += isQuestion(words) ? '?' : '.';
  return result;
}
