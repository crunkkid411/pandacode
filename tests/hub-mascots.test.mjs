// Agent faces (src/sc-hub/mascots.ts): harness color and mark, the bot's own color wins, tools match roles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentColor, agentColorStyle, mascotKind, mascotSeed, mascotSvg, toolFor, HARNESSES } from '../src/sc-hub/mascots.ts';

test('a Claude Code agent is Clawd (pixel block, four legs) in Claude orange; its own color replaces that', () => {
  const seed = mascotSeed('claude', 'b1', '', null, '');
  const [, harness, color] = seed.split('|');
  assert.equal(harness, 'claude');
  const [r, g] = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16)];
  assert.ok(r > 190 && g > 95 && g < 140, `orange, got ${color}`);
  const svg = mascotSvg(seed);
  assert.ok(svg.includes('shape-rendering="crispEdges"') && svg.includes('<rect x="11" y="13" width="42" height="32"'), 'Clawd: a pixel block body');
  assert.equal((svg.match(/<rect x="\d+" y="43" width="4" height="12"\/>/g) ?? []).length, 4, 'four legs');
  assert.ok(mascotSvg(mascotSeed('qwen', 'q', '', 0, '')).includes('stroke-linejoin="round"'), 'logo shapes keep soft round edges');
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

test('Liquid AI and OpenRouter: picked by the model, face in the logo hole', () => {
  assert.equal(mascotKind('opencode', 'openrouter/anthropic/claude-x'), 'openrouter');
  assert.equal(mascotKind('openrouter', ''), 'openrouter');
  assert.equal(mascotKind('opencode', 'lfm3-omni-2b'), 'liquid');
  assert.equal(mascotKind('claude', 'default'), 'claude');
  for (const h of ['openrouter', 'liquid']) {
    const svg = mascotSvg(mascotSeed(h, 'x', '', 0, 'clipboard'));
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
    assert.ok(svg.includes(`fill="${HARNESSES[h].color}"`) || svg.includes('fill="#'), h);
    assert.ok(svg.includes('fill="#1b1622"'), `${h}: dark face window`);
  }
});
