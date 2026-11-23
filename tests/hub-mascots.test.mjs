// Agent faces (src/sc-hub/mascots.ts): harness color and mark, the bot's own color wins, tools match roles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentColor, agentColorStyle, mascotSeed, mascotSvg, toolFor, HARNESSES } from '../src/sc-hub/mascots.ts';

test('a Claude Code agent is a shade of Claude orange with the starburst; its own color replaces that', () => {
  const seed = mascotSeed('claude', 'b1', '', null, '');
  const [, harness, color] = seed.split('|');
  assert.equal(harness, 'claude');
  const [r, g] = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16)];
  assert.ok(r > 190 && g > 95 && g < 140, `orange, got ${color}`);
  assert.match(mascotSvg(seed), /rotate\(45 32 15\)/);
  assert.equal(agentColor('claude', 'b1', '#22c55e'), '#22c55e');
  assert.deepEqual(agentColorStyle(mascotSeed('claude', 'b1', '#22c55e', 0, '')), { '--agent-color': '#22c55e' });
});

test('two agents on one harness differ a little; the same agent always looks the same', () => {
  assert.notEqual(agentColor('claude', 'a'), agentColor('claude', 'zz'));
  assert.equal(mascotSeed('qwen', 'x', '', null, ''), mascotSeed('qwen', 'x', '', null, ''));
});

test('a tool only where the role calls for one', () => {
  assert.equal(toolFor('Chief of Staff Keeps my week on track'), 'clipboard');
  assert.equal(toolFor('Anything', true), 'clipboard');
  assert.equal(toolFor('Clip Finder Finds clips in streams'), 'clapper');
  assert.equal(toolFor('Code Reviewer Reviews changes'), 'bug');
  assert.equal(toolFor('Researcher Digs into questions'), 'magnifier');
  assert.equal(toolFor('Inbox Sorter Sorts saved links'), 'envelope');
  assert.equal(toolFor('Buddy'), '');
});

test('every harness draws, and a bad seed draws nothing', () => {
  for (const h of Object.keys(HARNESSES)) assert.match(mascotSvg(mascotSeed(h, h, '', null, 'code')), /^<svg[\s\S]*<\/svg>$/);
  assert.equal(mascotSvg('mascot|claude|red|0|'), '');
  assert.equal(mascotSvg('b1'), '');
});
