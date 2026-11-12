import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ThemeProject, ThemeScreen } from './types/theme';
import type { MockSystemState } from './types/simulation';
import { DEFAULT_MOCK_USERS, DEFAULT_MOCK_GAMES } from './constants/switchPanes';

import { TopBar } from './features/editor/TopBar';
import { LeftDrawer, type RailTab } from './features/editor/LeftDrawer';
import { Viewport } from './features/editor/Viewport';
import { Inspector } from './features/editor/Inspector';
import { ScreensList } from './features/editor/ScreensList';
import { LayersPanel } from './features/editor/LayersPanel';
import type { MoveDelta, SnapSettings, TransformChange } from './features/canvas/EditorOverlay';
import { BottomDock } from './features/editor/BottomDock';
import { ContextMenu, type MenuItem } from './features/editor/ContextMenu';
import { HelpDialog } from './features/editor/HelpDialog';
import { useHelp } from './features/editor/help';
import { blockedBy, changedKeysOf, explodeScene, MEANING, nodeNotes, parentMap, realParent } from './features/canvas/geometry';
import { isComponent } from './lib/render/scene';
import { marksOf, markKey, setMark, TAG_COLORS, type TagColor } from './lib/editor/marks';
import { checkCompat } from './lib/compat';
import { AlertTriangle, ArrowDownToLine, ArrowUpToLine, CornerLeftUp, CornerRightDown, Eye, EyeOff, LayoutGrid, Lock, LockOpen, RotateCcw, Star, X } from 'lucide-react';
import { buildScene, buildSource, type SceneNode } from './lib/render/scene';
import { StartPage } from './features/project/StartPage';
import { saveProject } from './lib/state/projectStore';
import { readThemeFiles } from './lib/theme/nxtheme';
import { ExportModal } from './features/project/ExportModal';

import { useHistory } from './lib/state/useHistory';
import { editPane, hasLayoutChanges, revertPane, setDrawOrder, splitPaneKey, type LayoutPatch, type PaneEdit, type PanePatch, type PaneState } from './lib/layout/patch';
import { FW, stampFirmware } from './lib/layout/installerFixes';
import { getPaneInfo } from './lib/layout/paneModel';
import { loadAppletIcons, type AppletIcon } from './lib/layout/appletIcons';
import { loadStockLayouts } from './lib/stock/stockPack';
import { isCommonSzs, loadSavedSystemLayouts, parseSystemSzs, removeSystemSzs, saveSystemSzs, type SystemLayoutMap } from './lib/layout/systemLayouts';
import { loadWallpaper } from './lib/theme/images';
import { STOCK_BG } from './lib/theme/stock';
import { newScreen } from './lib/theme/nxtheme';
import type { ScreenTarget } from './types/theme';

interface EditorDoc {
  project: ThemeProject | null;
  /** Editor-only: layers hidden with the eye, layers locked against clicks (never exported). */
  hidden: ReadonlySet<string>;
  locked: ReadonlySet<string>;
}
const EMPTY_IDS: ReadonlySet<string> = new Set();
type EditOpts = { transient?: boolean; label?: string };
const paneName = (key: string) => key.slice(key.indexOf('::') + 2);
/** History label for a pane edit: what changed, on which pane. */
const editLabel = (key: string, e: PaneEdit) => {
  const verb = e.rotation ? 'Rotate' : e.scale ? 'Scale' : e.size ? 'Resize' : e.position ? 'Move' : e.visible !== undefined ? (e.visible ? 'Show in theme' : 'Hide in theme') : 'Anchor';
  return `${verb} ${paneName(key)}`;
};
const screenLabel = (u: object) => {
  const k = Object.keys(u);
  return k.includes('wallpaper') ? 'Background image' : k.includes('adjustments') ? 'Adjust background' : k.includes('extraFiles') ? 'Custom icons' : k.includes('common') ? 'Common layout' : k.includes('layout') ? 'Layout' : 'Edit screen';
};

