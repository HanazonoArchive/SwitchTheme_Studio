import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Grid3x3, Magnet, Minus, Moon, Plus, Scan, Square, Sun } from 'lucide-react';
import type { ThemeScreen } from '../../types/theme';
import type { Scene, SceneNode } from '../../lib/render/scene';
import type { MockSystemState } from '../../types/simulation';
import { useWallpaperPreview } from '../../lib/theme/useWallpaperPreview';
import { STOCK_BG } from '../../lib/theme/stock';
import { PixiView } from '../canvas/PixiView';
import { EditorOverlay, type SnapSettings } from '../canvas/EditorOverlay';

interface ViewportProps {
  activeScreen: ThemeScreen | null;
  scene: Scene | null;
  mode: 'edit' | 'preview';
  mockState: MockSystemState;
  selectedId: string | null;
  hiddenIds: ReadonlySet<string>;
  lockedIds: ReadonlySet<string>;
  snap: SnapSettings;
  onSnapChange: (s: SnapSettings) => void;
  onSelect: (node: SceneNode | null) => void;
  onDragPane: (key: string, dx: number, dy: number, phase: 'start' | 'move' | 'end') => void;
  onResizePane: (key: string, change: { dx: number; dy: number; w: number; h: number }, phase: 'start' | 'move' | 'end') => void;
  onUpdateMockState: (updates: Partial<MockSystemState>) => void;
  onDropFile: (file: File) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

export const Viewport: React.FC<ViewportProps> = ({
  activeScreen,
  scene,
  mode,
  mockState,
  selectedId,
  hiddenIds,
  lockedIds,
  snap,
  onSnapChange,
  onSelect,
  onDragPane,
  onResizePane,
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

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => containerRef.current && setSize({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Space held: drag anywhere pans (like Figma).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.code === 'Space' && !(t && /INPUT|TEXTAREA|SELECT/.test(t.tagName))) {
        setSpace(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const w = scene?.width ?? 1280;
  const h = scene?.height ?? 720;
  const fit = Math.min((size.width - 64) / w, (size.height - 96) / h);
  useEffect(() => {
    view.current = { zoom, pan, fit, size };
  });

  // Wheel zooms around the cursor (Shift + wheel pans sideways, a trackpad's two-finger scroll with
  // Ctrl is a pinch). The listener is native and non-passive so the browser doesn't zoom the page.
  const view = useRef({ zoom: 1, pan: { x: 0, y: 0 }, fit: 1, size: { width: 1280, height: 720 } });
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
      const cx = e.clientX - r.left - v.size.width / 2 - v.pan.x;
      const cy = e.clientY - r.top - (v.size.height / 2 - 16) - v.pan.y;
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
    () => (wallpaperUrl ? { url: wallpaperUrl } : { color: mockState.isDarkTheme ? STOCK_BG.dark : STOCK_BG.light }),
    [wallpaperUrl, mockState.isDarkTheme],
  );

  if (!activeScreen) return null;

  const scale = Math.max(0.05, fit * zoom);
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
  return (
    <section className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--canvas)] relative">
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
        style={{ cursor: isPanning ? 'grabbing' : space ? 'grab' : undefined }}
      >
        <div
          className="absolute"
          style={{
            width: w * scale,
            height: h * scale,
            left: size.width / 2 - (w * scale) / 2 + pan.x,
            top: size.height / 2 - (h * scale) / 2 + pan.y - 16,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 30px rgba(0,0,0,0.45)',
          }}
        >
          <div className="absolute left-0 top-0 overflow-hidden" style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
            <PixiView scene={scene} background={background} resolution={Math.min(4, dpr * scale)} hiddenIds={hiddenIds} />
          </div>
          {scene && (
            <div className="absolute left-0 top-0" style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: space ? 'none' : undefined }}>
              <EditorOverlay
                scene={scene}
                scale={scale}
                mode={mode}
                selectedId={selectedId}
                hiddenIds={hiddenIds}
                lockedIds={lockedIds}
                showAllOutlines={mockState.wireframeMode}
                snap={snap}
                onSelect={onSelect}
                onDrag={onDragPane}
                onResize={onResizePane}
                onFocusGame={(i) => onUpdateMockState({ selectedGameIndex: i })}
              />
            </div>
          )}
        </div>
      </div>

      {/* Canvas toolbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-0.5 h-9 px-1 rounded-lg bg-[var(--panel)] border border-[var(--border)] shadow-[0_4px_16px_rgba(0,0,0,0.35)] text-[var(--text-2)]">
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
            <button className={`ui-icon-btn ${snap.guides ? 'ui-on' : ''}`} title="Snap to other layers and the screen (hold Alt to move freely)" onClick={() => onSnapChange({ ...snap, guides: !snap.guides })}>
              <Magnet className="w-3.5 h-3.5" />
            </button>
            <button className={`ui-icon-btn ${mockState.wireframeMode ? 'ui-on' : ''}`} title="Show every layer's outline" onClick={() => onUpdateMockState({ wireframeMode: !mockState.wireframeMode })}>
              <Square className="w-3.5 h-3.5" />
            </button>
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
