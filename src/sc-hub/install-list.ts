// Jordan's link inbox ("X:\AI-2\inbox.txt"): links he dropped to be installed, then what got installed.
// Lines starting with # are notes for him; "=== DONE ===" splits waiting from done.
// Done lines: "date | link | what was installed | use: how to use it".

export interface Waiting { link: string; note: string }
export interface Installed { date: string; link: string; what: string; use: string }
export interface Inbox { waiting: Waiting[]; done: Installed[] }

export const INBOX_FILE = 'X:\\AI-2\\inbox.txt';

export function parseInbox(text: string): Inbox {
  const [waitingPart, donePart = ''] = text.replace(/\r\n/g, '\n').split(/^=== DONE ===\s*$/m);
  const lines = (s: string) => s.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const waiting = lines(waitingPart).map(l => {
    const [, link, note = ''] = l.match(/^(\S+)(?:\s+-\s+(.*))?$/) ?? [l, l];
    return { link, note: note.trim() };
  });
  const done = lines(donePart).map(l => {
    const [date = '', link = '', what = '', ...rest] = l.split(' | ').map(p => p.trim());
    return { date, link, what, use: rest.join(' | ').replace(/^use:\s*/, '') };
  }).reverse(); // newest first
  return { waiting, done };
}
