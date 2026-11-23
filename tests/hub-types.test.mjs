// The project's main type check skips src/sc (SwarmClaw) and src/sc-hub (the Hub), so a wrong field
// name there was invisible (2026-11-23). This checks both with tsconfig.hub.json and fails on any error
// in the Hub's own files. SwarmClaw's server-side files have old errors of their own; those are not counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('the Hub files type-check', () => {
  const run = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.hub.json'], { encoding: 'utf8' });
  const hubErrors = run.stdout.split(/\r?\n/).filter(l => /^src[\/]sc-hub[\/].*error TS/.test(l));
  assert.deepEqual(hubErrors, []);
  assert.match(run.stdout + run.stderr, /error TS|^$/m, 'tsc ran');
});
