import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Eye, EyeOff, Lock, LockOpen, Search, Square, Type, Box, Component, Frame, Star, LayoutGrid, X } from 'lucide-react';
import { isComponent, type Scene, type SceneNode } from '../../lib/render/scene';
import { TAG_COLORS, type LayerMark, type TagColor } from '../../lib/editor/marks';
import { blockedBy, MEANING } from '../canvas/geometry';

/**
 * The screen's layer hierarchy, top of the stack first like Figma. Parts and the layouts
 * qlaunch creates by code (game icons, settings pages) appear inside their slots.
 *
 * Eye and lock are editor-only (they never change the theme): hide a layer to get it out of
 * the way, lock it so clicks go through it. A component's layers follow it: hide or lock the
 * component and everything in it is hidden or locked too (shown with a faded icon).
 * "Hidden in theme" is shown in red; changing that is a property of the pane (Inspector or
 * right-click), because it goes into the theme.
 */

export type LayerFilter = 'all' | 'components' | 'changed' | 'themeHidden' | 'hidden' | 'locked' | 'fav' | TagColor;

interface Props {
  scene: Scene | null;
  /** Every selected layer; the last one is the primary. */
  selectedIds: string[];
  hiddenIds: ReadonlySet<string>;
  lockedIds: ReadonlySet<string>;
  changedKeys: ReadonlySet<string>;
  marks: Map<string, LayerMark>;
  onSelect: (node: SceneNode, how?: 'replace' | 'toggle') => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onContextMenu: (at: { x: number; y: number }, node: SceneNode) => void;
  /** Show a component's layers side by side on the canvas. */
  onExplode: (node: SceneNode) => void;
}

const KIND_ICON: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  pic1: Square,
  txt1: Type,
  prt1: Component,
  wnd1: Frame,
  pan1: Box,
  bnd1: Box,
};

const FILTERS: { id: LayerFilter; label: string; title: string }[] = [
  { id: 'all', label: 'All', title: 'Every layer' },
  { id: 'components', label: 'Components', title: 'Parts and slots that move and scale as one' },
  { id: 'changed', label: 'Changed', title: 'Changed by this theme' },
  { id: 'fav', label: '★', title: 'Favourites' },
  { id: 'themeHidden', label: 'Hidden in theme', title: 'Visible is off in the layout (not drawn on the console)' },
  { id: 'hidden', label: 'Hidden', title: 'Hidden in the editor (eye)' },
  { id: 'locked', label: 'Locked', title: 'Locked in the editor' },
];

/** Layers as shown: synthetic groups flattened, top of the stack first. */
const visibleChildren = (n: SceneNode): SceneNode[] => n.children.flatMap((c) => (c.kind === 'group' ? visibleChildren(c) : [c])).reverse();
const fileName = (n: SceneNode) => n.file.replace('blyt/', '').replace('.bflyt', '');

