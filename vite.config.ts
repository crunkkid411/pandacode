import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';

// Tailwind runs on the Hub's one stylesheet only (src/hub/hub.css) and scans only src/hub,
// so the rest of PandaCode's CSS is never touched by it.
const hubDir = fileURLToPath(new URL('./src/hub', import.meta.url));
const hubTailwind = (): Plugin => ({
  name: 'hub-tailwind',
  enforce: 'pre',
  async transform(code, id) {
    if (!/[\/]src[\/]hub[\/]hub\.css$/.test(id.split('?')[0])) return;
    const out = await postcss([tailwind({ base: hubDir })]).process(code, { from: id.split('?')[0] });
    return { code: out.css, map: null };
  },
});

// ES-module workers: the diff highlighter worker (@pierre/diffs) imports Shiki chunks.
// hub.html is the Hub window (React + SwarmClaw's look, docs/plans/2026-11-22-hub-window.md).
export default defineConfig({ plugins: [react(), hubTailwind()], clearScreen: false, server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } }, build: { target: 'es2022', assetsInlineLimit: 0, rollupOptions: { input: { main: 'index.html', 'agents-dock': 'agents-dock.html', hub: 'hub.html' } } }, worker: { format: 'es' } });
