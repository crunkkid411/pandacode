// The Hub's Connectors page facts: each agent's chat connections (bots/channels in Rust), with each
// platform's own color and icon, and the connection state as a color AND a word. Pure, so
// tests/hub-connectors-facts.test.mjs can run it.

export interface PcChannel { id: string; botId: string; kind: string; label: string; enabled: boolean; status: string; secrets: string[] }
export type LinkState = 'connected' | 'off' | 'problem' | 'starting';

/** Platforms PandaCode agents can connect to, with the secrets each one needs (he pastes them). */
export const PLATFORMS: Record<string, { name: string; color: string; icon: string; secrets: [string, string][]; needs?: [string, string] }> = {
  web: { name: 'Web chat', color: '#fbbf24', icon: '🌐', secrets: [] },
  telegram: { name: 'Telegram', color: '#38bdf8', icon: '✈️', secrets: [['token', 'Bot token from BotFather']] },
  discord: { name: 'Discord', color: '#818cf8', icon: '🎮', secrets: [['token', 'Bot token (Developer Portal → Bot)']] },
  slack: { name: 'Slack', color: '#f472b6', icon: '💼', secrets: [['token', 'Bot token (starts xoxb-)'], ['app_token', 'App-level token (starts xapp-)']] },
  whatsapp: { name: 'WhatsApp', color: '#4ade80', icon: '📞', secrets: [['access_token', 'Access token']], needs: ['phoneNumberId', 'Phone number ID (digits)'] },
};

export const LINK_LOOK: Record<LinkState, { word: string; color: string }> = {
  connected: { word: 'Connected', color: '#34d399' },
  starting: { word: 'Starting', color: '#60a5fa' },
  off: { word: 'Off', color: '#a3a3a3' },
  problem: { word: 'Problem', color: '#f87171' },
};

/** PandaCode writes a plain sentence as the status ("Connected as @x", "Off", or the error). */
export function linkState(c: Pick<PcChannel, 'enabled' | 'status'>): LinkState {
  if (!c.enabled || c.status === 'Off') return 'off';
  if (/^connected/i.test(c.status)) return 'connected';
  if (!c.status || /^(starting|connecting)/i.test(c.status)) return 'starting';
  return 'problem';
}
