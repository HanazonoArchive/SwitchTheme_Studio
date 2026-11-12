import { Stepper } from './NumberField';
import React from 'react';
import { RotateCcw, ArrowUpToLine, ArrowDownToLine } from 'lucide-react';
import type { PaneInfo } from '../../lib/layout/paneModel';
import {
  drawOrderOf,
  findFilePatch,
  setDrawOrder,
  setMaterialColors,
  setPaneFields,
  setUsd,
  toLayoutColor,
  type LayoutPatch,
} from '../../lib/layout/patch';
import { parseLayoutColor } from '../../lib/layout/textures';
import { PALETTE } from '../../lib/layout/palette';

/**
 * Inspector sections for what makes a theme look different, beyond position and size:
 * vertex / text colours, the material's colours, the system palette colours and rounded corners
 * and borders qlaunch reads from user data, and draw order. Everything is written to layout.json
 * the way SwitchThemesCommon reads it.
 */

type Edit = (fn: (l: LayoutPatch) => LayoutPatch, opts?: { transient?: boolean }) => void;

interface Props {
  info: PaneInfo;
  layout: LayoutPatch;
  dark: boolean;
  onEditLayout: Edit;
  onCommit: () => void;
}

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (c: number[]) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const css = (c: number[]) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] ?? 255) / 255})`;

const Head: React.FC<{ title: string; patched: boolean; onRevert?: () => void; children?: React.ReactNode }> = ({ title, patched, onRevert, children }) => (
  <div className="flex items-center justify-between">
    <span className="text-[12px] font-semibold text-[var(--text-2)] flex items-center gap-1.5">
      {patched && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" title="Changed by this theme" />}
      {title}
    </span>
    <span className="flex items-center gap-2">
      {children}
      {patched && onRevert && (
        <button onClick={onRevert} className="text-[12px] text-[var(--text-3)] hover:text-[var(--text)] flex items-center gap-1" title="Back to stock">
          <RotateCcw className="w-3 h-3" />
          Stock
        </button>
      )}
    </span>
  </div>
);

/** One colour with alpha: a swatch (opens the picker) and the alpha in 0..255. */
const ColorField: React.FC<{ label: string; rgba: number[]; changed?: boolean; compact?: boolean; onChange: (c: number[], transient: boolean) => void; onDone: () => void }> = ({
  label,
  rgba,
  changed,
  compact,
  onChange,
  onDone,
}) => (
  <div className={`flex items-center gap-2 bg-[var(--panel)] border rounded-lg px-2 py-1 ${changed ? 'border-[var(--accent)]/40' : 'border-[var(--border)]'}`}>
    <span className={`text-[12px] font-mono font-bold w-7 shrink-0 ${changed ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'}`}>{label}</span>
    <label className="relative w-6 h-5 rounded border border-[var(--border)] overflow-hidden shrink-0 cursor-pointer" style={{ background: 'repeating-conic-gradient(#888 0 25%, #ccc 0 50%) 0 0/8px 8px' }}>
      <span className="absolute inset-0" style={{ background: css(rgba) }} />
      <input
        type="color"
        value={rgbToHex(rgba)}
        onChange={(e) => onChange([...hexToRgb(e.target.value), rgba[3] ?? 255], true)}
        onBlur={onDone}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </label>
    <span className="font-mono text-[11px] text-[var(--text-2)] flex-1 truncate">{compact ? '' : rgbToHex(rgba).toUpperCase()}</span>
    <span className="ui-number ui-number-inline" title="Alpha (0–255)">
      <input
        type="text"
        inputMode="numeric"
        value={Math.round(rgba[3] ?? 255)}
        onChange={(e) => onChange([rgba[0], rgba[1], rgba[2], Math.max(0, Math.min(255, Number(e.target.value) || 0))], false)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 16 : 1);
          onChange([rgba[0], rgba[1], rgba[2], Math.max(0, Math.min(255, Math.round(rgba[3] ?? 255) + d))], false);
        }}
        className="ui-number-input w-9"
      />
      <Stepper onStep={(d, big) => onChange([rgba[0], rgba[1], rgba[2], Math.max(0, Math.min(255, Math.round(rgba[3] ?? 255) + d * (big ? 16 : 1)))], false)} />
    </span>
  </div>
);

