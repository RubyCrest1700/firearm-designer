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

const workerWorkflow = readFileSync(new URL('../.github/workflows/deploy-worker.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const workerJobs = workerWorkflow.slice(workerWorkflow.indexOf('\njobs:\n') + 1);

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

/** A step's whole text, from its name to the next step or the end of the job. */
const stepNamed = (name) => {
  const start = prices.indexOf(`- name: ${name}\n`);
  assert.notEqual(start, -1, name);
  const end = prices.indexOf('\n      - ', start);
  return prices.slice(start, end === -1 ? undefined : end);
};
const updatePrices = readFileSync(new URL('update-prices.mjs', import.meta.url), 'utf8');

test('every tracked data file update-prices writes is committed by the "Commit updated prices" step', () => {
  // A written file left out of these lines stays dirty, the rebase refuses to run, and the night's prices are lost.
  const written = [...updatePrices.matchAll(/writeFileSync\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(written)].sort(), ['data/price-history.json', 'data/price-holds.json', 'data/prices.json']);
  assert.equal(updatePrices.match(/writeFileSync\(/g).length, written.length, 'every write names its file where the test can see it');
  const step = stepNamed('Commit updated prices');
  const porcelain = step.match(/git status --porcelain ([^)]*)\)/)[1].split(' ');
  const added = step.match(/git add (.*)$/m)[1].split(' ');
  assert.deepEqual([...porcelain].sort(), [...new Set(written)].sort());
  assert.deepEqual([...added].sort(), [...new Set(written)].sort());
});

test('data/estimates.json is generated, ignored by git and never committed', () => {
  assert.ok(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8').split(/\r?\n/).includes('data/estimates.json'));
  for (const text of [workflow, ...prices.match(/git add .*/g)]) assert.doesNotMatch(text.replace(/^\s*#.*$/gm, ''), /git add[^\n]*estimates/);
  // Made in the prices job right before the price run, which is the only thing that reads it.
  assert.ok(prices.indexOf('- name: Generate estimates') < prices.indexOf('- name: Refresh prices'));
  assert.equal(prices.match(/npm run estimates/g).length, 1);
  assert.doesNotMatch(build, /estimates/);
  assert.doesNotMatch(readFileSync(new URL('check-presets.ts', import.meta.url), 'utf8'), /estimates\.json/);
});

test('a failed estimates generator warns and never fails the job', () => {
  const step = stepNamed('Generate estimates');
  assert.match(step, /^ {8}continue-on-error: true$/m);
  assert.match(step, /^ {8}timeout-minutes: \d+$/m);
  assert.match(step, /if ! timeout \d+ npm run estimates; then/);
  assert.match(step, /echo "::warning::/);
  assert.match(step, />> "\$GITHUB_STEP_SUMMARY"/);
  assert.doesNotMatch(step, /exit 1/);
});

test('update-prices gets past a missing estimates file, and writes nothing on a dry run', () => {
  // It runs on import, so this is checked as text. The readers themselves are tested in first-read-guard.test.mjs.
  assert.ok(updatePrices.includes("estimates: loaded('data/estimates.json', readEstimates),"));
  assert.doesNotMatch(updatePrices, /estimates\.json'[^\n]*readFileSync|readFileSync\('data\/estimates/);
  const start = updatePrices.indexOf('if (!dryRun) {');
  assert.notEqual(start, -1);
  assert.ok(updatePrices.indexOf('writeFileSync(') > start, 'no write ahead of the dry-run check');
  assert.ok(updatePrices.indexOf('appendFileSync(process') > start, 'no step summary ahead of it either');
});

test('update-prices checks a read right after implausiblePrice, and a held read writes no offer', () => {
  const odd = updatePrices.indexOf('if (odd) {');
  const hold = updatePrices.indexOf('const hold = firstReadHold(');
  const entry = updatePrices.indexOf('entry = { price: found.price');
  assert.ok(odd !== -1 && odd < hold && hold < entry);
  assert.ok(updatePrices.includes('hadOffer: Boolean(before[retailer])'));
  assert.match(updatePrices.slice(hold, entry), /if \(hold\) \{[\s\S]*report\.held\+\+[\s\S]*\} else \{\s*$/);
});

test('the Worker deploys only from main, even on a manual run', () => {
  // workflow_dispatch can pick any branch, and this job applies migrations and deploys with the production secrets.
  assert.ok(workerWorkflow.includes('workflow_dispatch'));
  // One job, so there's no second way in that this `if` doesn't cover.
  assert.deepEqual(workerJobs.match(/^ {2}\S.*$/gm), ['  deploy:']);
  assert.equal(jobIf(workerJobs), "github.ref == 'refs/heads/main'");
  assert.ok(workerJobs.indexOf('    if: ') < workerJobs.indexOf('    steps:\n'), 'on the job, ahead of its steps');
});
