import React from 'react';
import { Eye, EyeOff, RotateCcw, MousePointerClick } from 'lucide-react';
import { NumberField } from './NumberField';
import { Note } from '../../components/Note';
import { fieldNote, type PaneNote } from '../../lib/layout/limits';
import type { ThemeScreen } from '../../types/theme';
import type { SystemLayout } from '../../lib/layout/systemLayouts';
import { getPaneInfo } from '../../lib/layout/paneModel';
import type { JVec3, LayoutPatch, PaneEdit, PanePatch } from '../../lib/layout/patch';
import { StyleSections } from './StyleSections';
import { IconScaleSection } from './IconScaleSection';
import { ICON_FILE } from '../../lib/layout/focusScale';
import type { Origin } from '../../lib/nx/bflyt';

interface InspectorProps {
  activeScreen: ThemeScreen;
  system: SystemLayout | undefined;
  selectedKey: string | null;
  onEditPane: (key: string, edit: PaneEdit) => void;
  onRevertPane: (key: string, field?: keyof PanePatch) => void;
  onEditLayout: (fn: (layout: LayoutPatch) => LayoutPatch, opts?: { transient?: boolean; label?: string }) => void;
  onCommit: () => void;
  /** Preview is in Basic Black (palette swatches). */
  dark: boolean;
  /** What the console does with this pane beyond the layout (limits.ts). */
  notes?: PaneNote[];
  /** Other layers selected with it (multi-select): edits here apply to the primary one only. */
  alsoSelected?: number;
}

export const NoteBox: React.FC<{ note: PaneNote }> = ({ note }) => <Note tone={note.level}>{note.text}</Note>;

const ORIGIN_X = ['Center', 'Left', 'Right'];
const ORIGIN_Y = ['Center', 'Top', 'Bottom'];

