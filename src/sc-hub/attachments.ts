// Attachments in the Hub's chat box. Pictures go to the agent as pictures (PandaCode's
// import_prompt_image, at most 4 a message); any other file goes as its full path, which the
// agent opens itself because it runs on this PC.
type Call = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

/** A picture already handed to PandaCode: its "path" in SwarmClaw's chat store. */
export const IMAGE_PREFIX = 'pc-image:';
const MAX_IMAGES = 4;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

export interface HubFile { file: File; path: string; url: string }
interface Imported { id: string; name: string; thumbnail: string }

const baseName = (path: string) => path.split(/[\\/]/).pop() || path;

const picture = (imported: Imported, name: string): HubFile =>
  ({ file: new File([], name, { type: 'image/png' }), path: IMAGE_PREFIX + imported.id, url: imported.thumbnail });

/** "+": the Windows file picker; each chosen file ready to send. */
export async function pickFiles(call: Call): Promise<HubFile[]> {
  const chosen = await call<string | string[] | null>('plugin:dialog|open', { options: { multiple: true, title: 'Attach files' } });
  const paths = chosen == null ? [] : Array.isArray(chosen) ? chosen : [chosen];
  const out: HubFile[] = [];
  for (const path of paths) {
    if (IMAGE_EXT.test(path)) out.push(picture(await call<Imported>('import_prompt_image', { path }), baseName(path)));
    else out.push({ file: new File([], baseName(path)), path, url: '' });
  }
  return out;
}

/** A pasted or dropped picture (POST /api/upload). Other dropped files have no place on disk here. */
export async function uploadPicture(call: Call, file: Blob & { name?: string }) {
  if (!file.type.startsWith('image/')) throw new Error('Use the + button to attach this file, so the agent gets its place on disk.');
  const dataUrl = await new Promise<string>((ok, fail) => {
    const reader = new FileReader();
    reader.onload = () => ok(String(reader.result));
    reader.onerror = () => fail(new Error('Could not read the picture.'));
    reader.readAsDataURL(file);
  });
  const imported = await call<Imported>('import_prompt_image', { dataUrl, name: file.name || 'pasted.png' });
  return { path: IMAGE_PREFIX + imported.id, size: file.size, url: imported.thumbnail };
}

/** A reply as it should sound: code blocks, links and markdown signs left out. */
export const spoken = (text: string) => text
  .replace(/```[\s\S]*?```/g, ' (code left out) ')
  .replace(/`([^`]*)`/g, '$1')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/^\s*[#>|-]+\s*/gm, '')
  .replace(/[*_~]+/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** What a message carries: picture ids, and the text with other files' paths added. */
export function forSend(text: string, paths: string[]): { text: string; imageIds: string[] } {
  const imageIds = paths.filter(p => p.startsWith(IMAGE_PREFIX)).map(p => p.slice(IMAGE_PREFIX.length));
  if (imageIds.length > MAX_IMAGES) throw new Error(`Attach up to ${MAX_IMAGES} pictures per message.`);
  const files = paths.filter(p => p && !p.startsWith(IMAGE_PREFIX));
  const body = text === 'See attached file(s).' && files.length && !imageIds.length ? 'Please look at the attached files.' : text;
  return { imageIds, text: files.length ? `${body}\n\nAttached files (full paths on this PC):\n${files.map(f => `- ${f}`).join('\n')}` : body };
}
