import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, History, Image as ImageIcon, RotateCcw, Type, Upload } from 'lucide-react';
import type { ThemeScreen } from '../../types/theme';
import { CustomIcons } from './CustomIcons';
import type { AppletIconSlot } from '../../lib/layout/appletIcons';
import { Splitter } from '../../components/Splitter';
import { DEFAULT_FONT, setPreviewFontFamily } from '../../lib/render/mockDraw';

/**
 * The dock under the canvas: History (every step, click one to go back to it, like a paint
 * program's history panel) and Assets (the theme's custom icons, and a font for the preview).
 */

export interface HistoryStep {
  label: string;
  at: number;
}

interface Props {
  steps: HistoryStep[];
  current: number;
  onJump: (index: number) => void;
  screen: ThemeScreen;
  onChangeExtraFiles: (files: ThemeScreen['extraFiles']) => void;
  /** A preview font was loaded or removed (text needs laying out again). */
  onFontChange: () => void;
  /** Open height (drag the divider above the dock). */
  height: number;
  onHeight: (h: number) => void;
  onResetHeight: () => void;
  /** Picture of a custom-icon slot's default icon from the preview. */
  defaultIcon?: (slot: AppletIconSlot) => string | null | undefined;
}

const ago = (t: number, now: number) => {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const PREVIEW_FAMILY = 'STS Preview Font';

export const BottomDock: React.FC<Props> = ({ steps, current, onJump, screen, onChangeExtraFiles, onFontChange, height, onHeight, onResetHeight, defaultIcon }) => {
  const [tab, setTab] = useState<'history' | 'assets'>('history');
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('sts.dock') !== 'closed';
    } catch {
      return true;
    }
  });
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const [font, setFont] = useState<{ name: string; face: FontFace } | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('sts.dock', open ? 'open' : 'closed');
    } catch {
      /* private mode: not remembered */
    }
  }, [open]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    listRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, steps.length, open, tab]);

  const loadFont = async (file: File) => {
    try {
      if (typeof FontFace === 'undefined') throw new Error('This browser can’t load fonts from files.');
      const face = new FontFace(PREVIEW_FAMILY, await file.arrayBuffer());
      await face.load();
      if (font) document.fonts.delete(font.face);
      document.fonts.add(face);
      setPreviewFontFamily(PREVIEW_FAMILY);
      setFont({ name: file.name, face });
      setFontError(null);
      onFontChange();
    } catch (e) {
      setFontError(`${file.name} couldn’t be read as a font (TTF, OTF, WOFF or WOFF2). ${(e as Error).message ?? ''}`.trim());
    }
  };
  const resetFont = () => {
    if (font) document.fonts.delete(font.face);
    setFont(null);
    setPreviewFontFamily(null);
    onFontChange();
  };

  return (
    <>
    {open && <Splitter axis="y" size={height} onSize={onHeight} onReset={onResetHeight} invert label="History and assets height" />}
    <div className={`shrink-0 bg-[var(--panel)] flex flex-col ${open ? '' : 'border-t border-[var(--border)]'}`} style={{ height: open ? height : 32 }}>
      <div className="h-8 flex items-center gap-1 px-2 shrink-0 border-b border-[var(--border)]">
        {(
          [
            ['history', 'History', History, `${steps.length} steps`],
            ['assets', 'Assets', ImageIcon, 'Icons and font'],
          ] as const
        ).map(([id, label, Icon, sub]) => (
          <button
            key={id}
            onClick={() => (tab === id && open ? setOpen(false) : (setTab(id), setOpen(true)))}
            className={`h-6 px-2 rounded-md flex items-center gap-1.5 text-[12px] ${tab === id && open ? 'bg-[var(--panel-2)] text-[var(--text)]' : 'text-[var(--text-2)] hover:text-[var(--text)]'}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            <span className="text-[11px] text-[var(--text-3)]">{sub}</span>
          </button>
        ))}
        <span className="flex-1" />
        {tab === 'history' && open && (
          <span className="text-[11px] text-[var(--text-3)] mr-1">
            <span className="kbd">Ctrl</span>+<span className="kbd">Z</span> undo · <span className="kbd">Ctrl</span>+<span className="kbd">Shift</span>+<span className="kbd">Z</span> redo · click a step to go back to it
          </span>
        )}
        <button className="ui-icon-btn !w-6 !h-6" onClick={() => setOpen(!open)} title={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {open && tab === 'history' && (
        <div ref={listRef} className="flex-1 overflow-y-auto py-1 min-h-0">
          {steps.map((s, i) => {
            const future = i > current;
            const cur = i === current;
            return (
              <button
                key={`${i}-${s.at}`}
                data-current={cur}
                onClick={() => onJump(i)}
                className={`w-full h-6 flex items-center gap-2 px-3 text-[12px] text-left ${cur ? 'bg-[var(--accent)]/25 text-[var(--text)]' : future ? 'text-[var(--text-3)] italic hover:bg-[var(--hover)]' : 'text-[var(--text-2)] hover:bg-[var(--hover)]'}`}
                title={future ? 'Undone: click to redo up to here' : cur ? 'Current state' : 'Click to go back to this step'}
              >
                <span className="w-6 text-right tabular-nums text-[11px] text-[var(--text-3)]">{i}</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cur ? 'bg-[var(--accent)]' : future ? 'border border-[var(--text-3)]' : 'bg-[var(--text-3)]'}`} />
                <span className="truncate flex-1">{s.label}</span>
                <span className="text-[11px] text-[var(--text-3)] tabular-nums">{ago(s.at, now)}</span>
              </button>
            );
          })}
        </div>
      )}

      {open && tab === 'assets' && (
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 p-3 overflow-hidden">
          <div className="min-h-0 overflow-y-auto pr-1">
            <CustomIcons screen={screen} onChange={onChangeExtraFiles} defaultIcon={defaultIcon} />
            {!['home', 'lock'].includes(screen.target) && <div className="text-[12px] text-[var(--text-3)]">This screen has no icons a theme can replace. Custom icons are on the Home menu and the lock screen.</div>}
          </div>
          <div className="min-h-0 overflow-y-auto space-y-2">
            <span className="text-[12px] font-semibold text-[var(--text-2)]">Preview font</span>
            <input ref={fontInput} type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" className="hidden" onChange={(e) => (e.target.files?.[0] && loadFont(e.target.files[0]), (e.target.value = ''))} />
            <div className="flex items-center gap-2 bg-[var(--panel-2)] border border-[var(--border)] rounded-lg px-2 py-1.5">
              <span className="w-8 h-7 rounded shrink-0 flex items-center justify-center bg-[var(--panel)] text-[15px]" style={{ fontFamily: font ? `'${PREVIEW_FAMILY}'` : DEFAULT_FONT }}>
                Aa
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] text-[var(--text)] truncate">{font ? font.name : 'Default (placeholder)'}</span>
                <span className="block text-[11px] text-[var(--text-3)] truncate">{font ? 'Your font, this session only' : 'Nunito Sans, standing in for the console font'}</span>
              </span>
              <button onClick={() => fontInput.current?.click()} className="ui-row-action" title="Use a font file for the preview (TTF, OTF, WOFF)">
                <Upload className="w-3.5 h-3.5" />
              </button>
              {font && (
                <button onClick={resetFont} className="ui-row-action" title="Back to the default font">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {fontError && <div className="text-[12px] text-red-300">{fontError}</div>}
            <div className="flex gap-1.5 text-[12px] text-[var(--text-3)] leading-relaxed">
              <Type className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Preview only: an .nxtheme can’t carry a font, so this isn’t exported. It shows how the console’s text would look with a font you install separately (NXThemes Installer can install a .ttf on its own).</span>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};
