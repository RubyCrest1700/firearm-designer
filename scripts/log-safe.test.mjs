// logSafe, summaryCell and movedSummary (scripts/log-safe.mjs): text from a store's server, printed where GitHub Actions
// reads workflow commands and log markers. Hostile text is built from character codes, so this file holds none of it raw.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOG_TEXT_MAX, logSafe, movedSummary, summaryCell } from './log-safe.mjs';

const chr = String.fromCharCode;
const CR = chr(13);
const LF = chr(10);

test('ordinary addresses come through unchanged', () => {
  for (const url of [
    'https://shop.example/p/upper-receiver',
    'https://www.shop.example/p/upper-receiver/?sku=123&utm_source=feed#reviews',
    'https://shop.example/p/a%2Fb%20c?color=flat+dark',
    'http://shop.example:8080/c/uppers',
    'https://shop.example/p/a#b',
  ]) assert.equal(logSafe(url), url);
});

test('no control character survives, so the text can neither end its line nor start one', () => {
  assert.equal(logSafe(`a${CR}${LF}b`), 'a%0D%0Ab');
  assert.equal(logSafe(`a${LF}::error::x`), 'a%0A%3A:error%3A:x');
  assert.equal(logSafe(`a${chr(9)}b${chr(0)}c${chr(27)}[31md${chr(127)}e`), 'a%09b%00c%1B[31md%7Fe');
  // C1 controls, the line and paragraph separators, and the marks that reorder text.
  for (const code of [0x80, 0x85, 0x9f, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069]) {
    const out = logSafe(`a${chr(code)}b`);
    assert.equal(out, `a${encodeURIComponent(chr(code))}b`, code.toString(16));
    assert.match(out, /^a(%[0-9A-F]{2})+b$/);
  }
  for (let code = 0; code < 0x20; code++) assert.match(logSafe(chr(code)), /^%[0-9A-F]{2}$/, String(code));
  // What sits either side of those ranges is left alone.
  for (const code of [0x20, 0x7e, 0xa0, 0xe9, 0x200d, 0x2027, 0x202f, 0x2065, 0x206a]) assert.equal(logSafe(chr(code)), chr(code), code.toString(16));
  // A character outside the first plane, and half of one, pass through without an error.
  assert.equal(logSafe(`a${String.fromCodePoint(0x1f600)}b`), `a${String.fromCodePoint(0x1f600)}b`);
  assert.equal(logSafe(`a${chr(0xd83d)}b`), `a${chr(0xd83d)}b`);
});

test('no workflow command and no log marker survives', () => {
  assert.equal(logSafe('::error::x'), '%3A:error%3A:x');
  assert.equal(logSafe('::set-output name=a::b'), '%3A:set-output name=a%3A:b');
  assert.equal(logSafe(':::'), '%3A%3A:');
  assert.equal(logSafe('##[error]x'), '%23#[error]x');
  assert.equal(logSafe('###[group]x'), '%23%23#[group]x');
  for (const text of ['::error::x', ' ::warning file=a::b', ':::::', '##[error]', '####[x', 'a::b##[c', `${LF}::add-mask::x`, 'https://shop.example/p::x/##[y']) {
    const out = logSafe(text);
    assert.ok(!out.includes('::') && !out.includes('##'), out);
  }
  // A single colon or hash is ordinary.
  assert.equal(logSafe('https://shop.example:8080/a:b#c'), 'https://shop.example:8080/a:b#c');
});

test('long text is cut at the limit and marked', () => {
  assert.equal(LOG_TEXT_MAX, 300);
  const long = `https://shop.example/${'a'.repeat(5000)}`;
  assert.equal(logSafe(long), `${long.slice(0, 300)}...`);
  assert.equal(logSafe(long).length, 303);
  assert.equal(logSafe('a'.repeat(300)), 'a'.repeat(300));
  assert.equal(logSafe('a'.repeat(301)), `${'a'.repeat(300)}...`);
  assert.equal(logSafe('abcdef', 3), 'abc...');
  // The cut comes after the encoding, so encoded text can't run past it either.
  assert.ok(logSafe(LF.repeat(5000)).length <= 303);
  assert.ok(!logSafe(':'.repeat(5000)).includes('::'));
});

test('anything that is not text is printed as text', () => {
  assert.equal(logSafe(undefined), 'undefined');
  assert.equal(logSafe(null), 'null');
  assert.equal(logSafe(42), '42');
  assert.equal(logSafe(new URL('https://shop.example/a::b')), 'https://shop.example/a%3A:b');
});

test('a summary cell is one code span that cannot close early or split the table', () => {
  assert.equal(summaryCell('https://shop.example/p/a'), '`https://shop.example/p/a`');
  assert.equal(summaryCell('a`b|c'), '`a%60b%7Cc`');
  assert.equal(summaryCell(`a${LF}| x | y |${LF}##[error]`), '`a%0A%7C x %7C y %7C%0A%23#[error]`');
  for (const text of ['`', '``', '|', '](https://evil.example)', '<img src=x>', '![a](https://evil.example/x.png)', `a${CR}${LF}b`]) {
    assert.match(summaryCell(text), /^`[^`|\r\n]*`$/, text);
  }
});

test('the summary lists each moved read once, safely, and is empty when there are none', () => {
  assert.equal(movedSummary([]), '');
  assert.equal(movedSummary([{ partId: 'part-a', retailer: 'SHA', to: 'https://shop.example/p/a-mk2' }]), [
    '## Redirected to a different page',
    '',
    '1 tracked link was redirected to a different page on the same site. Each was still read and priced as usual.',
    '',
    '| Part | Store | Redirected to |',
    '|---|---|---|',
    '| part-a | SHA | `https://shop.example/p/a-mk2` |',
    '',
    '',
  ].join('\n'));
  const two = movedSummary([
    { partId: 'part-a', retailer: 'SHA', to: 'https://shop.example/c/uppers' },
    { partId: 'part-b', retailer: 'SHB', to: `https://shop.example/x${LF}::error::y|z\`##[error]${'a'.repeat(1000)}` },
  ]);
  assert.ok(two.includes('2 tracked links were redirected to a different page on the same site.'), two);
  const lines = two.split('\n');
  assert.equal(lines.length, 10);
  assert.equal(lines[6], '| part-a | SHA | `https://shop.example/c/uppers` |');
  assert.match(lines[7], /^\| part-b \| SHB \| `[^`|]*\.\.\.` \|$/);
  assert.ok(!lines[7].includes('::') && !lines[7].includes('##') && lines[7].length < 400, lines[7]);
});

test('log-safe.mjs is pure and holds no raw control or reordering character itself', () => {
  const text = readFileSync(new URL('log-safe.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /^\s*import\b|\bfetch\(|readFileSync|writeFileSync|process\./m);
  for (const c of text) {
    const code = c.codePointAt(0);
    assert.ok(code === 10 || code === 13 || (code >= 0x20 && code < 0x7f), `character ${code.toString(16)} in the source`);
  }
});
