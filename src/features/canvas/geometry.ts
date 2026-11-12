import { isComponent, type Scene, type SceneNode } from '../../lib/render/scene';
import { bounds, mul, quad, IDENTITY, type Mat } from '../../lib/render/matrix';
import { paneNotes, type PaneNote } from '../../lib/layout/limits';
import { paneKey, type LayoutPatch } from '../../lib/layout/patch';

export type Box = { x: number; y: number; w: number; h: number };
export type Pt = [number, number];

/**
 * What outline colours and line styles mean, everywhere in the editor (canvas, Layers, legend).
 * Colour says what a layer is; the line says what state it is in.
 */
export const MEANING = {
  selected: { color: '#2f7cf6', label: 'Selected layer' },
  component: { color: '#a78bfa', label: 'Component (moves and scales as one)' },
  changed: { color: '#f5a524', label: 'Changed by this theme' },
  hiddenInTheme: { color: '#ef5b5b', label: 'Hidden in the theme (Visible off)' },
  locked: { color: '#8b8b94', label: 'Locked, or shared and not editable' },
  plain: { color: '#e4e4e7', label: 'Layer (outline view)' },
  guide: { color: '#ff3d71', label: 'Guides, spacing and measurements' },
} as const;

export const LINES = {
  solid: 'Solid: selected',
  dashed: 'Dashed: what a click will select (hover)',
  dotted: 'Dotted: not drawn on the console right now (hidden, transparent, or a slot the console fills)',
  thin: 'Thin: every layer’s outline (outline view)',
} as const;

/** Ids hidden or locked by themselves or an ancestor. */
export const blockedBy = (id: string, set: ReadonlySet<string>) => {
  if (!set.size) return false;
  for (const s of set) if (id === s || id.startsWith(s + '/')) return true;
  return false;
};

/** Panes the theme changes (position, size, colours, visibility, draw order...), as `file::pane`. */
export function changedKeysOf(layout: LayoutPatch | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const f of layout?.Files ?? []) {
    for (const p of f.Patches ?? []) if (p.PaneName) out.add(paneKey(f.FileName, p.PaneName));
    for (const p of [...(f.PushBackPanes ?? []), ...(f.PullFrontPanes ?? [])]) out.add(paneKey(f.FileName, p));
  }
  return out;
}

/**
 * What the outline shows: a pane's own rect, or for a component the box around what it draws
 * (a slot's rect says nothing about the icon qlaunch puts in it).
 */
export function nodeOutline(scene: Scene, n: SceneNode): Pt[] {
  if (!isComponent(n)) return quad(n.world, n.rect);
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const walk = (c: SceneNode) => {
    if (c.hidden) return;
    if (c.content && c.opacity > 0.02) {
      const b = bounds(quad(c.world, c.rect));
      if (b.w < scene.width * 1.5 && b.h < scene.height * 1.5) {
        x0 = Math.min(x0, b.x);
        y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w);
        y1 = Math.max(y1, b.y + b.h);
      }
    }
    c.children.forEach(walk);
  };
  walk(n);
  if (x0 === Infinity) return quad(n.world, n.rect);
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

export const unionBox = (boxes: Box[]): Box | null => {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
};

/** Parent of each node (synthetic groups included). */
export function parentMap(scene: Scene) {
  const m = new Map<string, SceneNode>();
  const walk = (n: SceneNode) => n.children.forEach((c) => (m.set(c.id, n), walk(c)));
  walk(scene.root);
  return m;
}

/** The nearest real (non-group) ancestor. */
export function realParent(parents: Map<string, SceneNode>, n: SceneNode) {
  let p = parents.get(n.id);
  while (p && p.kind === 'group') p = parents.get(p.id);
  return p ?? null;
}

/** Console cautions for a node (limits.ts), with what the scene knows about it. */
export function nodeNotes(n: SceneNode, parent: SceneNode | null, missing?: boolean): PaneNote[] {
  const [file, pane] = n.key ? [n.key.slice(0, n.key.indexOf('::')), n.key.slice(n.key.indexOf('::') + 2)] : [n.file, n.name];
  const codeSlot = isComponent(n) && n.kind !== 'prt1';
  return paneNotes({
    file,
    pane,
    // A slot is a null pane on purpose: "draws nothing itself" is noise there.
    kind: n.kind === 'group' || codeSlot ? null : n.kind,
    partRoot: n.name === 'RootPane' && !!parent && parent.file !== n.file,
    codeSlot,
    readOnly: !n.editable,
    missing,
  });
}

