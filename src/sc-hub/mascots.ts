// Agent faces: a little creature per agent (murmur / invisible_dots / Rakazo style, drawn as SVG).
// Claude Code agents are Clawd, Claude Code's own pixel mascot (Jordan, 2026-11-23: "Claw'd the mascot,
// not the company logo"). Other harnesses are a soft blob in their logo's outline and brand color;
// logos with a hole (OpenRouter's "O", Liquid AI's drop) show the face in that hole. Face style and shade
// make each agent its own, and it holds a tool when its role clearly calls for one. A bot's own color
// (PandaCode's bot settings) replaces the brand color.
//
// AgentAvatar draws any seed that starts with "mascot|" (see mascotSeed); bots get one in bot-agents.ts.

export interface Harness { name: string; color: string; mark: string }

const INK = '#1b1622';
const LIGHT = '#fffaf5';

/** Brand colors and marks. Change a color here and every agent of that harness follows. */
export const HARNESSES: Record<string, Harness> = {
  claude: { name: 'Claude Code', color: '#e2774a', mark: 'clawd' },
  // Colors and shapes checked on the companies' own sites, 2026-11-23.
  openrouter: { name: 'OpenRouter', color: '#c8ff00', mark: 'ring' },
  liquid: { name: 'Liquid AI', color: '#7b3aed', mark: 'drop' },
  codex: { name: 'Codex', color: '#eceef2', mark: 'knot' },
  gemini: { name: 'Gemini CLI', color: '#6f86f6', mark: 'sparkle' },
  qwen: { name: 'Qwen Code', color: '#7b5cff', mark: 'hexagon' },
  opencode: { name: 'OpenCode', color: '#a7b2c4', mark: 'brackets' },
  hermes: { name: 'Hermes', color: '#e8b931', mark: 'wings' },
  deepseek: { name: 'DeepSeek', color: '#4d6bfe', mark: 'tail' },
  cursor: { name: 'Cursor', color: '#3a3a46', mark: 'cube' },
  copilot: { name: 'GitHub Copilot', color: '#a371f7', mark: 'goggles' },
  muse: { name: 'Muse', color: '#0866ff', mark: 'infinity' },
  kimi: { name: 'Kimi', color: '#2fb5a6', mark: 'sparkle' },
  grok: { name: 'Grok', color: '#9aa0a6', mark: 'slash' },
};

/** Expressions, picked per agent (or by the bot's chosen face, panda:N). */
export const FACES = ['Calm', 'Happy', 'Wink', 'Sleepy', 'Glasses', 'Grumpy'] as const;

/** What an agent holds, matched on its name and role. No match = empty hands. */
const TOOLS: [string, RegExp][] = [
  ['clipboard', /\b(chief|coordinat|manag|lead|boss|orchestrat|staff|director)/i],
  ['clapper', /\b(video|clip|film|edit|short|stream|footage|vegas)/i],
  ['bug', /\b(review|test|qa|bug|debug|audit)/i],
  ['code', /\b(code|coder|coding|dev|engineer|build|program|fix)/i],
  ['magnifier', /\b(research|scout|search|find|monitor|watch|investigat|analy)/i],
  ['envelope', /\b(inbox|mail|email|triage|sort|message)/i],
  ['calendar', /\b(schedul|standup|calendar|plan|daily|week)/i],
  ['pencil', /\b(writ|script|caption|note|release|draft|blog|copy)/i],
  ['note', /\b(music|audio|song|sound|voice|cubase|beat)/i],
];

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Mixes a #rrggbb color toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = amount > 0 ? 255 : 0;
  const a = Math.min(1, Math.abs(amount));
  const mix = (v: number) => Math.round(v + (to - v) * a).toString(16).padStart(2, '0');
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}
const luma = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000; };

export const toolFor = (text: string, coordinator = false): string =>
  coordinator ? 'clipboard' : TOOLS.find(([, re]) => re.test(text))?.[0] ?? '';

