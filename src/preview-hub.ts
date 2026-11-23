// Browser preview of the Hub's backend (src-tauri/src/hub.rs), for page tests only.
// Every call is recorded in `window.__hubCalls`; `window.__hubNoGpu = true` makes the
// graphics card "not answer", like a crashed driver.
import type { RunningNowFacts, Task } from './hub/facts';
import type { Chat, ChatMessage } from './hub/chats-facts';
import type { HubBot, HubSchedule } from './hub/agents-facts';

const tasks: Task[] = [
  { path: '\\Becky Playlist Scout (idle)', name: 'Becky Playlist Scout (idle)', enabled: true, state: 'Ready', lastRun: '11/22/2026 3:10:00 AM', lastResult: 0, nextRun: '11/22/2026 7:10:00 AM', action: 'wscript run-hidden.vbs', mine: true },
  { path: '\\Becky Stars Refresh', name: 'Becky Stars Refresh', enabled: true, state: 'Ready', lastRun: '11/22/2026 6:30:01 AM', lastResult: 1, nextRun: '11/23/2026 6:30:00 AM', action: 'powershell -File daily-run.ps1', mine: true },
  { path: '\\Agent Branch Sweep', name: 'Agent Branch Sweep', enabled: false, state: 'Disabled', lastRun: '11/21/2026 9:00:00 PM', lastResult: 0, nextRun: 'N/A', action: 'bash agent-check.sh', mine: true },
  { path: '\\MelancholyMonitor', name: 'MelancholyMonitor', enabled: true, state: 'Running', lastRun: '11/22/2026 6:40:00 AM', lastResult: 0x41301, nextRun: '11/22/2026 6:50:00 AM', action: 'wscript run-hidden.vbs', mine: true },
  { path: '\\AppleSoftwareUpdate', name: 'AppleSoftwareUpdate', enabled: true, state: 'Ready', lastRun: '11/21/2026 1:00:00 PM', lastResult: 0, nextRun: '11/28/2026 1:00:00 PM', action: 'SoftwareUpdate.exe', mine: false },
];

// Chats: PandaCode's own chat commands, as the Hub window calls them.
const now = Date.now();
const chats: (Chat & { projectId?: string })[] = [
  { id: 'c1', title: 'Fix the playlist scout', provider: 'claude', model: 'default', status: 'idle', projectId: 'p1', archived: false, createdAt: now - 9e6, updatedAt: now - 9e6, lastResponseAt: now - 3_600_000 },
  { id: 'c2', title: 'Write the shorts captions', provider: 'opencode', model: 'deepseek', status: 'running', projectId: 'p1', archived: false, createdAt: now - 8e6, updatedAt: now - 8e6, lastResponseAt: now - 60_000 },
  { id: 'c3', title: 'Old archived chat', provider: 'claude', model: 'default', status: 'idle', archived: true, createdAt: now - 9e7, updatedAt: now - 9e7, lastResponseAt: now - 9e7 },
];
const taskLinks: Record<string, string> = {}; // task -> bot (bot_tasks)
const messages: Record<string, ChatMessage[]> = {
  c1: [{ id: 1, role: 'user', content: 'Why did the scout run hot?', createdAt: now - 3_700_000 }, { id: 2, role: 'assistant', content: 'It ran Qwen3.5-4B on the graphics card.', createdAt: now - 3_600_000 }],
  c2: [{ id: 3, role: 'user', content: 'Caption the new short', createdAt: now - 70_000 }],
};
let nextId = 100;