export function App() {
  // One undo history for the theme and the editor-only eye/lock state, so hiding or locking a
  // layer is undone like any other step.
  const doc = useHistory<EditorDoc>({ project: null, hidden: EMPTY_IDS, locked: EMPTY_IDS });
  const history = useMemo(
    () => ({
      set: (next: ThemeProject | null | ((p: ThemeProject | null) => ThemeProject | null), opts?: EditOpts) =>
        doc.set((d) => {
          const project = typeof next === 'function' ? next(d.project) : next;
          return project === d.project ? d : { ...d, project };
        }, opts),
      reset: (project: ThemeProject | null) => doc.reset({ project, hidden: EMPTY_IDS, locked: EMPTY_IDS }, project ? `Opened ${project.name}` : 'Closed'),
      commit: doc.commit,
      undo: doc.undo,
      redo: doc.redo,
      canUndo: doc.canUndo,
      canRedo: doc.canRedo,
    }),
    [doc],
  );
  const project = doc.value.project;
  const hiddenIds = doc.value.hidden;
  const lockedIds = doc.value.locked;

  // Console layouts: the built-in pack, overridden per screen by the user's own .szs files.
  const [stockLayouts, setStockLayouts] = useState<SystemLayoutMap>({});
  const [consoleLayouts, setSystemLayouts] = useState<SystemLayoutMap>({});
  const systemLayouts = useMemo<SystemLayoutMap>(() => ({ ...stockLayouts, ...consoleLayouts }), [stockLayouts, consoleLayouts]);
  const [systemError, setSystemError] = useState<string | null>(null);

  const [mockState, setMockState] = useState<MockSystemState>({
    time: '12:00',
    users: DEFAULT_MOCK_USERS,
    games: DEFAULT_MOCK_GAMES,
    selectedGameIndex: 0,
    isDarkTheme: true,
    wireframeMode: false,
    canvasZoom: 1.0,
  });

  const [activeRailTab, setActiveRailTab] = useState<RailTab>('media');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // The selected instance (a layout used 12 times has 12 instances; edits apply to all of them).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Other selected layers (multi-select); the primary one above is what the Inspector shows.
  const [extraIds, setExtraIds] = useState<string[]>([]);
  // Layer view: a component's layers laid out side by side.
  const [explodeId, setExplodeId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null);
  const help = useHelp();
  const [compat, setCompat] = useState(() => checkCompat());
  // Bumped when the preview font changes (text is laid out again).
  const [fontTick, setFontTick] = useState(0);
  // Editor-only visibility and locks (never exported).
  const [snap, setSnap] = useState<SnapSettings>({ grid: false, gridSize: 8, guides: true });
  // Which screen is open is view state, not part of undo history.
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Built-in layouts, plus the user's console files remembered between sessions.
  useEffect(() => {
    loadStockLayouts().then(setStockLayouts);
    loadSavedSystemLayouts().then((saved) => setSystemLayouts((prev) => ({ ...saved, ...prev })));
  }, []);

  // Save the theme in this browser as you work (the start page lists recent themes).
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => saveProject(project).catch((e) => console.warn('Could not save the theme in this browser', e)), 600);
    return () => clearTimeout(t);
  }, [project]);

  const openProject = useCallback(
    (p: ThemeProject) => {
      history.reset(p);
      setActiveScreenId(p.activeScreenId);
      setSelectedKey(null);
      setSelectedId(null);
      setExtraIds([]);
      setExplodeId(null);
    },
    [history],
  );
  const openThemeFiles = useCallback(
    (files: File[]) => {
      readThemeFiles(files.map((f) => ({ name: f.name, blob: f })))
        .then(openProject)
        .catch((e) => alert((e as Error).message));
    },
    [openProject],
  );

  const activeScreen = project ? project.screens.find((s) => s.id === activeScreenId) || project.screens[0] : null;
  const activeId = activeScreen?.id ?? null;
  const activeSystem = activeScreen ? systemLayouts[activeScreen.target] : undefined;
  const isEditor = mode === 'edit';

  /* ------------------------------ scene ------------------------------ */

  // The theme's custom icons (album.png, lock.png, ...), decoded for the preview.
  const [icons, setIcons] = useState<{ files: ThemeScreen['extraFiles']; icons: AppletIcon[] } | null>(null);
  const extraFiles = activeScreen?.extraFiles;
  useEffect(() => {
    if (!activeScreen || !extraFiles?.length) return;
    let cancelled = false;
    loadAppletIcons(activeScreen).then((list) => !cancelled && setIcons({ files: extraFiles, icons: list }));
    return () => {
      cancelled = true;
    };
  }, [extraFiles]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeIcons = useMemo(() => (icons && icons.files === extraFiles ? icons.icons : []), [icons, extraFiles]);

  // Lock screen: with nothing suspended it rests centred with the HOME button and no status bar
  // (EntMain_LockMainIn, as on PS5 by Rodel's console screenshot); with a suspended game the
  // content moves right and the status bar shows (LockMainOut, as on Lava Lamp's and Project
  // Clean's). The lock screen starts with nothing suspended; the Console tab switches it.
  const screenMock = useMemo<MockSystemState>(() => {
    if (activeScreen?.target !== 'lock') return mockState;
    const gameSuspended = mockState.lockGameSuspended ?? false;
    return { ...mockState, gameSuspended, lockCentred: !gameSuspended };
  }, [mockState, activeScreen?.target]);

  const mainSource = useMemo(
    () => (activeSystem && activeScreen ? buildSource(activeSystem, activeScreen.layout, true, true, activeIcons, { lockCentred: screenMock.lockCentred }) : null),
    [activeSystem, activeScreen?.layout, activeIcons, screenMock.lockCentred], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const commonSource = useMemo(
    () => (systemLayouts.common && activeScreen ? buildSource(systemLayouts.common, activeScreen.common ?? {}, true, false) : null),
    [systemLayouts.common, activeScreen?.common], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const scene = useMemo(
    () =>
      activeSystem && mainSource && activeScreen
        ? buildScene({ system: activeSystem, main: mainSource, common: commonSource, hasWallpaper: Boolean(activeScreen.wallpaper), mock: screenMock, selectedKey })
        : null,
    [activeSystem, mainSource, commonSource, activeScreen?.wallpaper, screenMock, selectedKey, fontTick], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Player select opens over the Home menu: its transparent parts show Home, blurred.
  const homeScreen = project?.screens.find((s) => s.target === 'home');
  const underlay = useMemo(() => {
    const sys = systemLayouts.home;
    if (activeScreen?.target !== 'psl' || !sys) return null;
    const layout = homeScreen?.layout ?? {};
    const main = buildSource(sys, layout, true, false);
    const common = systemLayouts.common ? buildSource(systemLayouts.common, homeScreen?.common ?? {}, true, false) : null;
    const s = buildScene({ system: sys, main, common, hasWallpaper: Boolean(homeScreen?.wallpaper), mock: { ...mockState, selectedGameIndex: 0 }, selectedKey: null });
    if (!s) return null;
    const url = homeScreen?.wallpaper?.displayUrl;
    return { scene: s, background: url ? { url } : { color: mockState.isDarkTheme ? STOCK_BG.dark : STOCK_BG.light } };
  }, [activeScreen?.target, systemLayouts.home, systemLayouts.common, homeScreen, mockState, fontTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const nodeById = useMemo(() => new Map((scene?.flat ?? []).map((n) => [n.id, n])), [scene]);
  const parents = useMemo(() => (scene ? parentMap(scene) : new Map<string, SceneNode>()), [scene]);
  // A selection made by key (Inspector, pane lists) shows on its first instance on screen.
  const activeSelectedId = useMemo(() => {
    if (!scene || !selectedKey) return null;
    const cur = selectedId ? nodeById.get(selectedId) : undefined;
    if (cur?.key === selectedKey) return selectedId;
    return scene.flat.find((n) => n.key === selectedKey)?.id ?? null;
  }, [scene, nodeById, selectedKey, selectedId]);
  /** Every selected layer, primary last. */
  const selectedIds = useMemo(() => {
    const ids = extraIds.filter((id) => id !== activeSelectedId && nodeById.has(id));
    return activeSelectedId ? [...ids, activeSelectedId] : ids;
  }, [extraIds, activeSelectedId, nodeById]);
  const selectedNodes = useMemo(() => selectedIds.map((id) => nodeById.get(id)!).filter(Boolean), [selectedIds, nodeById]);

  const setSelection = useCallback(
    (ids: string[]) => {
      const last = ids.length ? nodeById.get(ids[ids.length - 1]) : undefined;
      setSelectedKey(last?.key ?? null);
      setSelectedId(last?.id ?? null);
      setExtraIds(ids.slice(0, -1));
    },
    [nodeById],
  );
  const selectNode = useCallback(
    (n: SceneNode | null, how: 'replace' | 'toggle' = 'replace') => {
      if (!n) return setSelection([]);
      if (how === 'toggle') {
        if (selectedIds.includes(n.id)) return setSelection(selectedIds.filter((id) => id !== n.id));
        return setSelection([...selectedIds, n.id]);
      }
      setSelection([n.id]);
    },
    [selectedIds, setSelection],
  );
  const selectMany = useCallback(
    (nodes: SceneNode[], additive: boolean) => {
      const ids = nodes.map((n) => n.id);
      setSelection(additive ? [...selectedIds.filter((id) => !ids.includes(id)), ...ids] : ids);
    },
    [selectedIds, setSelection],
  );
  const changedKeys = useMemo(() => changedKeysOf(activeScreen?.layout), [activeScreen?.layout]);
  const marks = useMemo(() => (activeScreen ? marksOf(project?.marks, activeScreen.id) : new Map()), [project?.marks, activeScreen]);
  const exploded = useMemo(() => {
    const n = explodeId ? nodeById.get(explodeId) : undefined;
    return scene && n ? explodeScene(scene, n, realParent(parents, n)?.file) : null;
  }, [scene, explodeId, nodeById, parents]);
  const primaryNode = activeSelectedId ? nodeById.get(activeSelectedId) : undefined;
  const notes = useMemo(() => (primaryNode ? nodeNotes(primaryNode, realParent(parents, primaryNode)) : []), [primaryNode, parents]);
  const toggleIn = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const updateActiveScreen = useCallback(
    (updates: Partial<ThemeScreen> | ((s: ThemeScreen) => Partial<ThemeScreen>), opts?: EditOpts) => {
      history.set(
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            screens: prev.screens.map((s) => (s.id === activeId ? { ...s, ...(typeof updates === 'function' ? updates(s) : updates) } : s)),
          };
        },
        { ...opts, label: opts?.label ?? (typeof updates === 'function' ? 'Edit screen' : screenLabel(updates)) },
      );
    },
    [history, activeId],
  );

  /* ------------------------------ pane editing ------------------------------ */

  const handleEditPane = useCallback(
    (key: string, edit: PaneEdit, opts?: EditOpts) => {
      updateActiveScreen((s) => {
        const sys = systemLayouts[s.target];
        // A layout started in the studio is made for this console: stamp its firmware on the first
        // edit, like the injector's LayoutDiff does, so the installer doesn't add downgrade fixes.
        const base = !hasLayoutChanges(s.layout) && s.layout.TargetFirmware === undefined && sys && sys.firmware >= FW.Fw11_0 ? stampFirmware(s.layout, s.target, sys.firmware) : s.layout;
        const info = getPaneInfo(base, sys, key);
        return { layout: editPane(base, info.file, info.name, info.current, edit) };
      }, { ...opts, label: opts?.label ?? editLabel(key, edit) });
    },
    [updateActiveScreen, systemLayouts],
  );

  // Style edits (colours, user data, materials, draw order) work on the whole layout.json.
  const handleEditLayout = useCallback(
    (fn: (layout: LayoutPatch) => LayoutPatch, opts?: EditOpts) => {
      updateActiveScreen((s) => {
        const sys = systemLayouts[s.target];
        const base = !hasLayoutChanges(s.layout) && s.layout.TargetFirmware === undefined && sys && sys.firmware >= FW.Fw11_0 ? stampFirmware(s.layout, s.target, sys.firmware) : s.layout;
        return { layout: fn(base) };
      }, { ...opts, label: opts?.label ?? (selectedKey ? `Style ${paneName(selectedKey)}` : 'Style') });
    },
    [updateActiveScreen, systemLayouts, selectedKey],
  );

  const handleRevertPane = useCallback(
    (key: string, field?: keyof PanePatch) => {
      updateActiveScreen((s) => {
        const info = getPaneInfo(s.layout, systemLayouts[s.target], key);
        return { layout: revertPane(s.layout, info.file, info.name, field) };
      }, { label: `Revert ${field ? `${field} of ` : ''}${paneName(key)}` });
    },
    [updateActiveScreen, systemLayouts],
  );

  // Drag on canvas: remember where each pane started, write absolute positions while moving.
  // Several layers move together (multi-select); a layout used many times is moved once.
  const dragBase = useRef<PaneState | null>(null);
  const moveBase = useRef<Map<string, PaneState>>(new Map());
  const handleMovePanes = useCallback(
    (moves: MoveDelta[], phase: 'start' | 'move' | 'end') => {
      if (!activeScreen) return;
      if (phase === 'start') {
        moveBase.current = new Map();
        for (const m of moves) if (!moveBase.current.has(m.key)) moveBase.current.set(m.key, getPaneInfo(activeScreen.layout, systemLayouts[activeScreen.target], m.key).current);
        return;
      }
      if (phase === 'end') {
        moveBase.current = new Map();
        history.commit();
        return;
      }
      const label = moveBase.current.size > 1 ? `Move ${moveBase.current.size} layers` : `Move ${paneName(moves[0]?.key ?? '')}`;
      const done = new Set<string>();
      for (const m of moves) {
        const base = moveBase.current.get(m.key);
        if (!base || done.has(m.key)) continue;
        done.add(m.key);
        handleEditPane(m.key, { position: { X: Math.round(base.position.X + m.dx), Y: Math.round(base.position.Y + m.dy) } }, { transient: true, label });
      }
    },
    [activeScreen, systemLayouts, handleEditPane, history],
  );

  // Resize, scale and rotate on canvas: changes relative to where the gesture started.
  const handleResizePane = useCallback(
    (key: string, c: TransformChange, phase: 'start' | 'move' | 'end') => {
      if (!activeScreen) return;
      if (phase === 'start') {
        dragBase.current = getPaneInfo(activeScreen.layout, systemLayouts[activeScreen.target], key).current;
        return;
      }
      if (phase === 'end') {
        dragBase.current = null;
        history.commit();
        return;
      }
      const base = dragBase.current;
      if (!base) return;
      const r = (v: number) => Math.round(v * 10) / 10;
      const r3 = (v: number) => Math.round(v * 1000) / 1000;
      const edit: PaneEdit = { position: { X: r(base.position.X + c.dx), Y: r(base.position.Y + c.dy) } };
      if (c.w !== undefined && c.h !== undefined) edit.size = { X: r(Math.max(1, c.w)), Y: r(Math.max(1, c.h)) };
      if (c.scale) edit.scale = { X: r3(base.scale.X * c.scale.x), Y: r3(base.scale.Y * c.scale.y) };
      if (c.rotation !== undefined) {
        const z = (((base.rotation.Z + c.rotation) % 360) + 540) % 360 - 180;
        edit.rotation = { Z: r(z) };
        delete edit.position;
      }
      handleEditPane(key, edit, { transient: true });
    },
    [activeScreen, systemLayouts, handleEditPane, history],
  );

  /* ------------------------------ keyboard ------------------------------ */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
        return;
      }
      if (e.key === 'Escape') {
        if (explodeId) setExplodeId(null);
        else selectNode(null);
        return;
      }
      // Shift+Enter selects the parent layer, Enter the first child (like Figma).
      if (isEditor && e.key === 'Enter' && activeSelectedId && scene) {
        e.preventDefault();
        const editable = (n?: SceneNode) => n && n.key && n.editable;
        if (e.shiftKey) {
          const parts = activeSelectedId.split('/');
          for (let i = parts.length - 1; i > 1; i--) {
            const p = scene.flat.find((n) => n.id === parts.slice(0, i).join('/'));
            if (editable(p)) return selectNode(p!);
          }
        } else {
          const n = scene.flat.find((x) => x.id === activeSelectedId);
          const child = n?.children.find((c) => editable(c));
          if (child) selectNode(child);
        }
        return;
      }

      // Editor with a selection: arrows nudge every selected pane (Shift = 10 units).
      if (isEditor && selectedKey && e.key.startsWith('Arrow')) {
        e.preventDefault();
        if (!activeScreen) return;
        const step = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key] ?? [0, 0];
        const keys = selectedNodes.length ? [...new Set(selectedNodes.filter((n) => n.editable && !blockedBy(n.id, lockedIds)).map((n) => n.key))] : [selectedKey];
        const label = keys.length > 1 ? `Nudge ${keys.length} layers` : `Nudge ${paneName(keys[0] ?? '')}`;
        for (const key of keys) {
          const cur = getPaneInfo(activeScreen.layout, systemLayouts[activeScreen.target], key).current.position;
          handleEditPane(key, { position: { X: cur.X + d[0], Y: cur.Y + d[1] } }, { label });
        }
        return;
      }

      // Otherwise arrows / A / D drive the simulated game carousel.
      if (e.key === 'ArrowRight' || e.key === 'd') {
        setMockState((p) => ({ ...p, selectedGameIndex: Math.min(p.games.length - 1, p.selectedGameIndex + 1) }));
      } else if (e.key === 'ArrowLeft' || e.key === 'a') {
        setMockState((p) => ({ ...p, selectedGameIndex: Math.max(0, p.selectedGameIndex - 1) }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, isEditor, selectedKey, activeSelectedId, scene, selectNode, activeScreen, systemLayouts, handleEditPane, explodeId, selectedNodes, lockedIds]);

  // Leaving with a theme open asks first (Ctrl+W, closing the tab, reloading). The theme is also
  // saved in this browser as you go, so this is a second line of defence.
  const hasProject = !!project;
  useEffect(() => {
    if (!hasProject) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [hasProject]);

  /* ------------------------------ layer menu ------------------------------ */

  const setDoc = doc.set;
  const layerMenu = useCallback(
    (target: SceneNode | null, under: SceneNode[]): MenuItem[] => {
      const items: MenuItem[] = [];
      if (!activeScreen) return items;
      const group = target && selectedIds.includes(target.id) && selectedIds.length > 1 ? selectedNodes : target ? [target] : [];
      const many = group.length > 1;
      const nameOf = (n: SceneNode) => (n.name === 'RootPane' ? n.file.replace('blyt/', '').replace('.bflyt', '') : n.name);
      if (under.length > 1) {
        items.push({ type: 'title', label: 'Layers here (top first)' });
        for (const n of under.slice(0, 10))
          items.push({
            type: 'item',
            label: nameOf(n),
            hint: n.file.replace('blyt/', '').replace('.bflyt', ''),
            icon: <span className="w-2 h-2 rounded-full" style={{ background: isComponent(n) ? MEANING.component.color : selectedIds.includes(n.id) ? MEANING.selected.color : 'var(--text-3)' }} />,
            disabled: !n.editable ? 'Not editable here: shared layout (common.szs)' : blockedBy(n.id, lockedIds) ? 'Locked: unlock it in Layers first' : false,
            onClick: () => selectNode(n),
          });
        items.push({ type: 'sep' });
      }
      if (!target) {
        items.push({ type: 'item', label: 'Nothing to select here', disabled: 'Not applicable: no layer under the cursor', onClick: () => {} });
        return items;
      }
      items.push({ type: 'title', label: many ? `${group.length} layers` : nameOf(target) });
      const parent = realParent(parents, target);
      const child = target.children.flatMap((c) => (c.kind === 'group' ? c.children : [c])).find((c) => c.key && c.editable);
      const notes = nodeNotes(target, parent);
      const partRoot = target.name === 'RootPane' && !!parent && parent.file !== target.file;
      if (!many) {
        items.push({ type: 'item', label: 'Select parent', hint: 'Shift+Enter', icon: <CornerLeftUp className="w-3.5 h-3.5" />, disabled: parent?.key && parent.editable ? false : 'Not applicable: top level', onClick: () => parent && selectNode(parent) });
        items.push({ type: 'item', label: 'Select first layer inside', hint: 'Enter', icon: <CornerRightDown className="w-3.5 h-3.5" />, disabled: child ? false : 'Not applicable: no layers inside', onClick: () => child && selectNode(child) });
        items.push({
          type: 'item',
          label: 'Layer view',
          hint: 'side by side',
          icon: <LayoutGrid className="w-3.5 h-3.5" />,
          disabled: isComponent(target) ? false : 'Only components have layers to lay out',
          onClick: () => setExplodeId(target.id),
        });
        items.push({ type: 'sep' });
      }
      // Editor-only eye and lock (a component's layers follow it).
      const allHidden = group.every((n) => blockedBy(n.id, hiddenIds));
      const inherited = group.every((n) => !hiddenIds.has(n.id) && blockedBy(n.id, hiddenIds));
      items.push({
        type: 'item',
        label: allHidden ? 'Show in editor' : 'Hide in editor',
        hint: 'editor only',
        icon: allHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />,
        disabled: inherited ? 'Hidden with its component: show the component instead' : false,
        onClick: () =>
          setDoc((d) => {
            const next = new Set(d.hidden);
            for (const n of group) {
              if (allHidden) next.delete(n.id);
              else next.add(n.id);
            }
            return { ...d, hidden: next };
          }, { label: `${allHidden ? 'Show' : 'Hide'} ${many ? `${group.length} layers` : nameOf(target)} (editor)` }),
      });
      const allLocked = group.every((n) => blockedBy(n.id, lockedIds));
      const lockInherited = group.every((n) => !lockedIds.has(n.id) && blockedBy(n.id, lockedIds));
      items.push({
        type: 'item',
        label: allLocked ? 'Unlock' : 'Lock',
        hint: 'editor only',
        icon: allLocked ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />,
        disabled: lockInherited ? 'Locked with its component: unlock the component instead' : false,
        onClick: () =>
          setDoc((d) => {
            const next = new Set(d.locked);
            for (const n of group) {
              if (allLocked) next.delete(n.id);
              else next.add(n.id);
            }
            return { ...d, locked: next };
          }, { label: `${allLocked ? 'Unlock' : 'Lock'} ${many ? `${group.length} layers` : nameOf(target)}` }),
      });
      // In the theme: the pane's Visible flag.
      const editable = group.filter((n) => n.editable && n.key);
      const visible = group.every((n) => !n.hiddenOnConsole);
      items.push({
        type: 'item',
        label: visible ? 'Invisible in theme' : 'Visible in theme',
        hint: 'Visible flag',
        icon: visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />,
        disabled: !editable.length ? 'Not editable here: shared layout (common.szs)' : partRoot && !many ? "Not supported: the console ignores a part's RootPane visibility. Hide the part instead." : false,
        onClick: () => {
          const label = `${visible ? 'Hide' : 'Show'} ${many ? `${editable.length} layers` : nameOf(target)} in theme`;
          for (const key of new Set(editable.map((n) => n.key))) handleEditPane(key, { visible: !visible }, { label });
        },
      });
      items.push({ type: 'sep' });
      // Favourite and colour tag (saved with the project, never exported).
      const allFav = group.every((n) => marks.get(n.id)?.fav);
      const mark = (change: { fav?: boolean; color?: TagColor }, label: string) =>
        history.set((p) => (p ? { ...p, marks: group.reduce((m, n) => setMark(m, markKey(activeScreen.id, n.id), change), p.marks) } : p), { label });
      items.push({
        type: 'item',
        label: allFav ? 'Remove from favourites' : 'Add to favourites',
        icon: <Star className={`w-3.5 h-3.5 ${allFav ? 'fill-current' : ''}`} />,
        onClick: () => mark({ fav: !allFav }, `${allFav ? 'Unfavourite' : 'Favourite'} ${many ? `${group.length} layers` : nameOf(target)}`),
      });
      const cur = group.length === 1 ? marks.get(target.id)?.color : undefined;
      items.push({
        type: 'custom',
        key: 'tags',
        render: (close) => (
          <div className="flex items-center gap-1 px-2 py-1.5">
            <span className="text-[11px] text-[var(--text-3)] mr-1">Tag</span>
            {(Object.keys(TAG_COLORS) as TagColor[]).map((c) => (
              <button
                key={c}
                title={c}
                className="w-4 h-4 rounded-full hover:scale-125 transition-transform"
                style={{ background: TAG_COLORS[c], boxShadow: cur === c ? '0 0 0 2px var(--panel), 0 0 0 3.5px var(--text)' : undefined }}
                onClick={() => (mark({ color: c }, `Tag ${many ? `${group.length} layers` : nameOf(target)} ${c}`), close())}
              />
            ))}
            <button title="No tag" className="w-4 h-4 rounded-full border border-[var(--text-3)] flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text)]" onClick={() => (mark({ color: undefined }, `Untag ${many ? `${group.length} layers` : nameOf(target)}`), close())}>
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ),
      });
      items.push({ type: 'sep' });
      // Draw order and revert.
      const orderBlock = !editable.length ? 'Not editable here: shared layout (common.szs)' : partRoot && !many ? 'Not applicable: a RootPane has no siblings to reorder' : false;
      const order = (o: 'front' | 'back') => {
        const keys = [...new Set(editable.map((n) => n.key))];
        handleEditLayout((l) => keys.reduce((acc, k) => {
          const { file, pane } = splitPaneKey(k);
          return setDrawOrder(acc, file, pane, o);
        }, l), { label: `${o === 'front' ? 'Bring to front' : 'Send to back'}: ${many ? `${keys.length} layers` : nameOf(target)}` });
      };
      items.push({ type: 'item', label: 'Bring to front', icon: <ArrowUpToLine className="w-3.5 h-3.5" />, disabled: orderBlock, onClick: () => order('front') });
      items.push({ type: 'item', label: 'Send to back', icon: <ArrowDownToLine className="w-3.5 h-3.5" />, disabled: orderBlock, onClick: () => order('back') });
      const changed = editable.filter((n) => changedKeys.has(n.key));
      items.push({
        type: 'item',
        label: 'Revert to stock',
        icon: <RotateCcw className="w-3.5 h-3.5" />,
        danger: true,
        disabled: changed.length ? false : 'Not changed by this theme',
        onClick: () => {
          const keys = [...new Set(changed.map((n) => n.key))];
          updateActiveScreen((s) => ({
            layout: keys.reduce((l, k) => {
              const info = getPaneInfo(l, systemLayouts[s.target], k);
              return revertPane(l, info.file, info.name);
            }, s.layout),
          }), { label: `Revert ${many ? `${keys.length} layers` : nameOf(target)}` });
        },
      });
      const caution = notes.find((n) => n.level !== 'info');
      if (caution && !many) {
        items.push({ type: 'sep' });
        items.push({
          type: 'custom',
          key: 'caution',
          render: () => (
            <div className={`flex gap-1.5 px-2 py-1.5 text-[11px] leading-snug max-w-[300px] ${caution.level === 'error' ? 'text-red-300' : 'text-amber-300'}`}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span className="whitespace-normal">{caution.text}</span>
            </div>
          ),
        });
      }
      return items;
    },
    [activeScreen, selectedIds, selectedNodes, parents, hiddenIds, lockedIds, marks, changedKeys, setDoc, selectNode, handleEditPane, handleEditLayout, history, updateActiveScreen, systemLayouts],
  );

  /* ------------------------------ background ------------------------------ */

  const handleReplaceWallpaper = async (file: File) => {
    try {
      const wallpaper = await loadWallpaper(file, file.name);
      updateActiveScreen({ wallpaper });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleExtractWallpaper = () => {
    const w = activeScreen?.wallpaper;
    if (!w) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(w.blob);
    a.download = w.fileName;
    a.click();
  };

  /* ------------------------------ system layouts ------------------------------ */

  const handleLoadSystemSzs = async (files: File[]) => {
    setSystemError(null);
    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const sys = parseSystemSzs(f.name, bytes);
        const slot = isCommonSzs(f.name) ? 'common' : sys.target;
        setSystemLayouts((prev) => ({ ...prev, [slot]: sys }));
        saveSystemSzs(slot, f.name, bytes);
      } catch (e) {
        setSystemError((e as Error).message);
      }
    }
  };

  const handleForgetSystemSzs = (target: ScreenTarget) => {
    setSystemLayouts((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
    removeSystemSzs(target);
  };

  const handleAddScreen = (target: ScreenTarget) => {
    const existing = project?.screens.find((s) => s.target === target);
    if (existing) {
      setActiveScreenId(existing.id);
    } else {
      const screen = newScreen(target);
      history.set((prev) => (prev ? { ...prev, screens: [...prev.screens, screen] } : prev));
      setActiveScreenId(screen.id);
    }
    selectNode(null);
    setExplodeId(null);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text)] select-none">
      <TopBar
        project={project}
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          if (m === 'preview') selectNode(null);
        }}
        onOpenFiles={openThemeFiles}
        onCloseProject={() => {
          history.reset(null);
          selectNode(null);
          setExplodeId(null);
        }}
        onHelp={help.open}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onRenameProject={(name, author) => history.set((p) => (p ? { ...p, name, author } : p), { label: `Rename to ${name}` })}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {!project && <StartPage onOpen={openProject} />}

        {project && activeScreen && (
          <aside className="w-[264px] shrink-0 flex flex-col bg-[var(--panel)] border-r border-[var(--border)] min-h-0">
            <ScreensList
              screens={project.screens}
              activeScreenId={activeScreen.id}
              onSelectScreen={(id) => {
                setActiveScreenId(id);
                selectNode(null);
                setExplodeId(null);
              }}
              onAddScreen={handleAddScreen}
            />
            <LeftDrawer
              activeTab={activeRailTab}
              onSelectTab={setActiveRailTab}
              activeScreen={activeScreen}
              system={activeSystem}
              systemLayouts={systemLayouts}
              consoleLayouts={consoleLayouts}
              systemError={systemError}
              mockState={screenMock}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onUpdateActiveScreen={updateActiveScreen}
              onUpdateMockState={(u) => setMockState((p) => ({ ...p, ...u }))}
              onReplaceWallpaper={handleReplaceWallpaper}
              onExtractWallpaper={handleExtractWallpaper}
              onEditPane={handleEditPane}
              onRevertPane={handleRevertPane}
              onLoadSystemSzs={handleLoadSystemSzs}
              onForgetSystemSzs={handleForgetSystemSzs}
              onCommitHistory={history.commit}
            />
          </aside>
        )}

        {project && activeScreen && (
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Viewport
          activeScreen={activeScreen}
          scene={scene}
          underlay={underlay}
          exploded={exploded}
          onExitExploded={() => setExplodeId(null)}
          mode={mode}
          mockState={mockState}
          selectedIds={selectedIds}
          hiddenIds={hiddenIds}
          lockedIds={lockedIds}
          changedKeys={changedKeys}
          snap={snap}
          onSnapChange={setSnap}
          onSelect={selectNode}
          onSelectMany={selectMany}
          onMovePanes={handleMovePanes}
          onResizePane={handleResizePane}
          onContextMenu={(at, under, target) => setMenu({ at, items: layerMenu(target, under) })}
          onUpdateMockState={(u) => setMockState((p) => ({ ...p, ...u }))}
          onDropFile={(file) => {
            const n = file.name.toLowerCase();
            if (n.endsWith('.szs')) handleLoadSystemSzs([file]);
            else if (n.endsWith('.nxtheme') || n.endsWith('.zip')) openThemeFiles([file]);
            else handleReplaceWallpaper(file);
          }}
        />
            <BottomDock
              steps={doc.steps}
              current={doc.current}
              onJump={doc.jumpTo}
              screen={activeScreen}
              onChangeExtraFiles={(extraFiles) => updateActiveScreen({ extraFiles })}
              onFontChange={() => setFontTick((t) => t + 1)}
            />
          </div>
        )}

        {activeScreen && (
          <aside className="w-[288px] shrink-0 flex flex-col bg-[var(--panel)] border-l border-[var(--border)] min-h-0">
            <div className="flex-[3] min-h-[160px] border-b border-[var(--border)]">
              <LayersPanel
                scene={scene}
                selectedIds={selectedIds}
                hiddenIds={hiddenIds}
                lockedIds={lockedIds}
                changedKeys={changedKeys}
                marks={marks}
                onSelect={selectNode}
                onToggleHidden={(id) => doc.set((d) => ({ ...d, hidden: toggleIn(d.hidden, id) }), { label: `${hiddenIds.has(id) ? 'Show' : 'Hide'} ${id.split('/').pop()} (editor)` })}
                onToggleLocked={(id) => doc.set((d) => ({ ...d, locked: toggleIn(d.locked, id) }), { label: `${lockedIds.has(id) ? 'Unlock' : 'Lock'} ${id.split('/').pop()}` })}
                onContextMenu={(at, n) => setMenu({ at, items: layerMenu(n, []) })}
                onExplode={(n) => setExplodeId(n.id)}
              />
            </div>
            <div className="flex-[2] min-h-[200px] overflow-y-auto">
              <Inspector
                activeScreen={activeScreen}
                system={activeSystem}
                selectedKey={selectedKey}
                onEditPane={handleEditPane}
                onRevertPane={handleRevertPane}
                onEditLayout={handleEditLayout}
                onCommit={history.commit}
                dark={screenMock.isDarkTheme}
                notes={notes}
                alsoSelected={Math.max(0, selectedIds.length - 1)}
              />
            </div>
          </aside>
        )}
      </div>



      {menu && <ContextMenu at={menu.at} items={menu.items} onClose={() => setMenu(null)} />}
      {help.tab && <HelpDialog tab={help.tab} onTab={help.open} onClose={help.close} />}
      {compat.length > 0 && (
        <div className={`fixed left-1/2 -translate-x-1/2 bottom-4 z-50 max-w-[640px] w-[calc(100%-32px)] flex gap-2 p-3 rounded-lg border text-[12px] leading-relaxed shadow-[0_10px_32px_rgba(0,0,0,0.5)] ${compat.some((c) => c.severe) ? 'bg-[#3a1f1f] border-red-500/40 text-red-100' : 'bg-[#3a311f] border-amber-500/40 text-amber-100'}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <b>This browser is missing something the studio uses.</b>
            <ul className="mt-1 space-y-0.5">
              {compat.map((c) => (
                <li key={c.what}>
                  <b>{c.what}</b>: {c.effect}
                </li>
              ))}
            </ul>
          </div>
          <button className="ui-icon-btn !w-6 !h-6 shrink-0" title="Dismiss" onClick={() => setCompat([])}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {project && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          project={project}
          activeScreen={activeScreen!}
          systemLayouts={systemLayouts}
        />
      )}
    </div>
  );
}

export default App;
