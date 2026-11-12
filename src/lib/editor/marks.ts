/**
 * Layer marks: favourites and colour tags a creator puts on layers to find them again. They are
 * saved with the project (in this browser) and never exported into the theme.
 */

export const TAG_COLORS = {
  red: '#ef5b5b',
  orange: '#f59e0b',
  yellow: '#facc15',
  green: '#3dbb7a',
  blue: '#38bdf8',
  violet: '#a78bfa',
  pink: '#f472b6',
  gray: '#8b8b94',
} as const;
export type TagColor = keyof typeof TAG_COLORS;

export interface LayerMark {
  fav?: boolean;
  color?: TagColor;
}

export type Marks = Record<string, LayerMark>;

/** Marks are per screen: the same layer id on two screens is two layers. */
export const markKey = (screenId: string, nodeId: string) => `${screenId}|${nodeId}`;

export function setMark(marks: Marks | undefined, key: string, change: Partial<LayerMark>): Marks {
  const next = { ...(marks ?? {}) };
  const m = { ...(next[key] ?? {}), ...change };
  if (!m.fav) delete m.fav;
  if (!m.color) delete m.color;
  if (Object.keys(m).length) next[key] = m;
  else delete next[key];
  return next;
}

/** Marks of one screen, by node id. */
export function marksOf(marks: Marks | undefined, screenId: string): Map<string, LayerMark> {
  const out = new Map<string, LayerMark>();
  const prefix = `${screenId}|`;
  for (const [k, v] of Object.entries(marks ?? {})) if (k.startsWith(prefix)) out.set(k.slice(prefix.length), v);
  return out;
}
