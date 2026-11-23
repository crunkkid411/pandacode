// The Hub's Extensions page: Jordan's install list, inbox.txt (SwarmClaw: "install extensions from ... a URL"). Links waiting to be installed (add one, or install them all
// with the same session the desktop "Install Inbox" shortcut starts), then what got installed and how to use it.
import { CapabilityGroups } from './capability-page';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/app/api-client';
import { INBOX_FILE, type Inbox } from './install-list';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** "github.com/JuneYaooo/rea-video" for a link: the part a person reads. */
const short = (link: string) => link.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

function LinkButton({ link }: { link: string }) {
  return (
    <button type="button" title={`Open ${link} in your browser`} onClick={() => api('POST', '/hub-installs/open', { url: link }).catch(e => toast.error(errorText(e)))}
      className="text-left text-[15px] font-600 text-[var(--hub-workspace)] hover:underline cursor-pointer break-all bg-transparent border-none p-0" style={{ fontFamily: 'inherit' }}>
      {short(link)}
    </button>
  );
}

export function InstallList() {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [failed, setFailed] = useState('');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Inbox>('GET', '/hub-installs').then(setInbox).catch(e => setFailed(errorText(e)));
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setInbox(await api<Inbox>('POST', '/hub-installs', { link, note }));
      setLink(''); setNote('');
      toast.success('Added to your install list');
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  };
  const install = () => api('POST', '/hub-installs/install')
    .then(() => toast.success('Install Inbox started in its own window'))
    .catch(e => toast.error(errorText(e)));

  if (failed) return <p className="px-8 py-8 text-[15px] text-red-400">Could not read {INBOX_FILE}: {failed}</p>;
  if (!inbox) return null;
  return (
    <div className="w-full px-8 py-8">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text">Extensions</h1>
          <p className="text-[14px] text-text-2 mt-1">Paste a link and an agent installs it. Your list is {INBOX_FILE}.</p>
        </div>
        <button type="button" onClick={install} disabled={!inbox.waiting.length}
          title="Starts the same Claude Code session as Install Inbox on your desktop"
          className="px-4 py-2.5 rounded-[12px] bg-[#6d6cf0] text-white text-[14px] font-600 cursor-pointer hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-default"
          style={{ fontFamily: 'inherit' }}>
          Install them now
        </button>
      </div>

      <form onSubmit={add} aria-label="Add a link" className="flex flex-wrap gap-2 mb-8">
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="Paste a link" aria-label="Link"
          style={{ fontFamily: 'inherit', flex: '2 1 260px' }} className="px-4 py-3 rounded-[12px] bg-[#1b1620] border border-white/[0.1] text-[15px] text-text outline-none focus:border-[var(--hub-workspace)]" />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="What it's for (optional)" aria-label="Note"
          style={{ fontFamily: 'inherit', flex: '1 1 200px' }} className="px-4 py-3 rounded-[12px] bg-[#1b1620] border border-white/[0.1] text-[15px] text-text outline-none focus:border-[var(--hub-workspace)]" />
        <button type="submit" disabled={busy || !link.trim()}
          className="px-5 py-3 rounded-[12px] bg-white/[0.08] text-text text-[15px] font-600 cursor-pointer hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-default"
          style={{ fontFamily: 'inherit' }}>
          Add
        </button>
      </form>

      <section aria-label="Waiting" className="mb-10">
        <h2 className="flex items-center gap-2 text-[17px] font-700 text-amber-300 mb-3">
          <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ background: "#fcd34d" }} /> Waiting ({inbox.waiting.length})
        </h2>
        {inbox.waiting.length ? (
          <ul className="flex flex-col gap-2">
            {inbox.waiting.map((w, i) => (
              <li key={`${w.link}-${i}`} className="px-4 py-3 rounded-[14px] bg-[#1b1620] border border-amber-300/20">
                <LinkButton link={w.link} />
                {w.note ? <p className="text-[14px] text-text-2 mt-1">{w.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : <p className="text-[14px] text-text-2">Nothing waiting. Paste a link above.</p>}
      </section>

      <section aria-label="Installed">
        <h2 className="flex items-center gap-2 text-[17px] font-700 text-emerald-300 mb-3">
          <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ background: "#6ee7b7" }} /> Installed ({inbox.done.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {inbox.done.map((d, i) => (
            <li key={`${d.link}-${i}`} className="px-4 py-3 rounded-[14px] bg-[#1b1620] border border-emerald-300/15">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <LinkButton link={d.link} />
                <span className="text-[12px] text-text-3">{d.date}</span>
              </div>
              <p className="text-[14px] text-text mt-1">{d.what}</p>
              {d.use ? <p className="text-[14px] text-text-2 mt-1"><span className="text-emerald-300 font-600">How to use: </span>{d.use}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Plugins" className="mt-10">
        <h2 className="text-[20px] font-700 text-text mb-1">Plugins in your harnesses</h2>
        <p className="text-[14px] text-text-2 mb-4">What each harness already has installed.</p>
        <CapabilityGroups kind="plugin" noun="plugins" />
      </section>
    </div>
  );
}
