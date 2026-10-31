import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** The prices job's text, from its name to the next job. */
const prices = workflow.slice(workflow.indexOf('\n  prices:\n'), workflow.indexOf('\n  build:\n'));
const build = workflow.slice(workflow.indexOf('\n  build:\n'), workflow.indexOf('\n  deploy:\n'));
const deploy = workflow.slice(workflow.indexOf('\n  deploy:\n'));
const GUARD = '- name: Refuse to run from a branch';
/** A job's own `if`, not a step's: job keys sit at four spaces, step keys deeper. */
const jobIf = (job) => job.match(/^ {4}if: (.*)$/m)?.[1];

test('the workflow text has the parts these tests look for', () => {
  for (const text of ['\n  prices:\n', '\n  build:\n', '\n  deploy:\n']) assert.ok(workflow.includes(text), text);
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
  // build treats a skipped prices job as fine and would run from the branch; a failed one stops it.
  assert.equal(jobIf(prices), "github.event_name == 'schedule' || inputs.update_prices");
  assert.match(workflow, /needs\.prices\.result == 'success' \|\| needs\.prices\.result == 'skipped'/);
});

test('the guard tells you to run from main and nothing else', () => {
  const start = prices.indexOf(GUARD);
  const step = prices.slice(start, prices.indexOf('\n      - ', start));
  assert.ok(step.includes('echo "::error::Prices can only be refreshed from main. Run this from main."'));
  // Unticking only skips the job, and the point is that a branch run stops.
  assert.doesNotMatch(step, /untick/i);
});

test('a failed guard stops the rest of the prices job', () => {
  // Only a job-level continue-on-error is forbidden: it would pass a failed guard on to build as a success.
  // "Refresh retailer list" has its own at step level, deeper in, and that one is fine.
  assert.doesNotMatch(prices, /^ {4}continue-on-error:/m);
  // Either of these would run a step, like the push to main, after the guard failed.
  const code = prices.replace(/^\s*#.*$/gm, '');
  assert.doesNotMatch(code, /\b(always|failure)\s*\(/i);
});

test('a failed prices job stops build, and a failed build stops deploy', () => {
  assert.equal(jobIf(build), "${{ !cancelled() && (needs.prices.result == 'success' || needs.prices.result == 'skipped') }}");
  assert.equal(jobIf(deploy), "${{ !cancelled() && needs.build.result == 'success' && github.event_name != 'pull_request' }}");
});
