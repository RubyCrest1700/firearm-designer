/**
 * Site text style: nav, buttons, tabs, headings and labels use Title Case; sentences (body copy, hints,
 * notes, status lines, toasts) and questions use sentence case.
 */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);

/** Title Case for labels built from catalog names, e.g. a slot name used as a heading or button. */
export const titleCase = (s: string) =>
  s.replace(/[A-Za-z][\w'-]*/g, (w, i: number) => (i > 0 && SMALL_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