/** A system palette index with its colour, as a dropdown of the known entries. */
const PaletteField: React.FC<{ label: string; value: number | undefined; dark: boolean; changed?: boolean; onChange: (v: number | null) => void }> = ({ label, value, dark, changed, onChange }) => {
  const swatch = value !== undefined && PALETTE[value] ? (dark ? PALETTE[value].dark : PALETTE[value].light) : null;
  return (
    <div className={`flex items-center gap-2 bg-[var(--panel)] border rounded-lg px-2 py-1 ${changed ? 'border-[var(--accent)]/40' : 'border-[var(--border)]'}`}>
      <span className={`text-[12px] font-mono font-bold w-7 shrink-0 ${changed ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'}`}>{label}</span>
      <span className="w-6 h-5 rounded border border-[var(--border)] shrink-0" style={{ background: swatch ? css(swatch) : 'transparent' }} />
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="flex-1 min-w-0 bg-transparent text-[var(--text)] text-xs font-mono outline-none"
      >
        <option value="">— not set —</option>
        {value !== undefined && !PALETTE[value] && <option value={value}>{value} (unknown)</option>}
        {Object.keys(PALETTE).map((k) => (
          <option key={k} value={k}>
            {k === '0' ? '0 (none: material colour)' : k}
          </option>
        ))}
      </select>
    </div>
  );
};

const NumberRow: React.FC<{ label: string; value: number | undefined; changed?: boolean; placeholder?: string; onChange: (v: number | null) => void }> = ({ label, value, changed, placeholder, onChange }) => {
  const [draft, setDraft] = React.useState<string | null>(null);
  return (
    <div className={`flex items-center gap-2 bg-[var(--panel)] border rounded-lg px-2 py-1 ${changed ? 'border-[var(--accent)]/40' : 'border-[var(--border)]'}`}>
      <span className={`text-[12px] flex-1 ${changed ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'}`}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder ?? '—'}
        value={draft ?? (value === undefined ? '' : String(Math.round(value * 1000) / 1000))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          const t = e.target.value.trim();
          setDraft(null);
          if (t === '') onChange(null);
          else if (!Number.isNaN(parseFloat(t))) onChange(parseFloat(t));
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="w-16 bg-transparent text-right text-[var(--text)] text-xs font-mono outline-none"
      />
    </div>
  );
};

