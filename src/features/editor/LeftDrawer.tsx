import React, { useMemo, useRef, useState } from 'react';
import { Note } from '../../components/Note';
import { Upload, Download, Eye, EyeOff, Plus, Trash2, Clock, Cpu, Search, RotateCcw, AlertTriangle, ImageOff, Image as ImageIcon, Check, Wrench } from 'lucide-react';
export type RailTab = 'media' | 'panes' | 'mock' | 'json';
const TABS: { id: RailTab; label: string }[] = [
  { id: 'media', label: 'Background' },
  { id: 'panes', label: 'Layout' },
  { id: 'mock', label: 'Console' },
  { id: 'json', label: 'JSON' },
];
import type { ImageAdjustments, ScreenTarget, ThemeScreen } from '../../types/theme';
import type { MockSystemState, MockGame } from '../../types/simulation';
import type { SystemLayout, SystemLayoutMap } from '../../lib/layout/systemLayouts';
import { flattenPanes } from '../../lib/nx/bflyt';
import { findImplicitZeroVectors, paneKey, splitPaneKey, type LayoutPatch, type PaneEdit, type PanePatch } from '../../lib/layout/patch';
import { targetInfo } from '../../lib/layout/targets';
import { fixesFor } from '../../lib/layout/paneModel';
import { FW, stampFirmware, themeTargetFirmware } from '../../lib/layout/installerFixes';
import { checkCompatibility } from '../../lib/layout/compatibility';
import { wallpaperIssues } from '../../lib/theme/images';
import { useWallpaperPreview } from '../../lib/theme/useWallpaperPreview';
import { UsersEditor } from './UsersEditor';

interface LeftDrawerProps {
  activeTab: RailTab;
  onSelectTab: (tab: RailTab) => void;
  /** Screens loaded from the user's own .szs files (the rest use the built-in layouts). */
  consoleLayouts: SystemLayoutMap;
  activeScreen: ThemeScreen;
  system: SystemLayout | undefined;
  systemLayouts: SystemLayoutMap;
  systemError: string | null;
  mockState: MockSystemState;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onUpdateActiveScreen: (updates: Partial<ThemeScreen>, opts?: { transient?: boolean }) => void;
  onUpdateMockState: (updates: Partial<MockSystemState>) => void;
  onReplaceWallpaper: (file: File) => void;
  onExtractWallpaper: () => void;
  onEditPane: (key: string, edit: PaneEdit) => void;
  onRevertPane: (key: string, field?: keyof PanePatch) => void;
  onLoadSystemSzs: (files: File[]) => void;
  onForgetSystemSzs: (target: ScreenTarget) => void;
  onOpenConsoleFiles: () => void;
  onCommitHistory: () => void;
}

const label = 'text-[12px] font-semibold text-[var(--text-2)] block';
const card = 'bg-[var(--panel-2)] rounded-lg p-3 border border-[var(--border)]';

const Slider: React.FC<{ name: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }> = ({ name, value, min, max, step, onChange }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-[12px] text-[var(--text-2)]">
      <span>{name}</span>
      <span className="font-mono text-[var(--text)]">{Math.round(value * 100)}%</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onDoubleClick={() => onChange(name === 'Dimming' ? 0 : 1)}
      className="w-full block"
      style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      title="Double-click to reset"
    />
  </div>
);

