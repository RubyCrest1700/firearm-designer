// Text from another server (a redirect's Location, say), made safe to print in a GitHub Actions log or step summary.
// Pure: no network, no files.

/** The longest remote text printed; the rest is cut and marked with `...`. */
export const LOG_TEXT_MAX = 300;

/**
 * Characters that must not be printed as they are: C0 and C1 control characters (CR, LF, tab, escape and the rest),
 * DEL, the Unicode line and paragraph separators, and the marks that reorder text on screen. Written as numbers so
 * this file holds none of them.
 */
const unprintable = (code) =>
  code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x200e || code === 0x200f || (code >= 0x2028 && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);

/**
 * One line of plain text, at most `max` characters and `...`. It can't end the log line or start a new one (control
 * characters are percent-encoded), can't hold a workflow command (`::name::` has no `::` left: the first colon of
 * each pair becomes %3A), and can't hold a `##[` log marker (the first # of each pair becomes %23).
 */
export function logSafe(text, max = LOG_TEXT_MAX) {
  let s = '';
  for (const c of String(text)) s += unprintable(c.codePointAt(0)) ? encodeURIComponent(c) : c;
  s = s.replace(/:(?=:)/g, '%3A').replace(/#(?=#)/g, '%23');
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

/** The same text as a Markdown table cell: a code span, so nothing in it is read as Markdown, with ` and | encoded. */
export const summaryCell = (text, max = LOG_TEXT_MAX) => `\`${logSafe(text, max).replace(/`/g, '%60').replace(/\|/g, '%7C')}\``;

/**
 * The step-summary section for reads that were redirected to a different page: [{ partId, retailer, to }]. '' when
 * there are none. Part and store are the repo's own ids; `to` came from the store's server.
 */
export function movedSummary(moved) {
  if (!moved.length) return '';
  const lines = ['## Redirected to a different page', ''];
  lines.push(`${moved.length} tracked ${moved.length === 1 ? 'link was' : 'links were'} redirected to a different page on the same site. Each was still read and priced as usual.`, '');
  lines.push('| Part | Store | Redirected to |', '|---|---|---|');
  for (const m of moved) lines.push(`| ${m.partId} | ${m.retailer} | ${summaryCell(m.to)} |`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}
