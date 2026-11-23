// Every engine command the Hub window calls must be on the Hub's allowed list in src-tauri/src/lib.rs.
// The preview tests fake the engine, so a missing entry only showed up in the real Hub
// ("Command list_slash_commands not found", 2026-11-23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const lib = readFileSync('src-tauri/src/lib.rs', 'utf8');
const start = lib.indexOf('label() == hub::LABEL');
const block = lib.slice(start, lib.indexOf('return handler(invoke);', start));
const allowed = new Set([...block.matchAll(/^\s*(?:[a-z_]+::)*([a-z_0-9]+),\s*$/gm)].map(m => m[1]));

const files = (dir) => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
});
// The Hub window's own code; src/sc is SwarmClaw's, which talks to the engine only through src/sc-hub, except these files.
const hubFiles = [...files('src/sc-hub'), ...files('src/hub'), 'src/sc/components/input/chat-input.tsx'];

test('the Hub window only calls commands the Hub is allowed to use', () => {
  assert.ok(allowed.size > 20, 'found the Hub list in lib.rs');
  const missing = new Set();
  for (const f of hubFiles) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bcall(?:<[^>()]*(?:<[^>]*>)?[^>()]*>)?\(\s*'([a-z_0-9]+)'/g)) {
      if (!allowed.has(m[1])) missing.add(`${m[1]} (${f})`);
    }
  }
  assert.deepEqual([...missing], []);
});