/** A layer's own outline style: colour by what it is, dotted when the console doesn't draw it. */
export function outlineStyle(n: SceneNode, changed: ReadonlySet<string>, locked: boolean) {
  const dotted = n.hiddenOnConsole || n.hidden || n.opacity < 0.05;
  const color = n.hiddenOnConsole
    ? MEANING.hiddenInTheme.color
    : locked || !n.editable
      ? MEANING.locked.color
      : changed.has(n.key)
        ? MEANING.changed.color
        : isComponent(n)
          ? MEANING.component.color
          : MEANING.plain.color;
  return { color, dotted };
}

/* ------------------------------ exploded component view ------------------------------ */

export interface Exploded {
  scene: Scene;
  /** Where each layer was placed, with its caption. */
  tiles: { id: string; name: string; box: Box; note: string }[];
  title: string;
}

/**
 * Every drawn layer of a component laid out side by side, each on its own tile (highlight,
 * pressed state, shadow...), including layers that are transparent or hidden right now. The
 * tiles keep their ids and keys, so selecting and editing a tile edits that layer.
 */
export function explodeScene(scene: Scene, comp: SceneNode, parentFile?: string): Exploded {
  const layers: SceneNode[] = [];
  const walk = (n: SceneNode) => {
    if (n.content && n.kind !== 'group') layers.push(n);
    n.children.forEach(walk);
  };
  walk(comp);
  const items = layers
    .map((n) => ({ n, b: bounds(quad(n.world, n.rect)) }))
    .filter(({ b }) => b.w >= 0.5 && b.h >= 0.5 && isFinite(b.w) && isFinite(b.h))
    .slice(0, 64);
  const W = scene.width;
  const H = scene.height;
  const count = Math.max(1, items.length);
  const cols = Math.max(1, Math.ceil(Math.sqrt((count * W) / H)));
  const rows = Math.ceil(count / cols);
  const pad = 16;
  const cw = (W - pad * 2) / cols;
  const ch = (H - pad * 2) / rows;
  const caption = Math.min(22, ch * 0.22);
  const tiles: Exploded['tiles'] = [];
  const children: SceneNode[] = items.map(({ n, b }, i) => {
    const cx = pad + (i % cols) * cw;
    const cy = pad + Math.floor(i / cols) * ch;
    const iw = cw - 16;
    const ih = ch - 16 - caption;
    const k = Math.min(iw / b.w, ih / b.h, 4);
    const tx = cx + cw / 2 - (b.x + b.w / 2) * k;
    const ty = cy + 8 + ih / 2 - (b.y + b.h / 2) * k;
    const M: Mat = [k, 0, 0, k, tx, ty];
    const why = n.hiddenOnConsole ? 'hidden in theme' : n.hidden || n.opacity < 0.05 ? 'not shown right now' : '';
    tiles.push({ id: n.id, name: n.name, box: { x: cx + 4, y: cy + 4, w: cw - 8, h: ch - 8 }, note: why });
    return { ...n, children: [], hidden: false, alpha: 1, opacity: 1, world: mul(M, n.world), parentWorld: mul(M, n.parentWorld), matrix: mul(M, n.world), clip: undefined, childOffsetX: 0, childOffsetY: 0 };
  });
  const root: SceneNode = {
    ...scene.root,
    id: '__exploded',
    key: '',
    kind: 'group',
    content: null,
    children,
    world: IDENTITY,
    parentWorld: IDENTITY,
    matrix: IDENTITY,
    hidden: false,
    alpha: 1,
    opacity: 1,
    clip: undefined,
    childOffsetX: 0,
    childOffsetY: 0,
  };
  const file = (parentFile ?? comp.file).replace(/^blyt\//, '').replace(/\.bflyt$/, '');
  return { scene: { width: W, height: H, root, flat: [root, ...children] }, tiles, title: `${comp.name} · ${file}` };
}
