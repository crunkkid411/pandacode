import { AlertTriangle, AudioLines, Mic, Square } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { call } from '../bridge';

// Voice panel: starts and stops Jordan's voice agent (src-tauri/src/hub_voice.rs owns the facts).
const REFRESH_MS = 3000;

interface VoiceStatus { running: string | null }

const VOICES = [
  { id: 'gemini', label: 'Talk with Gemini', hint: 'Gemini Live, voice Zephyr. A window opens: talk, or type and press Enter.', icon: Mic },
  { id: 'groq', label: 'Talk with Groq', hint: 'The fast backup voice. It opens a page in your browser: press Record and talk.', icon: AudioLines },
] as const;

export function Voice() {
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    try { setRunning((await call<VoiceStatus>('hub_voice_status')).running); } catch (e) { setError(String(e)); }
  }, []);
  useEffect(() => {
    void read();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void read(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [read]);
  const act = async (command: string, args: Record<string, unknown> = {}) => {
    try { await call(command, args); setError(null); } catch (e) { setError(String(e)); }
    await read();
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-8 py-7">
      <section aria-label="Voices" className="flex flex-wrap gap-4">
        {VOICES.map(v => {
          const on = running === v.id;
          return (
            <div key={v.id} className={`flex min-w-[300px] flex-1 items-center gap-4 rounded-2xl border px-6 py-5 ${on ? 'border-success bg-success-soft' : 'border-border-hi bg-surface'}`}>
              <v.icon size={30} className={on ? 'text-success' : 'text-accent-bright'} />
              <div className="min-w-0 flex-1">
                <p className="text-[19px] font-semibold">{v.label}</p>
                <p className="text-[15px] text-text-3">{on ? 'On now. Talk in its window.' : v.hint}</p>
              </div>
              {on
                ? <button type="button" onClick={() => void act('hub_voice_stop')} aria-label={`Stop ${v.label}`}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-danger-soft px-5 py-2.5 text-[17px] text-danger"><Square size={18} />Stop</button>
                : <button type="button" disabled={running !== null} onClick={() => void act('hub_voice_start', { kind: v.id })} aria-label={`Start ${v.label}`}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-accent px-5 py-2.5 text-[17px] font-semibold text-white disabled:cursor-default disabled:opacity-40"><Mic size={18} />Start</button>}
            </div>
          );
        })}
      </section>
      {error && <p role="alert" title={error} className="flex items-center gap-2 text-danger"><AlertTriangle size={20} />{error.length < 120 ? error : 'That did not work'}</p>}
      <p className="text-[15px] text-text-3">Stopping the voice does not stop work it handed to Claude Code or Hermes. It tells you their results next time.</p>
    </div>
  );
}
