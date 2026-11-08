import React from 'react';
import { Plus } from 'lucide-react';
import type { ThemeScreen } from '../../types/theme';

interface ScreenTimelineProps {
  screens: ThemeScreen[];
  activeScreenId: string;
  onSelectScreen: (screenId: string) => void;
  onAddScreen?: () => void;
}

export const ScreenTimeline: React.FC<ScreenTimelineProps> = ({
  screens,
  activeScreenId,
  onSelectScreen,
  onAddScreen,
}) => {
  return (
    <div className="h-32 bg-[#0c0e12] border-t border-[#1b1f28] flex flex-col shrink-0 select-none z-10">
      {/* Timeline Header without left svg icon */}
      <div className="h-8 px-4 border-b border-[#1b1f28] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Screens ({screens.length})
          </span>
        </div>

        {onAddScreen && (
          <button
            onClick={onAddScreen}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
          >
            <Plus className="w-3 h-3" />
            <span>Add screen</span>
          </button>
        )}
      </div>

      {/* Screens Track */}
      <div className="flex-1 px-4 py-2 flex items-center gap-3 overflow-x-auto">
        {screens.map((screen, index) => {
          const isActive = screen.id === activeScreenId;
          return (
            <div
              key={screen.id}
              onClick={() => onSelectScreen(screen.id)}
              className={`h-full min-w-[150px] max-w-[160px] rounded border cursor-pointer transition p-1.5 flex flex-col justify-between ${
                isActive
                  ? 'border-[#10b981] bg-[#121820]'
                  : 'border-[#202532] bg-[#101319] hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-slate-500">#{index + 1}</span>
                <span className="text-[9px] font-mono text-slate-500 truncate max-w-[80px]">
                  {screen.szsFileName}
                </span>
              </div>

              {/* Thumbnail */}
              <div className="flex-1 rounded bg-black/80 overflow-hidden relative border border-[#1b1f28] mb-1">
                {(screen.wallpaperUrl || screen.previewUrl) ? (
                  <img
                    src={(screen.wallpaperUrl || screen.previewUrl)!}
                    alt={screen.name}
                    className="w-full h-full object-cover"
                    style={{
                      filter: `brightness(${screen.brightness}) contrast(${screen.contrast})`,
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600">
                    No preview
                  </div>
                )}
                {screen.dimOverlay > 0 && (
                  <div
                    className="absolute inset-0 bg-black pointer-events-none"
                    style={{ opacity: screen.dimOverlay }}
                  />
                )}
              </div>

              <span
                className={`text-[11px] font-medium truncate ${
                  isActive ? 'text-[#10b981]' : 'text-slate-300'
                }`}
              >
                {screen.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

