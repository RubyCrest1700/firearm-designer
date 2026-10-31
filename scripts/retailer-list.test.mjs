import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advanceChecks, renderRetailerList, retailerListProblems } from './retailer-list.mjs';
import { isDay, retailersFrom } from './sources.mjs';

const retailers = {
  ZED: { id: 'ZED', name: 'Zed Arms', search: 'https://www.zedarms.example/search?q=' },
  AB: { id: 'AB', name: 'abel Supply', search: 'https://shop.abel.co.uk/search?q=' },
  BUD: { id: 'BUD', name: "Bud's Parts", search: 'https://budsparts.example/?s=' },
};
const sources = {
  paused: { ZED: { since: '2026-10-24', reason: 'robots.txt refuses the price bot' } },
  parts: { a: { ZED: 'https://x.example/1', BUD: 'https://x.example/2' }, b: { ZED: 'https://x.example/3' } },
};
const checks = { ZED: '2026-10-23', BUD: '2026-10-30' };
const render = (over = {}) => renderRetailerList(over.retailers ?? retailers, over.sources ?? sources, over.checks ?? checks);
const rows = (text) => text.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Retailer '));
const offer = (checkedAt) => ({ price: 10, checkedAt });

test('a paused retailer keeps its date after its offers lapse', () => {
  assert.deepEqual(advanceChecks({ ZED: '2026-10-23' }, { offers: { a: { BUD: offer('2026-10-30T08:00:00.000Z') } } }), { BUD: '2026-10-30', ZED: '2026-10-23' });
  assert.deepEqual(advanceChecks({ ZED: '2026-10-23' }, { offers: {} }), { ZED: '2026-10-23' });
  assert.deepEqual(advanceChecks({ ZED: '2026-10-23' }, {}), { ZED: '2026-10-23' });
});

test('dates move forward to the newest offer and never backwards', () => {
  const prices = { offers: { a: { BUD: offer('2026-10-20T08:00:00.000Z') }, b: { BUD: offer('2026-10-28T08:00:00.000Z'), ZED: offer('2026-10-10T08:00:00.000Z') } } };
  assert.deepEqual(advanceChecks({ BUD: '2026-10-21', ZED: '2026-10-23' }, prices), { BUD: '2026-10-28', ZED: '2026-10-23' });
});

test('an offer with no usable date moves nothing, and the input ledger is left alone', () => {
  const ledger = { BUD: '2026-10-21' };
  assert.deepEqual(advanceChecks(ledger, { offers: { a: { BUD: { price: 1 }, ZED: { price: 1, checkedAt: 'soon' } } } }), { BUD: '2026-10-21' });
  advanceChecks(ledger, { offers: { a: { BUD: offer('2026-10-28T08:00:00.000Z') } } });
  assert.deepEqual(ledger, { BUD: '2026-10-21' });
});

test('an impossible day moves nothing, even when it would sort newest', () => {
  for (const day of ['2026-99-99', '2026-13-01', '2026-02-30', '2026-00-10']) {
    assert.equal(isDay(day), false, day);
    assert.deepEqual(advanceChecks({ BUD: '2026-10-21' }, { offers: { a: { BUD: offer(`${day}T08:00:00.000Z`), ZED: offer(`${day}T08:00:00.000Z`) } } }), { BUD: '2026-10-21' }, day);
  }
  assert.equal(isDay('2028-02-29'), true);
  assert.deepEqual(advanceChecks({}, { offers: { a: { BUD: offer('2028-02-29T08:00:00.000Z') } } }), { BUD: '2028-02-29' });
});

test('the ledger comes back sorted by id', () => {
  const out = advanceChecks({ ZED: '2026-10-23', AB: '2026-10-23' }, { offers: { a: { BUD: offer('2026-10-30T08:00:00.000Z') } } });
  assert.deepEqual(Object.keys(out), ['AB', 'BUD', 'ZED']);
});

test('a table sorted by name, ignoring case, with each column filled in', () => {
  assert.deepEqual(rows(render()), [
    '| abel Supply | shop.abel.co.uk | active | - | - | 0 | none recorded |',
    "| Bud's Parts | budsparts.example | active | - | - | 1 | 2026-10-30 |",
    '| Zed Arms | zedarms.example | paused | 2026-10-24 | robots.txt refuses the price bot | 2 | 2026-10-23 |',
  ]);
});