export const LayersPanel: React.FC<Props> = ({ scene, selectedIds, hiddenIds, lockedIds, changedKeys, marks, onSelect, onToggleHidden, onToggleLocked, onContextMenu, onExplode }) => {
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LayerFilter>('all');
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
  // A new selection always reveals itself: reopen ancestors collapsed by hand, leave a search
  // that doesn't contain it. (State adjusted while rendering, not in an effect.)
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (selectedId !== shownFor) {
    setShownFor(selectedId);
    if (selectedId && [...collapsed].some((id) => revealed.has(id))) setCollapsed(new Set([...collapsed].filter((id) => !revealed.has(id))));
    if (selectedId && query && !selectedId.split('/').pop()!.toLowerCase().includes(query.trim().toLowerCase())) setQuery('');
  }
  // Scroll the selected layer into view once its row exists.
  useEffect(() => {
    const id = requestAnimationFrame(() => listRef.current?.querySelector('[data-primary="true"]')?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(id);
  }, [selectedId]);

  const roots = useMemo(() => (scene ? visibleChildren(scene.root) : []), [scene]);
  const usedTags = useMemo(() => {
    const s = new Set<TagColor>();
    marks.forEach((m) => m.color && s.add(m.color));
    return s;
  }, [marks]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if ((!q && filter === 'all') || !scene) return null;
    const test = (n: SceneNode) => {
      if (filter === 'components') return isComponent(n);
      if (filter === 'changed') return changedKeys.has(n.key);
      if (filter === 'themeHidden') return n.hiddenOnConsole;
      if (filter === 'hidden') return hiddenIds.has(n.id);
      if (filter === 'locked') return lockedIds.has(n.id);
      if (filter === 'fav') return !!marks.get(n.id)?.fav;
      if (filter !== 'all') return marks.get(n.id)?.color === filter;
      return true;
    };
    return scene.flat.filter((n) => n.kind !== 'group' && n.key && (!q || n.name.toLowerCase().includes(q)) && test(n)).slice(0, 400);
  }, [query, filter, scene, changedKeys, hiddenIds, lockedIds, marks]);

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
    const comp = isComponent(n);
    const Icon = comp ? Component : (KIND_ICON[n.kind] ?? Box);
    const sel = selSet.has(n.id);
    const ownHidden = hiddenIds.has(n.id);
    const inhHidden = !ownHidden && blockedBy(n.id, hiddenIds);
    const ownLocked = lockedIds.has(n.id);
    const inhLocked = !ownLocked && blockedBy(n.id, lockedIds);
    const mark = marks.get(n.id);
    const changed = changedKeys.has(n.key);
    const dim = !n.editable;
    const name = n.name === 'RootPane' ? fileName(n) : n.name;
    const tip = [
      `${n.name} · ${fileName(n)}`,
      comp && 'Component: moves and scales as one',
      changed && 'Changed by this theme',
      n.hiddenOnConsole && 'Hidden in the theme (not drawn on the console)',
      inhHidden && 'Hidden with its component (editor only)',
      inhLocked && 'Locked with its component (editor only)',
      !n.editable && 'Shared layout (common.szs), not editable here',
    ]
      .filter(Boolean)
      .join('\n');
    return (
      <React.Fragment key={n.id}>
        <div
          data-selected={sel}
          data-primary={n.id === selectedId}
          onClick={(e) => n.editable && onSelect(n, e.ctrlKey || e.metaKey || e.shiftKey ? 'toggle' : 'replace')}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!sel) onSelect(n);
            onContextMenu({ x: e.clientX, y: e.clientY }, n);
          }}
          className={`group flex items-center h-7 pr-1 text-[12px] cursor-default ${sel ? (n.id === selectedId ? 'bg-[var(--accent)]/25' : 'bg-[var(--accent)]/12') : 'hover:bg-[var(--hover)]'} ${dim ? 'text-[var(--text-3)]' : 'text-[var(--text)]'}`}
          style={{ paddingLeft: 6 + depth * 12, boxShadow: mark?.color ? `inset 2px 0 0 ${TAG_COLORS[mark.color]}` : undefined }}
          title={tip}
        >
          <button
            className={`w-4 h-4 flex items-center justify-center shrink-0 ${kids.length ? 'text-[var(--text-3)] hover:text-[var(--text)]' : 'invisible'}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle(n.id);
            }}
            tabIndex={-1}
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </button>
          <Icon className={`w-3.5 h-3.5 mx-1 shrink-0 ${comp ? '' : 'opacity-70'}`} style={comp ? { color: MEANING.component.color } : undefined} />
          <span
            className={`truncate flex-1 ${ownHidden || inhHidden ? 'opacity-45' : ''} ${n.hiddenOnConsole ? 'line-through decoration-1' : ''}`}
            style={n.hiddenOnConsole ? { textDecorationColor: MEANING.hiddenInTheme.color } : undefined}
          >
            {name}
          </span>
          {mark?.fav && <Star className="w-3 h-3 mr-1 shrink-0 fill-current" style={{ color: '#facc15' }} />}
          {changed && <span className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0" style={{ background: MEANING.changed.color }} />}
          {flatList && <span className="text-[10px] text-[var(--text-3)] truncate max-w-[80px] mr-1">{fileName(n)}</span>}
          {comp && (
            <button
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-3)] hover:text-[var(--text)] opacity-0 group-hover:opacity-100"
              title="Layer view: see every layer of this component side by side (highlight, pressed state...) and pick one"
              onClick={(e) => {
                e.stopPropagation();
                onExplode(n);
              }}
              tabIndex={-1}
            >
              <LayoutGrid className="w-3 h-3" />
            </button>
          )}
          <button
            className={`w-6 h-6 flex items-center justify-center rounded text-[var(--text-3)] hover:text-[var(--text)] ${ownLocked ? '' : inhLocked ? 'opacity-40' : 'opacity-0 group-hover:opacity-100'}`}
            title={ownLocked ? 'Unlock (editor only)' : inhLocked ? 'Locked with its component' : 'Lock: clicks go through this layer (editor only)'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLocked(n.id);
            }}
            tabIndex={-1}
          >
            {ownLocked || inhLocked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
          </button>
          <button
            className={`w-6 h-6 flex items-center justify-center rounded text-[var(--text-3)] hover:text-[var(--text)] ${ownHidden ? '' : inhHidden ? 'opacity-40' : 'opacity-0 group-hover:opacity-100'}`}
            title={ownHidden ? 'Show in editor' : inhHidden ? 'Hidden with its component' : 'Hide in editor only (not in the theme)'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleHidden(n.id);
            }}
            tabIndex={-1}
          >
            {ownHidden || inhHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>
        {isOpen && kids.map((c) => row(c, depth + 1))}
      </React.Fragment>
    );
  };

  const emptyText =
    filter === 'fav'
      ? 'No favourites yet. Right-click a layer to add one.'
      : filter in TAG_COLORS
        ? 'No layer has this colour. Right-click a layer to tag it.'
        : query
          ? `No layer named “${query}”.`
          : 'No layer matches this filter.';

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="h-9 px-3 flex items-center justify-between border-b border-[var(--border)] shrink-0">
        <span className="text-[12px] font-semibold text-[var(--text)]">Layers</span>
        <span className="text-[11px] text-[var(--text-3)]">
          {[selectedIds.length > 1 && `${selectedIds.length} selected`, hiddenIds.size && `${hiddenIds.size} hidden`, lockedIds.size && `${lockedIds.size} locked`].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="px-2 pt-1.5 pb-1 border-b border-[var(--border)] shrink-0 space-y-1.5">
        <label className="flex items-center gap-1.5 h-7 px-2 rounded-md bg-[var(--panel-2)] text-[var(--text-3)] focus-within:ring-1 focus-within:ring-[var(--accent)]">
          <Search className="w-3.5 h-3.5" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find layer" className="flex-1 bg-transparent outline-none text-[12px] text-[var(--text)] placeholder:text-[var(--text-3)]" />
          {(query || filter !== 'all') && (
            <button
              className="text-[var(--text-3)] hover:text-[var(--text)]"
              title="Clear search and filter"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
        <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button key={f.id} className={`ui-chip ${filter === f.id ? 'ui-on' : ''}`} title={f.title} onClick={() => setFilter(filter === f.id ? 'all' : f.id)}>
              {f.label}
            </button>
          ))}
          {(Object.keys(TAG_COLORS) as TagColor[]).map((c) => (
            <button
              key={c}
              className={`ui-chip !px-1.5 ${filter === c ? 'ui-on' : ''} ${usedTags.has(c) || filter === c ? '' : 'opacity-40'}`}
              title={`Tagged ${c}`}
              onClick={() => setFilter(filter === c ? 'all' : c)}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: TAG_COLORS[c] }} />
            </button>
          ))}
        </div>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto py-1 min-h-0">
        {!scene && <p className="px-3 py-2 text-[12px] text-[var(--text-3)]">Loading layout…</p>}
        {matches ? matches.length ? matches.map((n) => row(n, 0, true)) : <p className="px-3 py-2 text-[12px] text-[var(--text-3)]">{emptyText}</p> : roots.map((n) => row(n, 0))}
      </div>
    </div>
  );
};
