import { Activity, Bot, MessagesSquare, Mic, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Agents } from './agents';
import { Chats } from './chats';
import { RunningNow } from './running-now';
import { Tools } from './tools';
import { Voice } from './voice';

// One entry per panel that is really built. A panel with no backend is not drawn (JOBS.md J10).
const PANELS = [
  { id: 'running-now', label: 'Running now', icon: Activity, view: RunningNow },
  { id: 'chats', label: 'Chats', icon: MessagesSquare, view: Chats },
  { id: 'agents', label: 'Agents', icon: Bot, view: Agents },
  { id: 'tools', label: 'Tools', icon: Wrench, view: Tools },
  { id: 'voice', label: 'Voice', icon: Mic, view: Voice },
] as const;

export function App() {
  const [active, setActive] = useState<(typeof PANELS)[number]['id']>('running-now');
  const Panel = PANELS.find(p => p.id === active)!.view;
  return (
    <div className="flex h-full">
      <nav aria-label="Panels" className="flex w-[64px] shrink-0 flex-col items-center gap-2 border-r border-border-hi bg-raised py-4">
        {PANELS.map(p => (
          <button
            key={p.id}
            type="button"
            title={p.label}
            aria-label={p.label}
            aria-current={p.id === active ? 'page' : undefined}
            className={`rail-btn ${p.id === active ? 'active' : ''}`}
            onClick={() => setActive(p.id)}
          >
            <p.icon size={22} />
          </button>
        ))}
      </nav>
      <main className={`min-w-0 flex-1 ${active === 'chats' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <Panel />
      </main>
    </div>
  );
}
