import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ScreenTarget, ThemeScreen } from '../../types/theme';
import type { SystemLayoutMap } from '../../lib/layout/systemLayouts';
import { TARGETS, targetInfo } from '../../lib/layout/targets';
import { useWallpaperPreview } from '../../lib/theme/useWallpaperPreview';

interface ScreenTimelineProps {
  screens: ThemeScreen[];
  activeScreenId: string;
  systemLayouts: SystemLayoutMap;
  onSelectScreen: (screenId: string) => void;
  onAddScreen: (target: ScreenTarget) => void;
}

const Thumb: React.FC<{ screen: ThemeScreen }> = ({ screen }) => {
  const url = useWallpaperPreview(screen.wallpaper, screen.adjustments);
  return url ? (
    <img src={url} alt={screen.name} className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 bg-[#2d2d2d]">Console bg</div>
  );
};

export const ScreenTimeline: React.FC<ScreenTimelineProps> = ({ screens, activeScreenId, systemLayouts, onSelectScreen, onAddScreen }) => {
  const [adding, setAdding] = useState(false);
  const missing = TARGETS.filter((t) => !screens.some((s) => s.target === t.target));

  return (
    <div className="h-32 bg-[#0c0e12] border-t border-[#1b1f28] flex flex-col shrink-0 select-none z-10">
      <div className="h-8 px-4 border-b border-[#1b1f28] flex items-center justify-between text-xs">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Screens ({screens.length})</span>
        {missing.length > 0 && (
          <div className="relative">
            <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200">
              <Plus className="w-3 h-3" />
              <span>Add screen</span>
            </button>
            {adding && (
              <div className="absolute right-0 bottom-7 w-44 bg-[#141720] border border-[#232936] rounded-md shadow-xl py-1 z-30">
                {missing.map((t) => (
                  <button
                    key={t.target}
                    onClick={() => {
                      onAddScreen(t.target);
                      setAdding(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-slate-300 hover:bg-[#1c222d]"
                  >
                    {t.label} <span className="text-slate-500 font-mono">{t.szs}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-2 flex items-center gap-3 overflow-x-auto">
        {screens.map((screen) => {
          const isActive = screen.id === activeScreenId;
          const changes = (screen.layout.Files ?? []).reduce((n, f) => n + (f.Patches?.length ?? 0), 0);
          return (
            <div
              key={screen.id}
              onClick={() => onSelectScreen(screen.id)}
              className={`h-full min-w-[150px] max-w-[160px] rounded border cursor-pointer transition p-1.5 flex flex-col justify-between ${
                isActive ? 'border-[#10b981] bg-[#121820]' : 'border-[#202532] bg-[#101319] hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono text-slate-500 truncate">{targetInfo(screen.target).szs}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${systemLayouts[screen.target] ? 'bg-[#10b981]' : 'bg-amber-400'}`}
                  title={systemLayouts[screen.target] ? 'Exact preview' : 'Approximate preview'}
                />
              </div>
              <div className="flex-1 rounded bg-black/80 overflow-hidden relative border border-[#1b1f28] mb-1">
                <Thumb screen={screen} />
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-medium truncate ${isActive ? 'text-[#10b981]' : 'text-slate-300'}`}>{screen.name}</span>
                <span className="text-[9px] text-slate-500">{changes ? `${changes} edits` : 'stock'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
