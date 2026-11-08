import React, { useRef } from 'react';
import { Upload, Download, Eye, EyeOff, Plus, Trash2, Clock, Battery, Wifi } from 'lucide-react';
import type { RailTab } from './LeftRail';
import type { ThemeScreen } from '../../types/theme';
import type { MockSystemState, MockGame } from '../../types/simulation';

interface LeftDrawerProps {
  activeTab: RailTab;
  activeScreen: ThemeScreen;
  mockState: MockSystemState;
  selectedPaneId: string | null;
  onSelectPane: (paneId: string | null) => void;
  onUpdateActiveScreen: (updates: Partial<ThemeScreen>) => void;
  onUpdateMockState: (updates: Partial<MockSystemState>) => void;
  onReplaceWallpaper: (file: File) => void;
  onExtractWallpaper: () => void;
  onOpenAddComponentModal: () => void;
  onDeletePane: (paneId: string) => void;
}

export const LeftDrawer: React.FC<LeftDrawerProps> = ({
  activeTab,
  activeScreen,
  mockState,
  selectedPaneId,
  onSelectPane,
  onUpdateActiveScreen,
  onUpdateMockState,
  onReplaceWallpaper,
  onExtractWallpaper,
  onOpenAddComponentModal,
  onDeletePane,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddGame = () => {
    const newGame: MockGame = {
      id: `game-${Date.now()}`,
      title: `Game ${mockState.games.length + 1}`,
      coverUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
      publisher: 'Publisher',
    };
    onUpdateMockState({ games: [...mockState.games, newGame] });
  };

  const handleRemoveGame = (id: string) => {
    if (mockState.games.length <= 1) return;
    const filtered = mockState.games.filter((g) => g.id !== id);
    onUpdateMockState({
      games: filtered,
      selectedGameIndex: Math.min(mockState.selectedGameIndex, filtered.length - 1),
    });
  };

  // Wheel adjuster for Clock HH:MM
  const handleClockWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const [hhStr, mmStr] = mockState.time.split(':');
    let hh = parseInt(hhStr) || 12;
    let mm = parseInt(mmStr) || 0;
    const delta = e.deltaY < 0 ? 1 : -1;
    mm = (mm + delta + 60) % 60;
    if (delta > 0 && mm === 0) hh = (hh + 1) % 24;
    if (delta < 0 && mm === 59) hh = (hh - 1 + 24) % 24;
    onUpdateMockState({
      time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    });
  };

  // Arrow keys adjuster for Clock
  const handleClockKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const [hhStr, mmStr] = mockState.time.split(':');
      let hh = parseInt(hhStr) || 12;
      let mm = parseInt(mmStr) || 0;
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      mm = (mm + delta + 60) % 60;
      if (delta > 0 && mm === 0) hh = (hh + 1) % 24;
      if (delta < 0 && mm === 59) hh = (hh - 1 + 24) % 24;
      onUpdateMockState({
        time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      });
    }
  };

  return (
    <aside className="w-72 bg-[#101319] border-r border-[#1b1f28] flex flex-col shrink-0 select-none text-xs">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && onReplaceWallpaper(e.target.files[0])}
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
      />

      {/* Drawer Header */}
      <div className="h-10 px-4 border-b border-[#1b1f28] flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {activeTab === 'media' && 'Media & Background'}
          {activeTab === 'panes' && 'Layout & Panes'}
          {activeTab === 'mock' && 'Mock Environment'}
          {activeTab === 'json' && 'Layout Diff'}
        </span>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'media' && (
          <div className="space-y-4">
            {/* Media Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-2 px-3 rounded-md bg-[#161a22] hover:bg-[#1c222d] border border-[#232936] text-slate-200 font-medium flex items-center justify-center gap-1.5 transition"
              >
                <Upload className="w-3.5 h-3.5 text-[#10b981]" />
                <span>Import</span>
              </button>
              <button
                onClick={onExtractWallpaper}
                disabled={!activeScreen.wallpaperUrl}
                className="py-2 px-3 rounded-md bg-[#161a22] hover:bg-[#1c222d] border border-[#232936] text-slate-200 font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>Extract</span>
              </button>
            </div>

            {/* Thumbnail Preview */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Screen Thumbnail
              </span>
              <div className="aspect-video w-full rounded-md border border-[#202532] overflow-hidden bg-[#0a0c0f] relative flex items-center justify-center">
                {activeScreen.wallpaperUrl || activeScreen.previewUrl ? (
                  <img
                    src={activeScreen.wallpaperUrl || activeScreen.previewUrl || ''}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 font-mono"
                    style={{
                      background: mockState.isDarkTheme
                        ? 'radial-gradient(circle at 50% 50%, #2f2f2f 0%, #222222 100%)'
                        : 'radial-gradient(circle at 50% 50%, #f5f5f5 0%, #dfdfdf 100%)',
                    }}
                  >
                    <span>Default Switch Background</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span className="truncate">
                  {activeScreen.wallpaperUrl ? (activeScreen.wallpaperFileName || 'image.jpg') : 'Stock OEM Background'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">1280×720</span>
              </div>
            </div>

            {/* Adjustments (Supports mouse wheel scroll on sliders) */}
            {activeScreen.wallpaperUrl && (
              <div className="bg-[#141720] rounded-lg p-3 border border-[#202532] space-y-3">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Image Adjustments
                </span>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Dimming</span>
                    <span className="font-mono text-slate-200">{Math.round(activeScreen.dimOverlay * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.8"
                    step="0.05"
                    value={activeScreen.dimOverlay}
                    onWheel={(e) => {
                      e.preventDefault();
                      const delta = e.deltaY < 0 ? 0.05 : -0.05;
                      onUpdateActiveScreen({
                        dimOverlay: Math.max(0, Math.min(0.8, Number((activeScreen.dimOverlay + delta).toFixed(2)))),
                      });
                    }}
                    onChange={(e) => onUpdateActiveScreen({ dimOverlay: parseFloat(e.target.value) })}
                    className="w-full accent-[#10b981] cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Brightness</span>
                    <span className="font-mono text-slate-200">{Math.round(activeScreen.brightness * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.05"
                    value={activeScreen.brightness}
                    onWheel={(e) => {
                      e.preventDefault();
                      const delta = e.deltaY < 0 ? 0.05 : -0.05;
                      onUpdateActiveScreen({
                        brightness: Math.max(0.5, Math.min(1.5, Number((activeScreen.brightness + delta).toFixed(2)))),
                      });
                    }}
                    onChange={(e) => onUpdateActiveScreen({ brightness: parseFloat(e.target.value) })}
                    className="w-full accent-[#10b981] cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Contrast</span>
                    <span className="font-mono text-slate-200">{Math.round(activeScreen.contrast * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.05"
                    value={activeScreen.contrast}
                    onWheel={(e) => {
                      e.preventDefault();
                      const delta = e.deltaY < 0 ? 0.05 : -0.05;
                      onUpdateActiveScreen({
                        contrast: Math.max(0.5, Math.min(1.5, Number((activeScreen.contrast + delta).toFixed(2)))),
                      });
                    }}
                    onChange={(e) => onUpdateActiveScreen({ contrast: parseFloat(e.target.value) })}
                    className="w-full accent-[#10b981] cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'panes' && (
          <div className="space-y-3">
            {/* Clean Active Layout Header (No Box, No OTT Tags) */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1b1f28]">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                  Active Layout
                </span>
                <span className="text-xs font-semibold text-white">
                  {activeScreen.name}
                </span>
              </div>
              <button
                onClick={onOpenAddComponentModal}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#10b981] hover:bg-[#0ea572] text-[#0c0e12] text-[11px] font-semibold transition shadow-sm active:scale-95"
                title="Add Switch BFLYT component from OEM palette"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add Component</span>
              </button>
            </div>

            {/* List of Panes & Components */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between pb-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Components ({activeScreen.panes.length})
                </span>
              </div>
              {activeScreen.panes.map((pane) => (
                <div
                  key={pane.id}
                  onClick={() => onSelectPane(pane.id)}
                  className={`group flex items-center justify-between p-2 rounded-md cursor-pointer border transition ${
                    selectedPaneId === pane.id
                      ? 'bg-[#10b981]/10 border-[#10b981]/50 text-white font-medium'
                      : 'bg-[#141720] border-[#202532] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-xs truncate">{pane.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = activeScreen.panes.map((p) =>
                          p.id === pane.id ? { ...p, visible: !p.visible } : p
                        );
                        onUpdateActiveScreen({ panes: updated });
                      }}
                      className="text-slate-500 hover:text-white p-1"
                      title={pane.visible ? 'Hide pane' : 'Show pane'}
                    >
                      {pane.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePane(pane.id);
                      }}
                      className="text-slate-500 hover:text-red-400 p-1 opacity-60 group-hover:opacity-100 transition"
                      title="Delete component"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'mock' && (
          <div className="space-y-4">
            {/* Clock & Battery (Supports Wheel & Arrow Keys) */}
            <div className="bg-[#141720] rounded-lg p-3 border border-[#202532] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Clock
                </span>
                <input
                  type="text"
                  value={mockState.time}
                  onWheel={handleClockWheel}
                  onKeyDown={handleClockKeyDown}
                  onChange={(e) => onUpdateMockState({ time: e.target.value })}
                  className="w-16 bg-[#0c0e12] border border-[#232936] rounded px-2 py-0.5 text-right font-mono text-white text-xs outline-none focus:border-[#10b981]"
                  title="Scroll wheel or Arrow Up/Down to adjust time"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Battery className="w-3.5 h-3.5 text-emerald-400" />
                    Battery
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-200">{mockState.battery}%</span>
                    <button
                      onClick={() => onUpdateMockState({ isCharging: !mockState.isCharging })}
                      className="text-[10px] text-slate-400 hover:text-white"
                    >
                      {mockState.isCharging ? '⚡' : 'Plug'}
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={mockState.battery}
                  onWheel={(e) => {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 2 : -2;
                    onUpdateMockState({
                      battery: Math.max(0, Math.min(100, mockState.battery + delta)),
                    });
                  }}
                  onChange={(e) => onUpdateMockState({ battery: parseInt(e.target.value) })}
                  className="w-full accent-[#10b981] cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-blue-400" />
                    Wi-Fi Strength
                  </span>
                  <span className="font-mono text-slate-200">{mockState.wifiStrength} / 3</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="3"
                  value={mockState.wifiStrength}
                  onWheel={(e) => {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 1 : -1;
                    onUpdateMockState({
                      wifiStrength: Math.max(0, Math.min(3, mockState.wifiStrength + delta)),
                    });
                  }}
                  onChange={(e) => onUpdateMockState({ wifiStrength: parseInt(e.target.value) })}
                  className="w-full accent-[#10b981] cursor-pointer"
                />
              </div>
            </div>

            {/* Switch Stock Background Theme Toggle */}
            <div className="bg-[#141720] rounded-lg p-3 border border-[#202532] space-y-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Switch System Theme
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onUpdateMockState({ isDarkTheme: true })}
                  className={`py-1.5 px-2 rounded text-xs font-medium border transition flex items-center justify-center gap-1.5 ${
                    mockState.isDarkTheme
                      ? 'bg-[#2d2d2d] border-[#10b981] text-white'
                      : 'bg-[#181d28] border-[#252c3c] text-slate-400'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2d2d2d] border border-slate-500" />
                  <span>Basic Black</span>
                </button>
                <button
                  onClick={() => onUpdateMockState({ isDarkTheme: false })}
                  className={`py-1.5 px-2 rounded text-xs font-medium border transition flex items-center justify-center gap-1.5 ${
                    !mockState.isDarkTheme
                      ? 'bg-[#ebebeb] border-[#10b981] text-black'
                      : 'bg-[#181d28] border-[#252c3c] text-slate-400'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ebebeb] border border-slate-400" />
                  <span>Basic White</span>
                </button>
              </div>
            </div>

            {/* Games Carousel Management */}
            <div className="bg-[#141720] rounded-lg p-3 border border-[#202532] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Simulated Games ({mockState.games.length})
                </span>
                <button
                  onClick={handleAddGame}
                  className="text-xs text-[#10b981] hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {mockState.games.map((g, idx) => (
                  <div
                    key={g.id}
                    onClick={() => onUpdateMockState({ selectedGameIndex: idx })}
                    className={`flex items-center justify-between p-1.5 rounded border cursor-pointer transition ${
                      mockState.selectedGameIndex === idx
                        ? 'border-[#10b981]/50 bg-[#10b981]/10 text-white'
                        : 'border-[#202532] bg-[#0c0e12] text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-xs truncate max-w-[160px] font-medium">{g.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveGame(g.id);
                      }}
                      className="text-slate-500 hover:text-red-400 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'json' && (
          <div className="space-y-3 font-mono text-[10px]">
            <div className="p-3 bg-[#0c0e12] rounded-lg border border-[#202532] text-slate-300 overflow-x-auto max-h-[500px]">
              <pre>{JSON.stringify(activeScreen.layoutJson, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
