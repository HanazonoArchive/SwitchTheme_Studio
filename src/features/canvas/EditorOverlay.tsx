import React, { useMemo, useRef, useState } from 'react';
import { isComponent, type Scene, type SceneNode } from '../../lib/render/scene';
import { apply, applyLinear, bounds, invert, quad } from '../../lib/render/matrix';

/**
 * Selection, hover, handles, drag-to-move with snapping and smart guides, and resize — drawn
 * as SVG over the Pixi canvas in the same 1280×720 space. Hit testing uses the scene's world
 * matrices, so what you click is exactly what is drawn there.
 *
 * Parts (prt1: a game icon, an applet button, a settings row) are components, as in Figma:
 * clicking selects the whole component, so moving it moves everything in it. Double-click goes
 * one level deeper; once inside, clicks pick at that level. Ctrl/Cmd+click picks the exact layer.
 */

export interface SnapSettings {
  grid: boolean;
  gridSize: number;
  guides: boolean;
}

interface Props {
  scene: Scene;
  /** Screen pixels per layout pixel. */
  scale: number;
  mode: 'edit' | 'preview';
  selectedId: string | null;
  hiddenIds: ReadonlySet<string>;
  lockedIds: ReadonlySet<string>;
  showAllOutlines: boolean;
  snap: SnapSettings;
  onSelect: (node: SceneNode | null) => void;
  onDrag: (key: string, dx: number, dy: number, phase: 'start' | 'move' | 'end') => void;
  onResize: (key: string, change: { dx: number; dy: number; w: number; h: number }, phase: 'start' | 'move' | 'end') => void;
  onFocusGame: (index: number) => void;
}

const KIND_COLOR: Record<string, string> = { pic1: '#e879f9', txt1: '#22d3ee', prt1: '#facc15', wnd1: '#fb923c', pan1: '#a1a1aa', bnd1: '#a1a1aa' };
const ACCENT = '#2f7cf6';
const GUIDE = '#ff3d71';
const SNAP_PX = 6;

/** Ids hidden or locked by themselves or an ancestor. */
const blockedBy = (id: string, set: ReadonlySet<string>) => {
  if (!set.size) return false;
  for (const s of set) if (id === s || id.startsWith(s + '/')) return true;
  return false;
};

const inside = (n: SceneNode, x: number, y: number) => {
  const [lx, ly] = apply(invert(n.world), x, y);
  const r = n.rect;
  return lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h;
};

type Drag =
  | { kind: 'move'; node: SceneNode; x0: number; y0: number; box: { x: number; y: number; w: number; h: number }; xs: number[]; ys: number[] }
  | { kind: 'resize'; node: SceneNode; x0: number; y0: number; handle: [number, number] }
  | { kind: 'pending'; node: SceneNode; x0: number; y0: number };

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

