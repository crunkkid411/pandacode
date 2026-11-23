// The Hub's Knowledge page: Jordan's qmd library (hub_knowledge.rs), in SwarmClaw's three-column
// layout: collections on the left, search results in the middle, the chosen document on the right.
// Each collection has its own color, used on its results too.
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/app/api-client';

interface Collection { name: string; files: number; updated: string }
interface Hit { docid: string; score: number; file: string; title: string; snippet?: string; context?: string }
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const panel = 'rounded-[20px] border border-white/[0.08] bg-white/[0.03] overflow-hidden flex flex-col min-h-[260px]';

/** Plain names and colors for his collections; others get a color from their name. */
const KNOWN: Record<string, [string, string, string]> = {
  'youtube-notes': ['Saved videos', '#f87171', '▶'],
  'aisearch-channel': ['AISearch channel', '#fb923c', '▶'],
  transcripts: ['Transcripts', '#fbbf24', '🎙'],
  library: ['Library', '#a3e635', '📚'],
  'iphone-browsing': ['Phone browsing', '#34d399', '📱'],
  'github-stars': ['Starred repos', '#e5e7eb', '★'],
  'claude-memory': ['Agent memory', '#f472b6', '🧠'],
  'becky-docs': ['becky docs', '#60a5fa', '📘'],
  'becky-research': ['becky research', '#818cf8', '🔬'],
  'hj-clone': ['Your words', '#c084fc', '💬'],
  'ai-playlist-bots': ['Playlist bots', '#2dd4bf', '🤖'],
  skills: ['Skills catalog', '#22d3ee', '🧩'],
};
export function collectionLook(name: string): { label: string; color: string; icon: string } {
  const k = KNOWN[name];
  if (k) return { label: k[0], color: k[1], icon: k[2] };
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return { label: name, color: `hsl(${h} 70% 65%)`, icon: '📄' };
}
const collectionOf = (file: string) => file.replace(/^qmd:\/\//, '').split('/')[0];
/** qmd's snippet without its "@@ -1,4 @@" line and front-matter lines. */
export const cleanSnippet = (s = '') => s.split('\n').filter(l => !/^@@ |^---$|^[a-z_]+:\s/.test(l)).join(' ').trim();

export function HubKnowledge() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [failed, setFailed] = useState('');
  const [chosen, setChosen] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Hit | null>(null);
  const [doc, setDoc] = useState('');
  useEffect(() => { api<Collection[]>('GET', '/hub-knowledge').then(setCollections).catch(e => setFailed(errorText(e))); }, []);
  useEffect(() => {
    setDoc('');
    if (open) api<string>('POST', '/hub-knowledge/get', { file: open.file }).then(setDoc).catch(e => setDoc(`Could not open it: ${errorText(e)}`));
  }, [open]);
  const search = async (e?: FormEvent, inCollection = chosen) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try { setHits(await api<Hit[]>('POST', '/hub-knowledge/search', { query, collection: inCollection })); setOpen(null); }
    catch (err) { setFailed(errorText(err)); }
    finally { setBusy(false); }
  };
  if (failed && !collections) return <p className="px-8 py-8 text-[15px] text-red-400">Could not read your library: {failed}</p>;
  if (!collections) return null;
  const total = collections.reduce((n, c) => n + c.files, 0);

  return (
    <div className="h-full w-full flex-1 flex flex-col px-6 py-6 gap-5 overflow-hidden">
      <div>
        <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text">Knowledge</h1>
        <p className="text-[14px] text-text-2 mt-1">Your library: {total.toLocaleString()} documents your agents search (saved videos, starred repos, phone browsing, past chats).</p>
      </div>
      <form onSubmit={search} className="flex gap-3 max-w-[760px]">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your library" aria-label="Search your library"
          className="flex-1 px-4 py-3 rounded-[12px] bg-white/[0.06] border border-white/[0.12] text-[16px] text-text outline-none focus:border-[#8b8cf8]" style={{ fontFamily: 'inherit' }} />
        <button type="submit" disabled={busy || !query.trim()} className="px-5 py-3 rounded-[12px] bg-[#6d6cf0] text-white text-[15px] font-600 cursor-pointer hover:brightness-110 disabled:opacity-40 disabled:cursor-default" style={{ fontFamily: 'inherit' }}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      <div className="flex flex-wrap gap-4 flex-1 min-h-0">
        <section aria-label="Collections" className={panel} style={{ flex: '1 1 200px', maxWidth: 270 }}>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {[{ name: '', files: total, updated: '' }, ...collections].map(c => {
              const look = c.name ? collectionLook(c.name) : { label: 'Everything', color: '#ffffff', icon: '🔎' };
              const on = chosen === c.name;
              return (
                <button key={c.name || 'all'} type="button" aria-pressed={on} title={c.updated ? `Updated ${c.updated}` : undefined}
                  onClick={() => { setChosen(c.name); if (hits) void search(undefined, c.name); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[12px] text-left cursor-pointer"
                  style={{ background: on ? `color-mix(in srgb, ${look.color} 14%, #262626)` : 'transparent', border: `1px solid ${on ? look.color : 'transparent'}` }}>
                  <span aria-hidden className="w-6 text-center">{look.icon}</span>
                  <span className="flex-1 min-w-0 truncate text-[14px] font-600" style={{ color: c.name ? `color-mix(in srgb, ${look.color} 60%, #fff)` : '#fff' }}>{look.label}</span>
                  <span className="text-[13px] text-text-2">{c.files.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Results" className={panel} style={{ flex: '1 1 300px', maxWidth: 440 }}>
          <ul className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {(hits ?? []).map(h => {
              const look = collectionLook(collectionOf(h.file));
              const on = open?.file === h.file;
              return (
                <li key={h.file}>
                  <button type="button" onClick={() => setOpen(h)} aria-selected={on}
                    className="w-full text-left px-3.5 py-2.5 rounded-[12px] cursor-pointer"
                    style={{ background: on ? '#2e2e36' : '#1d1d1d', border: `1px solid ${on ? '#8b8cf8' : 'rgba(255,255,255,0.07)'}`, boxShadow: `inset 4px 0 0 ${look.color}` }}>
                    <div className="text-[15px] font-700 text-text line-clamp-2">{h.title || h.file}</div>
                    <div className="text-[12px] font-700 mt-0.5" style={{ color: look.color }}>{look.icon} {look.label}</div>
                    {h.snippet ? <div className="text-[13px] text-text-2 line-clamp-2 mt-0.5">{cleanSnippet(h.snippet)}</div> : null}
                  </button>
                </li>
              );
            })}
            {hits && !hits.length ? <li className="px-3 py-8 text-[15px] text-text-2 text-center">Nothing found.</li> : null}
            {!hits ? <li className="px-3 py-8 text-[15px] text-text-2 text-center">Type what you're looking for above.</li> : null}
          </ul>
        </section>

        <section aria-label="Document" className={`${panel} p-5 gap-3`} style={{ flex: '2 1 340px' }}>
          {open ? (
            <>
              <div className="text-[19px] font-700 text-text">{open.title}</div>
              <div className="flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-[1.6] text-text">{doc}</div>
            </>
          ) : <p className="px-5 py-10 text-[15px] text-text-2 text-center">Pick a result to read it.</p>}
        </section>
      </div>
    </div>
  );
}
