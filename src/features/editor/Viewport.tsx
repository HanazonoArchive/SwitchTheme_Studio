import React, { useRef, useState, useEffect } from 'react';
import { PenTool, MonitorPlay, Sparkles } from 'lucide-react';
import type { ThemeScreen } from '../../types/theme';
import type { SystemLayout } from '../../lib/layout/systemLayouts';
import { targetInfo } from '../../lib/layout/targets';
import { useWallpaperPreview } from '../../lib/theme/useWallpaperPreview';
import { ExactLayoutRenderer } from '../screens/ExactLayoutRenderer';
import { STOCK_BG } from '../../lib/theme/stock';
import type { MockSystemState } from '../../types/simulation';
import { ViewportControls } from './ViewportControls';
import { HomeMenuRenderer } from '../screens/HomeMenuRenderer';
import { LockscreenRenderer } from '../screens/LockscreenRenderer';
import { AllAppsRenderer } from '../screens/AllAppsRenderer';

interface ViewportProps {
  activeScreen: ThemeScreen | null;
  system: SystemLayout | undefined;
  common?: SystemLayout;
  mockState: MockSystemState;
  activeTopTab: 'editor' | 'motion';
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onDragPane: (key: string, dx: number, dy: number, phase: 'start' | 'move' | 'end') => void;
  onUpdateMockState: (updates: Partial<MockSystemState>) => void;
  onDropFile: (file: File) => void;
  onOpenProjectModal: () => void;
  onOpenPanes: () => void;
}

