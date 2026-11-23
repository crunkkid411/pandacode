// "Start from a template" in the new-agent form: every agent template on this PC (opencompany,
// Claude-Extras, Claude Code and plugin agent files, his Hermes bots), from src-tauri/src/hub_templates.rs.
// Picking one fills the form's name, description, instructions and (for a Hermes bot) the harness.
import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '../sc/components/shared/bottom-sheet';
import { call } from '../bridge';

export interface Template { path: string; name: string; description: string; source: string; provider: string; model?: string; role?: string }
export interface TemplateText { name: string; description: string; prompt: string; provider: string; model?: string; role?: string }

interface Props { open: boolean; onClose: () => void; onPick: (t: TemplateText) => void }

/** The group a source belongs to, for the filter chips ("opencompany · law firm" -> "opencompany"). */
export const groupOf = (source: string) => source.split(' · ')[0];

/** Templates matching the words typed (all words, in name, description or source); Hermes bots and opencompany first. */
export function filterTemplates(list: Template[], query: string, group: string): Template[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rank = (t: Template) => (t.source === 'Yours' ? 0 : t.source === 'Hermes bot' ? 1 : t.source === 'MausBot bot' ? 2 : t.source.startsWith('opencompany') ? 3 : 4);
  return list
    .filter(t => group === 'All' || groupOf(t.source) === group)
    .filter(t => { const hay = `${t.name} ${t.description} ${t.source}`.toLowerCase(); return words.every(w => hay.includes(w)); })
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function AgentTemplatePicker({ open, onClose, onPick }: Props) {
  const [list, setList] = useState<Template[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!open || list) return;
    call<Template[]>('hub_agent_templates').then(setList).catch(e => setError(String(e)));
  }, [open, list]);

  const groups = useMemo(() => ['All', ...new Set((list ?? []).map(t => groupOf(t.source)))], [list]);
  const shown = useMemo(() => filterTemplates(list ?? [], query, group), [list, query, group]);

  const pick = async (t: Template) => {
    setBusy(t.path);
    try { onPick(await call<TemplateText>('hub_agent_template', { path: t.path })); onClose(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(''); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} wide>
      <div className="mb-5">
        <h2 className="font-display text-[24px] font-700 tracking-[-0.03em] mb-1">Start from a template</h2>
        <p className="text-[13px] text-text-3">{list ? `${list.length} agent templates on this PC. Pick one to fill in the form; you can change everything after.` : 'Reading the templates…'}</p>
      </div>
      <input
        type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search: writer, lawyer, video, researcher…"
        className="w-full px-4 py-3 mb-3 rounded-[14px] border border-white/[0.08] bg-surface text-text text-[15px] outline-none focus-glow"
      />
      <div className="flex flex-wrap gap-2 mb-4">
        {groups.map(g => (
          <button key={g} onClick={() => setGroup(g)}
            className={`px-3 py-1.5 rounded-[10px] text-[12px] font-600 border transition-all cursor-pointer ${group === g ? 'bg-accent-soft border-accent-bright/25 text-accent-bright' : 'bg-surface border-white/[0.06] text-text-3 hover:text-text-2'}`}>
            {g}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 text-[13px] text-red-400">{error}</p>}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[55vh] pr-1">
        {shown.slice(0, 200).map(t => (
          <button key={t.path} onClick={() => pick(t)} disabled={!!busy} title={t.path}
            className="text-left px-4 py-3 rounded-[12px] border border-white/[0.06] bg-surface hover:border-accent-bright/30 hover:bg-white/[0.03] transition-all cursor-pointer disabled:opacity-60">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-600 text-text">{t.name}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-[999px] bg-white/[0.05] text-text-3">{t.source}</span>
              {busy === t.path && <span className="text-[11px] text-accent-bright">Loading…</span>}
            </div>
            {t.description && <p className="mt-1 text-[12px] text-text-3 line-clamp-2">{t.description}</p>}
          </button>
        ))}
        {list && shown.length === 0 && <p className="text-[13px] text-text-3">No template matches. Try fewer words.</p>}
        {shown.length > 200 && <p className="text-[12px] text-text-3/70">Showing 200 of {shown.length}. Type to narrow it down.</p>}
      </div>
    </BottomSheet>
  );
}
