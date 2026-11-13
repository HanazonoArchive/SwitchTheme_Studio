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

export interface ExplodedTile {
  /** The layer's id (the stack slab has it; the side tile's thumbnail is `${id}#tile`). */
  id: string;
  name: string;
  kind: string;
  note: string;
  side: 'left' | 'right';
  /** Card around the thumbnail and name. */
  box: Box;
  /** Where the thumbnail sits inside the card. */
  thumb: Box;
  /** Line from the card to the layer's slab in the stack. */
  from: Pt;
  to: Pt;
}

export interface Exploded {
  scene: Scene;
  tiles: ExplodedTile[];
  /** Slab outlines (top faces) bottom first, for highlighting. */
  slabs: { id: string; quad: Pt[] }[];
  title: string;
}

export const TILE_SUFFIX = '#tile';

const KIND_LABEL: Record<string, string> = { pic1: 'Picture', txt1: 'Text', wnd1: 'Window', prt1: 'Part', pan1: 'Null', bnd1: 'Bounds' };

/**
 * Layer view: a component taken apart. Its layers float in the middle as a stack of
 * semi-transparent slabs seen at an angle (bottom layer lowest), each slab showing what that
 * layer draws in place. Around it, a tile per layer (thumbnail and name) is connected to its slab
 * by a line. Slabs and tiles keep the layer's id and key, so clicking either selects that layer;
 * hidden and transparent layers (highlight, pressed state...) are shown too.
 */
