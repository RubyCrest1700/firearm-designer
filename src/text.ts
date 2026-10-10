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
