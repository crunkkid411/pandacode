import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';

export default function dynamic<P extends object>(load: () => Promise<ComponentType<P> | { default: ComponentType<P> }>, opts?: { loading?: () => ReactElement | null }) {
  const Lazy = lazy(async () => { const m = await load(); return 'default' in m ? m : { default: m }; });
  return (props: P) => <Suspense fallback={opts?.loading?.() ?? null}><Lazy {...props} /></Suspense>;
}
