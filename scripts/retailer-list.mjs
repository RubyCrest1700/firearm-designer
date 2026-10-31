// RETAILERS.md: one table of every retailer, its pause state, how many product links we hold and when we last read a
// price from it. data/retailer-checks.json is the ledger behind the last column, because data/prices.json forgets a
// store once its offers lapse. `npm run retailers` refreshes both files; the nightly job does the same after it commits
// prices. check-data (scripts/check-presets.ts) fails if any column but the last differs from what would be generated.
// It leaves the last column out because check-data runs on the price commit, before the refresh, and a failure there
// stops the deploy.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { isDay, readRetailers, readSources } from './sources.mjs';

const COMMAND = 'npm run retailers';
const HEADER = `# Retailers

Generated file, do not edit by hand. Regenerate it with \`${COMMAND}\`.
Built from src/data/retailers.ts, data/sources.json and data/retailer-checks.json.
`;
const COLUMNS = ['Retailer', 'Domain', 'Status', 'Paused since', 'Reason', 'Links', 'Last price check'];

const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The ledger moved on to the newest offer checkedAt per retailer, sorted by id. A date never moves backwards, and a
 * retailer with no offers left keeps the date it has. checkedAt only changes on a real read, so a kept offer adds nothing.
 */
export function advanceChecks(ledger, prices) {
  const out = { ...ledger };
  for (const byRetailer of Object.values(prices?.offers ?? {}))
    for (const [retailer, offer] of Object.entries(byRetailer)) {
      const day = String(offer?.checkedAt ?? '').slice(0, 10);
      if (isDay(day) && !(out[retailer] >= day)) out[retailer] = day;
    }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => byKey(a, b)));
}

/** One table cell: a pipe in the text would otherwise end the cell, and a line break the row. */
const cell = (text) => String(text).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const row = (cells) => `| ${cells.map(cell).join(' | ')} |`;

/** The whole of RETAILERS.md. Same input, same bytes: LF line endings and no generated-at time. */
export function renderRetailerList(retailers, sources, checks) {
  const links = {};
  for (const byRetailer of Object.values(sources.parts ?? {}))
    for (const id of Object.keys(byRetailer)) links[id] = (links[id] ?? 0) + 1;
  const sorted = Object.values(retailers).sort((a, b) => byKey(a.name.toLowerCase(), b.name.toLowerCase()) || byKey(a.id, b.id));
  const rows = sorted.map((r) => {
    const pause = sources.paused?.[r.id];
    return row([
      r.name,
      new URL(r.search).host.replace(/^www\./, ''),
      pause ? 'paused' : 'active',
      pause?.since ?? '-',
      pause?.reason ?? '-',
      links[r.id] ?? 0,
      checks[r.id] ?? 'none recorded',
    ]);
  });
  return `${HEADER}\n${row(COLUMNS)}\n|${COLUMNS.map(() => '---').join('|')}|\n${rows.join('\n')}\n`;
}

/** The text with CRLF read as LF and the last table column cut off, as a list of lines. */
const stableLines = (text) =>
  text.replace(/\r\n/g, '\n').split('\n').map((line) => (line.startsWith('|') ? line.replace(/\|[^|]*\|\s*$/, '|') : line));

/**
 * What differs between the generated list and the committed one, as plain sentences; an empty list means they agree.
 * Line endings and the last column (Last price check) don't count. `committed` is null when the file is missing.
 */
export function retailerListProblems(rendered, committed) {
  if (committed === null || committed === undefined) return [`RETAILERS.md is missing. Generate it with: ${COMMAND}`];
  const want = stableLines(rendered);
  const got = stableLines(committed);
  if (want.join('\n') === got.join('\n')) return [];
  const out = [
    ...want.filter((line) => !got.includes(line)).map((line) => `RETAILERS.md should have this line: ${line}`),
    ...got.filter((line) => !want.includes(line)).map((line) => `RETAILERS.md should not have this line: ${line}`),
  ];
  if (!out.length) out.push('RETAILERS.md has the right lines in the wrong order or number.');
  out.push(`RETAILERS.md is out of date. Regenerate it with: ${COMMAND}`);
  return out;
}

// The checks in scripts/check-presets.ts bundle this file, so the file name tells a real run from an import.
if (basename(process.argv[1] ?? '') === 'retailer-list.mjs') {
  const checks = advanceChecks(JSON.parse(readFileSync('data/retailer-checks.json', 'utf8')), JSON.parse(readFileSync('data/prices.json', 'utf8')));
  writeFileSync('data/retailer-checks.json', `${JSON.stringify(checks, null, 2)}\n`);
  writeFileSync('RETAILERS.md', renderRetailerList(readRetailers(), readSources(), checks));
  console.log(`Wrote RETAILERS.md and data/retailer-checks.json (${Object.keys(checks).length} retailers with a price check).`);
}