export const StyleSections: React.FC<Props> = ({ info, layout, dark, onEditLayout, onCommit }) => {
  const { file, name, patch, stockPane, material, kind } = info;
  const isText = kind === 'txt1';
  const hasColors = kind === 'pic1' || kind === 'wnd1' || isText;

  /* -------- vertex / text colours -------- */
  const corners = isText ? (['TL', 'BL'] as const) : (['TL', 'TR', 'BL', 'BR'] as const);
  const stockColor = (c: 'TL' | 'TR' | 'BL' | 'BR') =>
    isText ? (c === 'TL' ? stockPane?.fontColor : (stockPane?.fontColorBottom ?? stockPane?.fontColor)) : stockPane?.colors?.[c];
  const colorOf = (c: 'TL' | 'TR' | 'BL' | 'BR') => parseLayoutColor((patch?.[`Color${c}`] as string | undefined) ?? stockColor(c) ?? 'FFFFFFFF');
  const colorsPatched = corners.some((c) => patch?.[`Color${c}`] !== undefined);
  const setColors = (cs: ('TL' | 'TR' | 'BL' | 'BR')[], rgba: number[], transient: boolean) =>
    onEditLayout((l) => setPaneFields(l, file, name, Object.fromEntries(cs.map((c) => [`Color${c}`, toLayoutColor(rgba as [number, number, number, number])]))), { transient });

  /* -------- material -------- */
  const matPatch = material ? findFilePatch(layout, file)?.Materials?.find((m) => m.MaterialName === material.name) : undefined;
  const matPatched = !!(matPatch?.ForegroundColor || matPatch?.BackgroundColor);

  /* -------- user data -------- */
  const usdPatch = (prop: string) => patch?.UsdPatches?.find((u) => u.PropName === prop);
  const usdValues = (prop: string): number[] | undefined => {
    const p = usdPatch(prop);
    return p ? p.PropValues.map(Number) : stockPane?.userData?.[prop];
  };
  const usdType = (prop: string, fallback: number) => stockPane?.userDataTypes?.[prop] ?? usdPatch(prop)?.type ?? fallback;
  /** Writes a property keeping the stock value count (the installer ignores a different count). */
  const setProp = (prop: string, first: number | null, fallbackType: number, fill: number[] = []) => {
    if (first === null) return onEditLayout((l) => setUsd(l, file, name, prop, null, 1));
    const stockVals = stockPane?.userData?.[prop];
    const vals = stockVals ? [first, ...stockVals.slice(1)] : [first, ...fill];
    onEditLayout((l) => setUsd(l, file, name, prop, vals, usdType(prop, fallbackType)));
  };
  const cw = usdValues('C_W')?.[0];
  const cb = usdValues('C_B')?.[0];
  const radius = usdValues('S_RoundRadius')?.[0];
  const borderOn = usdValues('S_BorderDrawMode')?.[0] === 1;
  const borderSize = usdValues('S_BorderSize')?.[0];
  const borderColor = (usdValues('S_BorderColor0') ?? [1, 1, 1, 1]).map((v) => v * 255);
  const usdPatched = (props: string[]) => props.some((p) => usdPatch(p));
  const BORDER_PROPS = ['S_BorderDrawMode', 'S_BorderSize', 'S_BorderVolume', 'S_BorderColorSelect0', 'S_BorderColor0'];
  const setBorder = (on: boolean, size = borderSize ?? 3, color = borderColor) =>
    onEditLayout((l) => {
      let out = l;
      if (!on) {
        for (const p of BORDER_PROPS) out = setUsd(out, file, name, p, null, 1);
        return out;
      }
      out = setUsd(out, file, name, 'S_BorderDrawMode', [1], usdType('S_BorderDrawMode', 1));
      out = setUsd(out, file, name, 'S_BorderSize', [size], usdType('S_BorderSize', 2));
      out = setUsd(out, file, name, 'S_BorderVolume', [1], usdType('S_BorderVolume', 2));
      out = setUsd(out, file, name, 'S_BorderColorSelect0', [0], usdType('S_BorderColorSelect0', 1));
      out = setUsd(out, file, name, 'S_BorderColor0', color.map((v) => Math.round((v / 255) * 1000) / 1000), usdType('S_BorderColor0', 2));
      return out;
    });

  /* -------- draw order -------- */
  const order = drawOrderOf(layout, file, name);

  return (
    <>
      {hasColors && (
        <div className="space-y-2">
          <Head
            title={isText ? 'Text colour' : 'Colour'}
            patched={colorsPatched}
            onRevert={() => onEditLayout((l) => setPaneFields(l, file, name, { ColorTL: undefined, ColorTR: undefined, ColorBL: undefined, ColorBR: undefined }))}
          />
          <ColorField label="All" rgba={colorOf('TL')} onChange={(c, t) => setColors([...corners], c, t)} onDone={onCommit} />
          <div className="grid grid-cols-2 gap-2">
            {corners.map((c) => (
              <ColorField key={c} compact label={isText ? (c === 'TL' ? 'Top' : 'Btm') : c} rgba={colorOf(c)} changed={patch?.[`Color${c}`] !== undefined} onChange={(v, t) => setColors([c], v, t)} onDone={onCommit} />
            ))}
          </div>
          <div className="text-[12px] text-[var(--text-3)]">
            {isText ? 'Font colour (gradient top to bottom).' : 'Vertex colours multiply the picture; a system colour (below) takes precedence on the console.'}
          </div>
        </div>
      )}

      {material && (
        <div className="space-y-2">
          <Head
            title={`Material · ${material.name}`}
            patched={matPatched}
            onRevert={() => onEditLayout((l) => setMaterialColors(l, file, material.name, { ForegroundColor: null, BackgroundColor: null }))}
          />
          <div className="grid grid-cols-1 gap-2">
            <ColorField
              label="Blk"
              rgba={parseLayoutColor(matPatch?.ForegroundColor ?? material.black)}
              changed={!!matPatch?.ForegroundColor}
              onChange={(c, t) => onEditLayout((l) => setMaterialColors(l, file, material.name, { ForegroundColor: toLayoutColor(c as [number, number, number, number]) }), { transient: t })}
              onDone={onCommit}
            />
            <ColorField
              label="Wht"
              rgba={parseLayoutColor(matPatch?.BackgroundColor ?? material.white)}
              changed={!!matPatch?.BackgroundColor}
              onChange={(c, t) => onEditLayout((l) => setMaterialColors(l, file, material.name, { BackgroundColor: toLayoutColor(c as [number, number, number, number]) }), { transient: t })}
              onDone={onCommit}
            />
          </div>
          <div className="text-[12px] text-[var(--text-3)]">The texture is drawn from black (dark texels) to white (light texels). Shared by every pane using this material.</div>
        </div>
      )}

      {hasColors && (
        <div className="space-y-2">
          <Head title="System colour" patched={usdPatched(['C_W', 'C_B'])} onRevert={() => onEditLayout((l) => setUsd(setUsd(l, file, name, 'C_W', null, 1), file, name, 'C_B', null, 1))} />
          <PaletteField label="C_W" value={cw} dark={dark} changed={!!usdPatch('C_W')} onChange={(v) => setProp('C_W', v, 1, [0, 0, 0])} />
          <PaletteField label="C_B" value={cb} dark={dark} changed={!!usdPatch('C_B')} onChange={(v) => setProp('C_B', v, 1, [0, 0, 0])} />
          <div className="text-[12px] text-[var(--text-3)]">Palette colours follow Basic White / Basic Black. Swatches show the current preview theme.</div>
        </div>
      )}

      {(kind === 'pic1' || kind === 'wnd1' || kind === 'pan1') && (
        <div className="space-y-2">
          <Head title="Corners & border" patched={usdPatched(['S_RoundRadius', ...BORDER_PROPS])} />
          <NumberRow label="Corner radius" value={radius} changed={!!usdPatch('S_RoundRadius')} placeholder="0" onChange={(v) => setProp('S_RoundRadius', v, 2)} />
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-2)] cursor-pointer">
            <input type="checkbox" checked={borderOn} onChange={(e) => setBorder(e.target.checked)} className="accent-[var(--accent)]" />
            Border
          </label>
          {borderOn && (
            <>
              <NumberRow label="Border size" value={borderSize} changed={!!usdPatch('S_BorderSize')} onChange={(v) => setBorder(true, v ?? 3)} />
              <ColorField label="Clr" rgba={borderColor} changed={!!usdPatch('S_BorderColor0')} onChange={(c) => setBorder(true, borderSize ?? 3, c)} onDone={onCommit} />
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Head title="Draw order" patched={order !== null} onRevert={() => onEditLayout((l) => setDrawOrder(l, file, name, null))} />
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onEditLayout((l) => setDrawOrder(l, file, name, order === 'front' ? null : 'front'))}
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px] ${order === 'front' ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)]'}`}
            title="Drawn on top of its siblings (PushBackPanes)"
          >
            <ArrowUpToLine className="w-3.5 h-3.5" /> Bring to front
          </button>
          <button
            onClick={() => onEditLayout((l) => setDrawOrder(l, file, name, order === 'back' ? null : 'back'))}
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px] ${order === 'back' ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)]'}`}
            title="Drawn behind its siblings (PullFrontPanes)"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" /> Send to back
          </button>
        </div>
      </div>
    </>
  );
};
