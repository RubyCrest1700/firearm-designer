import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** The prices job's text, from its name to the next job. */
const prices = workflow.slice(workflow.indexOf('\n  prices:\n'), workflow.indexOf('\n  build:\n'));
const GUARD = '- name: Refuse to run from a branch';

test('the workflow text has the parts these tests look for', () => {
  for (const text of ['\n  prices:\n', '\n  build:\n']) assert.ok(workflow.includes(text), text);
  for (const text of ['    steps:\n', 'actions/checkout', 'git push origin HEAD:main']) assert.ok(prices.includes(text), text);
});

test('the prices job stops first thing when run from a branch', () => {
  const start = prices.indexOf(GUARD);
  assert.notEqual(start, -1, 'the guard step is gone');
  assert.ok(start < prices.indexOf('actions/checkout'), 'before the first checkout');
  assert.ok(start < prices.indexOf('npm run update-prices'), 'before any retailer is fetched');
  assert.ok(start < prices.indexOf('git push origin HEAD:main'), 'before the push to main');
  // First in the list, with nothing but comments ahead of it.
  const ahead = prices.slice(prices.indexOf('    steps:\n') + '    steps:\n'.length, start);
  assert.match(ahead, /^(\s*#.*\n)*\s*$/);

  const step = prices.slice(start, prices.indexOf('\n      - ', start));
  assert.ok(step.includes("if: github.ref != 'refs/heads/main'"));
  assert.ok(step.includes('exit 1'));
  assert.ok(!step.includes('continue-on-error'));
});

test('a branch run fails the prices job instead of skipping it', () => {
  // build treats a skipped prices job as fine and would deploy the branch; a failed one stops it.
  const jobIf = prices.match(/^ {4}if: (.*)$/m)?.[1];
  assert.equal(jobIf, "github.event_name == 'schedule' || inputs.update_prices");
  assert.match(workflow, /needs\.prices\.result == 'success' \|\| needs\.prices\.result == 'skipped'/);
});
