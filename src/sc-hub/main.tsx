// The Hub window: SwarmClaw's own layout and pages (src/sc, copied from X:\AI-2\swarmclaw, MIT),
// fed by our data through ONE adapter (./adapter.ts).
import { createRoot } from 'react-dom/client';
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { installAdapter } from './adapter';
import { STYLE_GUIDE_PATH, StyleGuidePage } from './style-guide-item';
import { usePathname } from './shims/next-navigation';
import { TooltipProvider } from '../sc/components/ui/tooltip';
import { Toaster } from '../sc/components/ui/sonner';
import { DashboardShell } from '../sc/components/layout/dashboard-shell';
import { AppQueryProvider } from '../sc/components/providers/app-query-provider';
import '../sc/app/globals.css';

installAdapter();

const pages = import.meta.glob<{ default: ComponentType }>('../sc/app/**/page.tsx');
const layouts = import.meta.glob<{ default: ComponentType<{ children: ReactNode }> }>('../sc/app/*/layout.tsx');
const lazyLayouts = new Map<string, ComponentType<{ children: ReactNode }>>();
/** A section's own layout (e.g. the Skills list beside the page), as Next.js would wrap it. */
function layoutFor(path: string): ComponentType<{ children: ReactNode }> | null {
  const key = `../sc/app/${path.split('/').filter(Boolean)[0]}/layout.tsx`;
  if (!layouts[key]) return null;
  if (!lazyLayouts.has(key)) lazyLayouts.set(key, lazy(layouts[key]));
  return lazyLayouts.get(key)!;
}
const lazyPages = new Map<string, ComponentType>();
function pageFor(path: string): ComponentType | null {
  const parts = path.split('/').filter(Boolean);
  const exact = `../sc/app/${parts.join('/')}/page.tsx`;
  const withId = `../sc/app/${parts.slice(0, -1).join('/')}/[id]/page.tsx`;
  const key = pages[exact] ? exact : pages[withId] ? withId : null;
  if (!key) return null;
  if (!lazyPages.has(key)) lazyPages.set(key, lazy(pages[key]));
  return lazyPages.get(key)!;
}

function Page() {
  const path = usePathname();
  if (path === STYLE_GUIDE_PATH) return <StyleGuidePage />; // Hub page of our own, not one of SwarmClaw's
  const Shown = pageFor(path);
  const Layout = layoutFor(path);
  if (!Shown) return <p className="p-8 text-text-3">This page is not in the Hub.</p>;
  return <Suspense fallback={null}>{Layout ? <Layout><Shown /></Layout> : <Shown />}</Suspense>;
}

createRoot(document.getElementById('hub-root')!).render(
  <AppQueryProvider>
    <TooltipProvider>
      <DashboardShell><Page /></DashboardShell>
      <Toaster />
    </TooltipProvider>
  </AppQueryProvider>,
);