export const EditorOverlay: React.FC<Props> = ({ scene, scale, mode, selectedId, hiddenIds, lockedIds, showAllOutlines, snap, onSelect, onDrag, onResize, onFocusGame }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const drag = useRef<Drag | null>(null);
  // Double-click detection on pointerdown (PointerEvent.detail isn't a reliable click count).
  const lastDown = useRef<{ t: number; x: number; y: number } | null>(null);

  const byId = useMemo(() => new Map(scene.flat.map((n) => [n.id, n])), [scene]);
  /** Things you can click: editable, drawn, not hidden or locked in the editor. */
  const pickable = useMemo(
    () => scene.flat.filter((n) => n.key && n.editable && !n.hidden && n.opacity > 0.02 && (n.content || (showAllOutlines && n.kind !== 'pan1' && n.kind !== 'group')) && !blockedBy(n.id, hiddenIds) && !blockedBy(n.id, lockedIds)),
    [scene, showAllOutlines, hiddenIds, lockedIds],
  );
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const parentOf = useMemo(() => {
    const m = new Map<string, SceneNode>();
    const walk = (n: SceneNode) => n.children.forEach((c) => (m.set(c.id, n), walk(c)));
    walk(scene.root);
    return m;
  }, [scene]);

  /**
   * What the outline shows: a pane's own rect, or for a component the box around what it draws
   * (a slot's rect says nothing about the icon qlaunch puts in it).
   */
  const outline = (n: SceneNode): [number, number][] => {
    if (!isComponent(n)) return quad(n.world, n.rect);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const walk = (c: SceneNode) => {
      if (c.hidden) return;
      if (c.content && c.opacity > 0.02) {
        const b = bounds(quad(c.world, c.rect));
        if (b.w < scene.width * 1.5 && b.h < scene.height * 1.5) {
          x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
        }
      }
      c.children.forEach(walk);
    };
    walk(n);
    if (x0 === Infinity) return quad(n.world, n.rect);
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  };

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

  const toLayout = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  };
  const hit = (x: number, y: number) => {
    for (let i = pickable.length - 1; i >= 0; i--) if (inside(pickable[i], x, y)) return pickable[i];
    return null;
  };

  /** Snap lines from everything else that is drawn, plus the screen's edges and centre. */
  const snapLines = (moving: SceneNode) => {
    const xs = [0, scene.width / 2, scene.width];
    const ys = [0, scene.height / 2, scene.height];
    for (const n of scene.flat) {
      if (!n.content || n.hidden || n.opacity < 0.02 || n.id === moving.id || n.id.startsWith(moving.id + '/') || blockedBy(n.id, hiddenIds)) continue;
      const b = bounds(quad(n.world, n.rect));
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

  const startMove = (node: SceneNode, x: number, y: number) => {
    const box = bounds(outline(node));
    const { xs, ys } = snapLines(node);
    drag.current = { kind: 'move', node, x0: x, y0: y, box, xs, ys };
    onDrag(node.key, 0, 0, 'start');
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
    // Keep dragging the current selection when clicking inside it (even if something is on top).
    const deep = e.ctrlKey || e.metaKey;
    const prev = lastDown.current;
    const twice = !!prev && e.timeStamp - prev.t < 400 && Math.hypot(x - prev.x, y - prev.y) * scale < 5;
    lastDown.current = twice ? null : { t: e.timeStamp, x, y };
    const n =
      selected && !blockedBy(selected.id, lockedIds) && inside(selected, x, y) && !e.altKey && !deep && !twice
        ? selected
        : resolve(hit(x, y), deep ? 'deep' : twice ? 'into' : 'click');
    onSelect(n);
    if (n) drag.current = { kind: 'pending', node: n, x0: x, y0: y };
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
    const d = drag.current;
    if (!d) {
      if (mode === 'edit') setHoverId(resolve(hit(x, y), e.ctrlKey || e.metaKey ? 'deep' : 'click')?.id ?? null);
      return;
    }
    if (d.kind === 'pending') {
      if (Math.hypot(x - d.x0, y - d.y0) * scale < 3) return;
      startMove(d.node, d.x0, d.y0);
    }
    const cur = drag.current!;
    if (cur.kind === 'move') {
      let dx = x - cur.x0;
      let dy = y - cur.y0;
      const free = e.altKey;
      const b = cur.box;
      const sx = free ? { d: 0, at: [] } : snapAxis([b.x + dx, b.x + dx + b.w / 2, b.x + dx + b.w], cur.xs, true);
      const sy = free ? { d: 0, at: [] } : snapAxis([b.y + dy, b.y + dy + b.h / 2, b.y + dy + b.h], cur.ys, true);
      dx += sx.d;
      dy += sy.d;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      setGuides({ x: sx.at, y: sy.at });
      // Screen delta -> the parent's space -> layout units (Y up).
      const [lx, ly] = applyLinear(invert(cur.node.parentWorld), dx, dy);
      onDrag(cur.node.key, lx / cur.node.posScale.x, -ly / cur.node.posScale.y, 'move');
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
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGuides({ x: [], y: [] });
    if (!d) return;
    ref.current?.releasePointerCapture(e.pointerId);
    if (d.kind === 'move') onDrag(d.node.key, 0, 0, 'end');
    if (d.kind === 'resize') onResize(d.node.key, { dx: 0, dy: 0, w: 0, h: 0 }, 'end');
  };

  const startResize = (e: React.PointerEvent, handle: [number, number]) => {
    if (!selected || e.button !== 0) return;
    e.stopPropagation();
    const [x, y] = toLayout(e);
    ref.current!.setPointerCapture(e.pointerId);
    drag.current = { kind: 'resize', node: selected, x0: x, y0: y, handle };
    onResize(selected.key, { dx: 0, dy: 0, w: 0, h: 0 }, 'start');
  };

  const sw = 1 / scale;
  const poly = (n: SceneNode) =>
    outline(n)
      .map((p) => p.join(','))
      .join(' ');
  const hover = hoverId && hoverId !== selectedId ? byId.get(hoverId) : null;
  const selQuad = selected ? outline(selected) : null;
  // A code-filled slot's size doesn't change what's in it, so it gets no resize handles.
  const resizable = !!selected && (selected.kind === 'prt1' || !isComponent(selected));
  const handlePoints = selQuad
    ? HANDLES.map(([hx, hy]) => {
        const r = selected!.rect;
        return { h: [hx, hy] as [number, number], p: apply(selected!.world, r.x + ((hx + 1) / 2) * r.w, r.y + ((hy + 1) / 2) * r.h) };
      })
    : [];
  const labelAt = selQuad ? bounds(selQuad) : null;

  return (
    <div
      ref={ref}
      className="absolute inset-0"
      style={{ cursor: mode === 'preview' ? 'default' : hover ? 'pointer' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setHoverId(null)}
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
          {showAllOutlines &&
            pickable.map((n) => <polygon key={n.id} points={poly(n)} fill="none" stroke={KIND_COLOR[n.kind] ?? '#a1a1aa'} strokeOpacity={0.75} strokeWidth={sw} />)}
          {hover && <polygon points={poly(hover)} fill="none" stroke={ACCENT} strokeWidth={1.5 * sw} />}
          {selected && selQuad && (
            <>
              <polygon points={poly(selected)} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={3.5 * sw} />
              <polygon points={poly(selected)} fill="none" stroke={ACCENT} strokeWidth={1.5 * sw} strokeDasharray={selected.hidden ? `${4 * sw} ${3 * sw}` : undefined} />
            </>
          )}
          {guides.x.map((gx) => (
            <line key={`gx${gx}`} x1={gx} x2={gx} y1={0} y2={scene.height} stroke={GUIDE} strokeWidth={sw} />
          ))}
          {guides.y.map((gy) => (
            <line key={`gy${gy}`} y1={gy} y2={gy} x1={0} x2={scene.width} stroke={GUIDE} strokeWidth={sw} />
          ))}
        </svg>
      )}
      {mode === 'edit' && selected && resizable && !selected.hidden && !blockedBy(selected.id, lockedIds) &&
        handlePoints.map(({ h, p }) => (
          <div
            key={h.join()}
            onPointerDown={(e) => startResize(e, h)}
            className="absolute bg-white"
            style={{
              left: p[0] - 4 / scale,
              top: p[1] - 4 / scale,
              width: 8 / scale,
              height: 8 / scale,
              border: `${1.5 / scale}px solid ${ACCENT}`,
              cursor: h[0] && h[1] ? (h[0] === h[1] ? 'nwse-resize' : 'nesw-resize') : h[0] ? 'ew-resize' : 'ns-resize',
            }}
          />
        ))}
      {mode === 'edit' && selected && labelAt && (
        <div
          className="absolute pointer-events-none whitespace-nowrap font-medium text-white"
          style={{ left: labelAt.x, top: labelAt.y - 20 / scale, fontSize: 11 / scale, padding: `${1 / scale}px ${5 / scale}px`, borderRadius: 3 / scale, background: ACCENT }}
        >
          {selected.name}
          {selected.hidden ? ' (hidden)' : ''}
        </div>
      )}
    </div>
  );
};
