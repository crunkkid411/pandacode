// Skills page facts: filtering Jordan's skill catalog (src-tauri/src/hub_skills.rs).

export interface Skill { kind: 'skill' | 'command' | 'agent' | 'tools' | string; name: string; description: string; places: string[]; path: string; ours: boolean }
export type KindFilter = 'all' | 'skill' | 'command' | 'agent' | 'tools';

/** Skills matching every word typed (name, description or where it lives), made-for-you first. */
export function filterSkills(all: Skill[], query: string, kind: KindFilter, oursOnly: boolean): Skill[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return all
    .filter(s => (kind === 'all' || s.kind === kind) && (!oursOnly || s.ours))
    .filter(s => { const hay = `${s.name} ${s.description} ${s.places.join(' ')}`.toLowerCase(); return words.every(w => hay.includes(w)); })
    .sort((a, b) => Number(b.ours) - Number(a.ours) || a.name.localeCompare(b.name));
}

/** "ON" / "OFF" if the catalog says so for any harness, else null (always available). */
export function switchState(s: Skill): 'on' | 'off' | null {
  const text = s.places.join(' ');
  if (/\bON\b/.test(text)) return 'on';
  if (/\bOFF\b/.test(text)) return 'off';
  return null;
}