test('the header says the file is generated and how to regenerate it, and the last check is the last column', () => {
  const text = render();
  assert.match(text, /Generated file/);
  assert.match(text, /`npm run retailers`/);
  assert.match(text, /^In the Status column, "active" only means the retailer is neither paused nor links only\. "Links only" means we keep its links and estimated prices but don't request its pages\.$/m);
  assert.match(text, /^\| Retailer \| Domain \| Status \| Since \| Reason \| Links \| Last price check \|$/m);
});

test('the domain is the search link host without a leading www., so a store on a shared platform shows its own host', () => {
  const forge = { FORGE: { id: 'FORGE', name: 'Forged Armory', search: 'https://forged-armory.odoo.com/shop?search=' } };
  assert.equal(rows(render({ retailers: forge, sources: { parts: {} }, checks: {} }))[0], '| Forged Armory | forged-armory.odoo.com | active | - | - | 0 | none recorded |');
  assert.ok(rows(render()).find((r) => r.startsWith('| Zed Arms')).startsWith('| Zed Arms | zedarms.example |'));
});

test('a retailer with no check date reads "none recorded", and one with no links reads 0', () => {
  const row = rows(render({ checks: {}, sources: { parts: {} } })).find((r) => r.startsWith('| Zed Arms'));
  assert.equal(row, '| Zed Arms | zedarms.example | active | - | - | 0 | none recorded |');
});

test('a links-only retailer shows its status and shares the date and reason columns, and its links still count', () => {
  const linksOnly = { BUD: { since: '2026-10-31', reason: 'its product pages answer the price bot with a 403' } };
  assert.equal(rows(render({ sources: { ...sources, linksOnly } })).find((r) => r.startsWith("| Bud's")), "| Bud's Parts | budsparts.example | links only | 2026-10-31 | its product pages answer the price bot with a 403 | 1 | 2026-10-30 |");
  assert.ok(rows(render({ sources: { ...sources, linksOnly } })).find((r) => r.startsWith('| Zed Arms')).includes('| paused | 2026-10-24 |'));
  assert.equal(rows(render({ sources: { ...sources, linksOnly }, checks: {} })).find((r) => r.startsWith("| Bud's")).endsWith(' | 1 | none recorded |'), true);
});

test('a changed links-only entry is reported', () => {
  const linksOnly = { BUD: { since: '2026-10-31', reason: 'why' } };
  const committed = render({ sources: { ...sources, linksOnly } });
  assert.notDeepEqual(retailerListProblems(render(), committed), []);
  assert.match(retailerListProblems(render({ sources: { ...sources, linksOnly: { BUD: { since: '2026-11-02', reason: 'why' } } } }), committed).join('\n'), /2026-11-02/);
});

test('Cheaper Than Dirt keeps its last price check in the ledger after going links only', () => {
  const ledger = { BUDS: '2026-10-29', CTD: '2026-10-16' };
  assert.deepEqual(advanceChecks(ledger, { offers: { a: { BUDS: offer('2026-10-30T08:00:00.000Z') } } }), { BUDS: '2026-10-30', CTD: '2026-10-16' });
});

test('a paused retailer\'s links still count', () => {
  assert.match(rows(render()).find((r) => r.startsWith('| Zed Arms')), / \| 2 \| 2026-10-23 \|$/);
});

test('a | in a reason is escaped, and the column after it stays apart', () => {
  const paused = { ZED: { since: '2026-10-24', reason: 'terms | robots' } };
  const text = render({ sources: { ...sources, paused } });
  assert.match(text, /\| terms \\\| robots \| 2 \| 2026-10-23 \|$/m);
  assert.deepEqual(retailerListProblems(text, text.replace('| 2026-10-23 |', '| 2026-10-31 |')), []);
});

test('the same input gives byte-identical output with LF line endings, whatever order the retailers come in', () => {
  const shuffled = Object.fromEntries(Object.entries(retailers).reverse());
  assert.equal(render(), render());
  assert.equal(render({ retailers: shuffled }), render());
  assert.ok(!render().includes('\r'));
  assert.ok(render().endsWith(' |\n'));
});

test('the generated list agrees with itself', () => {
  assert.deepEqual(retailerListProblems(render(), render()), []);
});

test('a changed pause is reported', () => {
  const paused = { ZED: { since: '2026-10-25', reason: 'robots.txt refuses the price bot' } };
  assert.match(retailerListProblems(render(), render({ sources: { ...sources, paused } })).join('\n'), /2026-10-25/);
  const reason = { ZED: { since: '2026-10-24', reason: 'another reason' } };
  assert.notDeepEqual(retailerListProblems(render(), render({ sources: { ...sources, paused: reason } })), []);
  assert.notDeepEqual(retailerListProblems(render(), render({ sources: { parts: sources.parts } })), []);
});

test('a changed link count is reported', () => {
  const parts = { ...sources.parts, c: { BUD: 'https://x.example/4' } };
  assert.match(retailerListProblems(render({ sources: { ...sources, parts } }), render()).join('\n'), /Bud's Parts/);
});

test('a changed name is reported', () => {
  const renamed = { ...retailers, BUD: { ...retailers.BUD, name: "Bud's Spares" } };
  assert.match(retailerListProblems(render({ retailers: renamed }), render()).join('\n'), /Bud's Spares/);
});

test('a row out of place or repeated is reported', () => {
  const lines = render().split('\n');
  const swapped = lines.slice();
  const i = lines.findIndex((l) => l.startsWith('| abel'));
  [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
  assert.notDeepEqual(retailerListProblems(render(), swapped.join('\n')), []);
  assert.notDeepEqual(retailerListProblems(render(), [...lines.slice(0, i + 1), ...lines.slice(i)].join('\n')), []);
});

test('a changed header line is reported', () => {
  assert.notDeepEqual(retailerListProblems(render(), render().replace('Generated file', 'Hand-kept file')), []);
});

test('a row cut short is reported, not read as a changed last check', () => {
  const committed = render().replace(' | 1 | 2026-10-30 |', ' | 1 |');
  assert.notDeepEqual(retailerListProblems(render(), committed), []);
});

test('a changed last-check column is not reported', () => {
  assert.deepEqual(retailerListProblems(render(), render({ checks: { ZED: '2026-10-29' } })), []);
  assert.deepEqual(retailerListProblems(render({ checks: {} }), render()), []);
});

test('CRLF and LF compare equal', () => {
  assert.deepEqual(retailerListProblems(render(), render().replace(/\n/g, '\r\n')), []);
  assert.deepEqual(retailerListProblems(render().replace(/\n/g, '\r\n'), render()), []);
});

test('every failure names the regenerate command', () => {
  assert.match(retailerListProblems(render(), 'nonsense\n').join('\n'), /npm run retailers/);
  assert.match(retailerListProblems(render(), render().replace('Zed Arms', 'Zed Armory')).at(-1), /npm run retailers/);
});

test('a missing file is a failure', () => {
  for (const missing of [null, undefined]) {
    const problems = retailerListProblems(render(), missing);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /missing.*npm run retailers/);
  }
});

test('a name with an apostrophe parses, in both quote styles', () => {
  const text = `  BUDS: { id: 'BUDS', name: "Bud's Gun Shop", search: 'https://www.budsgunshop.com/search.php?q=' },
  BRN: { id: 'BRN', name: 'Brownells', search: 'https://www.brownells.com/search/?k=' },`;
  assert.deepEqual(retailersFrom(text), {
    BUDS: { id: 'BUDS', name: "Bud's Gun Shop", search: 'https://www.budsgunshop.com/search.php?q=' },
    BRN: { id: 'BRN', name: 'Brownells', search: 'https://www.brownells.com/search/?k=' },
  });
});

test('every retailer in src/data/retailers.ts gets its name', () => {
  const real = retailersFrom(readFileSync(new URL('../src/data/retailers.ts', import.meta.url), 'utf8'));
  assert.equal(real.BUDS.name, "Bud's Gun Shop");
  assert.equal(real.SPW.name, "Sportsman's Warehouse");
  assert.equal(real.SW.name, 'Smith & Wesson');
  for (const r of Object.values(real)) assert.ok(r.name, r.id);
});
