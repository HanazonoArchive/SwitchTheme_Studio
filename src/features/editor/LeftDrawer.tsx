import React, { useMemo, useRef, useState } from 'react';
import { Upload, Download, Eye, EyeOff, Plus, Trash2, Clock, Battery, Wifi, Cpu, Search, RotateCcw, AlertTriangle, ImageOff, Image as ImageIcon, Check, Wrench } from 'lucide-react';
import type { RailTab } from './LeftRail';
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

interface LeftDrawerProps {
  activeTab: RailTab;
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
  onCommitHistory: () => void;
}

const label = 'text-[10px] font-semibold text-slate-400 uppercase tracking-wider block';
const card = 'bg-[#141720] rounded-lg p-3 border border-[#202532]';

const Slider: React.FC<{ name: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }> = ({ name, value, min, max, step, onChange }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-[11px] text-slate-400">
      <span>{name}</span>
      <span className="font-mono text-slate-200">{Math.round(value * 100)}%</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onDoubleClick={() => onChange(name === 'Dimming' ? 0 : 1)}
      className="w-full accent-[#10b981] cursor-pointer"
      title="Double-click to reset"
    />
  </div>
);

export const LeftDrawer: React.FC<LeftDrawerProps> = ({
  activeTab,
  activeScreen,
  system,
  systemLayouts,
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
    <aside className="w-72 bg-[#101319] border-r border-[#1b1f28] flex flex-col shrink-0 select-none text-xs">
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

      <div className="h-10 px-4 border-b border-[#1b1f28] flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {activeTab === 'media' && 'Background'}
          {activeTab === 'panes' && 'Layout & Panes'}
          {activeTab === 'mock' && 'Mock Environment'}
          {activeTab === 'json' && 'layout.json'}
        </span>
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
                    activeScreen.wallpaper ? 'border-[#10b981] bg-[#10b981]/10 text-white' : 'border-[#232936] bg-[#161a22] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5 mb-1 text-[#10b981]" />
                  <div className="font-medium">Custom image</div>
                  <div className="text-[10px] text-slate-400">Ships image.jpg</div>
                </button>
                <button
                  onClick={() => onUpdateActiveScreen({ wallpaper: null })}
                  className={`p-2 rounded-md border text-left transition ${
                    !activeScreen.wallpaper ? 'border-[#10b981] bg-[#10b981]/10 text-white' : 'border-[#232936] bg-[#161a22] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <ImageOff className="w-3.5 h-3.5 mb-1 text-slate-400" />
                  <div className="font-medium">Console default</div>
                  <div className="text-[10px] text-slate-400">Layout only, no image</div>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="aspect-video w-full rounded-md border border-[#202532] overflow-hidden bg-[#0a0c0f] relative flex items-center justify-center">
                {previewUrl ? (
                  <img src={previewUrl} alt="Background" className="w-full h-full" />
                ) : (
                  <div
                    className="w-full h-full flex flex-col items-center justify-center text-[10px] gap-1"
                    style={{ background: mockState.isDarkTheme ? '#2d2d2d' : '#ebebeb', color: mockState.isDarkTheme ? '#bbb' : '#555' }}
                  >
                    <span>Console background</span>
                    <span className="opacity-70">{mockState.isDarkTheme ? 'Basic Black' : 'Basic White'} (switch in Mock OS)</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2 px-3 rounded-md bg-[#161a22] hover:bg-[#1c222d] border border-[#232936] text-slate-200 font-medium flex items-center justify-center gap-1.5 transition"
                >
                  <Upload className="w-3.5 h-3.5 text-[#10b981]" />
                  <span>{activeScreen.wallpaper ? 'Replace' : 'Import'}</span>
                </button>
                <button
                  onClick={onExtractWallpaper}
                  disabled={!activeScreen.wallpaper}
                  className="py-2 px-3 rounded-md bg-[#161a22] hover:bg-[#1c222d] border border-[#232936] text-slate-200 font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Original</span>
                </button>
              </div>
              {activeScreen.wallpaper && (
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="truncate">{activeScreen.wallpaper.fileName}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {activeScreen.wallpaper.width}×{activeScreen.wallpaper.height}
                  </span>
                </div>
              )}
              {activeScreen.wallpaper &&
                wallpaperIssues(activeScreen.wallpaper).map((m) => (
                  <div key={m} className="flex gap-1.5 text-[11px] text-amber-300/90 leading-snug">
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
                <Cpu className="w-3.5 h-3.5 text-[#10b981]" />
                <span className="font-semibold text-white text-[11px]">Console layout ({info.szs})</span>
              </div>
              {system ? (
                <>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    <Check className="w-3 h-3 inline text-[#10b981] mr-1" />
                    {system.layouts.size} layouts, firmware {system.firmwareHint}. Preview and stock values are exact.
                    {!systemLayouts.common && <> Add <span className="font-mono">common.szs</span> for the footer.</>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => szsInputRef.current?.click()} className="text-[11px] text-slate-400 hover:text-white">
                      Replace
                    </button>
                    <button onClick={() => onForgetSystemSzs(activeScreen.target)} className="text-[11px] text-slate-500 hover:text-red-300">
                      Forget
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Defaults and exact positions come from your console's own files. In NXThemes Installer open{' '}
                    <span className="text-slate-300">Extract home menu → Extract szs layout files</span>, then copy{' '}
                    <span className="font-mono text-slate-300">sd:/themes/systemData/extracted/qlaunch/lyt/*.szs</span>. An installed theme doesn't affect them.
                  </p>
                  <button
                    onClick={() => szsInputRef.current?.click()}
                    className="w-full py-1.5 rounded-md bg-[#10b981] hover:bg-[#0ea572] text-[#0c0e12] font-semibold"
                  >
                    Load {info.szs}
                  </button>
                  <p className="text-[10px] text-slate-500">
                    Select several at once, including <span className="font-mono">common.szs</span> for the footer. They stay in this browser.
                  </p>
                </>
              )}
              {systemError && <div className="text-[11px] text-red-300">{systemError}</div>}
              {Object.keys(systemLayouts).length > 0 && (
                <div className="text-[10px] text-slate-500">
                  Loaded: {Object.values(systemLayouts).map((s) => s!.szsName).join(', ')}
                </div>
              )}
            </div>

            {/* What the installer will do to this layout on the user's console */}
            {system && (installer.before.length > 0 || installer.after.length > 0 || compat.length > 0) && (
              <div className={`${card} space-y-2`}>
                {(installer.before.length > 0 || installer.after.length > 0) && (
                  <>
                    <span className="font-semibold text-white text-[11px] flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-sky-400" /> Installer fixes on firmware {system.firmwareHint}
                    </span>
                    {[...installer.before, ...installer.after].map((f) => (
                      <div key={f.name} className="text-[11px] text-slate-400 leading-snug">
                        <span className="font-mono text-sky-300">{f.name}</span> {f.why}
                      </div>
                    ))}
                    <p className="text-[10px] text-slate-500">The preview already includes these.</p>
                    {system.firmware >= FW.Fw20_0 && themeTargetFirmware(layout) < FW.Fw20_0 && (
                      <button
                        onClick={() => onUpdateActiveScreen({ layout: stampFirmware(layout, activeScreen.target, system.firmware) })}
                        className="text-[11px] text-sky-300 hover:text-white underline underline-offset-2"
                        title="Sets TargetFirmware so the installer stops adding the 19.x downgrade. Positions written for 11.x may need adjusting."
                      >
                        Target {system.firmwareHint} instead
                      </button>
                    )}
                  </>
                )}
                {compat.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="font-semibold text-white text-[11px] flex items-center gap-1.5">
                      <AlertTriangle className={`w-3.5 h-3.5 ${compat.some((c) => c.severity === 'critical') ? 'text-red-400' : 'text-amber-400'}`} />
                      Compatibility ({compat.length})
                    </span>
                    {compat.slice(0, 12).map((c, i) => (
                      <div key={i} className={`text-[11px] leading-snug ${c.severity === 'critical' ? 'text-red-300' : 'text-slate-400'}`}>
                        <span className="font-mono">{c.item}</span>{' '}
                        {c.type === 'MissingFile'
                          ? 'file not on this firmware'
                          : c.type === 'MissingGroup'
                            ? 'group missing'
                            : c.type === 'MissingPane'
                              ? 'pane missing'
                              : c.info}
                        {c.severity === 'critical' ? ` in ${c.file.replace('anim/', '')}: the installer drops this animation` : ''}
                      </div>
                    ))}
                    {compat.length > 12 && <div className="text-[10px] text-slate-500">…and {compat.length - 12} more</div>}
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
                className="w-full bg-[#0c0e12] border border-[#232936] rounded px-2 py-1.5 text-white outline-none focus:border-[#10b981]"
              />
              {activeScreen.target === 'home' && (
                <label className="flex items-center justify-between text-[11px] text-slate-300" title="11.0+ added the Nintendo Switch Online button. On (or unset) makes the installer remove it and use the 19.x applet row.">
                  Hide Switch Online button
                  <input
                    type="checkbox"
                    checked={layout.HideOnlineBtn ?? true}
                    onChange={(e) => setLayoutMeta({ HideOnlineBtn: e.target.checked })}
                    className="accent-[#10b981]"
                  />
                </label>
              )}
            </div>

            {/* Changed panes */}
            <div className="space-y-1.5">
              <span className={label}>Changed by this theme ({patchedKeys.size})</span>
              {patched.length === 0 && <div className="text-[11px] text-slate-500">Nothing yet. Select a pane and change it.</div>}
              {patched.map((f) => (
                <div key={f.file} className="space-y-1">
                  <div className="font-mono text-[10px] text-slate-500 truncate">{f.file}</div>
                  {f.patches.map((p) => {
                    const key = paneKey(f.file, p.PaneName);
                    return (
                      <div
                        key={key}
                        onClick={() => onSelect(key)}
                        className={`group flex items-center justify-between px-2 py-1 rounded cursor-pointer border transition ${
                          selectedKey === key ? 'bg-[#10b981]/10 border-[#10b981]/50 text-white' : 'bg-[#141720] border-[#202532] text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <span className={`font-mono text-[11px] truncate ${p.Visible === false ? 'line-through text-slate-500' : ''}`}>{p.PaneName}</span>
                        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditPane(key, { visible: p.Visible === false });
                            }}
                            className="p-0.5 text-slate-400 hover:text-white"
                            title={p.Visible === false ? 'Show' : 'Hide'}
                          >
                            {p.Visible === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRevertPane(key);
                            }}
                            className="p-0.5 text-slate-400 hover:text-red-300"
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
                  className="w-full bg-[#0c0e12] border border-[#232936] rounded px-1.5 py-1 text-white outline-none font-mono text-[11px]"
                >
                  {fileOptions.map((n) => (
                    <option key={n} value={n}>
                      {n.replace('blyt/', '')}
                      {n === system.mainLayout ? '  (screen root)' : ''}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5 bg-[#0c0e12] border border-[#232936] rounded px-2 py-1">
                  <Search className="w-3 h-3 text-slate-500" />
                  <input
                    value={paneFilter}
                    onChange={(e) => setPaneFilter(e.target.value)}
                    placeholder="Filter panes"
                    className="bg-transparent outline-none text-white w-full text-[11px]"
                  />
                </div>
                <div className="max-h-[420px] overflow-y-auto rounded border border-[#202532] bg-[#0c0e12] py-1">
                  {tree.map(({ pane, depth }, i) => {
                    const key = paneKey(currentFile!, pane.name);
                    return (
                      <div
                        key={`${pane.name}-${i}`}
                        onClick={() => onSelect(key)}
                        className={`flex items-center gap-1.5 pr-2 py-0.5 cursor-pointer font-mono text-[11px] ${
                          selectedKey === key ? 'bg-[#10b981]/15 text-white' : 'text-slate-400 hover:bg-[#161a22] hover:text-slate-200'
                        }`}
                        style={{ paddingLeft: 6 + (paneFilter ? 0 : depth * 10) }}
                      >
                        <span className={`text-[9px] w-6 shrink-0 ${pane.kind === 'prt1' ? 'text-pink-400' : pane.kind === 'txt1' ? 'text-sky-400' : pane.kind === 'pic1' ? 'text-amber-400' : 'text-slate-600'}`}>
                          {pane.kind.slice(0, 3)}
                        </span>
                        <span className={`truncate ${pane.visible ? '' : 'opacity-50'}`}>{pane.name}</span>
                        {patchedKeys.has(key) && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#10b981] shrink-0" />}
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
          <div className="space-y-3">
            {implicitZero.length > 0 && (
              <div className="p-2 rounded bg-sky-500/10 border border-sky-500/30 text-sky-200 text-[11px] space-y-1">
                <div className="font-semibold">Axes the injector will set to 0</div>
                {implicitZero.slice(0, 8).map((z) => (
                  <div key={`${z.file}${z.pane}${z.field}`} className="font-mono text-[10px]">
                    {z.pane}.{z.field}.{z.missing.join('/')}
                  </div>
                ))}
                {implicitZero.length > 8 && <div>…and {implicitZero.length - 8} more</div>}
              </div>
            )}
            <textarea
              value={jsonDraft ?? JSON.stringify(layout, null, 2)}
              onChange={(e) => {
                setJsonDraft(e.target.value);
                setJsonError(null);
              }}
              spellCheck={false}
              className="w-full h-[460px] p-2 bg-[#0c0e12] rounded-lg border border-[#202532] text-slate-300 font-mono text-[10px] outline-none focus:border-[#10b981] resize-y"
            />
            {jsonError && <div className="text-[11px] text-red-300">{jsonError}</div>}
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
                  className="px-3 py-1.5 rounded bg-[#10b981] text-[#0c0e12] font-semibold"
                >
                  Apply
                </button>
                <button onClick={() => setJsonDraft(null)} className="px-3 py-1.5 rounded text-slate-400 hover:text-white">
                  Discard
                </button>
              </div>
            )}
            {activeScreen.common && (
              <details className="text-[11px] text-slate-400">
                <summary className="cursor-pointer">common.json (passed through on export)</summary>
                <pre className="mt-2 p-2 bg-[#0c0e12] rounded border border-[#202532] text-[10px] whitespace-pre-wrap break-all">
                  {JSON.stringify(activeScreen.common, null, 2)}
                </pre>
              </details>
            )}
            {activeScreen.extraFiles.length > 0 && (
              <div className="text-[11px] text-slate-400">Extra files kept on export: {activeScreen.extraFiles.map((f) => f.name).join(', ')}</div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