const Section: React.FC<{ title: string; patched: boolean; onRevert?: () => void; children: React.ReactNode }> = ({ title, patched, onRevert, children }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-[12px] font-semibold text-[var(--text-2)] flex items-center gap-1.5">
        {patched && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" title="Changed by this theme" />}
        {title}
      </span>
      {patched && onRevert && (
        <button onClick={onRevert} className="text-[12px] text-[var(--text-3)] hover:text-[var(--text)] flex items-center gap-1" title="Back to stock">
          <RotateCcw className="w-3 h-3" />
          Stock
        </button>
      )}
    </div>
    {children}
  </div>
);

export const Inspector: React.FC<InspectorProps> = ({ activeScreen, system, selectedKey, onEditPane, onRevertPane, onEditLayout, onCommit, dark, notes = [], alsoSelected = 0 }) => {
  if (!selectedKey) {
    return (
      <div className="flex flex-col select-none text-[12px]">
        <div className="h-10 px-4 border-b border-[var(--border)] flex items-center">
          <span className="text-[12px] font-semibold text-[var(--text-2)]">Inspector</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2">
          <MousePointerClick className="w-6 h-6 text-[var(--text-3)]" />
          <span className="text-sm font-medium text-[var(--text)]">No pane selected</span>
          <span className="text-xs text-[var(--text-3)] max-w-[220px] leading-relaxed">
            Click a layer on the canvas or in Layers. Drag to move, handles to resize, arrow keys to nudge (Shift = 10), Shift+Enter for the parent.
          </span>
        </div>
      </div>
    );
  }

  const info = getPaneInfo(activeScreen.layout, system, selectedKey);
  const { current: cur, stock, patch } = info;
  const edit = (e: PaneEdit) => onEditPane(selectedKey, e);
  const has = (f: keyof PanePatch) => patch?.[f] !== undefined;
  // Cautions about a field show on the field itself too (border colour and hover text).
  const fn = (field: string) => {
    const n = fieldNote(notes, field);
    return n ? { note: n.text, noteLevel: n.level } : {};
  };

  const implicitZero = (['Position', 'Rotation', 'Scale', 'Size'] as const).filter((f) => {
    const v = patch?.[f] as JVec3 | undefined;
    return v && (v.X === undefined || v.Y === undefined);
  });

  return (
    <div className="flex flex-col select-none text-[12px]">
      <div className="h-10 px-4 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--text-2)]">Inspector</span>
        <span className="text-[12px] font-mono text-[var(--text-3)]">{info.kind ?? 'pane'}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold text-[var(--text)] truncate">{info.name}</span>
            <button
              onClick={() => edit({ visible: !cur.visible })}
              className={`p-1 rounded ${cur.visible ? 'text-[var(--text)] hover:text-[var(--text)]' : 'text-amber-400'}`}
              title={cur.visible ? 'Hide pane (Visible: false)' : 'Show pane'}
            >
              {cur.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
          <div className="font-mono text-[12px] text-[var(--text-3)] truncate" title={info.file}>
            {info.file}
          </div>
          {patch ? (
            <button onClick={() => onRevertPane(selectedKey)} className="text-[12px] text-[var(--text-2)] hover:text-red-300 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Revert whole pane to stock
            </button>
          ) : (
            <span className="text-[12px] text-[var(--text-3)]">Not changed by this theme</span>
          )}
        </div>

        {alsoSelected > 0 && (
          <div className="text-[12px] text-[var(--text-3)] leading-relaxed">
            +{alsoSelected} more selected. Drag or use the arrow keys to move them together; the fields below edit this layer only.
          </div>
        )}
        {notes.map((n, i) => (
          <NoteBox key={i} note={n} />
        ))}
        {activeScreen.target === 'home' && (info.file === ICON_FILE || (/RdtBase/.test(info.file) && /^N_Icon_\d+$/.test(info.name))) && (
          <IconScaleSection layout={activeScreen.layout} system={system} onEditLayout={onEditLayout} />
        )}

        {!system && (
          <Note tone="warn" title="Stock values unknown">
            Without your console's layout file, fields you haven't changed show 0 / 1. Editing one axis writes the other as shown. Load the .szs in the
            Panes tab to see real defaults.
          </Note>
        )}
        {info.fixes.length > 0 && (
          <Note tone="info" title="Installer fix">
            The installer also changes this pane on your firmware ({info.fixes.map((f) => f.name).join(', ')}). Stock values and the preview include it.
          </Note>
        )}
        {info.missingInStock && (
          <NoteBox note={{ level: 'error', text: `This pane isn't in your console's ${info.file}. The installer silently skips it, so this patch does nothing on your firmware.` }} />
        )}
        {implicitZero.length > 0 && (
          <Note tone="warn" title="Missing axis">
            {implicitZero.join(', ')} leaves out an axis. The injector treats a missing axis as 0, not "unchanged", and so does this preview.
          </Note>
        )}

        <Section title="Position" patched={has('Position')} onRevert={() => onRevertPane(selectedKey, 'Position')}>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" value={cur.position.X} stock={stock?.position.X} onChange={(X) => edit({ position: { X } })} {...fn('position.x')} />
            <NumberField label="Y" value={cur.position.Y} stock={stock?.position.Y} onChange={(Y) => edit({ position: { Y } })} {...fn('position.y')} />
          </div>
          <div className="text-[12px] text-[var(--text-3)]">Relative to the parent pane. +Y is up.</div>
        </Section>

        <Section title="Size" patched={has('Size')} onRevert={() => onRevertPane(selectedKey, 'Size')}>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="W" min={0} value={cur.size.X} stock={stock?.size.X} onChange={(X) => edit({ size: { X } })} {...fn('size')} />
            <NumberField label="H" min={0} value={cur.size.Y} stock={stock?.size.Y} onChange={(Y) => edit({ size: { Y } })} {...fn('size')} />
          </div>
        </Section>

        <Section title="Scale" patched={has('Scale')} onRevert={() => onRevertPane(selectedKey, 'Scale')}>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" step={0.05} value={cur.scale.X} stock={stock?.scale.X} onChange={(X) => edit({ scale: { X } })} {...fn('scale')} />
            <NumberField label="Y" step={0.05} value={cur.scale.Y} stock={stock?.scale.Y} onChange={(Y) => edit({ scale: { Y } })} {...fn('scale')} />
          </div>
          <button onClick={() => edit({ scale: { Y: cur.scale.X } })} className="text-[12px] text-[var(--text-3)] hover:text-[var(--text)]">
            Make Y = X
          </button>
        </Section>

        <Section title="Rotation" patched={has('Rotation')} onRevert={() => onRevertPane(selectedKey, 'Rotation')}>
          <NumberField label="Z°" step={1} value={cur.rotation.Z} stock={stock?.rotation.Z} onChange={(Z) => edit({ rotation: { Z } })} {...fn('rotation')} />
        </Section>

        <Section
          title="Anchors"
          patched={has('OriginX') || has('OriginY') || has('ParentOriginX') || has('ParentOriginY')}
        >
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            {(
              [
                // layout.json field names are swapped against what the console does with them
                // (see realAnchors); label by effect.
                ['Origin X', 'parentOriginY', ORIGIN_X],
                ['Origin Y', 'parentOriginX', ORIGIN_Y],
                ['Parent X', 'originY', ORIGIN_X],
                ['Parent Y', 'originX', ORIGIN_Y],
              ] as const
            ).map(([label, field, names]) => (
              <label key={field} className="flex flex-col gap-1 text-[var(--text-2)]">
                {label}
                <select
                  value={cur[field]}
                  onChange={(e) => edit({ [field]: Number(e.target.value) as Origin })}
                  className="bg-[var(--panel)] border border-[var(--border)] rounded px-1.5 py-1 text-[var(--text)] outline-none"
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

        <StyleSections info={info} layout={activeScreen.layout} dark={dark} onEditLayout={onEditLayout} onCommit={onCommit} />

        {patch && (
          <div className="space-y-1.5">
            <span className="text-[12px] font-semibold text-[var(--text-2)]">Patch entry</span>
            <pre className="p-2 bg-[var(--panel)] rounded border border-[var(--border)] text-[12px] text-[var(--text)] whitespace-pre-wrap break-all font-mono">
              {JSON.stringify(patch, null, 1)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
