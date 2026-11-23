// The Hub's not-built-yet pages (Webhooks, Missions, Quality, Feed). Jordan, 2026-11-23: "they can be blank
// for now with just an explanation of what SwarmClaw uses each page for ... they should exist now so I don't forget".
import { sectionColor } from './views';

interface PageText { title: string; icon: string; what: string; points: string[] }

const PAGES: Record<string, PageText> = {
  webhooks: {
    title: 'Webhooks', icon: '🪝',
    what: 'In SwarmClaw, a webhook is a private web address that wakes an agent up. When another app or website sends a message to that address, the agent starts a job by itself.',
    points: ['A new GitHub star, a form, or a payment can start an agent', 'Each webhook belongs to one agent and says what job to run', 'A secret key stops strangers from using the address'],
  },
  missions: {
    title: 'Missions', icon: '🎯',
    what: 'In SwarmClaw, a mission is a big goal that a team of agents works on for days, with a budget so it can not spend too much.',
    points: ['A goal plus "this is what done looks like"', 'Milestones that tick off as the agents finish them', 'A spending and time limit, and a report on a schedule'],
  },
  quality: {
    title: 'Quality', icon: '✅',
    what: 'In SwarmClaw, Quality is where agents are tested. You keep a set of example jobs with the right answers, run the agents on them, and see a score.',
    points: ['Test sets: example jobs with known good answers', 'Runs: the score each agent got, and which jobs it failed', 'Shows if an agent got worse after a change'],
  },
  swarmfeed: {
    title: 'Feed', icon: '📰',
    what: 'In SwarmClaw, the Feed is a social timeline for agents. Agents post what they did and found, and you and other agents can read, like and reply.',
    points: ['Posts from your agents about finished work', 'Replies and likes, so agents can react to each other', 'One place to skim what the whole team did today'],
  },
};

export function HubPlaceholder({ view }: { view: keyof typeof PAGES }) {
  const p = PAGES[view];
  const color = sectionColor(view);
  return (
    <div className="h-full w-full flex-1 flex flex-col px-6 py-6 gap-5 overflow-y-auto">
      <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text flex items-center gap-3">
        <span aria-hidden>{p.icon}</span>{p.title}
        <span className="text-[13px] font-700 px-2.5 py-1 rounded-full" style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.14)' }}>Not built yet</span>
      </h1>
      <section aria-label="What this page is for" className="rounded-[20px] border border-white/[0.1] bg-[#1c1c1c] p-5 flex flex-col gap-3 max-w-[720px]" style={{ boxShadow: `inset 4px 0 0 ${color}` }}>
        <p className="text-[17px] text-text leading-relaxed">{p.what}</p>
        <ul className="flex flex-col gap-2">
          {p.points.map(t => <li key={t} className="text-[15px] text-text flex gap-2"><span aria-hidden style={{ color }}>●</span>{t}</li>)}
        </ul>
        <p className="text-[14px] text-text-2">This page is a reminder. Nothing in your system does this yet; we build it when you ask.</p>
      </section>
    </div>
  );
}
