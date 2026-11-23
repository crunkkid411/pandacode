// The agent form's skill picks come from the Hub's catalog (every skill, slash command and agent
// file on this PC, keyed by file path). A bot stores PandaCode library names, so a pick is added
// to the library from its folder (or its single .md file) the first time, then referenced by name.
type Call = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

interface LibraryItem { id: string; kind: string; source: { location: string } }

let library: LibraryItem[] = [];
const NAME = /^[a-z0-9-]{1,64}$/;
const norm = (p: string) => p.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
/** A catalog SKILL.md stands for its folder; a slash command or agent file is imported as itself. */
const sourceOf = (catalogPath: string) => catalogPath.replace(/[\\/]SKILL\.md$/i, '');

export async function loadLibrary(call: Call): Promise<void> {
  library = await call<LibraryItem[]>('skills_list').catch(() => library);
}

/** The catalog ids (file paths) for a bot's library names, so the form shows them as picked. */
export function catalogIds(names: string[]): string[] {
  return names.map(name => {
    const location = library.find(i => i.id === name)?.source.location;
    if (!location) return name;
    return /\.md$/i.test(location) ? location : `${location}${location.includes('\\') ? '\\' : '/'}SKILL.md`;
  });
}

/** Library names for the picked catalog entries, adding any that are not in the library yet. */
export async function libraryNames(call: Call, ids: string[]): Promise<string[]> {
  await loadLibrary(call);
  const out: string[] = [];
  for (const id of ids) {
    if (NAME.test(id) && library.some(i => i.id === id)) { out.push(id); continue; }
    const source = sourceOf(id);
    const known = library.find(i => norm(i.source.location) === norm(source));
    if (known) { out.push(known.id); continue; }
    const made = await call<LibraryItem>('skills_import_folder', { path: source, kind: 'skill' });
    library.push(made);
    out.push(made.id);
  }
  return [...new Set(out)];
}
