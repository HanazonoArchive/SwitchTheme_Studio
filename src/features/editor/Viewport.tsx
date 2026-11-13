import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Grid3x3, Info, Magnet, Minus, Moon, MousePointer2, Plus, Ruler, Scan, Square, Sun, ArrowLeft, SquareDashed } from 'lucide-react';
import type { ThemeScreen } from '../../types/theme';
import type { Scene, SceneNode } from '../../lib/render/scene';
import type { MockSystemState } from '../../types/simulation';
import { useWallpaperPreview } from '../../lib/theme/useWallpaperPreview';
import { STOCK_BG } from '../../lib/theme/stock';
import { bounds } from '../../lib/render/matrix';
import { PixiView, type Underlay } from '../canvas/PixiView';
import { EditorOverlay, type MoveDelta, type SnapSettings, type Tool, type TransformChange } from '../canvas/EditorOverlay';
import { LINES, MEANING, nodeOutline, TILE_SUFFIX, unionBox, type Exploded, type Pt } from '../canvas/geometry';

interface ViewportProps {
  activeScreen: ThemeScreen | null;
  scene: Scene | null;
  /** Drawn blurred behind the screen (Home behind Player select). */
  underlay?: Underlay | null;
  /** A component's layers side by side (Layer view), drawn instead of the screen. */
  exploded: Exploded | null;
  onExitExploded: () => void;
  /** Shown under the Layer view bar ("N_Foo isn't a component"). */
  explodeNotice?: string | null;
  mode: 'edit' | 'preview';
  mockState: MockSystemState;
  selectedIds: string[];
  hiddenIds: ReadonlySet<string>;
  lockedIds: ReadonlySet<string>;
  changedKeys: ReadonlySet<string>;
  snap: SnapSettings;
  onSnapChange: (s: SnapSettings) => void;
  onSelect: (node: SceneNode | null, how?: 'replace' | 'toggle') => void;
  onSelectMany: (nodes: SceneNode[], additive: boolean) => void;
  onMovePanes: (moves: MoveDelta[], phase: 'start' | 'move' | 'end') => void;
  onResizePane: (key: string, change: TransformChange, phase: 'start' | 'move' | 'end') => void;
  onContextMenu: (at: { x: number; y: number }, under: SceneNode[], target: SceneNode | null) => void;
  onUpdateMockState: (updates: Partial<MockSystemState>) => void;
  onDropFile: (file: File) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const RULER = 20;
const EMPTY: ReadonlySet<string> = new Set();

/** Ruler tick spacing for a zoom: majors at least ~60 screen px apart. */
function ticks(scale: number) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  const major = steps.find((s) => s * scale >= 60) ?? 2000;
  const minor = major / (major % 5 === 0 ? 5 : 4);
  return { major, minor: minor * scale >= 5 ? minor : major / 2 };
}