export const Viewport: React.FC<ViewportProps> = ({
  activeScreen,
  system,
  common,
  mockState,
  activeTopTab,
  selectedKey,
  onSelect,
  onDragPane,
  onUpdateMockState,
  onDropFile,
  onOpenProjectModal,
  onOpenPanes,
}) => {
  const wallpaperUrl = useWallpaperPreview(activeScreen?.wallpaper ?? null, activeScreen?.adjustments ?? { brightness: 1, contrast: 1, dim: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 1280, height: 720 });

  // Pan & Drag state (Left-click hold and drag)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const isMouseDownRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const originOffsetRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);

  // Measure container size
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      onDropFile(e.dataTransfer.files[0]);
    }
  };

  // Mouse wheel zoom in/out when hovering over canvas
  const handleWheel = (e: React.WheelEvent) => {
    const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;
    const currentZoom = mockState.canvasZoom || 1.0;
    const nextZoom = Math.min(2.5, Math.max(0.4, Number((currentZoom + zoomDelta).toFixed(2))));
    onUpdateMockState({ canvasZoom: nextZoom });
  };

  // Left-click hold and drag (pan)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      isMouseDownRef.current = true;
      hasMovedRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      originOffsetRef.current = { ...panOffset };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isMouseDownRef.current) {
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;

      if (!hasMovedRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        hasMovedRef.current = true;
        setIsPanning(true);
      }

      if (hasMovedRef.current) {
        setPanOffset({
          x: originOffsetRef.current.x + dx,
          y: originOffsetRef.current.y + dy,
        });
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 0) {
      isMouseDownRef.current = false;
      setIsPanning(false);
    }
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (hasMovedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      hasMovedRef.current = false;
    }
  };

  // Reset pan and zoom to default fit on double click
  const handleDoubleClick = () => {
    setPanOffset({ x: 0, y: 0 });
    onUpdateMockState({ canvasZoom: 1.0 });
  };

  // If no project is loaded, show clean welcome landing
  if (!activeScreen) {
    return (
      <section className="flex-1 bg-[#090b0e] flex flex-col items-center justify-center select-none text-center p-8">
        <div className="max-w-md space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#141720] border border-[#202532] flex items-center justify-center mx-auto text-[#10b981]">
            <Sparkles className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">No Active Theme Project</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Create a custom Nintendo Switch theme with BFLYT layout editing or open an existing .nxtheme to begin.
          </p>
          <button
            onClick={onOpenProjectModal}
            className="px-5 py-2.5 rounded-lg bg-[#10b981] hover:bg-[#0ea572] text-[#0c0e12] text-xs font-semibold shadow-lg transition active:scale-95 inline-flex items-center gap-2"
          >
            <span>Create or Open Theme</span>
          </button>
        </div>
      </section>
    );
  }

  const isEditorMode = activeTopTab === 'editor';
  const exact = Boolean(system);

  // Dynamic 16:9 scale with comfortable initial fit
  const paddingX = 80;
  const paddingY = 60;
  const availableWidth = Math.max(320, containerSize.width - paddingX);
  const availableHeight = Math.max(180, containerSize.height - paddingY);

  const baseScale = Math.min(availableWidth / 1280, availableHeight / 720) * 0.88;
  const finalScale = baseScale * (mockState.canvasZoom || 1.0);

  const canvasWidth = 1280 * finalScale;
  const canvasHeight = 720 * finalScale;

  return (
    <section className="flex-1 bg-[#090b0e] flex flex-col min-w-0 overflow-hidden select-none">
      <div className="h-8 px-4 border-b border-[#1b1f28] flex items-center justify-between bg-[#0c0e12]">
        <div className="flex items-center gap-2">
          {isEditorMode ? <PenTool className="w-3 h-3 text-[#10b981]" /> : <MonitorPlay className="w-3 h-3 text-blue-400" />}
          <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            {isEditorMode ? 'Theme Editor' : 'Live Simulator'}
          </span>
          <span className="text-slate-600">/</span>
          <span className="text-[11px] text-slate-300 font-medium">{activeScreen.name}</span>
          <span className="text-slate-600">/</span>
          <span className="text-[11px] text-slate-400">{activeScreen.wallpaper ? 'Custom background' : 'Stock background'}</span>
        </div>
        <div className="flex items-center gap-2">
          {exact ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#10b981]/15 text-[#10b981] font-medium" title={`Rendering ${system!.mainLayout} from your ${system!.szsName} (firmware ${system!.firmwareHint})`}>
              Exact layout · {system!.szsName}
            </span>
          ) : (
            <button
              onClick={onOpenPanes}
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-medium hover:bg-amber-500/25"
              title="Positions are a hand-made mock. Load your console's layout file for an exact preview."
            >
              Approximate · load {targetInfo(activeScreen.target).szs} for exact
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClickCapture={handleClickCapture}
        onDoubleClick={handleDoubleClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => {
          if (!hasMovedRef.current) onSelect(null);
        }}
        className="flex-1 relative overflow-hidden flex items-center justify-center p-6 bg-[#090b0e]"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <div
          className="relative rounded overflow-hidden shadow-2xl border border-[#1e232e] bg-black shrink-0 select-none"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          }}
        >
          {/* Native 1280x720 Switch display. Editor and simulator render the SAME layers;
              the editor only adds selection outlines and drag handles. */}
          <div
            className="absolute top-0 left-0 overflow-hidden"
            style={{ width: '1280px', height: '720px', transform: `scale(${finalScale})`, transformOrigin: 'top left' }}
          >
            {/* Layer 1: background. A theme without image.jpg keeps the console's own background. */}
            {wallpaperUrl ? (
              <img src={wallpaperUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />
            ) : (
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: mockState.isDarkTheme ? STOCK_BG.dark : STOCK_BG.light }} />
            )}

            {/* Layer 2: UI */}
            {exact ? (
              <ExactLayoutRenderer
                system={system!}
                layout={activeScreen.layout}
                common={common}
                commonLayout={activeScreen.common}
                hasWallpaper={Boolean(activeScreen.wallpaper)}
                mockState={mockState}
                interactive={isEditorMode}
                selectedKey={selectedKey}
                showAllOutlines={isEditorMode && mockState.wireframeMode}
                viewScale={finalScale}
                onSelect={onSelect}
                onDragPane={onDragPane}
                onUpdateMockState={onUpdateMockState}
              />
            ) : (
              <>
                {activeScreen.target === 'home' && (
                  <HomeMenuRenderer
                    layout={activeScreen.layout}
                    hideOnlineBtn={activeScreen.layout.HideOnlineBtn ?? true}
                    mockState={mockState}
                    interactive={isEditorMode}
                    selectedKey={selectedKey}
                    onSelect={onSelect}
                    onUpdateMockState={onUpdateMockState}
                  />
                )}
                {activeScreen.target === 'lock' && <LockscreenRenderer mockState={mockState} />}
                {activeScreen.target === 'apps' && <AllAppsRenderer mockState={mockState} />}
                {!['home', 'lock', 'apps'].includes(activeScreen.target) && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/60 text-lg">
                    Load {targetInfo(activeScreen.target).szs} to preview this screen's layout
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Viewer Controls */}
      <ViewportControls mockState={mockState} onUpdateMockState={onUpdateMockState} />
    </section>
  );
};
