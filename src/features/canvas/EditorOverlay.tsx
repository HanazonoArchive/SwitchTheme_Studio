import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isComponent, type Scene, type SceneNode } from '../../lib/render/scene';
import { apply, applyLinear, bounds, invert } from '../../lib/render/matrix';
import { fieldNote } from '../../lib/layout/limits';
import { blockedBy, MEANING, nodeNotes, nodeOutline, outlineStyle, parentMap, realParent, unionBox, type Box, type Pt } from './geometry';

/**
 * Selection, hover, handles, drag-to-move with snapping and smart guides, resize, rotate,
 * marquee and the measure tool — drawn as SVG over the Pixi canvas in the same 1280×720 space.
 * Hit testing uses the scene's world matrices, so what you click is exactly what is drawn there.
 *
 * Parts (prt1: a game icon, an applet button, a settings row) are components, as in Figma:
 * clicking selects the whole component, so moving it moves everything in it. Double-click goes
 * one level deeper; once inside, clicks pick at that level. Alt+click picks the exact layer.
 * Ctrl/Shift+click adds or removes layers from the selection; Ctrl+drag (or a drag that starts
 * on empty canvas) draws a selection box. Right-click lists every layer under the cursor.
 */

export interface SnapSettings {
  grid: boolean;
  gridSize: number;
  guides: boolean;
}

export type Tool = 'select' | 'measure';

export interface MoveDelta {
  key: string;
  dx: number;
  dy: number;
}

interface Props {
  scene: Scene;
  /** Screen pixels per layout pixel. */
  scale: number;
  mode: 'edit' | 'preview';
  tool: Tool;
  /** Every selected layer; the last one is the primary (Inspector). */
  selectedIds: string[];
  hiddenIds: ReadonlySet<string>;
  lockedIds: ReadonlySet<string>;
  /** Panes the theme changes (outline colour). */
  changedKeys: ReadonlySet<string>;
  showAllOutlines: boolean;
  snap: SnapSettings;
  onSelect: (node: SceneNode | null, how?: 'replace' | 'toggle') => void;
  onSelectMany: (nodes: SceneNode[], additive: boolean) => void;
  onMove: (moves: MoveDelta[], phase: 'start' | 'move' | 'end') => void;
  onResize: (key: string, change: TransformChange, phase: 'start' | 'move' | 'end') => void;
  onFocusGame: (index: number) => void;
  /** Right-click: every layer under the cursor (top first) and the one the click is about. */
  onContextMenu: (at: { x: number; y: number }, under: SceneNode[], target: SceneNode | null) => void;
  /** Cursor in layout units (rulers), null when it leaves. */
  onCursor?: (p: Pt | null) => void;
  onToolChange?: (t: Tool) => void;
  /** Clicks only select (Layer view: no moving, resizing or rotating). */
  selectOnly?: boolean;
}

/**
 * A canvas transform relative to where the gesture started: position change (layout units) plus
 * a new size, a scale factor (components scale as a whole) or a rotation change in degrees.
 */
export interface TransformChange {
  dx: number;
  dy: number;
  w?: number;
  h?: number;
  scale?: { x: number; y: number };
  rotation?: number;
}

/** Equal-spacing indicator: a gap drawn between two boxes. */
interface Gap {
  axis: 'x' | 'y';
  from: number;
  to: number;
  at: number;
}

interface Readout {
  at: Pt;
  lines: string[];
  warn?: string;
}

const ACCENT = MEANING.selected.color;
const GUIDE = MEANING.guide.color;
const SNAP_PX = 6;

const inside = (n: SceneNode, x: number, y: number) => {
  const [lx, ly] = apply(invert(n.world), x, y);
  const r = n.rect;
  return lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h;
};

type Drag =
  | { kind: 'move'; nodes: SceneNode[]; x0: number; y0: number; box: Box; xs: number[]; ys: number[]; peers: Box[]; warn?: string }
  | { kind: 'resize'; node: SceneNode; x0: number; y0: number; handle: [number, number]; warn?: string }
  | { kind: 'scale'; node: SceneNode; x0: number; y0: number; handle: [number, number]; box: Box; pivot: Pt; warn?: string }
  | { kind: 'rotate'; node: SceneNode; pivot: Pt; a0: number; r0: number; warn?: string }
  | { kind: 'pending'; node: SceneNode; x0: number; y0: number }
  | { kind: 'marquee'; x0: number; y0: number; additive: boolean; node: SceneNode | null }
  | { kind: 'measure' };

const HANDLES: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(Math.round(v * 10) / 10);
const r1 = (v: number) => Math.round(v * 10) / 10;