/** One ruler along the top or the left edge, in layout units (console pixels). */
const RulerBar: React.FC<{
  axis: 'x' | 'y';
  length: number;
  origin: number;
  scale: number;
  extent: number;
  band: [number, number] | null;
  cursor: number | null;
}> = ({ axis, length, origin, scale, extent, band, cursor }) => {
  const { major, minor } = ticks(scale);
  const u0 = Math.floor(-origin / scale / minor) * minor;
  const u1 = (length - origin) / scale;
  const lines: React.ReactNode[] = [];
  for (let u = u0, i = 0; u <= u1 && i < 2000; u += minor, i++) {
    const p = origin + u * scale;
    const isMajor = Math.abs(u / major - Math.round(u / major)) < 1e-6;
    const t = isMajor ? RULER : u % (major / 2) === 0 ? RULER * 0.45 : RULER * 0.25;
    lines.push(
      axis === 'x' ? <line key={u} x1={p} x2={p} y1={RULER - t} y2={RULER} /> : <line key={u} y1={p} y2={p} x1={RULER - t} x2={RULER} />,
    );
    if (isMajor)
      lines.push(
        axis === 'x' ? (
          <text key={`t${u}`} x={p + 3} y={9} fontSize={9}>
            {Math.round(u)}
          </text>
        ) : (
          <text key={`t${u}`} x={9} y={p + 3} fontSize={9} transform={`rotate(-90 9 ${p + 3})`}>
            {Math.round(u)}
          </text>
        ),
      );
  }
  const seg = (a: number, b: number, fill: string, key: string) =>
    axis === 'x' ? <rect key={key} x={origin + a * scale} y={0} width={(b - a) * scale} height={RULER} fill={fill} /> : <rect key={key} y={origin + a * scale} x={0} height={(b - a) * scale} width={RULER} fill={fill} />;
  return (
    <svg
      className="absolute pointer-events-none text-[var(--text-3)]"
      style={axis === 'x' ? { left: 0, top: 0, width: length, height: RULER } : { left: 0, top: 0, width: RULER, height: length }}
      width={axis === 'x' ? length : RULER}
      height={axis === 'x' ? RULER : length}
    >
      <rect width="100%" height="100%" fill="var(--panel)" />
      {seg(0, extent, 'rgba(255,255,255,0.045)', 'screen')}
      {band && seg(band[0], band[1], 'rgba(47,124,246,0.28)', 'band')}
      <g stroke="currentColor" strokeWidth={1} fill="currentColor" shapeRendering="crispEdges" style={{ fontFamily: 'ui-monospace, monospace' }}>
        {lines}
      </g>
      {band && (
        <g stroke={MEANING.selected.color} strokeWidth={1} shapeRendering="crispEdges">
          {axis === 'x' ? (
            <>
              <line x1={origin + band[0] * scale} x2={origin + band[0] * scale} y1={0} y2={RULER} />
              <line x1={origin + band[1] * scale} x2={origin + band[1] * scale} y1={0} y2={RULER} />
            </>
          ) : (
            <>
              <line y1={origin + band[0] * scale} y2={origin + band[0] * scale} x1={0} x2={RULER} />
              <line y1={origin + band[1] * scale} y2={origin + band[1] * scale} x1={0} x2={RULER} />
            </>
          )}
        </g>
      )}
      {cursor !== null &&
        (axis === 'x' ? (
          <line x1={origin + cursor * scale} x2={origin + cursor * scale} y1={0} y2={RULER} stroke={MEANING.guide.color} strokeWidth={1} />
        ) : (
          <line y1={origin + cursor * scale} y2={origin + cursor * scale} x1={0} x2={RULER} stroke={MEANING.guide.color} strokeWidth={1} />
        ))}
      {axis === 'x' ? <line x1={0} x2={length} y1={RULER - 0.5} y2={RULER - 0.5} stroke="var(--border)" /> : <line y1={0} y2={length} x1={RULER - 0.5} x2={RULER - 0.5} stroke="var(--border)" />}
    </svg>
  );
};

/** What outline colours and line styles mean. */
export const Legend: React.FC = () => (
  <div className="space-y-2 text-[12px]">
    <div className="space-y-1">
      {Object.values(MEANING).map((m) => (
        <div key={m.label} className="flex items-center gap-2">
          <span className="w-5 h-3 rounded-sm shrink-0" style={{ border: `2px solid ${m.color}` }} />
          <span className="text-[var(--text-2)]">{m.label}</span>
        </div>
      ))}
    </div>
    <div className="h-px bg-[var(--border)]" />
    <div className="space-y-1">
      {(['solid', 'dashed', 'dotted', 'thin'] as const).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <svg width="20" height="8" className="shrink-0">
            <line x1="1" y1="4" x2="19" y2="4" stroke="var(--text)" strokeWidth={k === 'thin' ? 1 : 2} strokeDasharray={k === 'dashed' ? '5 3' : k === 'dotted' ? '1.5 2.5' : undefined} />
          </svg>
          <span className="text-[var(--text-2)]">{LINES[k]}</span>
        </div>
      ))}
    </div>
  </div>
);