export const LeftDrawer: React.FC<LeftDrawerProps> = ({
  activeTab,
  onSelectTab,
  consoleLayouts,
  activeScreen,
  system,
  systemError,
  mockState,
  selectedKey,
  onSelect,
  onUpdateActiveScreen,
  onUpdateMockState,
  onReplaceWallpaper,
  onExtractWallpaper,
  onEditPane,
  onRevertPane,
  onLoadSystemSzs,
  onForgetSystemSzs,
  onOpenConsoleFiles,
  onCommitHistory,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const szsInputRef = useRef<HTMLInputElement>(null);
  const [paneFilter, setPaneFilter] = useState('');
  const [browseFile, setBrowseFile] = useState<string | null>(null);
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const previewUrl = useWallpaperPreview(activeScreen.wallpaper, activeScreen.adjustments);

  const layout = activeScreen.layout;
  const info = targetInfo(activeScreen.target);

  const setAdjust = (a: Partial<ImageAdjustments>) =>
    onUpdateActiveScreen({ adjustments: { ...activeScreen.adjustments, ...a } }, { transient: true });

  const setLayoutMeta = (m: Partial<LayoutPatch>) => onUpdateActiveScreen({ layout: { ...layout, ...m } });

  /* Patched panes, grouped by layout file. */
  const patched = useMemo(
    () =>
      (layout.Files ?? [])
        .map((f) => ({ file: f.FileName, patches: f.Patches ?? [] }))
        .filter((f) => f.patches.length > 0),
    [layout],
  );
  const patchedKeys = useMemo(() => new Set(patched.flatMap((f) => f.patches.map((p) => paneKey(f.file, p.PaneName)))), [patched]);

  /* Pane tree of the layout being browsed (exact mode only). */
  const fileOptions = useMemo(() => {
    if (!system) return [];
    const names = [...system.layouts.keys()];
    const patchedFiles = new Set(patched.map((p) => p.file));
    return names.sort((a, b) => {
      const rank = (n: string) => (n === system.mainLayout ? 0 : patchedFiles.has(n) ? 1 : 2);
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }, [system, patched]);
  const currentFile = browseFile && system?.layouts.has(browseFile) ? browseFile : (selectedKey && system?.layouts.has(splitPaneKey(selectedKey).file) ? splitPaneKey(selectedKey).file : fileOptions[0]);
  const tree = useMemo(() => {
    const f = currentFile ? system?.layouts.get(currentFile) : undefined;
    if (!f) return [];
    const all = flattenPanes(f.root);
    const q = paneFilter.trim().toLowerCase();
    return q ? all.filter((x) => x.pane.name.toLowerCase().includes(q)) : all;
  }, [system, currentFile, paneFilter]);

  const implicitZero = useMemo(() => findImplicitZeroVectors(layout), [layout]);
  const installer = useMemo(() => fixesFor(layout, system), [layout, system]);
  const compat = useMemo(() => (system ? checkCompatibility(layout, system) : []), [layout, system]);

  const handleAddGame = () => {
    const newGame: MockGame = {
      id: `game-${Date.now()}`,
      title: `Game ${mockState.games.length + 1}`,
      coverUrl: mockState.games[mockState.games.length % Math.max(1, mockState.games.length)]?.coverUrl ?? '',
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
    <div className="flex-1 min-h-0 flex flex-col select-none text-[12px]">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) onReplaceWallpaper(e.target.files[0]);
          e.target.value = '';
        }}
        accept="image/png,image/jpeg,image/webp,.dds"
        className="hidden"
      />
      <input
        type="file"
        ref={szsInputRef}
        multiple
        accept=".szs"
        onChange={(e) => {
          if (e.target.files?.length) onLoadSystemSzs(Array.from(e.target.files));
          e.target.value = '';
        }}
        className="hidden"
      />

      <div className="h-9 px-2 border-b border-[var(--border)] flex items-center gap-0.5 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectTab(t.id)}
            className={`h-7 px-2 rounded-md text-[12px] ${activeTab === t.id ? 'text-[var(--text)] bg-[var(--hover)]' : 'text-[var(--text-2)] hover:text-[var(--text)]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'media' && (
          <div className="space-y-4">
            {/* Background mode: the two theme kinds */}
            <div className="space-y-1.5">
              <span className={label}>Background</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => (activeScreen.wallpaper ? undefined : fileInputRef.current?.click())}
                  className={`p-2 rounded-md border text-left transition ${
                    activeScreen.wallpaper ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:border-[var(--text-3)]'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5 mb-1 text-[var(--accent)]" />
                  <div className="font-medium">Custom image</div>
                  <div className="text-[12px] text-[var(--text-2)]">Ships image.jpg</div>
                </button>
                <button
                  onClick={() => onUpdateActiveScreen({ wallpaper: null })}
                  className={`p-2 rounded-md border text-left transition ${
                    !activeScreen.wallpaper ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:border-[var(--text-3)]'
                  }`}
                >
                  <ImageOff className="w-3.5 h-3.5 mb-1 text-[var(--text-2)]" />
                  <div className="font-medium">Console default</div>
                  <div className="text-[12px] text-[var(--text-2)]">Layout only, no image</div>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="aspect-video w-full rounded-md border border-[var(--border)] overflow-hidden bg-[var(--bg)] relative flex items-center justify-center">
                {previewUrl ? (
                  <img src={previewUrl} alt="Background" className="w-full h-full" />
                ) : (
                  <div
                    className="w-full h-full flex flex-col items-center justify-center text-[12px] gap-1"
                    style={{ background: mockState.isDarkTheme ? '#2d2d2d' : '#ebebeb', color: mockState.isDarkTheme ? '#bbb' : '#555' }}
                  >
                    <span>Console background</span>
                    <span className="opacity-70">{mockState.isDarkTheme ? 'Basic Black' : 'Basic White'} (switch with the sun/moon button under the canvas)</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2 px-3 rounded-md bg-[var(--panel-2)] hover:bg-[var(--hover)] border border-[var(--border)] text-[var(--text)] font-medium flex items-center justify-center gap-1.5 transition"
                >
                  <Upload className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>{activeScreen.wallpaper ? 'Replace' : 'Import'}</span>
                </button>
                <button
                  onClick={onExtractWallpaper}
                  disabled={!activeScreen.wallpaper}
                  className="py-2 px-3 rounded-md bg-[var(--panel-2)] hover:bg-[var(--hover)] border border-[var(--border)] text-[var(--text)] font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Original</span>
                </button>
              </div>
              {activeScreen.wallpaper && (
                <div className="flex items-center justify-between text-[12px] text-[var(--text-2)]">
                  <span className="truncate">{activeScreen.wallpaper.fileName}</span>
                  <span className="text-[12px] text-[var(--text-3)] font-mono">
                    {activeScreen.wallpaper.width}×{activeScreen.wallpaper.height}
                  </span>
                </div>
              )}
              {activeScreen.wallpaper &&
                wallpaperIssues(activeScreen.wallpaper).map((m) => (
                  <div key={m} className="flex gap-1.5 text-[12px] text-amber-300/90 leading-snug">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{m}</span>
                  </div>
                ))}
            </div>

            {activeScreen.wallpaper && (
              <div className={`${card} space-y-3`} onPointerUp={onCommitHistory}>
                <span className={label}>Adjustments (baked into image.jpg)</span>
                <Slider name="Dimming" value={activeScreen.adjustments.dim} min={0} max={0.8} step={0.05} onChange={(dim) => setAdjust({ dim })} />
                <Slider name="Brightness" value={activeScreen.adjustments.brightness} min={0.5} max={1.5} step={0.05} onChange={(brightness) => setAdjust({ brightness })} />
                <Slider name="Contrast" value={activeScreen.adjustments.contrast} min={0.5} max={1.5} step={0.05} onChange={(contrast) => setAdjust({ contrast })} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'panes' && (
          <div className="space-y-4">
            {/* Stock layout source */}
            <div className={`${card} space-y-2`}>
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="font-semibold text-[var(--text)] text-[12px]">Console layout ({info.szs})</span>
              </div>
              {consoleLayouts[activeScreen.target] ? (
                <>
                  <div className="text-[12px] text-[var(--text-2)] leading-relaxed">
                    <Check className="w-3 h-3 inline text-[var(--ok)] mr-1" />
                    Your console's {info.szs} ({system?.layouts.size} layouts, firmware {system?.firmwareHint}). Textures are exact.
                  </div>
                  <div className="flex gap-3">
                    <button onClick={onOpenConsoleFiles} className="text-[12px] text-[var(--text-2)] hover:text-[var(--text)]">
                      Console files…
                    </button>
                    <button onClick={() => onForgetSystemSzs(activeScreen.target)} className="text-[12px] text-[var(--text-2)] hover:text-[var(--danger)]">
                      Use built-in
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[12px] text-[var(--text-2)] leading-relaxed">
                    {system ? <>Built-in stock layout (firmware {system.consoleVersion ?? system.firmwareHint}). Positions and sizes are the console's; icons are stand-ins.</> : <>Loading the built-in layout…</>}
                  </p>
                  <p className="text-[12px] text-[var(--text-3)] leading-relaxed">
                    For your firmware's exact layouts and the console's own icons and textures, load the zipped <span className="font-mono">extracted</span> folder from NXThemes Installer (Extract home menu). It stays in this browser.
                  </p>
                  <button onClick={onOpenConsoleFiles} className="ui-btn w-full justify-center">
                    Load console files…
                  </button>
                </>
              )}
              {systemError && <div className="text-[12px] text-red-300">{systemError}</div>}
              {Object.keys(consoleLayouts).length > 0 && (
                <div className="text-[12px] text-[var(--text-3)]">
                  From your console: {Object.values(consoleLayouts).map((s) => s!.szsName).join(', ')}
                </div>
              )}
            </div>

            {/* What the installer will do to this layout on the user's console */}
            {system && (installer.before.length > 0 || installer.after.length > 0 || compat.length > 0) && (
              <div className={`${card} space-y-2`}>
                {(installer.before.length > 0 || installer.after.length > 0) && (
                  <>
                    <span className="font-semibold text-[var(--text)] text-[12px] flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-sky-400" /> Installer fixes on firmware {system.firmwareHint}
                    </span>
                    {[...installer.before, ...installer.after].map((f) => (
                      <div key={f.name} className="text-[12px] text-[var(--text-2)] leading-snug">
                        <span className="font-mono text-sky-300">{f.name}</span> {f.why}
                      </div>
                    ))}
                    <p className="text-[12px] text-[var(--text-3)]">The preview already includes these.</p>
                    {system.firmware >= FW.Fw20_0 && themeTargetFirmware(layout) < FW.Fw20_0 && (
                      <button
                        onClick={() => onUpdateActiveScreen({ layout: stampFirmware(layout, activeScreen.target, system.firmware) })}
                        className="text-[12px] text-sky-300 hover:text-[var(--text)] underline underline-offset-2"
                        title="Sets TargetFirmware so the installer stops adding the 19.x downgrade. Positions written for 11.x may need adjusting."
                      >
                        Target {system.firmwareHint} instead
                      </button>
                    )}
                  </>
                )}
                {compat.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="font-semibold text-[var(--text)] text-[12px] flex items-center gap-1.5">
                      <AlertTriangle className={`w-3.5 h-3.5 ${compat.some((c) => c.severity === 'critical') ? 'text-red-400' : 'text-amber-400'}`} />
                      Compatibility ({compat.length})
                    </span>
                    {!compat.some((c) => c.severity === 'critical') && (
                      <div className="text-[12px] leading-snug text-[var(--text-3)]">
                        Written for an older firmware: these aren't in {system?.source === 'console' ? 'your console\'s' : 'the'} {system?.consoleVersion ?? system?.firmwareHint ?? ''} layouts.
                        The installer skips them as well, so the console looks like this preview.
                      </div>
                    )}
                    {compat.slice(0, 12).map((c, i) => (
                      <div key={i} className={`text-[12px] leading-snug ${c.severity === 'critical' ? 'text-red-300' : 'text-[var(--text-2)]'}`}>
                        <span className="font-mono">{c.item}</span>{' '}
                        {c.type === 'MissingFile'
                          ? c.item === 'anim/RdtBase_SystemAppletPos.bflan'
                            ? 'not on 20.0+ (applet positions come from the installer fix above)'
                            : 'file not on this firmware'
                          : c.type === 'MissingGroup'
                            ? 'group missing'
                            : c.type === 'MissingPane'
                              ? `pane not in ${c.file.replace(/^blyt\//, '').replace(/\.bflyt$/, '')}${c.info ? ` (${c.info})` : ''}`
                              : c.info}
                        {c.severity === 'critical' ? ` in ${c.file.replace('anim/', '')}: the installer drops this animation` : ''}
                      </div>
                    ))}
                    {compat.length > 12 && <div className="text-[12px] text-[var(--text-3)]">…and {compat.length - 12} more</div>}
                  </div>
                )}
              </div>
            )}

            {/* Layout metadata */}
            <div className="space-y-2">
              <span className={label}>Layout</span>
              <input
                value={layout.PatchName ?? ''}
                onChange={(e) => setLayoutMeta({ PatchName: e.target.value || undefined })}
                placeholder="Layout name (defaults to theme name)"
                className="w-full bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text)] outline-none focus:border-[var(--accent)]"
              />
              {activeScreen.target === 'home' && (
                <label className="flex items-center justify-between text-[12px] text-[var(--text)]" title="11.0+ added the Nintendo Switch Online button. On (or unset) makes the installer remove it and use the 19.x applet row.">
                  Hide Switch Online button
                  <input
                    type="checkbox"
                    checked={layout.HideOnlineBtn ?? true}
                    onChange={(e) => setLayoutMeta({ HideOnlineBtn: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                </label>
              )}
            </div>

            {/* Changed panes */}
            <div className="space-y-1.5">
              <span className={label}>Changed by this theme ({patchedKeys.size})</span>
              {patched.length === 0 && <div className="text-[12px] text-[var(--text-3)]">Nothing yet. Select a pane and change it.</div>}
              {patched.map((f) => (
                <div key={f.file} className="space-y-1">
                  <div className="font-mono text-[12px] text-[var(--text-3)] truncate">{f.file}</div>
                  {f.patches.map((p) => {
                    const key = paneKey(f.file, p.PaneName);
                    return (
                      <div
                        key={key}
                        onClick={() => onSelect(key)}
                        className={`group flex items-center justify-between px-2 py-1 rounded cursor-pointer border transition ${
                          selectedKey === key ? 'bg-[var(--accent)]/10 border-[var(--accent)]/50 text-[var(--text)]' : 'bg-[var(--panel-2)] border-[var(--border)] text-[var(--text)] hover:border-[var(--text-3)]'
                        }`}
                      >
                        <span className={`font-mono text-[12px] truncate ${p.Visible === false ? 'line-through text-[var(--text-3)]' : ''}`}>{p.PaneName}</span>
                        <div className="flex items-stretch self-stretch opacity-60 group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditPane(key, { visible: p.Visible === false });
                            }}
                            className="ui-row-action !w-6"
                            title={p.Visible === false ? 'Show' : 'Hide'}
                          >
                            {p.Visible === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRevertPane(key);
                            }}
                            className="ui-row-action ui-row-action-danger !w-6"
                            title="Revert to stock"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Full pane tree from the console layout */}
            {system && (
              <div className="space-y-1.5">
                <span className={label}>All panes</span>
                <select
                  value={currentFile}
                  onChange={(e) => setBrowseFile(e.target.value)}
                  className="w-full bg-[var(--panel)] border border-[var(--border)] rounded px-1.5 py-1 text-[var(--text)] outline-none font-mono text-[12px]"
                >
                  {fileOptions.map((n) => (
                    <option key={n} value={n}>
                      {n.replace('blyt/', '')}
                      {n === system.mainLayout ? '  (screen root)' : ''}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5 bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-1">
                  <Search className="w-3 h-3 text-[var(--text-3)]" />
                  <input
                    value={paneFilter}
                    onChange={(e) => setPaneFilter(e.target.value)}
                    placeholder="Filter panes"
                    className="bg-transparent outline-none text-[var(--text)] w-full text-[12px]"
                  />
                </div>
                <div className="max-h-[420px] overflow-y-auto rounded border border-[var(--border)] bg-[var(--panel)] py-1">
                  {tree.map(({ pane, depth }, i) => {
                    const key = paneKey(currentFile!, pane.name);
                    return (
                      <div
                        key={`${pane.name}-${i}`}
                        onClick={() => onSelect(key)}
                        className={`flex items-center gap-1.5 pr-2 py-0.5 cursor-pointer font-mono text-[12px] ${
                          selectedKey === key ? 'bg-[var(--accent)]/15 text-[var(--text)]' : 'text-[var(--text-2)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
                        }`}
                        style={{ paddingLeft: 6 + (paneFilter ? 0 : depth * 10) }}
                      >
                        <span className={`text-[12px] w-6 shrink-0 ${pane.kind === 'prt1' ? 'text-pink-400' : pane.kind === 'txt1' ? 'text-sky-400' : pane.kind === 'pic1' ? 'text-amber-400' : 'text-[var(--text-3)]'}`}>
                          {pane.kind.slice(0, 3)}
                        </span>
                        <span className={`truncate ${pane.visible ? '' : 'opacity-50'}`}>{pane.name}</span>
                        {patchedKeys.has(key) && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'mock' && (
          <div className="space-y-4">
            {/* Clock (wheel or arrow keys adjust it) */}
            <div className="bg-[var(--panel-2)] rounded-lg p-3 border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--text-2)] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--text-2)]" />
                  Clock
                </span>
                <input
                  type="text"
                  value={mockState.time}
                  onWheel={handleClockWheel}
                  onKeyDown={handleClockKeyDown}
                  onChange={(e) => onUpdateMockState({ time: e.target.value })}
                  className="w-16 bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-0.5 text-right font-mono text-[var(--text)] text-xs outline-none focus:border-[var(--accent)]"
                  title="Scroll wheel or Arrow Up/Down to adjust time"
                />
              </div>

            </div>

            {/* Switch Stock Background Theme Toggle */}
            <div className="bg-[var(--panel-2)] rounded-lg p-3 border border-[var(--border)] space-y-2">
              <span className="text-[12px] font-semibold text-[var(--text-2)] block">
                Switch System Theme
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onUpdateMockState({ isDarkTheme: true })}
                  className={`py-1.5 px-2 rounded text-xs font-medium border transition flex items-center justify-center gap-1.5 ${
                    mockState.isDarkTheme
                      ? 'bg-[#2d2d2d] border-[var(--accent)] text-[var(--text)]'
                      : 'bg-[var(--panel-2)] border-[var(--hover)] text-[var(--text-2)]'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2d2d2d] border border-slate-500" />
                  <span>Basic Black</span>
                </button>
                <button
                  onClick={() => onUpdateMockState({ isDarkTheme: false })}
                  className={`py-1.5 px-2 rounded text-xs font-medium border transition flex items-center justify-center gap-1.5 ${
                    !mockState.isDarkTheme
                      ? 'bg-[#ebebeb] border-[var(--accent)] text-black'
                      : 'bg-[var(--panel-2)] border-[var(--hover)] text-[var(--text-2)]'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ebebeb] border border-slate-400" />
                  <span>Basic White</span>
                </button>
              </div>
            </div>

            <UsersEditor users={mockState.users} onChange={(users) => onUpdateMockState({ users })} />

            {/* Games Carousel Management */}
            <div className="bg-[var(--panel-2)] rounded-lg p-3 border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--text-2)] block">
                  Simulated Games ({mockState.games.length})
                </span>
                <button
                  onClick={handleAddGame}
                  className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>

              <label className="flex items-center gap-2 text-[12px] text-[var(--text-2)] cursor-pointer" title="The first game shows as Playing; the lock screen offers to resume it instead of the HOME button">
                <input
                  type="checkbox"
                  checked={mockState.gameSuspended !== false}
                  onChange={(e) => onUpdateMockState(activeScreen.target === 'lock' ? { lockGameSuspended: e.target.checked } : { gameSuspended: e.target.checked })}
                  className="accent-[var(--accent)]"
                />
                First game is suspended (Playing)
              </label>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {mockState.games.map((g, idx) => (
                  <div
                    key={g.id}
                    onClick={() => onUpdateMockState({ selectedGameIndex: idx })}
                    className={`flex items-center justify-between p-1.5 rounded border cursor-pointer transition ${
                      mockState.selectedGameIndex === idx
                        ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--text)]'
                        : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text-2)] hover:border-[var(--text-3)]'
                    }`}
                  >
                    <span className="text-xs truncate max-w-[160px] font-medium">{g.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveGame(g.id);
                      }}
                      className="ui-row-action ui-row-action-danger !w-6"
                      title="Remove"
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
          <div className="space-y-3">
            {implicitZero.length > 0 && (
              <Note tone="warn" title="Axes the injector will set to 0">
                {implicitZero.slice(0, 8).map((z) => (
                  <div key={`${z.file}${z.pane}${z.field}`} className="font-mono text-[12px]">
                    {z.pane}.{z.field}.{z.missing.join('/')}
                  </div>
                ))}
                {implicitZero.length > 8 && <div>…and {implicitZero.length - 8} more</div>}
              </Note>
            )}
            <textarea
              value={jsonDraft ?? JSON.stringify(layout, null, 2)}
              onChange={(e) => {
                setJsonDraft(e.target.value);
                setJsonError(null);
              }}
              spellCheck={false}
              className="w-full h-[460px] p-2 bg-[var(--panel)] rounded-lg border border-[var(--border)] text-[var(--text)] font-mono text-[12px] outline-none focus:border-[var(--accent)] resize-y"
            />
            {jsonError && <div className="text-[12px] text-red-300">{jsonError}</div>}
            {jsonDraft !== null && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(jsonDraft) as LayoutPatch;
                      if (typeof parsed !== 'object' || Array.isArray(parsed) || (parsed.Files && !Array.isArray(parsed.Files))) throw new Error('Expected a layout object with a Files array.');
                      onUpdateActiveScreen({ layout: parsed });
                      setJsonDraft(null);
                    } catch (e) {
                      setJsonError((e as Error).message);
                    }
                  }}
                  className="px-3 py-1.5 rounded bg-[var(--accent)] text-[var(--text)] font-semibold"
                >
                  Apply
                </button>
                <button onClick={() => setJsonDraft(null)} className="px-3 py-1.5 rounded text-[var(--text-2)] hover:text-[var(--text)]">
                  Discard
                </button>
              </div>
            )}
            {activeScreen.common && (
              <details className="text-[12px] text-[var(--text-2)]">
                <summary className="cursor-pointer">common.json (passed through on export)</summary>
                <pre className="mt-2 p-2 bg-[var(--panel)] rounded border border-[var(--border)] text-[12px] whitespace-pre-wrap break-all">
                  {JSON.stringify(activeScreen.common, null, 2)}
                </pre>
              </details>
            )}
            {activeScreen.extraFiles.length > 0 && (
              <div className="text-[12px] text-[var(--text-2)]">Extra files kept on export: {activeScreen.extraFiles.map((f) => f.name).join(', ')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