export function explodeScene(scene: Scene, comp: SceneNode, parentFile?: string): Exploded {
  const layers: SceneNode[] = [];
  const walk = (n: SceneNode) => {
    if (n.content && n.kind !== 'group') layers.push(n);
    n.children.forEach(walk);
  };
  walk(comp);
  const W = scene.width;
  const H = scene.height;
  const items = layers
    .map((n) => ({ n, b: bounds(quad(n.world, n.rect)) }))
    .filter(({ b }) => b.w >= 0.5 && b.h >= 0.5 && isFinite(b.w) && isFinite(b.h) && b.w < W * 1.5 && b.h < H * 1.5)
    .slice(0, 32);
  const count = items.length;
  const B = unionBox(items.map((i) => i.b)) ?? { x: 0, y: 0, w: 1, h: 1 };
  const bcx = B.x + B.w / 2;
  const bcy = B.y + B.h / 2;

  // Projection: rotate 45° and squash to half height (a plate seen from above at an angle).
  const C = Math.SQRT1_2;
  const diag = B.w + B.h;
  const top = 34;
  const room = H - top - 26;
  const minGap = 12;
  let k = Math.min(520 / (diag * C), 4);
  if (count > 1) k = Math.min(k, (room - (count - 1) * minGap) / (diag * C * 0.5));
  k = Math.max(k, 0.05);
  const dh = diag * C * 0.5 * k;
  const gap = count > 1 ? Math.min(70, (room - dh) / (count - 1)) : 0;
  const stackH = dh + gap * (count - 1);
  const y0 = top + (room - stackH) / 2;
  const P: Mat = [k * C, k * C * 0.5, -k * C, k * C * 0.5, 0, 0];
  const center: Mat = [1, 0, 0, 1, -bcx, -bcy];
  const slabMat = (i: number): Mat => {
    // i = 0 is the bottom layer (drawn first, lowest on screen).
    const cy = y0 + dh / 2 + (count - 1 - i) * gap;
    return mul([1, 0, 0, 1, W / 2, cy], mul(P, center));
  };

  const plate = (id: string, m: Mat, rect: Box, color: string): SceneNode => ({
    ...scene.root,
    id,
    key: '',
    name: '',
    kind: 'group',
    editable: false,
    content: { type: 'visual', v: { color } },
    children: [],
    rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
    world: m,
    parentWorld: m,
    matrix: m,
    hidden: false,
    alpha: 1,
    opacity: 1,
    clip: undefined,
    childOffsetX: 0,
    childOffsetY: 0,
    gameIndex: null,
  });
  const unit: Box = { x: 0, y: 0, w: 1, h: 1 };
  const thick = 7;

  const children: SceneNode[] = [];
  const slabs: Exploded['slabs'] = [];
  items.forEach(({ n }, i) => {
    const m = slabMat(i);
    const q = quad(m, B) as Pt[];
    // Side faces under the two front edges (the ones meeting at the lowest corner).
    const low = q.reduce((bi, p, j) => (p[1] > q[bi][1] ? j : bi), 0);
    for (const nb of [(low + 3) % 4, (low + 1) % 4]) {
      const [a, b] = [q[nb], q[low]];
      const face: Mat = [b[0] - a[0], b[1] - a[1], 0, thick, a[0], a[1]];
      children.push(plate(`__face${i}_${nb}`, face, unit, nb === (low + 3) % 4 ? 'rgba(120,150,220,0.22)' : 'rgba(90,115,180,0.28)'));
    }
    children.push(plate(`__plate${i}`, m, B, 'rgba(150,180,255,0.10)'));
    children.push({ ...n, children: [], hidden: false, alpha: 1, opacity: 1, world: mul(m, n.world), parentWorld: mul(m, n.parentWorld), matrix: mul(m, n.world), clip: undefined, childOffsetX: 0, childOffsetY: 0 });
    slabs.push({ id: n.id, quad: q });
  });

  // Tiles: alternate sides from the top of the stack down, so lines run roughly level.
  const order = items.map((_, i) => i).reverse();
  const sides: Record<'left' | 'right', number[]> = { left: [], right: [] };
  order.forEach((i, j) => sides[j % 2 === 0 ? 'left' : 'right'].push(i));
  const tiles: ExplodedTile[] = [];
  const colW = 268;
  for (const side of ['left', 'right'] as const) {
    const list = sides[side];
    if (!list.length) continue;
    const th = Math.min(64, (H - 24) / list.length - 6);
    const total = list.length * (th + 6) - 6;
    const ty0 = (H - total) / 2;
    list.forEach((i, j) => {
      const { n, b } = items[i];
      const x = side === 'left' ? 14 : W - 14 - colW;
      const y = ty0 + j * (th + 6);
      const box: Box = { x, y, w: colW, h: th };
      const thumb: Box = { x: x + 4, y: y + 4, w: th - 8, h: th - 8 };
      const kk = Math.min(thumb.w / b.w, thumb.h / b.h, 4);
      const tm: Mat = [kk, 0, 0, kk, thumb.x + thumb.w / 2 - (b.x + b.w / 2) * kk, thumb.y + thumb.h / 2 - (b.y + b.h / 2) * kk];
      // The card is what you click (the whole tile selects the layer); the thumbnail is only a picture.
      children.push({ ...plate(n.id + TILE_SUFFIX, [1, 0, 0, 1, 0, 0], box, 'rgba(255,255,255,0.045)'), key: n.key, name: n.name, kind: n.kind, file: n.file, editable: n.editable });
      children.push(plate(`__thumbbg${i}`, [1, 0, 0, 1, 0, 0], thumb, 'rgba(0,0,0,0.35)'));
      children.push({
        ...n,
        id: `__thumb${i}`,
        key: '',
        children: [],
        hidden: false,
        alpha: 1,
        opacity: 1,
        world: mul(tm, n.world),
        parentWorld: mul(tm, n.parentWorld),
        matrix: mul(tm, n.world),
        clip: undefined,
        childOffsetX: 0,
        childOffsetY: 0,
      });
      const q = slabs[i].quad;
      // Connect to the slab's corner on this side.
      const corner = q.reduce((bi, p, jj) => ((side === 'left' ? p[0] < q[bi][0] : p[0] > q[bi][0]) ? jj : bi), 0);
      const why = n.hiddenOnConsole ? 'hidden in theme' : n.hidden || n.opacity < 0.05 ? 'not shown right now' : '';
      tiles.push({
        id: n.id,
        name: n.name,
        kind: KIND_LABEL[n.kind] ?? n.kind,
        note: why,
        side,
        box,
        thumb,
        from: side === 'left' ? [x + colW, y + th / 2] : [x, y + th / 2],
        to: q[corner],
      });
    });
  }

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
  return { scene: { width: W, height: H, root, flat: [root, ...children] }, tiles, slabs, title: `${comp.name} · ${file}` };
}
