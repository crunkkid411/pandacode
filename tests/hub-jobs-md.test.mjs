// JOBS.md on the Task Board (src/sc-hub/jobs-md.ts): labels from the index, text from the sections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { jobCard, kindOf, parseJobs } from '../src/sc-hub/jobs-md.ts';

const SAMPLE = `# JOBS.md - work list

## Index, in build order

| Job | Label | One sentence |
|---|---|---|
| J01 | DONE (2026-11-09, OpenCode) | Bark Pro everywhere. |
| J02 | READY | Fix the Planner crash. |
| google-connect | DONE (2026-11-09) | One double-click connects Gmail. Then more. |
| J26 | NEEDS_DECISIONS | The main assistant. |
| J34 | CONCEPT_ONLY | Lessons collector. |
| J10 | PART DONE (2026-11-11) | Jobs window. |

# READY

## J02. Fix the Planner crash (READY)

Line 66 fails.

## J10. Background-jobs window (READY)

Build the window.

# NEEDS_DECISIONS (Jordan decides)

## J26. The main assistant

Options.
`;

test('labels: the index wins over the heading, and each label lands in its column', () => {
  const jobs = parseJobs(SAMPLE);
  assert.deepEqual(jobs.map(j => j.id), ['J01', 'J02', 'google-connect', 'J26', 'J34', 'J10']);
  const j10 = jobs.find(j => j.id === 'J10');
  assert.equal(j10.label, 'PART DONE (2026-11-11)');
  assert.equal(j10.body, 'Build the window.');
  assert.equal(jobs.find(j => j.id === 'J02').body, 'Line 66 fails.');
  assert.equal(jobs.find(j => j.id === 'google-connect').title, 'One double-click connects Gmail.');
  assert.deepEqual(jobs.map(j => jobCard(j, 0).status), ['archived', 'backlog', 'archived', 'backlog', 'archived', 'backlog']);
  assert.deepEqual(jobCard(jobs.find(j => j.id === 'J26'), 0).tags, ['JOBS.md', 'Needs your decision']);
  assert.deepEqual(jobCard(j10, 0).tags, ['JOBS.md', 'PART DONE']);
  assert.equal(jobCard(j10, 0).title, 'J10. Background-jobs window');
});

test('kinds', () => {
  assert.equal(kindOf('MOSTLY DONE'), 'ready');
  assert.equal(kindOf('READY after J10'), 'ready');
  assert.equal(kindOf('LATER (after the basics)'), 'idea');
  assert.equal(kindOf('CHANGED 2026-11-22 (Claude Code)'), 'ready');
});

test("Jordan's real JOBS.md parses: every index row and every section is a job", { skip: !existsSync('X:/AI-2/JOBS.md') }, () => {
  const text = readFileSync('X:/AI-2/JOBS.md', 'utf8').replace(/\r\n/g, '\n');
  const jobs = parseJobs(text);
  const sections = text.match(/^## J\d+\. /gm).length;
  assert.ok(jobs.length >= sections, `${jobs.length} jobs, ${sections} sections`);
  assert.equal(new Set(jobs.map(j => j.id)).size, jobs.length, 'no job twice');
  assert.ok(jobs.every(j => j.title && j.body), 'every job has a title and text');
});
