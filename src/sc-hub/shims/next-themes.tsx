import type { ReactNode } from 'react';
// The Hub is always dark (SwarmClaw's "Midnight Glass").
export const useTheme = () => ({ theme: 'dark', resolvedTheme: 'dark', systemTheme: 'dark', themes: ['dark'], setTheme: () => {} });
export const ThemeProvider = ({ children }: { children: ReactNode; [k: string]: unknown }) => <>{children}</>;