/** The color an agent shows in: its own bot color, else its harness's brand color, nudged per agent. */
export function agentColor(harness: string, id: string, own = ''): string {
  if (/^#[0-9a-f]{6}$/i.test(own)) return own.toLowerCase();
  const base = HARNESSES[harness]?.color ?? `#${(hash(harness) & 0x7f7f7f | 0x404040).toString(16).padStart(6, '0')}`;
  return shade(base, ((hash(id) % 13) - 4) / 100); // ponytail: -4%..+8% so two Claude agents differ a little but stay on-brand
}

/** Whose face an agent wears: its model's company when that has one (Liquid's LFM models, anything
 *  through OpenRouter), else its harness. */
export function mascotKind(provider: string, model = ''): string {
  if (provider === 'openrouter' || /^openrouter[/:]/i.test(model)) return 'openrouter';
  if (/\b(lfm|liquid)/i.test(model)) return 'liquid';
  return provider;
}

/** "mascot|harness|#color|face|tool" — what AgentAvatar's seed carries. */
export function mascotSeed(harness: string, id: string, ownColor: string, face: number | null, tool: string): string {
  const f = face ?? hash(id) % FACES.length;
  return ['mascot', harness, agentColor(harness, id, ownColor), String(f % FACES.length), tool].join('|');
}

function face(index: number, ink = INK): string {
  const eye = (x: number) => `<ellipse cx="${x}" cy="29" rx="3" ry="4.3" fill="${ink}"/><circle cx="${x + 1}" cy="27.4" r="1.1" fill="${ink === INK ? '#fff' : INK}"/>`;
  const arc = (x: number) => `<path d="M${x - 3.2} 30q3.2-4 6.4 0" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
  switch (FACES[index]) {
    case 'Happy': return arc(25) + arc(39);
    case 'Wink': return eye(25) + arc(39);
    case 'Sleepy': return `<path d="M21.8 28h6.4a3.2 3.2 0 0 1-6.4 0zM35.8 28h6.4a3.2 3.2 0 0 1-6.4 0z" fill="${ink}"/>`;
    case 'Glasses': return eye(25) + eye(39) + `<g fill="none" stroke="${ink}" stroke-width="1.6"><circle cx="25" cy="29" r="5.6"/><circle cx="39" cy="29" r="5.6"/><path d="M30.6 28.6h2.8"/></g>`;
    case 'Grumpy': return eye(25) + eye(39) + `<path d="M20.5 21.8l7.5 2.4M43.5 21.8l-7.5 2.4" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
    default: return eye(25) + eye(39);
  }
}

/** Clawd's pixel eyes, one per face (from Jordan's photos: bars, ^ ^, wink, sleepy, pixel shades, > <). */
function clawdFace(index: number): string {
  const px = (cells: [number, number][], x0: number, y0 = 20) => cells.map(([x, y]) => `<rect x="${x0 + x * 3}" y="${y0 + y * 3}" width="3" height="3"/>`).join('');
  const bar = (x: number) => `<rect x="${x}" y="20" width="4.5" height="10"/>`;
  const up: [number, number][] = [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]];
  const flat = (x: number) => `<rect x="${x}" y="25" width="9" height="3"/>`;
  const right: [number, number][] = [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]]; // ">"
  const left: [number, number][] = [[2, 0], [1, 1], [0, 2], [1, 3], [2, 4]]; // "<"
  switch (FACES[index]) {
    case 'Happy': return px(up, 15, 22) + px(up, 34, 22);
    case 'Wink': return bar(21) + flat(35.5);
    case 'Sleepy': return flat(18) + flat(37);
    case 'Glasses': // "deal with it" shades: a black band with white pixel glints
      return `<rect x="15" y="21" width="34" height="3"/><rect x="17" y="24" width="12" height="3"/><rect x="19" y="27" width="8" height="2"/>`
        + `<rect x="35" y="24" width="12" height="3"/><rect x="37" y="27" width="8" height="2"/>`
        + `<g fill="#fff"><rect x="20" y="24" width="2" height="2"/><rect x="22" y="26" width="2" height="2"/><rect x="38" y="24" width="2" height="2"/><rect x="40" y="26" width="2" height="2"/></g>`;
    case 'Grumpy': return px(right, 19) + px(left, 36);
    default: return bar(20.5) + bar(39);
  }
}