// Agents: PandaCode's bots and scheduled chats.
// Agents are bots (bots.rs): b1 coordinates b2 on the Org Chart; b3 is not placed on it yet.
type MockBot = HubBot & Record<string, any>;
const profile = { instructions: '', goals: '', soul: '', avatar: '', mode: 'ask', color: '', reasoningEffort: '', backupModels: [], fallbackMode: 'ask', notify: true, whileWorking: 'queue', showPlan: false, skills: [], mcp: [], createdAt: now - 9e6, updatedAt: now - 9e6, desktopSession: null };
const bots: MockBot[] = [
  { ...profile, id: 'b1', name: 'Chief of Staff', role: 'Morning brief', provider: 'claude', model: 'default', paused: false, heartbeatMinutes: 60, nextHeartbeatAt: now + 25 * 60_000, lastMessage: null, org: { parentId: null, swarmRole: 'coordinator', onChart: true } },
  { ...profile, id: 'b2', name: 'Inbox Sorter', role: 'Sorts saved links', provider: 'opencode', model: 'deepseek', paused: true, heartbeatMinutes: 30, nextHeartbeatAt: null, lastMessage: null, org: { parentId: 'b1', swarmRole: 'worker', onChart: true } },
  { ...profile, id: 'b3', name: 'Clip Finder', role: 'Finds clips in streams', provider: 'claude', model: 'default', paused: false, heartbeatMinutes: 0, nextHeartbeatAt: null, lastMessage: null, org: {} },
];
// PandaCode's skills library: agent-firefox was imported from its folder before.
const library: any[] = [{ id: 'agent-firefox', name: 'agent-firefox', kind: 'skill', description: '', source: { kind: 'folder', location: 'C:/skills/agent-firefox' } }];
const botById = (id: string) => { const b = bots.find(x => x.id === id); if (!b) throw new Error('This bot no longer exists.'); return b; };
// Bot schedules (bots/schedule.rs): Chief of Staff checks the inbox every weekday at 08:15.
const botSchedules: any[] = [
  { id: 'k1', botId: 'b1', title: 'Weekday queue sweep', prompt: 'Sort the saved links by owner', kind: 'weekdays', intervalMinutes: null, timeOfDay: '08:15', nextRunAt: now + 5 * 3_600_000, lastRunAt: null, enabled: true, createdBy: 'user' },
];
function invokeBotSchedules(command: string, args: Record<string, any>): unknown {
  const own = () => { const s = botSchedules.find(x => x.id === args.scheduleId); if (!s) throw new Error('This schedule no longer exists.'); return s; };
  switch (command) {
    case 'bot_detail': return { bot: { ...botById(args.botId) }, schedules: botSchedules.filter(s => s.botId === args.botId).map(s => ({ ...s })), memories: [], channels: [], pairings: [], threads: [], rules: [], serverPort: 0 };
    case 'bot_schedule_create': {
      const i = args.input;
      if (!i.prompt) throw new Error('A schedule needs a prompt: what should the bot do?');
      if (i.kind === 'interval' && !(i.intervalMinutes >= 5 && i.intervalMinutes <= 10080)) throw new Error('Check the schedule’s time: intervals are 5 minutes to a week, times are HH:MM, one-off runs are within a year.');
      const s = { id: `k${nextId++}`, botId: botById(args.botId).id, title: i.title || i.prompt.slice(0, 60), prompt: i.prompt, kind: i.kind, intervalMinutes: i.intervalMinutes ?? null, timeOfDay: i.timeOfDay ?? null, nextRunAt: Date.now() + 3_600_000, lastRunAt: null, enabled: true, createdBy: 'user' };
      botSchedules.push(s);
      return { ...s };
    }
    case 'bot_schedule_set_enabled': { const s = own(); s.enabled = Boolean(args.enabled); return { ...s }; }
    case 'bot_schedule_delete': { botSchedules.splice(botSchedules.indexOf(own()), 1); return undefined; }
    case 'bot_run_schedule_now': { own().lastRunAt = Date.now(); return undefined; }
  }
  return null;
}
const schedules: HubSchedule[] = [
  { id: 's1', title: 'Morning news digest', sessionTitle: 'News', projectName: 'AI-2', prompt: 'Summarise AI news', kind: 'daily', intervalMinutes: null, timeOfDay: '07:30', days: [], watchSessionTitle: null, nextRunAt: now + 3 * 3_600_000, lastRunAt: now - 20 * 3_600_000, enabled: true, runCount: 12 },
  { id: 's2', title: 'Check the build', sessionTitle: 'Build', projectName: 'pandacode', prompt: 'Run the tests', kind: 'interval', intervalMinutes: 30, timeOfDay: null, days: [], watchSessionTitle: null, nextRunAt: now + 10 * 60_000, lastRunAt: now - 20 * 60_000, enabled: false, runCount: 3 },
];

