// A harness's real logo in place of its name ("claude-cli" → the Claude mark). PandaCode's logo files
// (src/provider-logos.ts); Gemini and Qwen have none there, so their marks are drawn here. Hover shows the name.
import { providerLogoUrl } from '../provider-logos';
import type { ProviderId } from '../types';
import { HARNESSES } from './mascots';
import { pcProvider } from './bot-agents';

const svg = (body: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`)}`;
const DRAWN: Record<string, string> = {
  gemini: svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285f4"/><stop offset="1" stop-color="#9b72cb"/></linearGradient></defs><path d="M12 1c.9 5.6 5.4 10.1 11 11-5.6.9-10.1 5.4-11 11-.9-5.6-5.4-10.1-11-11C6.6 11.1 11.1 6.6 12 1z" fill="url(#g)"/>'),
  qwen: svg('<path d="M12 1.5l9.1 5.25v10.5L12 22.5l-9.1-5.25V6.75z" fill="#615ced"/><path d="M12 7l4.3 2.5v5L12 17l-4.3-2.5v-5z" fill="none" stroke="#fff" stroke-width="1.8"/>'),
};

/** Black marks, turned white on the Hub's dark background (as PandaCode does in dark mode). */
const DARK_MARKS = new Set(['codex', 'github-copilot', 'kilo', 'cline', 'devin', 'zcode']);
const LOGO_ID: Record<string, string> = { copilot: 'github-copilot' };

export const harnessName = (provider: string) => { const id = pcProvider(provider); return HARNESSES[id]?.name ?? id; };

export function HarnessLogo({ provider, size = 16, className = '' }: { provider: string; size?: number; className?: string }) {
  const id = pcProvider(provider);
  const logoId = LOGO_ID[id] ?? id;
  const src = DRAWN[id] ?? providerLogoUrl(logoId as ProviderId);
  const name = harnessName(provider);
  if (!src) {
    return <span title={name} aria-label={name} role="img" className={`inline-flex shrink-0 items-center justify-center rounded-[5px] bg-white/10 text-text font-700 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.6 }}>{name.charAt(0).toUpperCase()}</span>;
  }
  return <img src={src} alt={name} title={name} width={size} height={size} draggable={false} className={`inline-block shrink-0 object-contain ${className}`}
    style={DARK_MARKS.has(logoId) ? { filter: 'invert(1)' } : undefined} />;
}
