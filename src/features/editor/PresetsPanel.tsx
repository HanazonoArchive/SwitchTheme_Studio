import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, LayoutTemplate, Loader2, RotateCcw, Search } from 'lucide-react';
import type { ThemeScreen } from '../../types/theme';
import { composePreset, loadPresets, type LayoutPreset, type PresetChoices } from '../../lib/layout/presets';
import { hasLayoutChanges } from '../../lib/layout/patch';
import { targetInfo } from '../../lib/layout/targets';
import { Note } from '../../components/Note';

/**
 * "Start from a layout": the community layouts from Themezer for this screen, with their options
 * (toggles and choices). Picking one replaces the screen's layout; Ctrl+Z undoes it.
 */

const SOURCE_URL = 'https://github.com/ThemezerNX/Layouts';

interface Props {
  screen: ThemeScreen;
  onApply: (updates: Partial<ThemeScreen>, label: string) => void;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const PresetsPanel: React.FC<Props> = ({ screen, onApply }) => {
  const [loaded, setLoaded] = useState<{ target: string; list: LayoutPreset[] } | null>(null);
  const presets = loaded?.target === screen.target ? loaded.list : null;
  const [open, setOpen] = useState(() => !hasLayoutChanges(screen.layout));
  const [query, setQuery] = useState('');

  useEffect(() => {
    let live = true;
    loadPresets(screen.target).then((list) => live && setLoaded({ target: screen.target, list }));
    return () => {
      live = false;
    };
  }, [screen.target]);

  const active = presets?.find((p) => p.id === screen.preset?.id);
  const choices: PresetChoices = useMemo(() => screen.preset?.choices ?? {}, [screen.preset]);
  const allowCommon = targetInfo(screen.target).allowCommon;
  // Edited by hand since the preset was applied (an option change starts again from the preset).
  const edited = useMemo(() => (active ? !same(composePreset(active, choices).layout, screen.layout) : false), [active, choices, screen.layout]);

  const apply = (p: LayoutPreset, c: PresetChoices, label: string) => {
    const { layout, common } = composePreset(p, c);
    onApply({ layout, common: allowCommon ? common : screen.common, preset: { id: p.id, choices: c } }, label);
  };
  const toStock = () => onApply({ layout: {}, common: active?.common ? null : screen.common, preset: undefined }, 'Back to the stock layout');

  const shown = (presets ?? []).filter((p) => {
    const q = query.trim().toLowerCase();
    return !q || `${p.name} ${p.author} ${p.description}`.toLowerCase().includes(q);
  });

  return (
    <div className="bg-[var(--panel-2)] rounded-lg border border-[var(--border)]">
      <button className="w-full flex items-center gap-1.5 px-3 py-2 text-left" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-3)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-3)]" />}
        <LayoutTemplate className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span className="font-semibold text-[var(--text)] text-[12px] flex-1">Start from a layout</span>
        <span className="text-[11px] text-[var(--text-3)] truncate max-w-[50%]">{active ? active.name : presets ? `${presets.length} presets` : ''}</span>
      </button>

      {active && active.options.length > 0 && (
        <div className="px-3 pb-2.5 space-y-1.5 border-t border-[var(--border)] pt-2">
          <span className="text-[11px] text-[var(--text-2)] block">{active.name} options</span>
          {active.options.map((o) =>
            o.type === 'toggle' ? (
              <label key={o.name} className="flex items-center justify-between gap-2 text-[12px] text-[var(--text)]">
                <span className="min-w-0">{o.name}</span>
                <input
                  type="checkbox"
                  className="accent-[var(--accent)] shrink-0"
                  checked={choices[o.name] === true}
                  onChange={(e) => apply(active, { ...choices, [o.name]: e.target.checked }, `${active.name}: ${o.name} ${e.target.checked ? 'on' : 'off'}`)}
                />
              </label>
            ) : (
              <label key={o.name} className="flex items-center justify-between gap-2 text-[12px] text-[var(--text)]">
                <span className="min-w-0">{o.name}</span>
                <select
                  className="ui-input !h-6 !py-0 text-[12px] max-w-[55%]"
                  value={typeof choices[o.name] === 'string' ? String(choices[o.name]) : ''}
                  onChange={(e) => apply(active, { ...choices, [o.name]: e.target.value || undefined }, `${active.name}: ${o.name} ${e.target.value || 'default'}`)}
                >
                  <option value="">As designed</option>
                  {o.choices?.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ),
          )}
          {edited && (
            <Note tone="info" compact>
              You've edited this layout since picking it. Changing an option starts again from {active.name} with your options; Ctrl+Z brings your edits back.
            </Note>
          )}
        </div>
      )}

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-[var(--border)] pt-2">
          {!presets && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-3)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading layouts…
            </div>
          )}
          {presets && presets.length === 0 && <div className="text-[12px] text-[var(--text-3)]">No ready-made layouts for this screen yet.</div>}
          {presets && presets.length > 6 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
              <input className="ui-input w-full !pl-7" placeholder={`Search ${presets.length} layouts`} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}
          {presets && presets.length > 0 && (
            <div className="max-h-80 overflow-y-auto -mx-1 px-1 space-y-1">
              <button
                onClick={() => hasLayoutChanges(screen.layout) && toStock()}
                className={`w-full text-left px-2 py-1.5 rounded-md border flex items-center gap-2 ${!hasLayoutChanges(screen.layout) ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10' : 'border-[var(--border)] hover:bg-[var(--hover)]'}`}
                title="Remove every layout change on this screen (Ctrl+Z undoes it)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[var(--text-3)] shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] text-[var(--text)]">Stock</span>
                  <span className="block text-[11px] text-[var(--text-3)]">The console's own layout</span>
                </span>
                {!hasLayoutChanges(screen.layout) && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
              </button>
              {shown.map((p) => {
                const on = p.id === active?.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => apply(p, on ? choices : {}, `Layout: ${p.name}`)}
                    className={`w-full text-left px-2 py-1.5 rounded-md border flex items-start gap-2 ${on ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10' : 'border-[var(--border)] hover:bg-[var(--hover)]'}`}
                    title={on ? 'Applied. Click to start again from this layout.' : `Use ${p.name} (replaces this screen's layout; Ctrl+Z undoes it)`}
                  >
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: p.color ? `#${p.color}` : 'var(--text-3)' }} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-[12px] text-[var(--text)] truncate">{p.name}</span>
                        {p.author && <span className="text-[11px] text-[var(--text-3)] truncate">by {p.author}</span>}
                      </span>
                      {p.description && <span className="text-[11px] text-[var(--text-3)] leading-snug line-clamp-2">{p.description}</span>}
                      {(p.options.length > 0 || (p.common && allowCommon)) && (
                        <span className="block text-[11px] text-[var(--text-3)]">
                          {[p.options.length ? `${p.options.length} option${p.options.length > 1 ? 's' : ''}` : '', p.common && allowCommon ? 'also styles the footer and headers' : ''].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    {on && <Check className="w-3.5 h-3.5 text-[var(--accent)] mt-0.5 shrink-0" />}
                  </button>
                );
              })}
              {presets.length > 0 && shown.length === 0 && <div className="text-[12px] text-[var(--text-3)] px-1">No layout matches “{query}”.</div>}
            </div>
          )}
          {presets && presets.length > 0 && (
            <div className="text-[11px] text-[var(--text-3)] leading-snug">
              Community layouts from{' '}
              <a className="underline hover:text-[var(--text)]" href={SOURCE_URL} target="_blank" rel="noreferrer">
                Themezer
              </a>{' '}
              (MPL-2.0), by their authors. Picking one replaces this screen's layout changes.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
