/**
 * Site text style: nav, buttons, tabs, headings and labels use Title Case; sentences (body copy, hints,
 * notes, status lines, toasts) and questions use sentence case.
 */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);

/** Title Case for labels built from catalog names, e.g. a slot name used as a heading or button. */
export const titleCase = (s: string) =>
  s.replace(/[A-Za-z][\w'-]*/g, (w, i: number) => (i > 0 && SMALL_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1)));

/** A slot name that names several parts, like "Sights" or "Trigger & frame parts". */
export const isPlural = (s: string) => /[^s]s$/i.test(s);

/** A lowercase slot name with its article for a sentence: "a barrel", "an optic plate", "sights". */
export const withArticle = (s: string) => {
  const n = s.toLowerCase();
  return isPlural(n) ? n : `${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n}`;
};

/**
 * A platform or model name with its article, the name's own capitals kept: "an AR-15", "an S&W M&P 2.0", "a Glock 19".
 * A name that opens with letters read one by one ("AR", "S&W") goes by how its first letter is said; any other by its first letter.
 * `sentenceStart` capitalises the article: "An AR-15".
 */
export const nameWithArticle = (name: string, sentenceStart = false) => {
  const spelledOut = /^[A-Z](?![a-z])/.test(name);
  const an = spelledOut ? /^[AEFHILMNORSX]/.test(name) : /^[aeiou]/i.test(name);
  return `${sentenceStart ? 'A' : 'a'}${an ? 'n' : ''} ${name}`;
};
