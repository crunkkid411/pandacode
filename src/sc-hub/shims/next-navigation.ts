// Stand-in for next/navigation: SwarmClaw's pages route by path; in the Hub the path lives in the URL hash.
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const current = () => (location.hash.replace(/^#/, '') || '/org-chart').split('?')[0];
const query = () => location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?') + 1) : '';
window.addEventListener('hashchange', () => listeners.forEach(l => l()));
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function navigate(path: string, replace = false) {
  const url = `#${path}`;
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  listeners.forEach(l => l());
}
const router = { push: (p: string) => navigate(p), replace: (p: string) => navigate(p, true), back: () => history.back(), forward: () => history.forward(), refresh: () => {}, prefetch: () => {} };
export const useRouter = () => router;
export const usePathname = () => useSyncExternalStore(subscribe, current);
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(subscribe, query));
/** `/agents/abc` -> { id: 'abc' }: SwarmClaw's dynamic pages only use one id. */
export const useParams = () => { const parts = usePathname().split('/').filter(Boolean); return parts.length > 1 ? { id: decodeURIComponent(parts[parts.length - 1]), token: parts[1], templateId: parts[parts.length - 1] } : {}; };
export function redirect(path: string): never { navigate(path, true); throw new Error('redirect'); }
export function notFound(): never { throw new Error('Page not found'); }
