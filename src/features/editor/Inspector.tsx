import React from 'react';
import { Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw, AlertTriangle, MousePointerClick } from 'lucide-react';
import type { ThemeScreen } from '../../types/theme';
import type { SystemLayout } from '../../lib/layout/systemLayouts';
import { getPaneInfo } from '../../lib/layout/paneModel';
import type { JVec3, PaneEdit, PanePatch } from '../../lib/layout/patch';
import type { Origin } from '../../lib/nx/bflyt';

interface InspectorProps {
  activeScreen: ThemeScreen;
  system: SystemLayout | undefined;
  selectedKey: string | null;
  onEditPane: (key: string, edit: PaneEdit) => void;
  onRevertPane: (key: string, field?: keyof PanePatch) => void;
}

interface NumberFieldProps {
  label: string;
  value: number;
  stock?: number | null;
  step?: number;
  onChange: (val: number) => void;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

const NumberField: React.FC<NumberFieldProps> = ({ label, value, stock, step = 1, onChange }) => {
  const [draft, setDraft] = React.useState<string | null>(null);
  const differs = stock !== undefined && stock !== null && Math.abs(stock - value) > 1e-4;
  const commit = (raw: string) => {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) onChange(parsed);
    setDraft(null);
  };
  return (
    <div
      onWheel={(e) => {
        if (document.activeElement !== e.currentTarget.querySelector('input')) return;
        onChange(Number((value + (e.deltaY < 0 ? step : -step)).toFixed(3)));
      }}
      className={`flex items-center justify-between bg-[#0c0e12] border rounded-lg px-2 py-1 transition group ${
        differs ? 'border-[#10b981]/40' : 'border-[#232936]'
      } hover:border-slate-600 focus-within:border-[#10b981]`}
      title={stock !== undefined && stock !== null ? `Stock: ${fmt(stock)}` : 'Stock value unknown'}
    >
      <span className={`text-[10px] font-mono font-bold select-none ${differs ? 'text-[#10b981]' : 'text-slate-500'}`}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? fmt(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? step * 10 : step);
            setDraft(null);
            onChange(Number((value + d).toFixed(3)));
          }
        }}
        className="w-full bg-transparent text-right text-white text-xs font-mono outline-none ml-2 min-w-0"
      />
      <div className="flex flex-col ml-1.5 opacity-40 group-hover:opacity-100 transition">
        <button onClick={() => onChange(Number((value + step).toFixed(3)))} className="text-slate-400 hover:text-white">
          <ChevronUp className="w-2.5 h-2.5" />
        </button>
        <button onClick={() => onChange(Number((value - step).toFixed(3)))} className="text-slate-400 hover:text-white">
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};

const ORIGIN_X = ['Center', 'Left', 'Right'];
const ORIGIN_Y = ['Center', 'Top', 'Bottom'];

