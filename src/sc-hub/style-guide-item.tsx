// Jordan's visual style guide as a Hub page (#/style-guide), with a sidebar entry that looks like
// SwarmClaw's nav items. The page shows the existing HTML file, served by the app itself
// (src-tauri/src/hub.rs, the "hubpage" address), inside the Hub.
import { RailTooltip } from '../sc/components/layout/nav-item';
import { navigate, usePathname } from './shims/next-navigation';

export const STYLE_GUIDE_PATH = '/style-guide';
/** Where the app serves the guide (Windows WebView2 form of the custom "hubpage" scheme). */
export const STYLE_GUIDE_URL = 'http://hubpage.localhost/style-guide';

const ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" /><circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.7 1.7-1.7H16c3.1 0 5.6-2.5 5.6-5.6C21.9 6.4 17.5 2 12 2z" />
  </svg>
);

export function StyleGuideItem({ expanded }: { expanded: boolean }) {
  const active = usePathname() === STYLE_GUIDE_PATH;
  const open = () => navigate(STYLE_GUIDE_PATH);
  if (expanded) {
    return (
      <button type="button" onClick={open} aria-current={active ? 'page' : undefined} style={{ fontFamily: 'inherit' }}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[13px] font-500 cursor-pointer transition-all border-none ${active ? 'bg-accent-soft text-accent-bright' : 'bg-transparent text-text-3 hover:text-text hover:bg-white/[0.04]'}`}>
        <span className="shrink-0">{ICON}</span><span className="truncate">Style Guide</span>
      </button>
    );
  }
  return (
    <RailTooltip label="Style Guide" description="Your visual style menu">
      <button type="button" aria-label="Style Guide" onClick={open} className={`rail-btn border-none ${active ? 'active' : ''}`}>{ICON}</button>
    </RailTooltip>
  );
}

export function StyleGuidePage() {
  return <iframe title="Style Guide" src={STYLE_GUIDE_URL} className="flex-1 w-full h-full border-0 bg-black" />;
}
