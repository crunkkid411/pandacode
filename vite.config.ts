import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// ES-module workers: the diff highlighter worker (@pierre/diffs) imports Shiki chunks.
// hub.html is the Hub window (React + SwarmClaw's look, docs/plans/2026-11-22-hub-window.md).
export default defineConfig({ plugins: [react(), tailwindcss()], clearScreen: false, server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } }, build: { target: 'es2022', assetsInlineLimit: 0, rollupOptions: { input: { main: 'index.html', 'agents-dock': 'agents-dock.html', hub: 'hub.html' } } }, worker: { format: 'es' } });