function invokeChats(command: string, args: Record<string, any>): unknown {
  const w = window as any;
  switch (command) {
    case 'list_sessions': return [...chats, ...(w.__hubWaitingChat ? [{ id: 'c9', title: 'Pick a thumbnail', provider: 'claude', model: 'default', status: 'waiting', archived: false, createdAt: now - 5e6, updatedAt: now - 120_000, lastResponseAt: now - 120_000 }] : [])].map(c => ({ ...c }));
    case 'list_providers': if (w.__hubSlowProviders && !w.__hubSlowDone) { w.__hubSlowDone = true; return new Promise(r => setTimeout(() => r(invokeHub('list_providers', args)), 800)); }
      return [{ id: 'claude', name: 'Claude Code', installed: true }, { id: 'opencode', name: 'OpenCode', installed: true }, { id: 'gemini', name: 'Gemini CLI', installed: true }, { id: 'qwen', name: 'Qwen Code', installed: true }, { id: 'cursor', name: 'Cursor', installed: false }, ...((window as any).__hubBroken ? [{ id: 'cursor-broken', name: 'Broken Agent', installed: true }] : [])];
    case 'get_messages': return { messages: (messages[args.sessionId] ?? []).map(m => ({ ...m })), hasOlder: false };
    case 'list_provider_models': if (args.provider === 'gemini') throw new Error('ACP startup timed out after 60 seconds.');
      if (args.provider === 'cursor-broken') throw new Error('Cursor exited before returning models' + String.fromCharCode(10) + 'Details: more');
      return args.provider === 'claude' ? [{ id: 'default', name: 'Default' }, { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5' }] : args.provider === 'qwen' ? [{ id: 'qwen3-coder', name: 'Qwen3 Coder' }] : [{ id: 'freellmapi/deepseek-v4-flash', name: 'DeepSeek V4 Flash' }];
    case 'model_routing_route': return w.__hubNoRoute ? { pick: null, difficulty: 3, category: 'implementation', profiler: 'onnx' } : { pick: { provider: 'claude', model: 'claude-sonnet-5-5', name: 'Sonnet 5.5', pSuccess: 0.8 }, difficulty: 5, category: 'implementation', profiler: 'onnx' };
    case 'chat_create': {
      const c: Chat = { id: `c${nextId++}`, title: 'New chat', provider: args.provider, model: args.model, status: 'idle', archived: false, createdAt: Date.now(), updatedAt: Date.now(), lastResponseAt: null, lastPromptAt: null };
      chats.push(c);
      return { ...c };
    }
    case 'send_message': {
      const c = chats.find(x => x.id === args.sessionId);
      if (!c) throw new Error('No chat');
      (messages[c.id] ??= []).push({ id: nextId++, role: 'user', content: args.text, createdAt: Date.now() });
      c.status = 'running';
      c.lastPromptAt = Date.now();
      if ((c as any).taskStage) (c as any).taskStage = 'in_progress';
      // The agent answers after a moment, unless a test holds it running.
      if (args.text === 'FAIL') { messages[c.id].push({ id: nextId++, role: 'error', content: 'This harness cannot run here.', createdAt: Date.now() }, { id: nextId++, role: 'changes', content: '', createdAt: Date.now() }); c.status = 'error'; return undefined; }
      if (!w.__hubHoldRunning) setTimeout(() => { messages[c.id].push({ id: nextId++, role: 'assistant', content: `Done: ${args.text}`, createdAt: Date.now() }); c.status = 'idle'; c.lastResponseAt = Date.now(); if ((c as any).taskStage) (c as any).taskStage = 'review'; }, 300);
      return undefined;
    }
    case 'bots_list': return (window as any).__hubNoBots ? [] : bots.map(b => ({ ...b }));
    case 'bot_set_paused': { const b = botById(args.botId); b.paused = Boolean(args.paused); return { ...b }; }
    case 'bot_create': { if (!['claude', 'opencode', 'codex', 'qwen', 'hermes'].includes(args.input.provider)) throw new Error('Choose a harness and model for the bot.'); const b: MockBot = { ...profile, ...args.input, id: `b${nextId++}`, paused: false, nextHeartbeatAt: null, lastMessage: null, org: {}, createdAt: Date.now(), updatedAt: Date.now() }; bots.push(b); return { ...b }; }
    case 'bot_update': { if (!['claude', 'opencode', 'codex', 'qwen'].includes(args.input.provider)) throw new Error('Choose a harness and model for the bot.'); const b = botById(args.botId); Object.assign(b, args.input, { updatedAt: Date.now() }); return { ...b }; }
    case 'bot_delete': { bots.splice(bots.indexOf(botById(args.botId)), 1); return undefined; }
    case 'bot_set_org': { const b = botById(args.botId); if (args.org.parentId === b.id) throw new Error('A bot cannot report to itself or to a bot that reports to it.'); b.org = { ...args.org }; return { ...b }; }
    case 'bot_set_capabilities': { const b = botById(args.botId); b.skills = args.skills; b.mcp = args.mcp; return { ...b }; }
    case 'bot_desktop_thread': {
      const b = botById(args.botId);
      if (!b.desktopSession) { const c: Chat & { projectId: string } = { id: `t-${b.id}`, projectId: 'pb1', title: `${b.name} · You`, provider: b.provider, model: b.model, status: 'idle', archived: false, createdAt: Date.now(), updatedAt: Date.now(), lastResponseAt: null, lastPromptAt: null }; chats.push(c); b.desktopSession = c.id; }
      return b.desktopSession;
    }
    case 'bot_message': return invokeChats('send_message', { sessionId: invokeChats('bot_desktop_thread', args), text: args.text });
    case 'schedules_list': return schedules.map(x => ({ ...x }));
    case 'schedule_set_enabled': { const x = schedules.find(y => y.id === args.scheduleId); if (!x) throw new Error('No schedule'); x.enabled = Boolean(args.enabled); return { ...x }; }
    case 'schedule_run_now': { const x = schedules.find(y => y.id === args.scheduleId); if (!x) throw new Error('No schedule'); x.runCount++; x.lastRunAt = Date.now(); return { scheduleId: x.id }; }
    // Task Board: PandaCode tasks are these same sessions, with a stage and a description.
    case 'create_board_task': {
      const c: any = { id: `c${nextId++}`, title: args.title, taskDescription: args.description, taskStage: 'pending', projectId: args.projectId, provider: args.provider, model: args.model, status: 'idle', archived: false, createdAt: Date.now(), updatedAt: Date.now(), lastResponseAt: null, lastPromptAt: null };
      chats.push(c);
      return { ...c };
    }
    case 'update_task_details': { const c: any = chats.find(x => x.id === args.sessionId); c.title = args.title; c.taskDescription = args.description; c.taskStage ??= 'pending'; return { ...c }; }
    case 'set_task_stage': { const c: any = chats.find(x => x.id === args.sessionId); c.taskStage = args.stage; return { ...c }; }
    case 'configure_session': { const c: any = chats.find(x => x.id === args.sessionId); c.provider = args.provider; c.model = args.model; return { ...c }; }
    case 'start_task': { const c: any = chats.find(x => x.id === args.sessionId); return invokeChats('send_message', { sessionId: c.id, text: c.taskDescription || c.title }); }
    case 'bot_assign_task': { if (args.botId) taskLinks[args.sessionId] = args.botId; else delete taskLinks[args.sessionId]; return args.botId ? { ...botById(args.botId) } : null; }
    case 'bot_task_links': return { ...taskLinks };
    case 'bot_task_brief': return taskLinks[args.sessionId] ? `\n\nBot brief: you are ${botById(taskLinks[args.sessionId]).name}.` : null;
    case 'overlay_open_task': return undefined;
    case 'list_slash_commands': return { warnings: [], commands: [
      { name: '/model', description: 'Choose a model', source: 'PandaCode', kind: 'action' },
      { name: '/permissions', description: 'Change permissions', source: 'PandaCode', kind: 'action' },
      { name: '/review', description: 'Review the changes', argumentHint: null, source: 'Claude Code', kind: 'native' },
      { name: '/video-rules', description: 'Video editing rules', source: 'Skill', kind: 'skill' },
    ] };
    case 'resolve_slash_command': {
      const name = String(args.text).split(/\s/)[0];
      if (name === '/permissions') return { action: 'permissions', arguments: '' };
      if (['/review', '/video-rules'].includes(name)) return { action: null, arguments: '' };
      throw new Error(`Unknown command ${name}. Type / to browse this harness's commands, or refresh the list.`);
    }
    case 'update_session': { const c: any = chats.find(x => x.id === args.sessionId); if (args.title) c.title = args.title; if (args.model) c.model = args.model; return undefined; }
    case 'stop_session': {
      const c = chats.find(x => x.id === args.sessionId);
      if (c) c.status = 'interrupted';
      return undefined;
    }
  }
  throw new Error(`Unknown Hub command ${command}`);
}

// Tools: one job at a time, like hub_tools.rs. A job finishes after 400 ms unless a test holds it.
const jobs: any[] = [];
function invokeTools(command: string, args: Record<string, any>): unknown {
  const w = window as any;
  if (command === 'hub_tool_jobs') return [...jobs].reverse().map(j => ({ ...j }));
  if (command === 'hub_tool_run') {
    const running = jobs.some(j => j.state === 'running');
    const job = { id: jobs.length + 1, tool: args.tool, file: args.file, state: running ? 'waiting' : 'running', note: running ? 'In line' : 'Listening', output: args.file.replace(/\.[^.\\]+$/, '.transcript.srt'), queuedMs: Date.now(), finishedMs: null };
    jobs.push(job);
    const finish = () => { if (job.state !== 'running') return; job.state = 'done'; job.note = 'Finished'; const next = jobs.find(j => j.state === 'waiting'); if (next) { next.state = 'running'; setTimeout(() => finishNext(next), 400); } };
    const finishNext = (j: any) => { if (j.state !== 'running') return; j.state = 'done'; j.note = 'Finished'; };
    if (!running && !w.__hubHoldJobs) setTimeout(finish, 400);
    return { ...job };
  }
  if (command === 'hub_tool_stop') { const j = jobs.find(x => x.id === args.id); if (j && (j.state === 'running' || j.state === 'waiting')) { j.state = 'stopped'; j.note = 'Stopped'; } return undefined; }
  if (command === 'hub_open_path') return undefined;
  throw new Error(`Unknown Hub command ${command}`);
}

export function invokeHub<T>(command: string, args: Record<string, any>): T {
  const w = window as any;
  (w.__hubCalls ??= []).push({ command, args });
  if (command.startsWith('hub_tool_') || command === 'hub_open_path') return invokeTools(command, args) as T;
  if (command === 'hub_skills_list' || command === 'hub_skills_rebuild') return [
    { kind: 'skill', name: 'agent-firefox', description: 'Browse with the agent Firefox', places: ['Claude Code'], path: 'C:/skills/agent-firefox/SKILL.md', ours: true },
    { kind: 'agent', name: 'planner', description: 'Plans features', places: ['Claude Code (plugin ecc ON)'], path: 'C:/plugins/planner.md', ours: false },
    { kind: 'command', name: 'deploy', description: 'Ships a build', places: ['OpenCode'], path: 'C:/oc/deploy.md', ours: false },
    { kind: 'skill', name: 'video-rules', description: 'Video editing rules', places: ['X:/AI-2 project'], path: 'X:/AI-2/rules/SKILL.md', ours: true },
  ] as T;
  if (command === 'hub_speak') return new ArrayBuffer(0) as T;
  if (command === 'hub_inbox_add' || command === 'hub_inbox_install' || command === 'hub_open_link') return null as T;
  // Inbox read state: everything counts as new in the preview until marked read.
  if (command === 'hub_inbox_seen' || command === 'hub_inbox_mark_read') {
    const w = window as any;
    w.__hubSeen ??= { since: 0, seen: {} };
    for (const id of (args.ids ?? []) as string[]) w.__hubSeen.seen[id] = Date.now() + 1;
    return { since: w.__hubSeen.since, seen: { ...w.__hubSeen.seen } } as T;
  }
  if (command === 'hub_read_list') return (args.name === 'jobs' ? [
    '## Index, in build order', '', '| Job | Label | One sentence |', '|---|---|---|',
    '| J02 | DONE (2026-11-09) | Fix the Planner crash. |', '| J06 | READY | Check Vibe\'s graph. |',
    '| J26 | NEEDS_DECISIONS | The main assistant. |', '', '# READY', '',
    '## J06. Is Vibe\'s graph real? (READY)', '', 'Check whether the graph is real, then report it plainly.', '',
    '# NEEDS_DECISIONS', '', '## J26. The main assistant', '', 'Jordan decides.', '',
  ] : [
    '# Double-click "Install Inbox" on the desktop', '', 'https://github.com/JuneYaooo/rea-video', 'https://github.com/noblehacks/frenemy', '',
    '=== DONE ===', '2026-11-12 | https://github.com/only-cli/oc | INSTALLED as CLI "oc" | use: oc open <url>',
  ]).join('\n') as T;
  if (command === 'plugin:dialog|open') return ((window as any).__hubPick ?? null) as T;
  if (command === 'import_prompt_image') return { id: `img-${args.path ?? args.name}`, name: 'pic.png', width: 1, height: 1, thumbnail: 'data:image/png;base64,iVBORw0KGgo=' } as T;
  if (command === 'hub_agent_templates') return [
    { path: 'C:/hermes/profiles/scout/SOUL.md', name: 'scout', description: 'You are the Scout', source: 'Hermes bot', provider: 'hermes', model: 'profile:scout' },
    { path: 'X:/AI-2/agent-templates/chief-of-staff.md', name: 'Chief of Staff', description: 'His one point of contact', source: 'Yours', provider: 'claude', role: 'coordinator' },
    { path: 'X:/oc/media_company/agents/writer.toml', name: 'Writer', description: 'Write and edit articles.', source: 'opencompany · media company', provider: '' },
    { path: 'C:/extras/agency-agents/marketing/seo.md', name: 'SEO Specialist', description: 'Ranks pages', source: 'Claude-Extras · agency-agents', provider: '' },
  ] as T;
  if (command === 'hub_agent_template') {
    const all = invokeHub<any[]>('hub_agent_templates', {});
    const t = all.find(x => x.path === args.path);
    if (!t) throw new Error('That template is no longer there.');
    return { name: t.name, description: t.description, prompt: `Prompt of ${t.name}`, provider: t.provider, model: t.model ?? '', role: t.role ?? '' } as T;
  }
  if (command === 'usage_ledger') {
    const h = Math.floor(Date.now() / 3600_000);
    return { scannedAt: Date.now(), models: [{ provider: 'claude', name: 'Claude Opus 5.5' }, { provider: 'codex', name: 'GPT-6 Luna' }], rows: [[h, 0, 1000, 50000, 200, 300, 0, 0], [h - 24, 1, 400, 0, 0, 100, 0, 0], [h - 48, 0, 2000, 0, 0, 500, 0, 0]] } as T;
  }
  if (command === 'hub_voice_status') return { running: w.__hubVoice ?? null } as T;
  if (command === 'hub_voice_start') { if (w.__hubVoice && w.__hubVoice !== args.kind) throw new Error('Another voice is already on. Stop it first.'); w.__hubVoice = args.kind; return { running: args.kind } as T; }
  if (command === 'hub_voice_stop') { w.__hubVoice = null; return { running: null } as T; }
  // Skills library, MCP servers and projects for the agent form.
  if (command === 'skills_list') return library.map(i => ({ ...i })) as T;
  if (command === 'skills_import_folder') {
    const id = String(args.path).split(/[\\/]/).pop()!.replace(/\.md$/i, '').toLowerCase();
    const item = { id, name: id, kind: 'skill', description: '', source: { kind: 'folder', location: args.path } };
    library.push(item);
    return { ...item } as T;
  }
  if (command === 'capabilities_inventory') return { entries: [{ harness: 'claude', kind: 'mcp server', name: 'github', source: 'Claude Code settings' }, { harness: 'opencode', kind: 'mcp server', name: 'github', source: 'OpenCode config' }, { harness: 'claude', kind: 'plugin', name: 'superpowers@claude-plugins-official', source: '~/.claude/settings.json' }, { harness: 'claude', kind: 'plugin', name: 'ponytail@ponytail', source: '~/.claude/settings.json' }] } as T;
  if (command === 'list_projects') return [{ id: 'p1', name: 'pandacode', path: 'X:/AI-2/pandacode', addedOrder: 1 }, { id: 'pb1', name: 'Chief of Staff', path: 'C:/Bots/chief', addedOrder: 2 }, { id: 'pold', name: 'Hub check (delete me)', path: 'C:/Users/x/PandaCode Bots/hub-check', addedOrder: 3 }] as T;
  if (command === 'bot_project_ids') return ['pb1'] as T;
  if (command === 'hub_memory_list') return [
    { scope: 'Everywhere', path: 'C:/m/brand.md', name: 'hairjordan-brand', description: 'One brand file; never ask him for brand info', kind: 'reference', modified: now - 86_400_000 },
    { scope: 'X:\\AI-2', path: 'C:/m/no-telegram.md', name: 'no-telegram-no-multiple-choice', description: 'He does not use Telegram; ask in plain words', kind: 'feedback', modified: now - 3_600_000 },
    { scope: 'X:\\AI-2', path: 'C:/m/iphone.md', name: 'jordan-devices', description: 'iPhone 13 Pro', kind: 'user', modified: now - 7_200_000 },
  ] as T;
  if (command === 'hub_memory_read') return `---\nname: x\n---\nThe memory text for ${args.path}.` as T;
  if (command === 'bot_set_work_project') { const b = botById(args.botId); b.workProject = args.projectId ?? ''; return { ...b } as T; }
  if (command === 'bot_detail' || command.startsWith('bot_schedule_') || command === 'bot_run_schedule_now') return invokeBotSchedules(command, args) as T;
  if (!command.startsWith('hub_')) return invokeChats(command, args) as T;
  if (command === 'hub_org') return [
    { pid: 11, sessionId: 's1', title: 'Build the Hub', cwd: 'X:/AI-2', status: 'busy', startedMs: Date.now() - 3600000, lastWords: 'Copying SwarmClaw pages', log: 'X:/log.jsonl',
      helpers: [{ id: 'a1', description: 'Find skill files', agentType: 'Explore', model: 'haiku', state: 'working', lastWords: 'Found 8', updatedMs: Date.now(), log: 'X:/a1.jsonl' }] },
  ] as T;
  if (command === 'hub_running_now') {
    const facts: RunningNowFacts = {
      memory: { totalMb: 32604, freeMb: 14210 },
      gpu: w.__hubNoGpu ? null : { name: 'NVIDIA GeForce RTX 3070 Laptop GPU', totalMb: 8192, freeMb: 6011, tempC: 58, utilPct: 3 },
      processes: [
        { pid: 4120, name: 'llama-server.exe', commandLine: 'llama-server -m d1-2B.gguf --port 8092', startedMs: Date.now() - 28 * 60_000, memMb: 512, kind: 'llm-server', label: 'llama-server' },
        { pid: 7311, name: 'claude.exe', commandLine: 'claude', startedMs: Date.now() - 90 * 60_000, memMb: 420, kind: 'agent', label: 'claude' },
      ],
      // His tasks first, then by name, like hub.rs parse_schtasks_csv.
      tasks: tasks.map(t => ({ ...t })).sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
      tasksError: null,
      readAtMs: Date.now(),
    };
    return facts as T;
  }
  const task = tasks.find(t => t.path === args.path);
  if (!task) throw new Error(`No task ${args.path}`);
  if (command === 'hub_task_set_enabled') {
    task.enabled = Boolean(args.enabled);
    task.state = task.enabled ? 'Ready' : 'Disabled';
    return undefined as T;
  }
  if (command === 'hub_task_run_now') {
    task.lastRun = new Date().toLocaleString('en-US');
    return undefined as T;
  }
  throw new Error(`Unknown Hub command ${command}`);
}
