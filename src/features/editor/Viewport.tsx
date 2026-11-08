import React, { useRef, useState, useEffect } from 'react';
import { PenTool, MonitorPlay, Sparkles } from 'lucide-react';
import type { ThemeScreen } from '../../types/theme';
import type { MockSystemState } from '../../types/simulation';
import { ViewportControls } from './ViewportControls';
import { HomeMenuRenderer } from '../screens/HomeMenuRenderer';
import { LockscreenRenderer } from '../screens/LockscreenRenderer';
import { AllAppsRenderer } from '../screens/AllAppsRenderer';

interface ViewportProps {
  activeScreen: ThemeScreen | null;
  mockState: MockSystemState;
  activeTopTab: 'editor' | 'motion';
  selectedPaneId: string | null;
  onSelectPane: (paneId: string | null) => void;
  onUpdateMockState: (updates: Partial<MockSystemState>) => void;
  onDropWallpaper: (file: File) => void;
  onOpenProjectModal: () => void;
}

export const Viewport: React.FC<ViewportProps> = ({
  activeScreen,
  mockState,
  activeTopTab,
  selectedPaneId,
  onSelectPane,
  onUpdateMockState,
  onDropWallpaper,
  onOpenProjectModal,
}) => {
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
      onDropWallpaper(e.dataTransfer.files[0]);
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
  // In Theme Editor, show pre-rendered preview if available, or custom wallpaper
  const displayImage = activeScreen.wallpaperUrl || (isEditorMode ? activeScreen.previewUrl : null);

  // Dynamic 16:9 scale with comfortable initial fit (85% factor with generous padding)
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
      {/* Viewer Header without the green semi-transparent tag */}
      <div className="h-8 px-4 border-b border-[#1b1f28] flex items-center justify-between bg-[#0c0e12]">
        <div className="flex items-center gap-2">
          {isEditorMode ? (
            <PenTool className="w-3 h-3 text-[#10b981]" />
          ) : (
            <MonitorPlay className="w-3 h-3 text-blue-400" />
          )}
          <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            {isEditorMode ? 'Theme Editor' : 'Live Simulator'}
          </span>
          <span className="text-slate-600">/</span>
          <span className="text-[11px] text-slate-300 font-medium">{activeScreen.name}</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">{activeScreen.szsFileName}</span>
      </div>

      {/* Canvas Area with Left-Click Drag Pan and Wheel Zoom */}
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
          if (!hasMovedRef.current) onSelectPane(null);
        }}
        className="flex-1 relative overflow-hidden flex items-center justify-center p-6 bg-[#090b0e]"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <div
          className="relative rounded overflow-hidden shadow-2xl border border-[#1e232e] bg-black shrink-0 transition-transform duration-75 select-none"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          }}
        >
          {/* Internal 1280x720 Native Switch Display */}
          <div
            className="absolute top-0 left-0 overflow-hidden"
            style={{
              width: '1280px',
              height: '720px',
              transform: `scale(${finalScale})`,
              transformOrigin: 'top left',
            }}
          >
            {/* Layer 1: Background (Custom Wallpaper OR Theme Preview OR Authentic Switch Stock Background) */}
            {displayImage ? (
              <img
                src={displayImage}
                alt=""
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{
                  filter: `brightness(${activeScreen.brightness}) contrast(${activeScreen.contrast})`,
                }}
              />
            ) : (
              /* Authentic Nintendo Switch Stock Background: Dark (#2d2d2d) or Light (#ebebeb) */
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundColor: mockState.isDarkTheme ? '#2d2d2d' : '#ebebeb',
                  backgroundImage: mockState.isDarkTheme
                    ? 'radial-gradient(circle at 50% 50%, #323232 0%, #242424 100%)'
                    : 'radial-gradient(circle at 50% 50%, #f5f5f5 0%, #dfdfdf 100%)',
                }}
              />
            )}

            {/* Layer 2: Dim Overlay */}
            {activeScreen.dimOverlay > 0 && (
              <div
                className="absolute inset-0 bg-black pointer-events-none"
                style={{ opacity: activeScreen.dimOverlay }}
              />
            )}

            {/* Layer 3: Interactive Simulation Overlay */}
            {/* Active in Live Simulator OR when editing without a pre-rendered screenshot */}
            {(!isEditorMode || (!activeScreen.wallpaperUrl && !activeScreen.previewUrl)) && (
              <>
                {activeScreen.target === 'home' && (
                  <HomeMenuRenderer
                    activeScreen={activeScreen}
                    mockState={mockState}
                    selectedPaneId={selectedPaneId}
                    onSelectPane={onSelectPane}
                    onUpdateMockState={onUpdateMockState}
                  />
                )}

                {activeScreen.target === 'lock' && (
                  <LockscreenRenderer mockState={mockState} />
                )}

                {activeScreen.target === 'apps' && (
                  <AllAppsRenderer mockState={mockState} />
                )}
              </>
            )}

            {/* Layer 4: BFLYT Wireframe Overlay (ONLY when user explicitly toggles wireframeMode) */}
            {mockState.wireframeMode && (
              <div className="absolute inset-0 pointer-events-none z-30">
                {activeScreen.panes.map((pane) => {
                  const isSelected = selectedPaneId === pane.id;
                  const isCentered = pane.x < 640 && pane.x > -640 && pane.y < 360 && pane.y > -360;
                  const left = isCentered && (pane.x < 0 || pane.y > 0) ? 640 + pane.x : pane.x;
                  const top = isCentered && (pane.x < 0 || pane.y > 0) ? 360 - pane.y : pane.y;

                  if (!pane.visible && !isSelected) return null;

                  return (
                    <div
                      key={pane.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPane(pane.id);
                      }}
                      className={`absolute pointer-events-auto cursor-pointer transition ${
                        isSelected
                          ? 'border-2 border-[#10b981] bg-[#10b981]/20 ring-2 ring-[#10b981]/40'
                          : 'border border-amber-400/50 hover:border-amber-300 bg-amber-400/10'
                      }`}
                      style={{
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${pane.width}px`,
                        height: `${pane.height}px`,
                        transform: `scale(${pane.scaleX}, ${pane.scaleY})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      <span className="absolute top-1 left-1 font-mono text-[9px] px-1.5 py-0.5 bg-black/90 text-amber-300 border border-amber-400/40 rounded shadow">
                        {pane.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Viewer Controls */}
      <ViewportControls mockState={mockState} onUpdateMockState={onUpdateMockState} />
    </section>
  );
};