const Section: React.FC<{ title: string; patched: boolean; onRevert?: () => void; children: React.ReactNode }> = ({ title, patched, onRevert, children }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        {patched && <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" title="Changed by this theme" />}
        {title}
      </span>
      {patched && onRevert && (
        <button onClick={onRevert} className="text-[10px] text-slate-500 hover:text-white flex items-center gap-1" title="Back to stock">
          <RotateCcw className="w-3 h-3" />
          Stock
        </button>
      )}
    </div>
    {children}
  </div>
);

export const Inspector: React.FC<InspectorProps> = ({ activeScreen, system, selectedKey, onEditPane, onRevertPane }) => {
  if (!selectedKey) {
    return (
      <aside className="w-72 bg-[#101319] border-l border-[#1b1f28] flex flex-col shrink-0 select-none text-xs">
        <div className="h-10 px-4 border-b border-[#1b1f28] flex items-center">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Inspector</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2">
          <MousePointerClick className="w-6 h-6 text-slate-600" />
          <span className="text-sm font-medium text-slate-300">No pane selected</span>
          <span className="text-xs text-slate-500 max-w-[220px] leading-relaxed">
            Click something in the preview or pick a pane in the Panes list. Drag to move, arrow keys to nudge (Shift = 10).
          </span>
        </div>
      </aside>
    );
  }

  const info = getPaneInfo(activeScreen.layout, system, selectedKey);
  const { current: cur, stock, patch } = info;
  const edit = (e: PaneEdit) => onEditPane(selectedKey, e);
  const has = (f: keyof PanePatch) => patch?.[f] !== undefined;

  const implicitZero = (['Position', 'Rotation', 'Scale', 'Size'] as const).filter((f) => {
    const v = patch?.[f] as JVec3 | undefined;
    return v && (v.X === undefined || v.Y === undefined);
  });

  return (
    <aside className="w-72 bg-[#101319] border-l border-[#1b1f28] flex flex-col shrink-0 select-none text-xs">
      <div className="h-10 px-4 border-b border-[#1b1f28] flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Inspector</span>
        <span className="text-[10px] font-mono text-slate-500">{info.kind ?? 'pane'}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold text-white truncate">{info.name}</span>
            <button
              onClick={() => edit({ visible: !cur.visible })}
              className={`p-1 rounded ${cur.visible ? 'text-slate-300 hover:text-white' : 'text-amber-400'}`}
              title={cur.visible ? 'Hide pane (Visible: false)' : 'Show pane'}
            >
              {cur.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
          <div className="font-mono text-[10px] text-slate-500 truncate" title={info.file}>
            {info.file}
          </div>
          {patch ? (
            <button onClick={() => onRevertPane(selectedKey)} className="text-[11px] text-slate-400 hover:text-red-300 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Revert whole pane to stock
            </button>
          ) : (
            <span className="text-[11px] text-slate-500">Not changed by this theme</span>
          )}
        </div>

        {!system && (
          <div className="flex gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Stock values are unknown without your console's layout file, so fields you haven't changed show 0 / 1. Editing one axis writes the
              other as shown. Load the .szs in the Panes tab to see real defaults.
            </span>
          </div>
        )}
        {info.fixes.length > 0 && (
          <div className="flex gap-2 p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-200 text-[11px] leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              The installer also changes this pane on your firmware ({info.fixes.map((f) => f.name).join(', ')}). Stock values and the preview include it.
            </span>
          </div>
        )}
        {info.missingInStock && (
          <div className="flex gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-[11px] leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>This pane isn't in your console's {info.file}. The installer silently skips it, so this patch does nothing on your firmware.</span>
          </div>
        )}
        {implicitZero.length > 0 && (
          <div className="flex gap-2 p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-200 text-[11px] leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {implicitZero.join(', ')} leaves out an axis. The injector treats a missing axis as 0, not "unchanged", and so does this preview.
            </span>
          </div>
        )}

        <Section title="Position" patched={has('Position')} onRevert={() => onRevertPane(selectedKey, 'Position')}>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" value={cur.position.X} stock={stock?.position.X} onChange={(X) => edit({ position: { X } })} />
            <NumberField label="Y" value={cur.position.Y} stock={stock?.position.Y} onChange={(Y) => edit({ position: { Y } })} />
          </div>
          <div className="text-[10px] text-slate-500">Relative to the parent pane. +Y is up.</div>
        </Section>

        <Section title="Size" patched={has('Size')} onRevert={() => onRevertPane(selectedKey, 'Size')}>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="W" value={cur.size.X} stock={stock?.size.X} onChange={(X) => edit({ size: { X } })} />
            <NumberField label="H" value={cur.size.Y} stock={stock?.size.Y} onChange={(Y) => edit({ size: { Y } })} />
          </div>
        </Section>

        <Section title="Scale" patched={has('Scale')} onRevert={() => onRevertPane(selectedKey, 'Scale')}>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" step={0.05} value={cur.scale.X} stock={stock?.scale.X} onChange={(X) => edit({ scale: { X } })} />
            <NumberField label="Y" step={0.05} value={cur.scale.Y} stock={stock?.scale.Y} onChange={(Y) => edit({ scale: { Y } })} />
          </div>
          <button onClick={() => edit({ scale: { Y: cur.scale.X } })} className="text-[10px] text-slate-500 hover:text-white">
            Make Y = X
          </button>
        </Section>

        <Section title="Rotation" patched={has('Rotation')} onRevert={() => onRevertPane(selectedKey, 'Rotation')}>
          <NumberField label="Z°" step={1} value={cur.rotation.Z} stock={stock?.rotation.Z} onChange={(Z) => edit({ rotation: { Z } })} />
        </Section>

        <Section
          title="Anchors"
          patched={has('OriginX') || has('OriginY') || has('ParentOriginX') || has('ParentOriginY')}
        >
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {(
              [
                ['Origin X', 'originX', ORIGIN_X],
                ['Origin Y', 'originY', ORIGIN_Y],
                ['Parent X', 'parentOriginX', ORIGIN_X],
                ['Parent Y', 'parentOriginY', ORIGIN_Y],
              ] as const
            ).map(([label, field, names]) => (
              <label key={field} className="flex flex-col gap-1 text-slate-400">
                {label}
                <select
                  value={cur[field]}
                  onChange={(e) => edit({ [field]: Number(e.target.value) as Origin })}
                  className="bg-[#0c0e12] border border-[#232936] rounded px-1.5 py-1 text-white outline-none"
                >
                  {names.map((n, i) => (
                    <option key={n} value={i}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </Section>

        {patch && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Patch entry</span>
            <pre className="p-2 bg-[#0c0e12] rounded border border-[#202532] text-[10px] text-slate-300 whitespace-pre-wrap break-all font-mono">
              {JSON.stringify(patch, null, 1)}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
};
