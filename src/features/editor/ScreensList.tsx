import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ScreenTarget, ThemeScreen } from '../../types/theme';
import { TARGETS, targetInfo } from '../../lib/layout/targets';

/** The theme's screens (one per console layout file), and adding more. */
export const ScreensList: React.FC<{
  screens: ThemeScreen[];
  activeScreenId: string;
  onSelectScreen: (id: string) => void;
  onAddScreen: (target: ScreenTarget) => void;
}> = ({ screens, activeScreenId, onSelectScreen, onAddScreen }) => {
  const [adding, setAdding] = useState(false);
  const missing = TARGETS.filter((t) => !screens.some((s) => s.target === t.target));
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="h-9 px-3 flex items-center justify-between shrink-0">
        <span className="text-[12px] font-semibold text-[var(--text)]">Screens</span>
        {missing.length > 0 && (
          <div className="relative">
            <button onClick={() => setAdding((v) => !v)} className="ui-icon-btn" title="Add a screen">
              <Plus className="w-3.5 h-3.5" />
            </button>
            {adding && (
              <div className="absolute left-0 top-8 w-52 bg-[var(--panel-2)] border border-[var(--border)] rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1 z-30">
                {missing.map((t) => (
                  <button
                    key={t.target}
                    onClick={() => {
                      onAddScreen(t.target);
                      setAdding(false);
                    }}
                    className="w-full flex justify-between px-3 py-1.5 text-[12px] text-[var(--text)] hover:bg-[var(--hover)]"
                  >
                    {t.label}
                    <span className="text-[var(--text-3)]">{t.szs}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="pb-1.5 flex-1 min-h-0 overflow-y-auto">
        {screens.map((s) => {
          const edits = (s.layout.Files ?? []).reduce((n, f) => n + (f.Patches?.length ?? 0), 0);
          const active = s.id === activeScreenId;
          return (
            <button
              key={s.id}
              onClick={() => onSelectScreen(s.id)}
              className={`w-full h-7 px-3 flex items-center gap-2 text-[12px] text-left ${active ? 'bg-[var(--accent)]/20 text-[var(--text)]' : 'text-[var(--text-2)] hover:bg-[var(--hover)]'}`}
            >
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-[11px] text-[var(--text-3)]">
                {s.wallpaper ? 'image · ' : ''}
                {edits ? `${edits} edits` : targetInfo(s.target).szs}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
