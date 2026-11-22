// Browser preview of the Hub's backend (src-tauri/src/hub.rs), for page tests only.
// Every call is recorded in `window.__hubCalls`; `window.__hubNoGpu = true` makes the
// graphics card "not answer", like a crashed driver.
import type { RunningNowFacts, Task } from './hub/facts';
import type { Chat, ChatMessage } from './hub/chats-facts';

const tasks: Task[] = [
  { path: '\\Becky Playlist Scout (idle)', name: 'Becky Playlist Scout (idle)', enabled: true, state: 'Ready', lastRun: '11/22/2026 3:10:00 AM', lastResult: 0, nextRun: '11/22/2026 7:10:00 AM', action: 'wscript run-hidden.vbs', mine: true },
  { path: '\\Becky Stars Refresh', name: 'Becky Stars Refresh', enabled: true, state: 'Ready', lastRun: '11/22/2026 6:30:01 AM', lastResult: 1, nextRun: '11/23/2026 6:30:00 AM', action: 'powershell -File daily-run.ps1', mine: true },
  { path: '\\Agent Branch Sweep', name: 'Agent Branch Sweep', enabled: false, state: 'Disabled', lastRun: '11/21/2026 9:00:00 PM', lastResult: 0, nextRun: 'N/A', action: 'bash agent-check.sh', mine: true },
  { path: '\\MelancholyMonitor', name: 'MelancholyMonitor', enabled: true, state: 'Running', lastRun: '11/22/2026 6:40:00 AM', lastResult: 0x41301, nextRun: '11/22/2026 6:50:00 AM', action: 'wscript run-hidden.vbs', mine: true },
  { path: '\\AppleSoftwareUpdate', name: 'AppleSoftwareUpdate', enabled: true, state: 'Ready', lastRun: '11/21/2026 1:00:00 PM', lastResult: 0, nextRun: '11/28/2026 1:00:00 PM', action: 'SoftwareUpdate.exe', mine: false },
];

// Chats: PandaCode's own chat commands, as the Hub window calls them.
const now = Date.now();
const chats: Chat[] = [
  { id: 'c1', title: 'Fix the playlist scout', provider: 'claude', model: 'default', status: 'idle', archived: false, createdAt: now - 9e6, updatedAt: now - 9e6, lastResponseAt: now - 3_600_000 },
  { id: 'c2', title: 'Write the shorts captions', provider: 'opencode', model: 'deepseek', status: 'running', archived: false, createdAt: now - 8e6, updatedAt: now - 8e6, lastResponseAt: now - 60_000 },
  { id: 'c3', title: 'Old archived chat', provider: 'claude', model: 'default', status: 'idle', archived: true, createdAt: now - 9e7, updatedAt: now - 9e7, lastResponseAt: now - 9e7 },
];
const messages: Record<string, ChatMessage[]> = {
  c1: [{ id: 1, role: 'user', content: 'Why did the scout run hot?', createdAt: now - 3_700_000 }, { id: 2, role: 'assistant', content: 'It ran Qwen3.5-4B on the graphics card.', createdAt: now - 3_600_000 }],
  c2: [{ id: 3, role: 'user', content: 'Caption the new short', createdAt: now - 70_000 }],
};
let nextId = 100;

function invokeChats(command: string, args: Record<string, any>): unknown {
  const w = window as any;
  switch (command) {
    case 'list_sessions': return chats.map(c => ({ ...c }));
    case 'list_providers': return [{ id: 'claude', name: 'Claude Code', installed: true }, { id: 'opencode', name: 'OpenCode', installed: true }, { id: 'cursor', name: 'Cursor', installed: false }];
    case 'get_messages': return { messages: (messages[args.sessionId] ?? []).map(m => ({ ...m })), hasOlder: false };
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
      // The agent answers after a moment, unless a test holds it running.
      if (!w.__hubHoldRunning) setTimeout(() => { messages[c.id].push({ id: nextId++, role: 'assistant', content: `Done: ${args.text}`, createdAt: Date.now() }); c.status = 'idle'; c.lastResponseAt = Date.now(); }, 300);
      return undefined;
    }
    case 'stop_session': {
      const c = chats.find(x => x.id === args.sessionId);
      if (c) c.status = 'interrupted';
      return undefined;
    }
  }
  throw new Error(`Unknown Hub command ${command}`);
}

export function invokeHub<T>(command: string, args: Record<string, any>): T {
  const w = window as any;
  (w.__hubCalls ??= []).push({ command, args });
  if (!command.startsWith('hub_')) return invokeChats(command, args) as T;
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