/** Clawd: a flat orange block with arm nubs and four short legs, drawn pixel-crisp. */
function clawd(color: string, faceNo: number, held: string): string {
  const side = shade(color, -0.16), top = shade(color, 0.14), legs = shade(color, -0.08);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges">`
    + `<g fill="${legs}"><rect x="15" y="43" width="4" height="12"/><rect x="21" y="43" width="4" height="12"/><rect x="39" y="43" width="4" height="12"/><rect x="45" y="43" width="4" height="12"/></g>`
    + `<rect x="5" y="27" width="8" height="8" fill="${side}"/><rect x="51" y="27" width="8" height="8" fill="${side}"/>`
    + `<rect x="11" y="13" width="42" height="32" fill="${color}"/>`
    + `<rect x="11" y="13" width="42" height="3" fill="${top}"/><rect x="50" y="16" width="3" height="29" fill="${side}" opacity=".55"/>`
    + `<g fill="${INK}">${clawdFace(faceNo)}</g>`
    // A held tool sits a little higher: Clawd's body ends where his legs start.
    + (held ? `<g shape-rendering="auto" transform="translate(0 -5)">${tool(held)}</g>` : '')
    + `</svg>`;
}

function mark(kind: string, ink: string): string {
  switch (kind) {
    case 'starburst': return `<g stroke="${ink}" stroke-width="1.9" stroke-linecap="round">${[0, 45, 90, 135].map(a => `<path d="M32 10.2v9.6" transform="rotate(${a} 32 15)"/>`).join('')}</g>`;
    case 'knot': return `<g fill="none" stroke="${ink}" stroke-width="1.5">${[0, 60, 120].map(a => `<ellipse cx="32" cy="15" rx="5.2" ry="2.3" transform="rotate(${a} 32 15)"/>`).join('')}</g>`;
    case 'sparkle': return `<path d="M32 9c.8 4 2 5.2 6 6-4 .8-5.2 2-6 6-.8-4-2-5.2-6-6 4-.8 5.2-2 6-6z" fill="${ink}"/>`;
    case 'hexagon': return `<path d="M32 10l4.8 2.6v5.2L32 20.4l-4.8-2.6v-5.2z" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/>`;
    case 'brackets': return `<path d="M29 10.5h-2.5v9H29M35 10.5h2.5v9H35" fill="none" stroke="${ink}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'wings': { const wing = 'M11.6 26c-2.6-3.6-6.4-5.4-9.4-5 1 .8 1.6 1.6 1.8 2.4-1.2.2-2.1.8-2.6 1.8 1.4 0 2.4.4 3 1-.8.6-1.2 1.4-1.2 2.4 2.8-.4 5.8-1.2 8.4-2.6z';
      return `<path d="${wing}" fill="${LIGHT}"/><path d="${wing}" fill="${LIGHT}" transform="translate(64 0) scale(-1 1)"/>`; }
    case 'tail': return `<path d="M32 12.5c-1.2-3.2-4.2-4.6-7.6-4.4 2.2 2 3.6 4 7.6 5.6 4-1.6 5.4-3.6 7.6-5.6-3.4-.2-6.4 1.2-7.6 4.4z" fill="${ink}"/>`;
    case 'cube': return `<g fill="none" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"><path d="M32 9.5l5.2 3v6L32 21.5l-5.2-3v-6z"/><path d="M26.8 12.5L32 15.5l5.2-3M32 15.5v6"/></g>`;
    case 'infinity': return `<path d="M26.5 15c0-3.2 4-3.2 5.5 0s5.5 3.2 5.5 0-4-3.2-5.5 0-5.5 3.2-5.5 0z" fill="none" stroke="${ink}" stroke-width="1.8"/>`;
    case 'slash': return `<path d="M35 10l-6 10" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
    default: return '';
  }
}

function tool(kind: string): string {
  const paper = '#fbfbfd', line = '#9aa3b5';
  switch (kind) {
    case 'clipboard': return `<rect x="22" y="37" width="20" height="18" rx="2.2" fill="#c49a6c"/><rect x="24.5" y="40" width="15" height="13" rx="1" fill="${paper}"/><rect x="28" y="35.4" width="8" height="4" rx="1.2" fill="#7d8592"/><path d="M27 44h10M27 47h10M27 50h6" stroke="${line}" stroke-width="1.3" stroke-linecap="round"/>`;
    case 'code': return `<rect x="21" y="38" width="22" height="16" rx="2.6" fill="${paper}"/><path d="M28 43l-3 3 3 3M36 43l3 3-3 3M33.4 42.4l-2.8 7.2" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'bug': return `<rect x="21" y="38" width="22" height="16" rx="2.6" fill="${paper}"/><g stroke="${INK}" stroke-width="1.2" stroke-linecap="round"><path d="M28.6 44.5h-2M35.4 44.5h2M28.6 47.5h-2M35.4 47.5h2M28.8 50.2l-1.8 1.4M35.2 50.2l1.8 1.4"/></g><ellipse cx="32" cy="47.2" rx="3.2" ry="3.9" fill="${INK}"/><circle cx="32" cy="42.4" r="1.9" fill="${INK}"/>`;
    case 'magnifier': return `<path d="M35.5 48.5L42 55" stroke="#6b4f3a" stroke-width="3.4" stroke-linecap="round"/><circle cx="30" cy="44" r="6.4" fill="#d8ecff" stroke="#5b6270" stroke-width="2.4"/><path d="M27 41.6a3.6 3.6 0 0 1 3-1.6" stroke="#fff" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
    case 'envelope': return `<rect x="21" y="40" width="22" height="14" rx="2" fill="${paper}"/><path d="M21.6 41l10.4 7.4L42.4 41" fill="none" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"/>`;
    case 'calendar': return `<rect x="22" y="39" width="20" height="16" rx="2.2" fill="${paper}"/><path d="M22 41.2a2.2 2.2 0 0 1 2.2-2.2h15.6a2.2 2.2 0 0 1 2.2 2.2V43H22z" fill="#ef4444"/><path d="M27 37.4v3.4M37 37.4v3.4" stroke="#5b6270" stroke-width="1.6" stroke-linecap="round"/><g fill="${line}"><circle cx="27" cy="47" r="1.1"/><circle cx="32" cy="47" r="1.1"/><circle cx="37" cy="47" r="1.1"/><circle cx="27" cy="51" r="1.1"/><circle cx="32" cy="51" r="1.1"/></g>`;
    case 'pencil': return `<rect x="21" y="40" width="20" height="14" rx="1.6" fill="${paper}"/><path d="M24.5 44h9M24.5 47.5h7" stroke="${line}" stroke-width="1.3" stroke-linecap="round"/><path d="M30 53l11-12" stroke="#f5b83d" stroke-width="3.6" stroke-linecap="round"/><path d="M28.6 54.6l1.4-1.6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
    case 'clapper': return `<rect x="21" y="42" width="22" height="12.5" rx="1.6" fill="#2b2b35"/><rect x="21" y="37.2" width="22" height="4.6" rx="1" fill="${paper}"/><path d="M24 37.2l-2.2 4.6M29.5 37.2l-2.2 4.6M35 37.2l-2.2 4.6M40.5 37.2l-2.2 4.6" stroke="#2b2b35" stroke-width="2"/><path d="M25 47.5h14M25 50.5h9" stroke="#8b90a0" stroke-width="1.2" stroke-linecap="round"/>`;
    case 'note': return `<rect x="21" y="38" width="22" height="16" rx="2.6" fill="${paper}"/><path d="M33.5 49.5v-8l4 1.2" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="31.4" cy="49.8" r="2.2" fill="${INK}"/>`;
    default: return '';
  }
}

const BODY = 'M32 7C18.5 7 11 18 11 32v16c0 5.5 3.5 8 8 8h26c4.5 0 8-2.5 8-8V32C53 18 45.5 7 32 7z';

const xy = (r: number, a: number, cx = 32, cy = 31) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
/** A star or flower: points around the middle, alternating an outer and an inner radius. */
const ring = (n: number, outer: number, inner: number, turn = 0) =>
  `M${Array.from({ length: n * 2 }, (_, i) => xy(i % 2 ? inner : outer, (Math.PI * i) / n + turn - Math.PI / 2)).join('L')}z`;
/** A regular polygon (n corners, the first one at the top unless turned). */
const poly = (n: number, r: number, turn = 0) =>
  `M${Array.from({ length: n }, (_, i) => xy(r, (2 * Math.PI * i) / n + turn - Math.PI / 2)).join('L')}z`;

/** Each body follows its logo's outline; a thick round edge ("round") keeps it a soft blob. Others: the plain blob.
 *  `at` places a logo drawn in its own units; `hole` is the logo's hole (cx, cy, r in the 64 box), where the face goes. */
interface Shape { d: string; round: number; at?: string; hole?: [number, number, number] }
const SHAPES: Record<string, Shape> = {
  // OpenRouter's mark (outer outline, from openrouter.ai's header): an "O" with an "R" leg.
  openrouter: {
    d: 'M303.9475,17.19926c42.79734,0,77.48933,34.69327,77.48933,77.48933s-34.69199,77.48933-77.48933,77.48933l76.86166,76.86244c9.76367,9.76313,2.84903,26.45667-10.95697,26.45667h-220.88335c-71.32686,0-129.14889-57.82202-129.14889-129.14889S77.64197,17.19926,148.96884,17.19926h154.97866Z',
    round: 0, at: 'translate(5 12) scale(.147) translate(-19.82 -17.2)', hole: [24, 31, 11.4],
  },
  // Liquid AI's mark (liquid.ai/logos): three pieces round a drop-shaped hole.
  liquid: {
    d: 'M386.801 319.037L386.474 319.22L503.32 515.258C518.989 538.504 528.132 566.18 528.132 595.93C528.132 624.104 519.97 650.452 505.782 672.918L743.865 598.585L371.425 0L281.732 144.536L386.801 319.037Z'
      + 'M186.582 895.985L373.628 744.663C373.473 744.663 373.301 744.663 373.146 744.663C287.552 744.663 218.178 678.078 218.178 595.946C218.178 566.279 227.27 538.669 242.87 515.457L353.396 329.673L261.535 177.106L0 598.601L186.272 895.985H186.582Z'
      + 'M452.697 723.591C452.697 723.591 452.68 723.591 452.662 723.607L239.977 895.985H555.596L715.557 643.301L452.697 723.607V723.591Z',
    round: 0, at: 'translate(10.4 4) scale(.0583)', hole: [32.1, 38.7, 8.6],
  },
  codex: { d: ring(6, 23.5, 15, Math.PI / 6), round: 11 }, // OpenAI's six-lobed knot
  gemini: { d: ring(4, 26, 12), round: 9 }, // Gemini's four-point sparkle
  qwen: { d: poly(6, 24, Math.PI / 6), round: 9 }, // Qwen's hexagon
  cursor: { d: poly(6, 25), round: 6 }, // Cursor's cube
  opencode: { d: 'M15 11H49V53H15z', round: 10 }, // OpenCode's terminal square
  deepseek: { d: 'M9 37a23 18.5 0 1 0 46 0a23 18.5 0 1 0-46 0zM42 21L49 9.5L56 16z', round: 6 }, // DeepSeek's whale
  copilot: { d: 'M14 18H50V51H14zM6 27a6 6 0 1 0 12 0a6 6 0 1 0-12 0zM46 27a6 6 0 1 0 12 0a6 6 0 1 0-12 0z', round: 8 }, // Copilot's goggled head
  muse: { d: 'M8 30a13 13 0 1 0 26 0a13 13 0 1 0-26 0zM30 30a13 13 0 1 0 26 0a13 13 0 1 0-26 0zM15 36H49V51H15z', round: 5 }, // Meta's infinity loop
};
/** Harnesses whose body already is their logo; the rest wear their mark on the forehead. */
const shapeIsMark = (harness: string) => !!SHAPES[harness] && harness !== 'opencode';

/** The mascot for a seed from mascotSeed, as an SVG document; '' when the seed is not a mascot. */
export function mascotSvg(seed: string): string {
  const [kind, harness, color, faceIndex, held] = seed.split('|');
  if (kind !== 'mascot' || !/^#[0-9a-f]{6}$/i.test(color ?? '')) return '';
  const h = HARNESSES[harness];
  if (harness === 'claude') return clawd(color, Number(faceIndex) || 0, tool(held ?? '') ? held : '');
  const dark = luma(color) < 110;
  const ink = dark ? LIGHT : (h?.mark === 'knot' || h?.mark === 'brackets' ? INK : LIGHT);
  const markKind = h?.mark === 'goggles' || shapeIsMark(harness) ? '' : h?.mark ?? '';
  const s: Shape = SHAPES[harness] ?? { d: BODY, round: 0 };
  const body = (fill: string) => `<path d="${s.d}" fill="${fill}"${s.at ? ` transform="${s.at}"` : ''}${s.round ? ` stroke="${fill}" stroke-width="${s.round}" stroke-linejoin="round"` : ''}/>`;
  // Cursor's cube: a lighter top face and the edges, faintly.
  const cube = harness === 'cursor'
    ? `<path d="M32 6L53.7 18.5L32 31L10.3 18.5z" fill="${shade(color, 0.16)}" stroke="${shade(color, 0.16)}" stroke-width="5" stroke-linejoin="round" opacity=".7"/><path d="M32 31V56M32 31L53.7 18.5M32 31L10.3 18.5" stroke="${shade(color, 0.3)}" stroke-width="1.4" opacity=".5"/>`
    : '';
  const faceNo = h?.mark === 'goggles' ? FACES.indexOf('Glasses') : Number(faceIndex) || 0;
  const hole = s.hole;
  // In a hole logo the face sits in the hole, light on dark, and a held tool moves aside so the face shows.
  const shownFace = hole
    ? `<circle cx="${hole[0]}" cy="${hole[1]}" r="${hole[2]}" fill="${INK}"/><circle cx="${hole[0]}" cy="${hole[1]}" r="${hole[2] - 0.6}" fill="none" stroke="${shade(color, -0.3)}" stroke-width="1.2"/>`
      + `<g transform="translate(${hole[0]} ${hole[1] - 0.6}) scale(${(hole[2] / 17.5).toFixed(3)}) translate(-32 -29)">${face(faceNo, LIGHT)}</g>`
    : face(faceNo);
  const toolAt = harness === 'openrouter' ? 'translate(45 41) scale(.78) translate(-32 -46)' : harness === 'liquid' ? 'translate(46 49) scale(.62) translate(-32 -46)' : '';
  const t = tool(held ?? '') && toolAt ? `<g transform="${toolAt}">${tool(held ?? '')}</g>` : tool(held ?? '');
  const hands = t && !hole ? `<circle cx="19.6" cy="47" r="3.8" fill="${shade(color, -0.12)}"/><circle cx="44.4" cy="47" r="3.8" fill="${shade(color, -0.12)}"/>` : '';
  const feetY = harness === 'openrouter' ? 50.5 : 56.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
    + `<defs><radialGradient id="hi" cx="34%" cy="24%" r="72%"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="lo" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-opacity="0"/><stop offset="1" stop-opacity=".28"/></linearGradient></defs>`
    + `<ellipse cx="23" cy="${feetY}" rx="4.4" ry="2.6" fill="${shade(color, -0.25)}"/><ellipse cx="41" cy="${feetY}" rx="4.4" ry="2.6" fill="${shade(color, -0.25)}"/>`
    // A dark body gets a faint light rim so it shows on the dark window.
    + (luma(color) < 70 && !s.at ? `<path d="${s.d}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="${s.round + 2.4}" stroke-linejoin="round"/>` : '')
    // Light and shade are painted through a mask of the body, so the round edge and the fill never double up.
    + `<mask id="m">${body('#fff')}</mask>`
    + body(color) + `<rect width="64" height="64" fill="url(#hi)" mask="url(#m)"/><rect width="64" height="64" fill="url(#lo)" mask="url(#m)"/>` + cube
    + mark(markKind, ink)
    // Dark bodies get eye whites, or the eyes vanish.
    + (luma(color) < 80 && !hole ? `<ellipse cx="25" cy="29" rx="4.6" ry="5.8" fill="${LIGHT}"/><ellipse cx="39" cy="29" rx="4.6" ry="5.8" fill="${LIGHT}"/>` : '')
    + shownFace
    + (hole ? '' : `<ellipse cx="19.5" cy="35.5" rx="2.6" ry="1.6" fill="#ff6f8e" opacity=".35"/><ellipse cx="44.5" cy="35.5" rx="2.6" ry="1.6" fill="#ff6f8e" opacity=".35"/>`)
    + t + hands
    + `</svg>`;
}

/** The agent's color from its mascot seed, as the --agent-color style its chat is drawn in (globals.css .bubble-user). */
export function agentColorStyle(seed?: string | null): Record<string, string> | undefined {
  const color = seed?.startsWith('mascot|') ? seed.split('|')[2] : '';
  return color ? { '--agent-color': color } : undefined;
}
