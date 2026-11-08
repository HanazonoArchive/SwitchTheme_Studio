import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Eye,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Moon,
  Sun,
} from 'lucide-react';
import type { MockSystemState } from '../../types/simulation';

interface ViewportControlsProps {
  mockState: MockSystemState;
  onUpdateMockState: (updates: Partial<MockSystemState>) => void;
}

export const ViewportControls: React.FC<ViewportControlsProps> = ({
  mockState,
  onUpdateMockState,
}) => {
  const zoom = Math.round(mockState.canvasZoom * 100);

  const handleNextGame = () => {
    onUpdateMockState({
      selectedGameIndex: Math.min(mockState.games.length - 1, mockState.selectedGameIndex + 1),
    });
  };

  const handlePrevGame = () => {
    onUpdateMockState({
      selectedGameIndex: Math.max(0, mockState.selectedGameIndex - 1),
    });
  };

  return (
    <div className="h-11 px-4 bg-[#0c0e12] border-t border-[#1b1f28] flex items-center justify-between text-xs text-slate-400 select-none shrink-0">
      {/* Left: Resolution & Status */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] text-slate-400">1280 × 720</span>
        <span className="text-slate-600">|</span>
        <span className="text-[11px] text-slate-400">720p Native</span>
      </div>

      {/* Center: Playback / Carousel navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={handlePrevGame}
          disabled={mockState.selectedGameIndex === 0}
          className="p-1 rounded hover:bg-[#161a22] text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
          title="Previous Game (Left Arrow)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="font-mono text-[11px] px-2 text-slate-200">
          {mockState.selectedGameIndex + 1} / {mockState.games.length}
        </span>

        <button
          onClick={handleNextGame}
          disabled={mockState.selectedGameIndex === mockState.games.length - 1}
          className="p-1 rounded hover:bg-[#161a22] text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
          title="Next Game (Right Arrow)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Viewport Display Controls */}
      <div className="flex items-center gap-2">
        {/* Wireframe toggle */}
        <button
          onClick={() => onUpdateMockState({ wireframeMode: !mockState.wireframeMode })}
          className={`p-1.5 rounded transition ${
            mockState.wireframeMode ? 'text-[#10b981] bg-[#10b981]/15' : 'hover:bg-[#161a22] text-slate-400'
          }`}
          title="Toggle BFLYT Wireframe Overlay"
        >
          {mockState.wireframeMode ? <Layers className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>

        {/* Theme mode */}
        <button
          onClick={() => onUpdateMockState({ isDarkTheme: !mockState.isDarkTheme })}
          className="p-1.5 rounded hover:bg-[#161a22] text-slate-400"
          title="Toggle Dark / Light Switch OS Theme"
        >
          {mockState.isDarkTheme ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
        </button>

        {/* Zoom */}
        <div className="flex items-center gap-1 bg-[#13161d] px-1.5 py-0.5 rounded border border-[#202532]">
          <button
            onClick={() => onUpdateMockState({ canvasZoom: Math.max(0.4, mockState.canvasZoom - 0.1) })}
            className="hover:text-white"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="font-mono text-[10px] min-w-[32px] text-center text-slate-300">
            {zoom}%
          </span>
          <button
            onClick={() => onUpdateMockState({ canvasZoom: Math.min(1.5, mockState.canvasZoom + 0.1) })}
            className="hover:text-white"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={() => onUpdateMockState({ canvasZoom: 1.0 })}
            className="hover:text-white ml-0.5"
            title="Reset Zoom (Fit)"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

