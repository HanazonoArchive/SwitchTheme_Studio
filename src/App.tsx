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
import type { SnapSettings, TransformChange } from './features/canvas/EditorOverlay';
import { buildScene, buildSource, type SceneNode } from './lib/render/scene';
import { StartPage } from './features/project/StartPage';
import { saveProject } from './lib/state/projectStore';
import { readThemeFiles } from './lib/theme/nxtheme';
import { ExportModal } from './features/project/ExportModal';

import { useHistory } from './lib/state/useHistory';
import { editPane, hasLayoutChanges, revertPane, type PaneEdit, type PanePatch, type PaneState } from './lib/layout/patch';
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

export function App() {
  // One undo history for the theme and the editor-only eye/lock state, so hiding or locking a
  // layer is undone like any other step.
  const doc = useHistory<EditorDoc>({ project: null, hidden: EMPTY_IDS, locked: EMPTY_IDS });
  const history = useMemo(
    () => ({
      set: (next: ThemeProject | null | ((p: ThemeProject | null) => ThemeProject | null), opts?: { transient?: boolean }) =>
        doc.set((d) => {
          const project = typeof next === 'function' ? next(d.project) : next;
          return project === d.project ? d : { ...d, project };
        }, opts),
      reset: (project: ThemeProject | null) => doc.reset({ project, hidden: EMPTY_IDS, locked: EMPTY_IDS }),
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
    [activeSystem, mainSource, commonSource, activeScreen?.wallpaper, screenMock, selectedKey], // eslint-disable-line react-hooks/exhaustive-deps
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
  }, [activeScreen?.target, systemLayouts.home, systemLayouts.common, homeScreen, mockState]);

  const selectNode = useCallback((n: SceneNode | null) => {
    setSelectedKey(n?.key ?? null);
    setSelectedId(n?.id ?? null);
  }, []);
  // A selection made by key (Inspector, pane lists) shows on its first instance on screen.
  const activeSelectedId = useMemo(() => {
    if (!scene || !selectedKey) return null;
    const cur = selectedId ? scene.flat.find((n) => n.id === selectedId) : undefined;
    if (cur?.key === selectedKey) return selectedId;
    return scene.flat.find((n) => n.key === selectedKey)?.id ?? null;
  }, [scene, selectedKey, selectedId]);
  const toggleIn = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const updateActiveScreen = useCallback(
    (updates: Partial<ThemeScreen> | ((s: ThemeScreen) => Partial<ThemeScreen>), opts?: { transient?: boolean }) => {
      history.set((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          screens: prev.screens.map((s) =>
            s.id === activeId ? { ...s, ...(typeof updates === 'function' ? updates(s) : updates) } : s,
          ),
        };
      }, opts);
    },
    [history, activeId],
  );

  /* ------------------------------ pane editing ------------------------------ */

  const handleEditPane = useCallback(
    (key: string, edit: PaneEdit, opts?: { transient?: boolean }) => {
      updateActiveScreen((s) => {
        const sys = systemLayouts[s.target];
        // A layout started in the studio is made for this console: stamp its firmware on the first
        // edit, like the injector's LayoutDiff does, so the installer doesn't add downgrade fixes.
        const base = !hasLayoutChanges(s.layout) && s.layout.TargetFirmware === undefined && sys && sys.firmware >= FW.Fw11_0 ? stampFirmware(s.layout, s.target, sys.firmware) : s.layout;
        const info = getPaneInfo(base, sys, key);
        return { layout: editPane(base, info.file, info.name, info.current, edit) };
      }, opts);
    },
    [updateActiveScreen, systemLayouts],
  );

  const handleRevertPane = useCallback(
    (key: string, field?: keyof PanePatch) => {
      updateActiveScreen((s) => {
        const info = getPaneInfo(s.layout, systemLayouts[s.target], key);
        return { layout: revertPane(s.layout, info.file, info.name, field) };
      });
    },
    [updateActiveScreen, systemLayouts],
  );

  // Drag on canvas: remember where the pane started, write absolute positions while moving.
  const dragBase = useRef<PaneState | null>(null);
  const handleDragPane = useCallback(
    (key: string, dx: number, dy: number, phase: 'start' | 'move' | 'end') => {
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
      if (!base || (dx === 0 && dy === 0)) return;
      handleEditPane(key, { position: { X: Math.round(base.position.X + dx), Y: Math.round(base.position.Y + dy) } }, { transient: true });
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
        selectNode(null);
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

      // Editor with a selection: arrows nudge the pane (Shift = 10 units).
      if (isEditor && selectedKey && e.key.startsWith('Arrow')) {
        e.preventDefault();
        if (!activeScreen) return;
        const step = e.shiftKey ? 10 : 1;
        const cur = getPaneInfo(activeScreen.layout, systemLayouts[activeScreen.target], selectedKey).current.position;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key] ?? [0, 0];
        handleEditPane(selectedKey, { position: { X: cur.X + d[0], Y: cur.Y + d[1] } });
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
  }, [history, isEditor, selectedKey, activeSelectedId, scene, selectNode, activeScreen, systemLayouts, handleEditPane]);

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
        }}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onRenameProject={(name, author) => history.set((p) => (p ? { ...p, name, author } : p))}
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

        {project && <Viewport
          activeScreen={activeScreen}
          scene={scene}
          underlay={underlay}
          mode={mode}
          mockState={mockState}
          selectedId={activeSelectedId}
          hiddenIds={hiddenIds}
          lockedIds={lockedIds}
          snap={snap}
          onSnapChange={setSnap}
          onSelect={selectNode}
          onDragPane={handleDragPane}
          onResizePane={handleResizePane}
          onUpdateMockState={(u) => setMockState((p) => ({ ...p, ...u }))}
          onDropFile={(file) => {
            const n = file.name.toLowerCase();
            if (n.endsWith('.szs')) handleLoadSystemSzs([file]);
            else if (n.endsWith('.nxtheme') || n.endsWith('.zip')) openThemeFiles([file]);
            else handleReplaceWallpaper(file);
          }}
        />}

        {activeScreen && (
          <aside className="w-[288px] shrink-0 flex flex-col bg-[var(--panel)] border-l border-[var(--border)] min-h-0">
            <div className="flex-[3] min-h-[160px] border-b border-[var(--border)]">
              <LayersPanel
                scene={scene}
                selectedId={activeSelectedId}
                hiddenIds={hiddenIds}
                lockedIds={lockedIds}
                onSelect={selectNode}
                onToggleHidden={(id) => doc.set((d) => ({ ...d, hidden: toggleIn(d.hidden, id) }))}
                onToggleLocked={(id) => doc.set((d) => ({ ...d, locked: toggleIn(d.locked, id) }))}
              />
            </div>
            <div className="flex-[2] min-h-[200px] overflow-y-auto">
              <Inspector activeScreen={activeScreen} system={activeSystem} selectedKey={selectedKey} onEditPane={handleEditPane} onRevertPane={handleRevertPane} />
            </div>
          </aside>
        )}
      </div>



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
