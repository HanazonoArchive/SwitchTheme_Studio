import React from 'react';
import { Gamepad2, RotateCcw } from 'lucide-react';
import type { LayoutPatch } from '../../lib/layout/patch';
import type { SystemLayout } from '../../lib/layout/systemLayouts';
import { readIconScale, writeIconScale } from '../../lib/layout/focusScale';
import { NumberField } from './NumberField';
import { NoteBox } from './Inspector';

/**
 * Game icon size (all games at once) and focused-game enlargement. Shown when a game icon (or its
 * slot) is selected on the Home menu.
 */
export const IconScaleSection: React.FC<{
  layout: LayoutPatch;
  system: SystemLayout | null | undefined;
  onEditLayout: (fn: (l: LayoutPatch) => LayoutPatch, opts?: { transient?: boolean; label?: string }) => void;
}> = ({ layout, system, onEditLayout }) => {
  const s = readIconScale(layout);
  const pct = (v: number) => Math.round(v * 1000) / 10;
  const set = (normal: number, focused: number, label: string) => onEditLayout((l) => writeIconScale(l, system, Math.max(0.05, normal), Math.max(0.05, focused)), { label });
  const zoom = s.normal ? s.focused / s.normal : 1;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-2)]">
        <Gamepad2 className="w-3.5 h-3.5" /> Game icon size
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField label="All %" value={pct(s.normal)} step={1} min={5} max={400} onChange={(v) => set(v / 100, (v / 100) * zoom, 'Game icon size')} />
        <NumberField label="Focus %" value={pct(s.focused)} step={1} min={5} max={600} onChange={(v) => set(s.normal, v / 100, 'Focused game size')} />
      </div>
      <div className="flex gap-1.5">
        {[1, 1.25, 1.5].map((z) => (
          <button key={z} className={`ui-chip ${Math.abs(zoom - z) < 0.01 ? 'ui-on' : ''}`} onClick={() => set(s.normal, s.normal * z, z === 1 ? 'No focus zoom' : `Focus zoom ×${z}`)} title={z === 1 ? 'Like the console: the focused game keeps its size, only the cursor shows' : `Focused game ${z * 100}% of the others`}>
            {z === 1 ? 'No zoom' : `×${z}`}
          </button>
        ))}
        {(s.source !== 'stock' || zoom !== 1) && (
          <button className="ui-chip ml-auto" title="Console size, no focus zoom" onClick={() => set(1, 1, 'Reset game icon size')}>
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>
      <NoteBox
        note={{
          level: 'info',
          text:
            'Every game icon is the same layout, so these sizes apply to all of them. On the console a focused game keeps its size (only the cursor frame appears); enlarging it is a theme choice, not a console setting. It is written as the Active/Inactive animations' +
            (s.source === 'animation' ? ` on ${s.pane}, which this theme already has.` : '. Spacing between icons is set by the slots (N_Icon_xx), so move those if big icons overlap.'),
        }}
      />
    </div>
  );
};