export const Viewport: React.FC<ViewportProps> = ({
  underlay,
  activeScreen,
  scene,
  exploded,
  onExitExploded,
  explodeNotice,
  mode,
  mockState,
  selectedIds,
  hiddenIds,
  lockedIds,
  changedKeys,
  snap,
  onSnapChange,
  onSelect,
  onSelectMany,
  onMovePanes,
  onResizePane,
  onContextMenu,
  onUpdateMockState,
  onDropFile,
}) => {
  const wallpaperUrl = useWallpaperPreview(activeScreen?.wallpaper ?? null, activeScreen?.adjustments ?? { brightness: 1, contrast: 1, dim: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1280, height: 720 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panning = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [space, setSpace] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [rulers, setRulers] = useState(true);
  const [legend, setLegend] = useState(false);
  const [cursor, setCursor] = useState<Pt | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => containerRef.current && setSize({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Space held: drag anywhere pans (like Figma). V / M pick a tool, Shift+R toggles the rulers.
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.code === 'Space') {
        setSpace(true);
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'm') setTool((t) => (t === 'measure' ? 'select' : 'measure'));
      else if (k === 'v') setTool('select');
      else if (k === 'r' && e.shiftKey) setRulers((r) => !r);
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const shown = exploded?.scene ?? scene;
  const w = shown?.width ?? 1280;
  const h = shown?.height ?? 720;
  const inset = rulers && mode === 'edit' ? RULER : 0;
  const fit = Math.min((size.width - 64 - inset) / w, (size.height - 96 - inset) / h);
  useEffect(() => {
    view.current = { zoom, pan, fit, size, inset };
  });

  // Wheel zooms around the cursor (Shift + wheel pans sideways, a trackpad's two-finger scroll with
  // Ctrl is a pinch). The listener is native and non-passive so the browser doesn't zoom the page.
  const view = useRef({ zoom: 1, pan: { x: 0, y: 0 }, fit: 1, size: { width: 1280, height: 720 }, inset: 0 });
  const hasScreen = Boolean(activeScreen);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      if (e.shiftKey && !e.ctrlKey) {
        setPan({ x: v.pan.x - (e.deltaY || e.deltaX), y: v.pan.y });
        return;
      }
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left - (v.size.width + v.inset) / 2 - v.pan.x;
      const cy = e.clientY - r.top - ((v.size.height + v.inset) / 2 - 16) - v.pan.y;
      const step = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const next = Math.min(MAX_ZOOM / Math.max(v.fit, 0.01), Math.max(MIN_ZOOM, v.zoom * Math.exp(-step * (e.ctrlKey ? 0.01 : 0.0018))));
      const k = next / v.zoom;
      setPan({ x: v.pan.x - cx * (k - 1), y: v.pan.y - cy * (k - 1) });
      setZoom(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasScreen]);

  const background = React.useMemo(
    () => (exploded ? { color: 'rgba(0,0,0,0)' } : wallpaperUrl ? { url: wallpaperUrl } : { color: mockState.isDarkTheme ? STOCK_BG.dark : STOCK_BG.light }),
    [wallpaperUrl, mockState.isDarkTheme, exploded],
  );

  const scale = Math.max(0.05, fit * zoom);
  const left = (size.width + inset) / 2 - (w * scale) / 2 + pan.x;
  const top = (size.height + inset) / 2 - (h * scale) / 2 + pan.y - 16;

  // Selection extent on the rulers.
  const band = useMemo(() => {
    if (!shown || !selectedIds.length) return null;
    const byId = new Map(shown.flat.map((n) => [n.id, n]));
    return unionBox(
      selectedIds
        .map((id) => byId.get(id))
        .filter((n): n is SceneNode => !!n)
        .map((n) => bounds(nodeOutline(shown, n))),
    );
  }, [shown, selectedIds]);

  if (!activeScreen) return null;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const zoomTo = (z: number) => setZoom(Math.min(MAX_ZOOM / Math.max(fit, 0.01), Math.max(MIN_ZOOM, z)));
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || space || e.target === e.currentTarget) {
      panning.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      setIsPanning(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (e.target === e.currentTarget && e.button === 0 && !space) onSelect(null);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = panning.current;
    if (p) setPan({ x: p.px + e.clientX - p.x, y: p.py + e.clientY - p.y });
  };
  const onPointerUp = () => {
    panning.current = null;
    setIsPanning(false);
  };

  const games = mockState.games.length;
  const showRulers = rulers && mode === 'edit';
  return (
    <section className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-[var(--canvas)] relative">
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden ui-canvas-bg"
        onPointerDownCapture={(e) => {
          if (space || e.button === 1) {
            e.stopPropagation();
            onPointerDown(e);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.target === e.currentTarget && e.preventDefault()}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) onDropFile(f);
        }}
        style={{ cursor: isPanning ? 'grabbing' : space ? 'grab' : undefined, touchAction: 'none' }}
      >
        <div
          className="absolute"
          style={{
            width: w * scale,
            height: h * scale,
            left,
            top,
            // Layer view floats on the canvas itself, without the screen's frame.
            boxShadow: exploded ? undefined : '0 0 0 1px rgba(255,255,255,0.06), 0 8px 30px rgba(0,0,0,0.45)',
          }}
        >
          <div className="absolute left-0 top-0 overflow-hidden" style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
            <PixiView scene={shown} underlay={exploded ? null : underlay} background={background} resolution={Math.min(4, dpr * scale)} hiddenIds={exploded ? EMPTY : hiddenIds} />
          </div>
          {exploded && (
            <div className="absolute left-0 top-0 pointer-events-none" style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              <svg className="absolute inset-0 overflow-visible" width={w} height={h}>
                {exploded.tiles.map((t) => {
                  const on = selectedIds.includes(t.id);
                  const mx = (t.from[0] + t.to[0]) / 2;
                  return (
                    <g key={t.id} opacity={on ? 1 : 0.55}>
                      <path
                        d={`M ${t.from[0]} ${t.from[1]} C ${mx} ${t.from[1]}, ${mx} ${t.to[1]}, ${t.to[0]} ${t.to[1]}`}
                        fill="none"
                        stroke={on ? MEANING.selected.color : 'rgba(170,190,255,0.7)'}
                        strokeWidth={(on ? 1.6 : 1) / scale}
                        strokeDasharray={on ? undefined : `${4 / scale} ${3 / scale}`}
                      />
                      <circle cx={t.to[0]} cy={t.to[1]} r={(on ? 3.5 : 2.5) / scale} fill={on ? MEANING.selected.color : 'rgba(170,190,255,0.9)'} />
                      <circle cx={t.from[0]} cy={t.from[1]} r={2 / scale} fill={on ? MEANING.selected.color : 'rgba(170,190,255,0.9)'} />
                    </g>
                  );
                })}
              </svg>
              {exploded.tiles.map((t) => {
                const on = selectedIds.includes(t.id);
                const fs = Math.min(12 / scale, t.box.h * 0.3);
                return (
                  <div
                    key={t.id}
                    className="absolute rounded-lg"
                    style={{
                      left: t.box.x,
                      top: t.box.y,
                      width: t.box.w,
                      height: t.box.h,
                      border: `${(on ? 1.5 : 1) / scale}px solid ${on ? MEANING.selected.color : 'rgba(255,255,255,0.12)'}`,
                      boxShadow: on ? `0 0 0 ${3 / scale}px rgba(47,124,246,0.25)` : undefined,
                    }}
                  >
                    <div
                      className="absolute flex flex-col justify-center min-w-0"
                      style={{ left: t.thumb.x - t.box.x + t.thumb.w + 8, right: 8, top: 0, bottom: 0, fontSize: fs, lineHeight: 1.25 }}
                    >
                      <div className="whitespace-nowrap overflow-hidden text-ellipsis font-medium" style={{ color: on ? '#fff' : 'rgba(255,255,255,0.88)' }} title={t.name}>
                        {t.name}
                      </div>
                      <div className="whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: fs * 0.85, color: 'rgba(255,255,255,0.5)' }}>
                        {t.kind}
                        {t.note && <span style={{ color: t.note === 'hidden in theme' ? MEANING.hiddenInTheme.color : '#a1a1aa' }}> · {t.note}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {shown && (
            <div className="absolute left-0 top-0" style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: space ? 'none' : undefined }}>
              <EditorOverlay
                scene={shown}
                scale={scale}
                mode={mode}
                tool={tool}
                selectedIds={selectedIds}
                hiddenIds={exploded ? EMPTY : hiddenIds}
                lockedIds={lockedIds}
                changedKeys={changedKeys}
                showAllOutlines={mockState.wireframeMode}
                snap={exploded ? { ...snap, guides: false } : snap}
                onSelect={exploded ? (n, how) => onSelect(n && n.id.endsWith(TILE_SUFFIX) ? (shown.flat.find((x) => x.id === n.id.slice(0, -TILE_SUFFIX.length)) ?? null) : n, how) : onSelect}
                onSelectMany={onSelectMany}
                selectOnly={!!exploded}
                onMove={onMovePanes}
                onResize={onResizePane}
                onContextMenu={onContextMenu}
                onCursor={setCursor}
                onToolChange={setTool}
                onFocusGame={(i) => onUpdateMockState({ selectedGameIndex: i })}
              />
            </div>
          )}
        </div>

        {showRulers && (
          <>
            <div className="absolute z-10 pointer-events-none" style={{ left: RULER, top: 0, right: 0, height: RULER }}>
              <RulerBar axis="x" length={size.width - RULER} origin={left - RULER} scale={scale} extent={w} band={band ? [band.x, band.x + band.w] : null} cursor={cursor ? cursor[0] : null} />
            </div>
            <div className="absolute z-10 pointer-events-none" style={{ left: 0, top: RULER, bottom: 0, width: RULER }}>
              <RulerBar axis="y" length={size.height - RULER} origin={top - RULER} scale={scale} extent={h} band={band ? [band.y, band.y + band.h] : null} cursor={cursor ? cursor[1] : null} />
            </div>
            <div
              className="absolute z-10 left-0 top-0 bg-[var(--panel)] border-r border-b border-[var(--border)] flex items-center justify-center text-[8px] text-[var(--text-3)]"
              style={{ width: RULER, height: RULER }}
              title="Rulers in console pixels (1280×720). Shift+R hides them."
            >
              px
            </div>
            {cursor && (
              <div className="absolute z-10 pointer-events-none text-[10px] tabular-nums text-[var(--text-2)] bg-[var(--panel)] border border-[var(--border)] rounded px-1.5 py-0.5" style={{ right: 8, top: RULER + 6 }}>
                {Math.round(cursor[0])}, {Math.round(cursor[1])}
              </div>
            )}
          </>
        )}

        {exploded && (
          <div className="absolute z-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 max-w-[calc(100%-48px)]" style={{ top: inset + 8 }}>
            <div className="flex items-center gap-2 h-8 pl-1 pr-3 max-w-full whitespace-nowrap rounded-lg bg-[var(--panel)] border border-[var(--border)] shadow-[0_4px_16px_rgba(0,0,0,0.35)] text-[12px]">
              <button
                className="h-6 pl-1.5 pr-2 rounded-md flex items-center gap-1 text-[12px] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--hover)] shrink-0"
                onClick={onExitExploded}
                title="Back to the screen (Esc)"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <span className="w-px h-4 bg-[var(--border)] shrink-0" />
              <span className="font-medium shrink-0" style={{ color: MEANING.component.color }}>
                Layer view
              </span>
              <span className="text-[var(--text-2)] truncate min-w-0" title={`${exploded.title} · ${exploded.tiles.length} layers`}>
                {exploded.title} · {exploded.tiles.length} {exploded.tiles.length === 1 ? 'layer' : 'layers'} · pick a component in Layers to open it here
              </span>
            </div>
            {exploded.tiles.length === 0 && (
              <div role="status" className="h-7 px-3 flex items-center rounded-md bg-[var(--panel)] border border-[var(--border)] text-[12px] text-[var(--text-2)] whitespace-nowrap" style={{ borderLeft: '3px solid var(--info)' }}>
                Nothing to take apart: this component draws no layers of its own (only other components, or nothing on screen).
              </div>
            )}
            {explodeNotice && (
              <div role="status" className="h-7 px-3 flex items-center rounded-md bg-[var(--panel)] border border-[var(--border)] text-[12px] text-[var(--text-2)] whitespace-nowrap" style={{ borderLeft: '3px solid var(--warn)' }}>
                {explodeNotice}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Canvas toolbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-0.5 h-9 px-1 rounded-lg bg-[var(--panel)] border border-[var(--border)] shadow-[0_4px_16px_rgba(0,0,0,0.35)] text-[var(--text-2)] z-20">
        {mode === 'edit' && (
          <>
            <button className={`ui-icon-btn ${tool === 'select' ? 'ui-on' : ''}`} title="Select and move (V)" onClick={() => setTool('select')}>
              <MousePointer2 className="w-3.5 h-3.5" />
            </button>
            <button
              className={`ui-icon-btn ${tool === 'measure' ? 'ui-on' : ''}`}
              title="Measure (M): drag from point A to point B for the distance, Δx, Δy and angle. Snaps to edges and centres (Alt: free, Shift: 45°). Esc clears."
              onClick={() => setTool(tool === 'measure' ? 'select' : 'measure')}
            >
              <Ruler className="w-3.5 h-3.5" />
            </button>
            <span className="ui-sep" />
          </>
        )}
        <button className="ui-icon-btn" title="Zoom out (Ctrl + wheel)" onClick={() => zoomTo(zoom / 1.25)}>
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button className="h-7 px-1.5 rounded-md text-[12px] tabular-nums hover:bg-[var(--hover)] min-w-[46px]" title="Fit (double-click the canvas)" onClick={() => (setZoom(1), setPan({ x: 0, y: 0 }))}>
          {Math.round(scale * 100)}%
        </button>
        <button className="ui-icon-btn" title="Zoom in" onClick={() => zoomTo(zoom * 1.25)}>
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button className="ui-icon-btn" title="Fit to screen" onClick={() => (setZoom(1), setPan({ x: 0, y: 0 }))}>
          <Scan className="w-3.5 h-3.5" />
        </button>
        <span className="ui-sep" />
        {mode === 'edit' && (
          <>
            <button className={`ui-icon-btn ${rulers ? 'ui-on' : ''}`} title="Rulers (Shift+R)" onClick={() => setRulers(!rulers)}>
              <SquareDashed className="w-3.5 h-3.5" />
            </button>
            <button className={`ui-icon-btn ${snap.grid ? 'ui-on' : ''}`} title={`Grid ${snap.gridSize}px (snap to grid)`} onClick={() => onSnapChange({ ...snap, grid: !snap.grid })}>
              <Grid3x3 className="w-3.5 h-3.5" />
            </button>
            <select
              className="h-7 rounded-md bg-transparent text-[12px] px-1 hover:bg-[var(--hover)] outline-none"
              value={snap.gridSize}
              title="Grid size"
              onChange={(e) => {
                onSnapChange({ ...snap, gridSize: +e.target.value });
                e.target.blur(); // keep keyboard shortcuts working
              }}
            >
              {[4, 8, 10, 16, 20, 32, 40].map((g) => (
                <option key={g} value={g} className="bg-[var(--panel)]">
                  {g}
                </option>
              ))}
            </select>
            <button className={`ui-icon-btn ${snap.guides ? 'ui-on' : ''}`} title="Snap to other layers, equal spacing and the screen (hold Alt to move freely)" onClick={() => onSnapChange({ ...snap, guides: !snap.guides })}>
              <Magnet className="w-3.5 h-3.5" />
            </button>
            <button className={`ui-icon-btn ${mockState.wireframeMode ? 'ui-on' : ''}`} title="Outline view: every layer's outline, coloured by what it is" onClick={() => onUpdateMockState({ wireframeMode: !mockState.wireframeMode })}>
              <Square className="w-3.5 h-3.5" />
            </button>
            <div className="relative">
              <button className={`ui-icon-btn ${legend ? 'ui-on' : ''}`} title="What the outline colours and lines mean" onClick={() => setLegend(!legend)}>
                <Info className="w-3.5 h-3.5" />
              </button>
              {legend && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[300px] p-3 rounded-lg bg-[var(--panel)] border border-[var(--border)] shadow-[0_10px_32px_rgba(0,0,0,0.5)]">
                  <div className="text-[12px] font-semibold mb-2">Outlines</div>
                  <Legend />
                </div>
              )}
            </div>
            <span className="ui-sep" />
          </>
        )}
        <button className="ui-icon-btn" title={mockState.isDarkTheme ? 'Console theme: Basic Black' : 'Console theme: Basic White'} onClick={() => onUpdateMockState({ isDarkTheme: !mockState.isDarkTheme })}>
          {mockState.isDarkTheme ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>
        <button className="ui-icon-btn" title="Focus previous game" onClick={() => onUpdateMockState({ selectedGameIndex: Math.max(0, mockState.selectedGameIndex - 1) })}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[12px] tabular-nums w-10 text-center" title="Focused game">
          {mockState.selectedGameIndex + 1}/{games}
        </span>
        <button className="ui-icon-btn" title="Focus next game" onClick={() => onUpdateMockState({ selectedGameIndex: Math.min(games - 1, mockState.selectedGameIndex + 1) })}>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
};
