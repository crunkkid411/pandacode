// Jordan's job list ("X:\AI-2\JOBS.md") on the Task Board, next to PandaCode's own tasks.
// The file stays the source of truth: the board never edits it. A job card can only be handed to
// an agent, which turns it into a normal PandaCode task that names the job (and the job card then
// steps aside for that task). JOBS.md's own rule: NEEDS_DECISIONS jobs are Jordan's to decide
// ("don't build, don't choose"), so those cards can't be started.
import type { BoardTask, BoardTaskStatus } from '../sc/types';

type Call = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export const JOBS_FILE = 'X:\\AI-2\\JOBS.md';
export const JOB_PREFIX = 'job:';
type Kind = 'ready' | 'decide' | 'idea' | 'done';
export interface Job { id: string; title: string; label: string; kind: Kind; body: string }

/** What a label means: DONE, NEEDS_DECISIONS, CONCEPT_ONLY / LATER, or work that is ready. */
export function kindOf(label: string): Kind {
  const l = label.toUpperCase();
  if (/^DONE\b/.test(l)) return 'done';
  if (l.includes('NEEDS_DECISION')) return 'decide';
  if (l.includes('CONCEPT') || /^LATER\b/.test(l)) return 'idea';
  return 'ready';
}

/** Every job: the index table gives the current label (it is kept up to date), the "## Jnn." sections the full text. */
export function parseJobs(text: string): Job[] {
  const lines = text.split('\n');
  const index = new Map<string, { label: string; line: string }>();
  const order: string[] = [];
  let inIndex = false;
  for (const line of lines) {
    if (/^## Index\b/.test(line)) { inIndex = true; continue; }
    if (inIndex && /^#{1,2} /.test(line)) break;
    const row = inIndex && line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/);
    if (!row || row[1] === 'Job' || /^-+$/.test(row[1])) continue;
    index.set(row[1], { label: row[2], line: row[3] });
    order.push(row[1]);
  }
  const sections = new Map<string, { title: string; label: string; body: string }>();
  let group = '', current: { id: string; title: string; label: string; body: string[] } | null = null;
  const close = () => { if (current) sections.set(current.id, { title: current.title, label: current.label, body: current.body.join('\n').trim() }); current = null; };
  for (const line of lines) {
    const top = line.match(/^# (.+)/);
    if (top) { close(); group = top[1].split(' ')[0]; continue; }
    const head = line.match(/^## (J\d+)\. (.+?)(?: \(([^)]*)\))?\s*$/);
    if (head) { close(); current = { id: head[1], title: head[2], label: head[3] ?? group, body: [] }; continue; }
    if (/^## /.test(line)) { close(); continue; }
    current?.body.push(line);
  }
  close();
  const ids = [...order, ...[...sections.keys()].filter(id => !index.has(id))];
  return ids.map(id => {
    const row = index.get(id), sec = sections.get(id);
    const label = (row?.label ?? sec?.label ?? '').trim();
    return {
      id, label, kind: kindOf(label),
      title: sec?.title ?? (row?.line ?? id).replace(/\*\*/g, '').split(/(?<=[.:])\s/)[0].slice(0, 120),
      body: sec?.body || row?.line || '',
    };
  });
}

const STATUS: Record<Kind, BoardTaskStatus> = { ready: 'backlog', decide: 'backlog', idea: 'archived', done: 'archived' };
const TAG: Record<Kind, string> = { ready: '', decide: 'Needs your decision', idea: 'Idea', done: 'Done' };
/** The short label for the card ("PART DONE", "READY after J10"), without the who-and-when part. */
const shortLabel = (label: string) => label.replace(/\s*\(.*$/, '').trim();

export function jobCard(job: Job, position: number): BoardTask {
  const tag = TAG[job.kind] || shortLabel(job.label) || 'READY';
  return {
    id: JOB_PREFIX + job.id, title: `${job.id}. ${job.title}`, description: job.body, status: STATUS[job.kind],
    agentId: '', sessionId: null, error: null, tags: ['JOBS.md', tag],
    // ponytail: no real dates in the file; a falling number keeps the board in the file's build order.
    createdAt: 1_000_000 - position, updatedAt: 1_000_000 - position, startedAt: null, completedAt: null,
  } as BoardTask;
}

/** Job cards for the board, minus jobs already handed to an agent (a task titled "Jnn. ..."). */
export async function jobBoardTasks(call: Call, taken: string[], includeArchived: boolean): Promise<Record<string, BoardTask>> {
  const started = new Set(taken.map(t => t.match(/^(J\d+)\. /)?.[1]).filter(Boolean));
  const out: Record<string, BoardTask> = {};
  parseJobs(await call<string>('hub_read_list', { name: 'jobs' })).forEach((job, i) => {
    if (started.has(job.id)) return;
    const card = jobCard(job, i);
    if (includeArchived || card.status !== 'archived') out[card.id] = card;
  });
  return out;
}

/** Handing a job to an agent (or dragging it to Running) makes it a PandaCode task that names the job. */
export async function startJob(call: Call, cardId: string, patch: Partial<BoardTask>,
  createBoardTask: (call: Call, data: Partial<BoardTask>) => Promise<BoardTask>): Promise<BoardTask> {
  const id = cardId.slice(JOB_PREFIX.length);
  const job = parseJobs(await call<string>('hub_read_list', { name: 'jobs' })).find(j => j.id === id);
  if (!job) throw new Error(`${id} is no longer in ${JOBS_FILE}.`);
  const wantsWork = patch.agentId || patch.status === 'running' || patch.status === 'queued';
  if (!wantsWork || patch.title !== undefined || patch.description !== undefined) {
    throw new Error(`Jobs live in ${JOBS_FILE}; change the job there. Here you can hand it to an agent.`);
  }
  if (job.kind === 'decide') throw new Error(`${id} waits for your decision (JOBS.md: "don't build, don't choose").`);
  if (job.kind === 'done') throw new Error(`${id} is already done.`);
  const description = `Job ${id} from ${JOBS_FILE} (label: ${job.label}). Read that job in the file first and follow the file's "How to use this file" steps; below is a copy.\n\n${job.body}`;
  return createBoardTask(call, { title: `${id}. ${job.title}`, description, agentId: patch.agentId, status: patch.status });
}
