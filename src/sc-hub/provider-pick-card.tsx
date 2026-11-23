// One harness as a card in the New Agent form: its mascot on a glow of its brand color, its real
// logo and its name. The chosen one is outlined and tinted in that color (Jordan, 2026-11-23:
// creating an agent was "a wall of text ... no logos, no mascots, no color coordination").
import { AgentAvatar } from '../sc/components/agents/agent-avatar';
import { HarnessLogo, harnessName } from './harness-logo';
import { HARNESSES, mascotKind, mascotSeed } from './mascots';
import { pcProvider } from './bot-agents';

interface Props { provider: string; model?: string; selected: boolean; connected: boolean; onPick: () => void }

/** The mascot seed the form shows for an agent of this provider and model. */
export const formMascot = (provider: string, model: string, key: string, tool = '') =>
  mascotSeed(mascotKind(pcProvider(provider), model), key, '', 1, tool);

export function ProviderPickCard({ provider, model = '', selected, connected, onPick }: Props) {
  const kind = mascotKind(pcProvider(provider), model);
  const color = HARNESSES[kind]?.color ?? '#9b9cff';
  const name = harnessName(provider);
  return (
    <button type="button" onClick={onPick} aria-pressed={selected} aria-label={name} title={connected ? name : `${name}: not set up on this PC yet`}
      className="relative flex flex-col items-center gap-2 px-3 pt-4 pb-3 rounded-[16px] cursor-pointer transition-[background-color,border-color] duration-150 active:scale-[0.98]"
      style={{
        fontFamily: 'inherit',
        border: `2px solid ${selected ? color : 'rgba(255,255,255,0.10)'}`,
        background: selected ? `color-mix(in srgb, ${color} 22%, #2a2a2a)` : '#333333',
      }}>
      {connected ? <span aria-label="Ready" className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-emerald-400" /> : null}
      <span className="relative flex items-center justify-center w-[64px] h-[64px]">
        <span aria-hidden className="absolute inset-1 rounded-full blur-lg" style={{ background: color, opacity: selected ? 0.55 : 0.3 }} />
        <AgentAvatar seed={formMascot(provider, model, `pick-${provider}`)} name={name} size={58} className="relative" />
      </span>
      <span className="flex items-center gap-1.5 max-w-full">
        <HarnessLogo provider={provider} size={16} />
        <span className="text-[15px] font-700 text-white truncate">{name}</span>
      </span>
    </button>
  );
}