export const EditorOverlay: React.FC<Props> = ({
  scene,
  scale,
  mode,
  tool,
  selectedIds,
  hiddenIds,
  lockedIds,
  changedKeys,
  showAllOutlines,
  snap,
  onSelect,
  onSelectMany,
  onMove,
  onResize,
  onFocusGame,
  onContextMenu,
  onCursor,
  onToolChange,
  selectOnly = false,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[]; gaps: Gap[] }>({ x: [], y: [], gaps: [] });
  const [readout, setReadout] = useState<Readout | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [measure, setMeasure] = useState<{ a: Pt; b: Pt; done: boolean } | null>(null);
  const [rotArc, setRotArc] = useState<{ pivot: Pt; a0: number; a1: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  // Double-click detection on pointerdown (PointerEvent.detail isn't a reliable click count).
  const lastDown = useRef<{ t: number; x: number; y: number } | null>(null);

  const byId = useMemo(() => new Map(scene.flat.map((n) => [n.id, n])), [scene]);
  /** Things you can click: editable, drawn, not hidden or locked in the editor. */
  const pickable = useMemo(
    () =>
      scene.flat.filter(
        (n) =>
          n.key &&
          n.editable &&
          !n.hidden &&
          n.opacity > 0.02 &&
          (n.content || (showAllOutlines && n.kind !== 'pan1' && n.kind !== 'group')) &&
          !blockedBy(n.id, hiddenIds) &&
          !blockedBy(n.id, lockedIds),
      ),
    [scene, showAllOutlines, hiddenIds, lockedIds],
  );
  // Outline view also shows what the console doesn't draw (dotted), so it can be found.
  const outlined = useMemo(
    () =>
      showAllOutlines
        ? scene.flat.filter((n) => n.key && n.kind !== 'group' && n.kind !== 'pan1' && (!n.hidden || n.hiddenOnConsole) && !blockedBy(n.id, hiddenIds))
        : [],
    [scene, showAllOutlines, hiddenIds],
  );
  const selectedNodes = useMemo(() => selectedIds.map((id) => byId.get(id)).filter((n): n is SceneNode => !!n), [selectedIds, byId]);
  const selected = selectedNodes.length ? selectedNodes[selectedNodes.length - 1] : null;
  const isSelected = (id: string) => selectedIds.includes(id);
  const parentOf = useMemo(() => parentMap(scene), [scene]);
  const outline = (n: SceneNode) => nodeOutline(scene, n);

  // Esc ends a measurement; M switches tools (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === 'Escape' && measure) {
        setMeasure(null);
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [measure]);
  // A measurement belongs to the measure tool.
  const [measureFor, setMeasureFor] = useState(tool);
  if (measureFor !== tool) {
    setMeasureFor(tool);
    if (tool !== 'measure') setMeasure(null);
  }

  /** Selectable levels for a clicked layer: its enclosing components, outermost first, then itself. */
  const levels = (leaf: SceneNode): SceneNode[] => {
    const out: SceneNode[] = [leaf];
    for (let p = parentOf.get(leaf.id); p; p = parentOf.get(p.id))
      if (isComponent(p) && p.key && p.editable && !p.hidden && !blockedBy(p.id, lockedIds)) out.unshift(p);
    return out;
  };

  /** What a click on `leaf` selects, given the current selection (see the comment at the top). */
  const resolve = (leaf: SceneNode | null, how: 'click' | 'deep' | 'into'): SceneNode | null => {
    if (!leaf) return null;
    const lv = levels(leaf);
    if (how === 'deep') return leaf;
    const at = selected ? lv.findIndex((n) => n.id === selected.id) : -1;
    if (how === 'into') return at >= 0 ? lv[Math.min(at + 1, lv.length - 1)] : lv[0];
    if (at >= 0) return selected;
    // Inside a component already: stay at the selection's depth when the click shares its parents.
    if (selected) {
      const sl = levels(selected);
      const depth = sl.length - 1;
      if (depth > 0 && depth < lv.length && sl.slice(0, depth).every((n, i) => lv[i].id === n.id)) return lv[depth];
    }
    return lv[0];
  };

  const toLayout = (e: { clientX: number; clientY: number }): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  };
  const hit = (x: number, y: number) => {
    for (let i = pickable.length - 1; i >= 0; i--) if (inside(pickable[i], x, y)) return pickable[i];
    return null;
  };

  /** Snap lines from everything else that is drawn, plus the screen's edges and centre. */
  const snapLines = (moving: SceneNode[]) => {
    const xs = [0, scene.width / 2, scene.width];
    const ys = [0, scene.height / 2, scene.height];
    const ignore = (n: SceneNode) => moving.some((m) => n.id === m.id || n.id.startsWith(m.id + '/'));
    for (const n of scene.flat) {
      if (!n.content || n.hidden || n.opacity < 0.02 || ignore(n) || blockedBy(n.id, hiddenIds)) continue;
      const b = bounds(outline(n));
      if (b.w > scene.width * 1.5 || b.h > scene.height * 1.5) continue;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    return { xs, ys };
  };

  const snapAxis = (features: number[], lines: number[], useGuides: boolean): { d: number; at: number[] } => {
    const tol = SNAP_PX / scale;
    let best: { d: number; at: number[] } = { d: 0, at: [] };
    let bestDist = tol + 1;
    if (useGuides && snap.guides)
      for (const f of features)
        for (const l of lines) {
          const dist = Math.abs(l - f);
          if (dist < bestDist - 0.01) {
            bestDist = dist;
            best = { d: l - f, at: [l] };
          } else if (Math.abs(dist - bestDist) < 0.01 && !best.at.includes(l)) best.at.push(l);
        }
    if (snap.grid && bestDist > tol) {
      for (const f of features) {
        const g = Math.round(f / snap.gridSize) * snap.gridSize;
        const dist = Math.abs(g - f);
        if (dist < bestDist) {
          bestDist = dist;
          best = { d: g - f, at: [] };
        }
      }
    }
    return bestDist <= Math.max(tol, snap.grid ? snap.gridSize / 2 : 0) ? best : { d: 0, at: [] };
  };

  /** Boxes of the moving layer's siblings (what equal spacing is measured against). */
  const peersOf = (nodes: SceneNode[]): Box[] => {
    const parent = nodes.length === 1 ? parentOf.get(nodes[0].id) : null;
    if (!parent) return [];
    const flat = (n: SceneNode): SceneNode[] => n.children.flatMap((c) => (c.kind === 'group' ? flat(c) : [c]));
    return flat(parent)
      .filter((c) => c.id !== nodes[0].id && !c.hidden && !blockedBy(c.id, hiddenIds))
      .map((c) => bounds(outline(c)))
      .filter((b) => b.w > 0.5 && b.h > 0.5 && b.w < scene.width * 1.5 && b.h < scene.height * 1.5);
  };

  /**
   * Equal spacing: offsets that put the moving box the same distance from a neighbour as other
   * neighbours are from each other, or centred between two neighbours.
   */
  const spacingSnap = (b: Box, peers: Box[], axis: 'x' | 'y'): { d: number; gaps: Gap[] } | null => {
    const lo = (r: Box) => (axis === 'x' ? r.x : r.y);
    const len = (r: Box) => (axis === 'x' ? r.w : r.h);
    const hi = (r: Box) => lo(r) + len(r);
    // Only boxes beside the moving one (overlapping on the other axis) count as neighbours.
    const olo = (r: Box) => (axis === 'x' ? r.y : r.x);
    const ohi = (r: Box) => olo(r) + (axis === 'x' ? r.h : r.w);
    const row = peers.filter((r) => ohi(r) > olo(b) && olo(r) < ohi(b)).sort((p, q) => lo(p) - lo(q));
    if (!row.length) return null;
    const mid = (olo(b) + ohi(b)) / 2;
    const gaps: { g: number; a: Box; c: Box }[] = [];
    for (let i = 1; i < row.length; i++) {
      const g = lo(row[i]) - hi(row[i - 1]);
      if (g > 0.5) gaps.push({ g, a: row[i - 1], c: row[i] });
    }
    const left = row.filter((r) => hi(r) <= lo(b) + len(b) / 2).pop();
    const right = row.find((r) => lo(r) >= lo(b) + len(b) / 2);
    const tol = SNAP_PX / scale;
    let best: { d: number; gaps: Gap[] } | null = null;
    const offer = (target: number, show: Gap[]) => {
      const d = target - lo(b);
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, gaps: show };
    };
    const ref = (x: { a: Box; c: Box }): Gap => ({ axis, from: hi(x.a), to: lo(x.c), at: mid });
    for (const x of gaps) {
      if (left) offer(hi(left) + x.g, [ref(x), { axis, from: hi(left), to: hi(left) + x.g, at: mid }]);
      if (right) offer(lo(right) - x.g - len(b), [ref(x), { axis, from: lo(right) - x.g, to: lo(right), at: mid }]);
    }
    if (left && right) {
      const g = (lo(right) - hi(left) - len(b)) / 2;
      if (g > 0.5) offer(hi(left) + g, [{ axis, from: hi(left), to: hi(left) + g, at: mid }, { axis, from: lo(right) - g, to: lo(right), at: mid }]);
    }
    return best;
  };

  /** A caution to show while changing a field the console overrides. */
  const cautionFor = (n: SceneNode, field: string) => {
    return fieldNote(nodeNotes(n, realParent(parentOf, n)), field)?.text;
  };

  /** Selected layers that move: not locked, and not inside another moving layer. */
  const movingSet = (start: SceneNode): SceneNode[] => {
    const list = isSelected(start.id) ? selectedNodes : [start];
    const ok = list.filter((n) => !blockedBy(n.id, lockedIds) && n.key && n.editable);
    return ok.filter((n) => !ok.some((m) => m !== n && n.id.startsWith(m.id + '/')));
  };

  const startMove = (node: SceneNode, x: number, y: number) => {
    const nodes = movingSet(node);
    if (!nodes.length) return;
    const box = unionBox(nodes.map((n) => bounds(outline(n))))!;
    const { xs, ys } = snapLines(nodes);
    drag.current = { kind: 'move', nodes, x0: x, y0: y, box, xs, ys, peers: snap.guides ? peersOf(nodes) : [], warn: nodes.length === 1 ? cautionFor(nodes[0], 'position') : undefined };
    onMove(
      nodes.map((n) => ({ key: n.key, dx: 0, dy: 0 })),
      'start',
    );
  };

  /** Measure tool: snap a point to edges, centres and corners of drawn layers. */
  const snapPoint = (p: Pt, free: boolean): Pt => {
    if (free) return p;
    const { xs, ys } = snapLines([]);
    const tol = 8 / scale;
    const near = (v: number, lines: number[]) => {
      let best = v;
      let d = tol;
      for (const l of lines)
        if (Math.abs(l - v) < d) {
          d = Math.abs(l - v);
          best = l;
        }
      return best;
    };
    return [near(p[0], xs), near(p[1], ys)];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const [x, y] = toLayout(e);
    if (mode === 'preview') {
      const n = hitAny(x, y);
      if (n?.gameIndex !== null && n?.gameIndex !== undefined) onFocusGame(n.gameIndex);
      return;
    }
    e.stopPropagation();
    ref.current!.setPointerCapture(e.pointerId);
    if (tool === 'measure') {
      const p = snapPoint([x, y], e.altKey);
      setMeasure({ a: p, b: p, done: false });
      drag.current = { kind: 'measure' };
      return;
    }
    const multi = e.ctrlKey || e.metaKey || e.shiftKey;
    const deep = e.altKey;
    const prev = lastDown.current;
    const twice = !!prev && e.timeStamp - prev.t < 400 && Math.hypot(x - prev.x, y - prev.y) * scale < 5;
    lastDown.current = twice ? null : { t: e.timeStamp, x, y };
    // Keep dragging the current selection when clicking inside it (even if something is on top).
    const inSel = !multi && !deep && !twice ? selectedNodes.find((s) => !blockedBy(s.id, lockedIds) && inside(s, x, y)) : undefined;
    const n = inSel ?? resolve(hit(x, y), deep ? 'deep' : twice ? 'into' : 'click');
    // Ctrl+drag, or a drag from empty canvas: selection box.
    if (!n && selectOnly) {
      if (!multi) onSelect(null);
      return;
    }
    if (!n || ((e.ctrlKey || e.metaKey) && !twice)) {
      drag.current = { kind: 'marquee', x0: x, y0: y, additive: multi, node: n };
      // A plain click on empty canvas clears the selection; with a modifier it adds to it.
      if (!n && !multi) onSelect(null);
      return;
    }
    if (multi) {
      onSelect(n, 'toggle');
      return;
    }
    if (!isSelected(n.id)) onSelect(n);
    if (!selectOnly) drag.current = { kind: 'pending', node: n, x0: x, y0: y };
  };

  const hitAny = (x: number, y: number) => {
    for (let i = scene.flat.length - 1; i >= 0; i--) {
      const n = scene.flat[i];
      if (n.content && !n.hidden && n.opacity > 0.02 && inside(n, x, y)) return n;
    }
    return null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const [x, y] = toLayout(e);
    onCursor?.([x, y]);
    const d = drag.current;
    if (!d) {
      if (mode === 'edit') setHoverId(resolve(hit(x, y), e.altKey ? 'deep' : 'click')?.id ?? null);
      return;
    }
    if (d.kind === 'measure') {
      setMeasure((m) => {
        if (!m) return m;
        let b = snapPoint([x, y], e.altKey);
        if (e.shiftKey) {
          // 45° steps.
          const ang = Math.round(Math.atan2(b[1] - m.a[1], b[0] - m.a[0]) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(b[0] - m.a[0], b[1] - m.a[1]);
          b = [m.a[0] + Math.cos(ang) * len, m.a[1] + Math.sin(ang) * len];
        }
        return { ...m, b };
      });
      return;
    }
    if (d.kind === 'marquee') {
      if (Math.hypot(x - d.x0, y - d.y0) * scale < 3) return;
      setMarquee({ x: Math.min(x, d.x0), y: Math.min(y, d.y0), w: Math.abs(x - d.x0), h: Math.abs(y - d.y0) });
      return;
    }
    if (d.kind === 'pending') {
      if (Math.hypot(x - d.x0, y - d.y0) * scale < 3) return;
      startMove(d.node, d.x0, d.y0);
      if (!drag.current || drag.current.kind !== 'move') {
        drag.current = null;
        return;
      }
    }
    const cur = drag.current!;
    if (cur.kind === 'move') {
      let dx = x - cur.x0;
      let dy = y - cur.y0;
      const free = e.altKey;
      const b = cur.box;
      const sx = free ? { d: 0, at: [] } : snapAxis([b.x + dx, b.x + dx + b.w / 2, b.x + dx + b.w], cur.xs, true);
      const sy = free ? { d: 0, at: [] } : snapAxis([b.y + dy, b.y + dy + b.h / 2, b.y + dy + b.h], cur.ys, true);
      const moved = { ...b, x: b.x + dx, y: b.y + dy };
      const gx = free ? null : spacingSnap(moved, cur.peers, 'x');
      const gy = free ? null : spacingSnap(moved, cur.peers, 'y');
      // Equal spacing wins when it's at least as close as an edge or centre line.
      const useGx = !!gx && (!sx.at.length || Math.abs(gx.d) <= Math.abs(sx.d));
      const useGy = !!gy && (!sy.at.length || Math.abs(gy.d) <= Math.abs(sy.d));
      dx += useGx ? gx!.d : sx.d;
      dy += useGy ? gy!.d : sy.d;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      setGuides({ x: useGx ? [] : sx.at, y: useGy ? [] : sy.at, gaps: [...(useGx ? gx!.gaps : []), ...(useGy ? gy!.gaps : [])] });
      // Screen delta -> each layer's parent space -> layout units (Y up).
      onMove(
        cur.nodes.map((n) => {
          const [lx, ly] = applyLinear(invert(n.parentWorld), dx, dy);
          return { key: n.key, dx: lx / n.posScale.x, dy: -ly / n.posScale.y };
        }),
        'move',
      );
      setReadout({
        at: [x, y],
        lines: [`X ${r1(b.x + dx)}  Y ${r1(b.y + dy)}`, `Δ ${sign(dx)}, ${sign(dy)}${cur.nodes.length > 1 ? ` · ${cur.nodes.length} layers` : ''}`],
        warn: cur.warn,
      });
    } else if (cur.kind === 'scale') {
      // Components scale as a whole: everything inside follows. The opposite edge stays put.
      const [hx, hy] = cur.handle;
      const b = cur.box;
      let kx = hx ? Math.max(0.05, (b.w + hx * (x - cur.x0)) / b.w) : 1;
      let ky = hy ? Math.max(0.05, (b.h + hy * (y - cur.y0)) / b.h) : 1;
      if (e.shiftKey || (hx && hy)) {
        const k = hx && hy ? Math.max(kx, ky) : hx ? kx : ky;
        kx = k;
        ky = k;
      }
      const ax = hx === 1 ? b.x : hx === -1 ? b.x + b.w : b.x + b.w / 2;
      const ay = hy === 1 ? b.y : hy === -1 ? b.y + b.h : b.y + b.h / 2;
      const [px, py] = cur.pivot;
      const [lx, ly] = applyLinear(invert(cur.node.parentWorld), (1 - kx) * (ax - px), (1 - ky) * (ay - py));
      onResize(cur.node.key, { dx: lx / cur.node.posScale.x, dy: -ly / cur.node.posScale.y, scale: { x: kx, y: ky } }, 'move');
      setReadout({ at: [x, y], lines: [kx === ky ? `×${kx.toFixed(2)}` : `×${kx.toFixed(2)} × ${ky.toFixed(2)}`, `${r1(b.w * kx)} × ${r1(b.h * ky)}`], warn: cur.warn });
    } else if (cur.kind === 'rotate') {
      const [px, py] = cur.pivot;
      // Screen angles grow clockwise; layout rotation grows counter-clockwise.
      const a1 = Math.atan2(y - py, x - px);
      let deg = -((a1 - cur.a0) * 180) / Math.PI;
      deg = ((((deg + 180) % 360) + 360) % 360) - 180;
      if (e.shiftKey) deg = Math.round((cur.r0 + deg) / 15) * 15 - cur.r0;
      deg = r1(deg);
      onResize(cur.node.key, { dx: 0, dy: 0, rotation: deg }, 'move');
      const abs = ((((cur.r0 + deg + 180) % 360) + 360) % 360) - 180;
      setRotArc({ pivot: cur.pivot, a0: cur.a0, a1: cur.a0 - (deg * Math.PI) / 180 });
      setReadout({ at: [x, y], lines: [`${r1(abs)}°`, `Δ ${sign(deg)}°`], warn: cur.warn });
    } else if (cur.kind === 'resize') {
      const n = cur.node;
      // Mouse delta in the node's own (rotated, scaled) space.
      const [du, dv] = applyLinear(invert(n.world), x - cur.x0, y - cur.y0);
      const [hx, hy] = cur.handle;
      const r = n.rect;
      let nx = r.x;
      let ny = r.y;
      let nw = r.w;
      let nh = r.h;
      if (hx === 1) nw = Math.max(1, r.w + du);
      if (hx === -1) {
        nw = Math.max(1, r.w - du);
        nx = r.x + r.w - nw;
      }
      if (hy === 1) nh = Math.max(1, r.h + dv);
      if (hy === -1) {
        nh = Math.max(1, r.h - dv);
        ny = r.y + r.h - nh;
      }
      if (e.shiftKey && hx && hy) {
        const k = Math.max(nw / r.w, nh / r.h);
        nw = r.w * k;
        nh = r.h * k;
        if (hx === -1) nx = r.x + r.w - nw;
        if (hy === -1) ny = r.y + r.h - nh;
      }
      // Keep the pane's origin rule: its pivot sits at the same relative point of the new rect.
      const fx = r.w ? -r.x / r.w : 0.5;
      const fy = r.h ? -r.y / r.h : 0.5;
      const pivotX = nx + fx * nw;
      const pivotY = ny + fy * nh;
      const rad = (n.rotation * Math.PI) / 180;
      const px = (Math.cos(rad) * pivotX * n.scaleX - Math.sin(rad) * pivotY * n.scaleY) / n.posScale.x;
      const py = (Math.sin(rad) * pivotX * n.scaleX + Math.cos(rad) * pivotY * n.scaleY) / n.posScale.y;
      onResize(n.key, { dx: px, dy: -py, w: nw / n.sizeScale.x, h: nh / n.sizeScale.y }, 'move');
      setReadout({ at: [x, y], lines: [`W ${r1(nw / n.sizeScale.x)}  H ${r1(nh / n.sizeScale.y)}`], warn: cur.warn });
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGuides({ x: [], y: [], gaps: [] });
    setReadout(null);
    setRotArc(null);
    if (!d) return;
    ref.current?.releasePointerCapture(e.pointerId);
    if (d.kind === 'measure') {
      setMeasure((m) => (m && Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) * scale < 2 ? null : m && { ...m, done: true }));
      return;
    }
    if (d.kind === 'marquee') {
      const box = marquee;
      setMarquee(null);
      // Ctrl+click without dragging: add or remove that layer.
      if (!box) {
        if (d.node) onSelect(d.node, 'toggle');
        return;
      }
      // Everything fully inside the box, at the level a click would select.
      const found = new Map<string, SceneNode>();
      for (const n of pickable) {
        const r = resolve(n, 'click');
        if (!r || found.has(r.id)) continue;
        const b = bounds(outline(r));
        if (b.w > scene.width * 0.98 && b.h > scene.height * 0.98) continue;
        if (b.x >= box.x && b.y >= box.y && b.x + b.w <= box.x + box.w && b.y + b.h <= box.y + box.h) found.set(r.id, r);
      }
      onSelectMany([...found.values()], d.additive);
      return;
    }
    if (d.kind === 'move') onMove(d.nodes.map((n) => ({ key: n.key, dx: 0, dy: 0 })), 'end');
    if (d.kind === 'resize' || d.kind === 'scale' || d.kind === 'rotate') onResize(d.node.key, { dx: 0, dy: 0 }, 'end');
  };

  const startResize = (e: React.PointerEvent, handle: [number, number]) => {
    if (!selected || e.button !== 0) return;
    e.stopPropagation();
    const [x, y] = toLayout(e);
    ref.current!.setPointerCapture(e.pointerId);
    drag.current = isComponent(selected)
      ? { kind: 'scale', node: selected, x0: x, y0: y, handle, box: bounds(outline(selected)), pivot: apply(selected.world, 0, 0) as Pt, warn: cautionFor(selected, 'scale') }
      : { kind: 'resize', node: selected, x0: x, y0: y, handle, warn: cautionFor(selected, 'size') };
    onResize(selected.key, { dx: 0, dy: 0 }, 'start');
  };

  const startRotate = (e: React.PointerEvent) => {
    if (!selected || e.button !== 0) return;
    e.stopPropagation();
    const [x, y] = toLayout(e);
    ref.current!.setPointerCapture(e.pointerId);
    const pivot = apply(selected.world, 0, 0) as Pt;
    drag.current = { kind: 'rotate', node: selected, pivot, a0: Math.atan2(y - pivot[1], x - pivot[0]), r0: -selected.rotation, warn: cautionFor(selected, 'rotation') };
    onResize(selected.key, { dx: 0, dy: 0 }, 'start');
  };

  const onRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (mode !== 'edit') return;
    const [x, y] = toLayout(e);
    // Every editable layer under the cursor, top first (locked ones too, so they can be unlocked).
    const under: SceneNode[] = [];
    for (let i = scene.flat.length - 1; i >= 0 && under.length < 14; i--) {
      const n = scene.flat[i];
      if (!n.key || n.kind === 'group' || n.hidden || blockedBy(n.id, hiddenIds)) continue;
      if ((n.content || isComponent(n)) && inside(n, x, y)) under.push(n);
    }
    const inSel = selectedNodes.find((s) => inside(s, x, y));
    const target = inSel ?? resolve(hit(x, y), e.altKey ? 'deep' : 'click') ?? under[0] ?? null;
    if (target && !isSelected(target.id)) onSelect(target);
    onContextMenu({ x: e.clientX, y: e.clientY }, under, target);
  };

  const sw = 1 / scale;
  const poly = (n: SceneNode) =>
    outline(n)
      .map((p) => p.join(','))
      .join(' ');
  const hover = hoverId && !isSelected(hoverId) ? byId.get(hoverId) : null;
  const selQuad = selected ? outline(selected) : null;
  const comp = !!selected && isComponent(selected);
  const selBox = selQuad ? bounds(selQuad) : null;
  const single = selectedNodes.length === 1;
  const editableSel = !selectOnly && !!selected && single && !blockedBy(selected.id, lockedIds) && selected.editable;
  const handlePoints =
    selQuad && editableSel
      ? HANDLES.map(([hx, hy]) => {
          const h = [hx, hy] as [number, number];
          if (comp) return { h, p: [selBox!.x + ((hx + 1) / 2) * selBox!.w, selBox!.y + ((hy + 1) / 2) * selBox!.h] as Pt };
          const r = selected!.rect;
          return { h, p: apply(selected!.world, r.x + ((hx + 1) / 2) * r.w, r.y + ((hy + 1) / 2) * r.h) };
        })
      : [];
  // Rotation handle: a knob above the top edge's midpoint (follows the pane's own rotation).
  const rotateKnob = (() => {
    if (!selected || !selQuad || !editableSel) return null;
    const top = comp ? ([selBox!.x + selBox!.w / 2, selBox!.y] as Pt) : (apply(selected.world, selected.rect.x + selected.rect.w / 2, selected.rect.y) as Pt);
    const c = comp ? ([selBox!.x + selBox!.w / 2, selBox!.y + selBox!.h / 2] as Pt) : (apply(selected.world, selected.rect.x + selected.rect.w / 2, selected.rect.y + selected.rect.h / 2) as Pt);
    const len = Math.hypot(top[0] - c[0], top[1] - c[1]) || 1;
    const off = 22 / scale;
    return { from: top, to: [top[0] + ((top[0] - c[0]) / len) * off, top[1] + ((top[1] - c[1]) / len) * off] as Pt };
  })();
  const multiBox = selectedNodes.length > 1 ? unionBox(selectedNodes.map((n) => bounds(outline(n)))) : null;
  const hoverStyle = hover ? outlineStyle(hover, changedKeys, false) : null;
  const dot = `${1.5 * sw} ${2.5 * sw}`;
  const dash = `${5 * sw} ${3 * sw}`;

  // Measurement: distance, legs and angle (layout pixels = console pixels).
  const m = measure;
  const mdx = m ? m.b[0] - m.a[0] : 0;
  const mdy = m ? m.b[1] - m.a[1] : 0;
  const mlen = Math.hypot(mdx, mdy);
  const mang = m ? (-Math.atan2(mdy, mdx) * 180) / Math.PI : 0;
  // Measure tool hover: the layer's size.
  const measureHover = tool === 'measure' && hoverId ? byId.get(hoverId) : null;

  const arcPath = (a: { pivot: Pt; a0: number; a1: number }) => {
    const R = 36 / scale;
    const [px, py] = a.pivot;
    const sx = px + Math.cos(a.a0) * R;
    const sy = py + Math.sin(a.a0) * R;
    const ex = px + Math.cos(a.a1) * R;
    const ey = py + Math.sin(a.a1) * R;
    let delta = a.a1 - a.a0;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    return `M ${px} ${py} L ${sx} ${sy} A ${R} ${R} 0 0 ${delta > 0 ? 1 : 0} ${ex} ${ey} Z`;
  };

  return (
    <div
      ref={ref}
      className="absolute inset-0"
      style={{ cursor: mode === 'preview' ? 'default' : tool === 'measure' ? 'crosshair' : hover ? 'pointer' : 'default', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        setHoverId(null);
        onCursor?.(null);
      }}
      onContextMenu={onRightClick}
      onDoubleClick={() => tool === 'measure' && onToolChange?.('select')}
    >
      {mode === 'edit' && (
        <svg className="absolute inset-0 overflow-visible pointer-events-none" width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`}>
          {snap.grid && snap.gridSize * scale >= 6 && (
            <>
              <defs>
                <pattern id="grid" width={snap.gridSize} height={snap.gridSize} patternUnits="userSpaceOnUse">
                  <path d={`M ${snap.gridSize} 0 L 0 0 0 ${snap.gridSize}`} fill="none" stroke="rgba(120,160,255,0.22)" strokeWidth={sw} />
                </pattern>
              </defs>
              <rect width={scene.width} height={scene.height} fill="url(#grid)" />
            </>
          )}
          {outlined.map((n) => {
            const st = outlineStyle(n, changedKeys, blockedBy(n.id, lockedIds));
            return <polygon key={n.id} points={poly(n)} fill="none" stroke={st.color} strokeOpacity={0.7} strokeWidth={sw} strokeDasharray={st.dotted ? dot : undefined} />;
          })}
          {hover && hoverStyle && tool === 'select' && (
            <polygon points={poly(hover)} fill="none" stroke={isComponent(hover) ? MEANING.component.color : ACCENT} strokeWidth={1.5 * sw} strokeDasharray={dash} />
          )}
          {selectedNodes.map((n) => {
            const st = outlineStyle(n, changedKeys, blockedBy(n.id, lockedIds));
            const color = blockedBy(n.id, lockedIds) || !n.editable ? MEANING.locked.color : isComponent(n) ? MEANING.component.color : ACCENT;
            return (
              <g key={`sel${n.id}`}>
                <polygon points={poly(n)} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={3.5 * sw} />
                <polygon points={poly(n)} fill="none" stroke={color} strokeWidth={1.5 * sw} strokeDasharray={st.dotted ? dot : undefined} />
              </g>
            );
          })}
          {multiBox && <rect x={multiBox.x} y={multiBox.y} width={multiBox.w} height={multiBox.h} fill="none" stroke={ACCENT} strokeOpacity={0.6} strokeWidth={sw} strokeDasharray={dash} />}
          {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(47,124,246,0.10)" stroke={ACCENT} strokeWidth={sw} />}
          {guides.x.map((gx) => (
            <line key={`gx${gx}`} x1={gx} x2={gx} y1={0} y2={scene.height} stroke={GUIDE} strokeWidth={sw} />
          ))}
          {guides.y.map((gy) => (
            <line key={`gy${gy}`} y1={gy} y2={gy} x1={0} x2={scene.width} stroke={GUIDE} strokeWidth={sw} />
          ))}
          {guides.gaps.map((g, i) => {
            const [x1, y1, x2, y2] = g.axis === 'x' ? [g.from, g.at, g.to, g.at] : [g.at, g.from, g.at, g.to];
            const t = 4 / scale;
            const cross = g.axis === 'x' ? (v: number) => `M ${v} ${g.at - t} L ${v} ${g.at + t}` : (v: number) => `M ${g.at - t} ${v} L ${g.at + t} ${v}`;
            return (
              <g key={`gap${i}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={GUIDE} strokeWidth={sw} />
                <path d={`${cross(g.from)} ${cross(g.to)}`} stroke={GUIDE} strokeWidth={sw} />
                <text x={(x1 + x2) / 2 + (g.axis === 'y' ? 5 / scale : 0)} y={(y1 + y2) / 2 - (g.axis === 'x' ? 5 / scale : 0)} fill={GUIDE} fontSize={10 / scale} textAnchor={g.axis === 'x' ? 'middle' : 'start'}>
                  {Math.round(g.to - g.from)}
                </text>
              </g>
            );
          })}
          {rotateKnob && !selected!.hidden && <line x1={rotateKnob.from[0]} y1={rotateKnob.from[1]} x2={rotateKnob.to[0]} y2={rotateKnob.to[1]} stroke={ACCENT} strokeWidth={sw} />}
          {rotArc && (
            <g>
              <path d={arcPath(rotArc)} fill="rgba(255,61,113,0.15)" stroke={GUIDE} strokeWidth={sw} />
              <circle cx={rotArc.pivot[0]} cy={rotArc.pivot[1]} r={2.5 / scale} fill={GUIDE} />
            </g>
          )}
          {measureHover && (
            <g>
              <polygon points={poly(measureHover)} fill="rgba(255,61,113,0.06)" stroke={GUIDE} strokeWidth={sw} strokeDasharray={dash} />
              {(() => {
                const b = bounds(outline(measureHover));
                return (
                  <text x={b.x + b.w / 2} y={b.y + b.h + 13 / scale} fill="#fff" fontWeight={600} fontSize={10 / scale} textAnchor="middle" style={{ paintOrder: 'stroke' }} stroke={GUIDE} strokeWidth={3.5 / scale}>
                    {r1(b.w)} × {r1(b.h)}
                  </text>
                );
              })()}
            </g>
          )}
          {m && mlen > 0 && (
            <g>
              {/* legs */}
              <path d={`M ${m.a[0]} ${m.a[1]} L ${m.b[0]} ${m.a[1]} L ${m.b[0]} ${m.b[1]}`} fill="none" stroke={GUIDE} strokeOpacity={0.55} strokeWidth={sw} strokeDasharray={dash} />
              <line x1={m.a[0]} y1={m.a[1]} x2={m.b[0]} y2={m.b[1]} stroke="rgba(0,0,0,0.6)" strokeWidth={3 * sw} />
              <line x1={m.a[0]} y1={m.a[1]} x2={m.b[0]} y2={m.b[1]} stroke={GUIDE} strokeWidth={1.5 * sw} />
              {[m.a, m.b].map((p, i) => (
                <g key={i}>
                  <circle cx={p[0]} cy={p[1]} r={3.5 / scale} fill="#fff" stroke={GUIDE} strokeWidth={1.5 * sw} />
                  <path d={`M ${p[0] - 7 / scale} ${p[1]} L ${p[0] + 7 / scale} ${p[1]} M ${p[0]} ${p[1] - 7 / scale} L ${p[0]} ${p[1] + 7 / scale}`} stroke={GUIDE} strokeWidth={sw} />
                </g>
              ))}
              {Math.abs(mdx) > 12 / scale && (
                <text x={(m.a[0] + m.b[0]) / 2} y={m.a[1] + (mdy > 0 ? -5 : 13) / scale} fill="#fff" fontWeight={600} fontSize={10 / scale} textAnchor="middle" style={{ paintOrder: 'stroke' }} stroke={GUIDE} strokeWidth={3.5 / scale}>
                  {r1(Math.abs(mdx))}
                </text>
              )}
              {Math.abs(mdy) > 12 / scale && (
                <text x={m.b[0] + (mdx > 0 ? 5 : -5) / scale} y={(m.a[1] + m.b[1]) / 2} fill="#fff" fontWeight={600} fontSize={10 / scale} textAnchor={mdx > 0 ? 'start' : 'end'} dominantBaseline="middle" style={{ paintOrder: 'stroke' }} stroke={GUIDE} strokeWidth={3.5 / scale}>
                  {r1(Math.abs(mdy))}
                </text>
              )}
            </g>
          )}
        </svg>
      )}
      {mode === 'edit' &&
        selected &&
        !selected.hidden &&
        handlePoints.map(({ h, p }) => (
          <div
            key={h.join()}
            onPointerDown={(e) => startResize(e, h)}
            title={comp ? 'Scale the component (Shift: keep proportions)' : 'Resize (Shift: keep proportions)'}
            className="absolute bg-white"
            style={{
              left: p[0] - 4 / scale,
              top: p[1] - 4 / scale,
              width: 8 / scale,
              height: 8 / scale,
              border: `${1.5 / scale}px solid ${comp ? MEANING.component.color : ACCENT}`,
              borderRadius: comp ? '50%' : 0,
              cursor: h[0] && h[1] ? (h[0] === h[1] ? 'nwse-resize' : 'nesw-resize') : h[0] ? 'ew-resize' : 'ns-resize',
              touchAction: 'none',
            }}
          />
        ))}
      {mode === 'edit' && rotateKnob && selected && !selected.hidden && (
        <div
          onPointerDown={startRotate}
          title="Rotate (Shift: 15° steps)"
          className="absolute bg-white rounded-full"
          style={{
            left: rotateKnob.to[0] - 5 / scale,
            top: rotateKnob.to[1] - 5 / scale,
            width: 10 / scale,
            height: 10 / scale,
            border: `${1.5 / scale}px solid ${ACCENT}`,
            cursor: 'grab',
            touchAction: 'none',
          }}
        />
      )}
      {mode === 'edit' && selected && selBox && !readout && (
        <div
          className="absolute pointer-events-none whitespace-nowrap font-medium text-white"
          style={{
            left: (multiBox ?? selBox).x,
            top: (multiBox ?? selBox).y - 20 / scale,
            fontSize: 11 / scale,
            padding: `${1 / scale}px ${5 / scale}px`,
            borderRadius: 3 / scale,
            background: multiBox ? ACCENT : blockedBy(selected.id, lockedIds) || !selected.editable ? MEANING.locked.color : comp ? MEANING.component.color : ACCENT,
          }}
        >
          {multiBox ? `${selectedNodes.length} layers` : selected.name}
          {!multiBox && selected.hiddenOnConsole ? ' · hidden in theme' : ''}
          {!multiBox && blockedBy(selected.id, lockedIds) ? ' · locked' : ''}
        </div>
      )}
      {mode === 'edit' && selected && selBox && !readout && tool === 'select' && !selectOnly && (
        <div
          className="absolute pointer-events-none whitespace-nowrap tabular-nums text-white"
          style={{
            left: (multiBox ?? selBox).x + (multiBox ?? selBox).w / 2,
            top: (multiBox ?? selBox).y + (multiBox ?? selBox).h + 6 / scale,
            transform: 'translateX(-50%)',
            fontSize: 10 / scale,
            padding: `${1 / scale}px ${4 / scale}px`,
            borderRadius: 3 / scale,
            background: 'rgba(0,0,0,0.65)',
          }}
        >
          {r1((multiBox ?? selBox).w)} × {r1((multiBox ?? selBox).h)}
          {!multiBox && Math.abs(selected.rotation) > 0.05 ? ` · ${r1(-selected.rotation)}°` : ''}
        </div>
      )}
      {mode === 'edit' && m && mlen > 0 && (
        <div
          className="absolute pointer-events-none whitespace-nowrap tabular-nums text-white"
          style={{
            left: (m.a[0] + m.b[0]) / 2,
            top: (m.a[1] + m.b[1]) / 2,
            transform: `translate(-50%, ${mdy * mdx > 0 ? '20%' : '-120%'})`,
            fontSize: 11 / scale,
            lineHeight: 1.35,
            padding: `${3 / scale}px ${6 / scale}px`,
            borderRadius: 4 / scale,
            background: GUIDE,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          <b>{r1(mlen)} px</b>
          <span style={{ opacity: 0.85 }}>
            {' '}
            · Δx {r1(mdx)} · Δy {r1(mdy)} · {r1(mang)}°
          </span>
        </div>
      )}
      {readout && (
        <div
          className="absolute pointer-events-none tabular-nums text-white"
          style={{
            left: readout.at[0] + 14 / scale,
            top: readout.at[1] + 16 / scale,
            fontSize: 11 / scale,
            lineHeight: 1.35,
            padding: `${3 / scale}px ${6 / scale}px`,
            borderRadius: 4 / scale,
            background: 'rgba(20,20,24,0.92)',
            border: `${1 / scale}px solid ${readout.warn ? 'var(--warn)' : 'rgba(255,255,255,0.12)'}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            maxWidth: 260 / scale,
          }}
        >
          {readout.lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap', fontWeight: i === 0 ? 600 : 400, opacity: i === 0 ? 1 : 0.75 }}>
              {l}
            </div>
          ))}
          {readout.warn && <div style={{ color: 'var(--warn)', marginTop: 2 / scale, whiteSpace: 'normal' }}>⚠ {readout.warn}</div>}
        </div>
      )}
    </div>
  );
};
