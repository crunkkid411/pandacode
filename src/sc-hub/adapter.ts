// The ONE connection between SwarmClaw's real pages and our data. SwarmClaw's pages call
// fetch('/api/...'); this answers those calls from the Hub's Rust commands. Paths it does not know
// are logged in window.__scMissing and answered with an empty list, so a page shows "nothing yet" instead of breaking.
import { call } from '../bridge';
import { routes } from './routes';

declare global { interface Window { __scMissing?: string[] } }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body ?? null), { status, headers: { 'Content-Type': 'application/json' } });

export async function answer(method: string, path: string, body: unknown): Promise<Response> {
  const [bare, qs] = path.split('?');
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = bare.match(r.path);
    if (m) {
      try { return json(await r.run({ call, match: m, query: new URLSearchParams(qs), body })); }
      catch (e) { return json({ error: String(e) }, 500); }
    }
  }
  (window.__scMissing ??= []).push(`${method} ${bare}`);
  return method === 'GET' ? json([]) : json({ error: 'Not available in the Hub yet' }, 501);
}

export function installAdapter() {
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    if (!path.startsWith('/api/')) return real(input, init);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    return answer((init?.method ?? 'GET').toUpperCase(), path.slice(4), body);
  };
}
