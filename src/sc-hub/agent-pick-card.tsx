// One agent as a card (murmur's "Agents" grid): its face on a soft glow of its color, its name,
// a short description and its harness logo. Used wherever an agent or agent template is chosen.
import type { ReactNode } from 'react';
import { AgentAvatar } from '../sc/components/agents/agent-avatar';
import { HarnessLogo } from './harness-logo';

interface Props {
  name: string;
  description?: string;
  seed: string | null;
  avatarUrl?: string | null;
  provider?: string;
  /** Small text under the description (where it comes from, or what it is doing). */
  note?: ReactNode;
  busy?: boolean;
  selected?: boolean;
  onPick: () => void;
  title?: string;
}

export function AgentPickCard({ name, description, seed, avatarUrl, provider, note, busy, selected, onPick, title }: Props) {
  const color = seed?.startsWith('mascot|') ? seed.split('|')[2] : '#7c7cf6';
  return (
    <button type="button" onClick={onPick} disabled={busy} title={title} aria-pressed={selected}
      style={{ '--card': color } as React.CSSProperties}
      className={`group flex flex-col items-center text-center gap-2 px-4 pt-5 pb-4 rounded-[20px] border cursor-pointer transition-[border-color,background-color,transform] duration-150
        bg-[#1b1620] hover:bg-[color-mix(in_srgb,var(--card)_9%,#1b1620)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait
        ${selected ? 'border-[var(--card)]' : 'border-white/[0.07] hover:border-[color-mix(in_srgb,var(--card)_55%,transparent)]'}`}>
      <span className="relative flex items-center justify-center w-[84px] h-[84px]">
        <span aria-hidden className="absolute inset-2 rounded-full blur-xl opacity-45 bg-[var(--card)]" />
        <AgentAvatar seed={seed} avatarUrl={avatarUrl} name={name} size={76} className="relative" />
      </span>
      <span className="flex items-center gap-1.5 max-w-full">
        {provider ? <HarnessLogo provider={provider} size={15} /> : null}
        <span className="font-display text-[16px] font-700 text-text truncate">{name}</span>
      </span>
      {description ? <span className="text-[13px] leading-[1.35] text-text-2 line-clamp-2">{description}</span> : null}
      {note ? <span className="text-[12px] text-[color-mix(in_srgb,var(--card)_70%,#fff)]">{note}</span> : null}
    </button>
  );
}
