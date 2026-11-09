import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Eye, EyeOff, Lock, LockOpen, Search, Square, Type, Box, Component, Frame } from 'lucide-react';
import type { Scene, SceneNode } from '../../lib/render/scene';

/**
 * The screen's layer hierarchy, top of the stack first like Figma. Parts and the layouts
 * qlaunch creates by code (game icons, settings pages) appear inside their slots.
 *
 * Eye and lock are editor-only (they never change the theme): hide a layer to get it out of
 * the way, lock it so clicks go through it. "Hidden on console" is shown dimmed; changing
 * that is a property of the pane (Inspector), because it goes into the theme.
 */

interface Props {
  scene: Scene | null;
  selectedId: string | null;
  hiddenIds: ReadonlySet<string>;
  lockedIds: ReadonlySet<string>;
  onSelect: (node: SceneNode) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
}

const KIND_ICON: Record<string, React.FC<{ className?: string }>> = {
  pic1: Square,
  txt1: Type,
  prt1: Component,
  wnd1: Frame,
  pan1: Box,
  bnd1: Box,
};

/** Layers as shown: synthetic groups flattened, top of the stack first. */
const visibleChildren = (n: SceneNode): SceneNode[] => n.children.flatMap((c) => (c.kind === 'group' ? visibleChildren(c) : [c])).reverse();

export const LayersPanel: React.FC<Props> = ({ scene, selectedId, hiddenIds, lockedIds, onSelect, onToggleHidden, onToggleLocked }) => {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // The selected layer is revealed: its ancestors show open unless collapsed by hand.
  const revealed = useMemo(() => {
    const set = new Set<string>();
    if (selectedId) {
      const parts = selectedId.split('/');
      for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join('/'));
    }
    return set;
  }, [selectedId]);
  const isOpenId = (id: string) => open.has(id) || (revealed.has(id) && !collapsed.has(id));
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, open]);

  const roots = useMemo(() => (scene ? visibleChildren(scene.root) : []), [scene]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !scene) return null;
    return scene.flat.filter((n) => n.kind !== 'group' && n.name.toLowerCase().includes(q)).slice(0, 300);
  }, [query, scene]);

  const toggle = (id: string) => {
    const wasOpen = isOpenId(id);
    setOpen((prev) => {
      const next = new Set(prev);
      if (wasOpen) next.delete(id);
      else next.add(id);
      return next;
    });
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (wasOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const row = (n: SceneNode, depth: number, flatList = false): React.ReactNode => {
    const kids = flatList ? [] : visibleChildren(n);
    const isOpen = isOpenId(n.id);
    const Icon = KIND_ICON[n.kind] ?? Box;
    const sel = n.id === selectedId;
    const eyeOff = hiddenIds.has(n.id);
    const locked = lockedIds.has(n.id);
    const dim = n.hiddenOnConsole || !n.editable;
    return (
      <React.Fragment key={n.id}>
        <div
          data-selected={sel}
          onClick={() => n.editable && onSelect(n)}
          className={`group flex items-center h-7 pr-1 text-[12px] cursor-default ${sel ? 'bg-[var(--accent)]/20 text-[var(--text)]' : 'hover:bg-[var(--hover)]'} ${dim ? 'text-[var(--text-3)]' : 'text-[var(--text)]'}`}
          style={{ paddingLeft: 6 + depth * 12 }}
          title={`${n.name} · ${n.file.replace('blyt/', '')}${n.hiddenOnConsole ? ' · hidden on console' : ''}${n.editable ? '' : ' · shared layout (common.szs), not editable here'}`}
        >
          <button
            className={`w-4 h-4 flex items-center justify-center shrink-0 ${kids.length ? 'text-[var(--text-3)] hover:text-[var(--text)]' : 'invisible'}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle(n.id);
            }}
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </button>
          <Icon className="w-3.5 h-3.5 mx-1 shrink-0 opacity-70" />
          <span className={`truncate flex-1 ${eyeOff ? 'opacity-50' : ''}`}>{n.name === 'RootPane' ? n.file.replace('blyt/', '').replace('.bflyt', '') : n.name}</span>
          {flatList && <span className="text-[10px] text-[var(--text-3)] truncate max-w-[90px] mr-1">{n.file.replace('blyt/', '').replace('.bflyt', '')}</span>}
          <button
            className={`w-6 h-6 flex items-center justify-center rounded text-[var(--text-3)] hover:text-[var(--text)] ${locked ? '' : 'opacity-0 group-hover:opacity-100'}`}
            title={locked ? 'Unlock (editor only)' : 'Lock: clicks go through this layer (editor only)'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLocked(n.id);
            }}
          >
            {locked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
          </button>
          <button
            className={`w-6 h-6 flex items-center justify-center rounded text-[var(--text-3)] hover:text-[var(--text)] ${eyeOff ? '' : 'opacity-0 group-hover:opacity-100'}`}
            title={eyeOff ? 'Show in editor' : 'Hide in editor only (not in the theme)'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleHidden(n.id);
            }}
          >
            {eyeOff ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>
        {isOpen && kids.map((c) => row(c, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="h-9 px-3 flex items-center justify-between border-b border-[var(--border)] shrink-0">
        <span className="text-[12px] font-semibold text-[var(--text)]">Layers</span>
        {(hiddenIds.size > 0 || lockedIds.size > 0) && (
          <span className="text-[11px] text-[var(--text-3)]">
            {hiddenIds.size ? `${hiddenIds.size} hidden` : ''}
            {hiddenIds.size && lockedIds.size ? ' · ' : ''}
            {lockedIds.size ? `${lockedIds.size} locked` : ''}
          </span>
        )}
      </div>
      <div className="px-2 py-1.5 border-b border-[var(--border)] shrink-0">
        <label className="flex items-center gap-1.5 h-7 px-2 rounded-md bg-[var(--panel-2)] text-[var(--text-3)] focus-within:ring-1 focus-within:ring-[var(--accent)]">
          <Search className="w-3.5 h-3.5" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find layer" className="flex-1 bg-transparent outline-none text-[12px] text-[var(--text)] placeholder:text-[var(--text-3)]" />
        </label>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto py-1 min-h-0">
        {!scene && <p className="px-3 py-2 text-[12px] text-[var(--text-3)]">Loading layout…</p>}
        {matches ? (matches.length ? matches.map((n) => row(n, 0, true)) : <p className="px-3 py-2 text-[12px] text-[var(--text-3)]">No layer named “{query}”.</p>) : roots.map((n) => row(n, 0))}
      </div>
    </div>
  );
};
