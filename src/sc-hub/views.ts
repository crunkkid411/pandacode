import type { AppView } from '../sc/types';

/** SwarmClaw pages the Hub shows: only those with real data behind them (J10: no hollow buttons).
 *  Add a view here when its API paths are answered in routes.ts. */
export const HUB_VIEWS = new Set<AppView>(['agents', 'org_chart', 'inbox', 'tasks', 'schedules', 'skills', 'providers', 'usage', 'extensions', 'runs', 'projects', 'mcp_servers', 'memory', 'knowledge', 'chatrooms']);
export const HUB_HOME = '/org-chart';

/** True when at least one of a sidebar section's pages is shown in the Hub. */
export const hubSectionShown = (views: string[]) => views.some(v => HUB_VIEWS.has(v as AppView));

/** Each sidebar section has its own color (murmur-style separation); the colors are in globals.css (--hub-*). */
const SECTIONS: [string, string[]][] = [
  ['workspace', ['home', 'agents', 'org_chart', 'inbox', 'chatrooms', 'protocols', 'projects', 'swarmfeed', 'marketplace']],
  ['execution', ['tasks', 'missions', 'schedules', 'memory', 'runs', 'quality']],
  ['knowledge', ['knowledge', 'skills', 'connectors', 'webhooks', 'mcp_servers', 'extensions']],
  ['system', ['secrets', 'wallets', 'providers', 'usage', 'activity', 'autonomy', 'logs']],
];
export const sectionColor = (view: string) => `var(--hub-${SECTIONS.find(([, v]) => v.includes(view))?.[0] ?? 'workspace'})`;
