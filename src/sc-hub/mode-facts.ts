// The chat box's mode: how much an agent may do without asking. Shift+Tab steps through them in Claude Code's
// own order (default -> accept edits -> plan -> auto -> bypass permissions). PandaCode's ids are mapped to each
// harness's own setting in src-tauri/src/providers.rs (e.g. Claude: auto=acceptEdits, review=auto, full=bypassPermissions).
export interface ModeLook { id: string; word: string; color: string; meaning: string }

export const MODES: ModeLook[] = [
  { id: 'ask', word: 'Ask first', color: '#93c5fd', meaning: 'Asks you before it edits a file or runs a command.' },
  { id: 'auto', word: 'Accept edits', color: '#4ade80', meaning: 'Edits files by itself; asks before it runs a command.' },
  { id: 'plan', word: 'Plan only', color: '#2dd4bf', meaning: 'Reads and makes a plan; changes nothing.' },
  { id: 'review', word: 'Auto', color: '#fbbf24', meaning: 'Does safe work by itself; a safety check stops risky actions.' },
  { id: 'full', word: 'Full access', color: '#f87171', meaning: 'Does everything without asking.' },
];

export const modeLook = (id: string): ModeLook => MODES.find(m => m.id === id) ?? MODES[0];
/** The mode after this one, wrapping around (Shift+Tab). */
export const nextMode = (id: string): string => MODES[(MODES.findIndex(m => m.id === id) + 1) % MODES.length].id;
