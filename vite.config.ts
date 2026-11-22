import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';

// Tailwind runs on the Hub's one stylesheet only (src/hub/hub.css) and scans only src/hub,
// so the rest of PandaCode's CSS is never touched by it.
// SwarmClaw's real stylesheet (src/sc/app/globals.css) gets Tailwind too, scanning only src/sc.
const scDir = fileURLToPath(new URL('./src/sc', import.meta.url));
const hubDir = fileURLToPath(new URL('./src/hub', import.meta.url)); // old panels (hub-classic.html, tests only)
const hubTailwind = (): Plugin => ({
  name: 'hub-tailwind',
  enforce: 'pre',
  async transform(code, id) {
    const file = id.split('?')[0];
    const base = /[\/]src[\/]sc[\/]app[\/]globals\.css$/.test(file) ? scDir : /[\/]src[\/]hub[\/]hub\.css$/.test(file) ? hubDir : null;
    if (!base) return;
    const out = await postcss([tailwind({ base })]).process(code, { from: file });
    return { code: out.css, map: null };
  },
});
const shim = (f: string) => fileURLToPath(new URL(`./src/sc-hub/shims/${f}`, import.meta.url));
const scAlias = [
  { find: /^@\//, replacement: `${scDir}/` },
  { find: /^next\/navigation$/, replacement: shim('next-navigation.ts') },
  { find: /^next\/link$/, replacement: shim('next-link.tsx') },
  { find: /^next\/dynamic$/, replacement: shim('next-dynamic.tsx') },
  { find: /^next\/server$/, replacement: shim('next-server.ts') },
  { find: /^next-themes$/, replacement: shim('next-themes.tsx') },
  { find: /^next$/, replacement: shim('next.ts') },
];

// ES-module workers: the diff highlighter worker (@pierre/diffs) imports Shiki chunks.
// hub.html is the Hub window (React + SwarmClaw's look, docs/plans/2026-11-22-hub-window.md).
export default defineConfig({ plugins: [react(), hubTailwind()], resolve: { alias: scAlias }, define: { 'process.env': '{}' }, clearScreen: false, server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } }, build: { target: 'es2022', assetsInlineLimit: 0, rollupOptions: { input: { main: 'index.html', 'agents-dock': 'agents-dock.html', hub: 'hub.html', 'hub-classic': 'hub-classic.html' } } }, worker: { format: 'es' } });
