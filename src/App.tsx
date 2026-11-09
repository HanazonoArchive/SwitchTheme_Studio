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
import type { SnapSettings } from './features/canvas/EditorOverlay';
import { buildScene, buildSource, type SceneNode } from './lib/render/scene';
import { ProjectModal } from './features/project/ProjectModal';
import { ExportModal } from './features/project/ExportModal';

import { useHistory } from './lib/state/useHistory';
import { editPane, hasLayoutChanges, revertPane, type PaneEdit, type PanePatch, type PaneState } from './lib/layout/patch';
import { FW, stampFirmware } from './lib/layout/installerFixes';
import { getPaneInfo } from './lib/layout/paneModel';
import { loadStockLayouts } from './lib/stock/stockPack';
import { isCommonSzs, loadSavedSystemLayouts, parseSystemSzs, removeSystemSzs, saveSystemSzs, type SystemLayoutMap } from './lib/layout/systemLayouts';
import { loadWallpaper } from './lib/theme/images';
import { newScreen } from './lib/theme/nxtheme';
import type { ScreenTarget } from './types/theme';

export function App() {
  const history = useHistory<ThemeProject | null>(null);
  const project = history.value;

  // Console layouts: the built-in pack, overridden per screen by the user's own .szs files.
  const [stockLayouts, setStockLayouts] = useState<SystemLayoutMap>({});
  const [consoleLayouts, setSystemLayouts] = useState<SystemLayoutMap>({});
  const systemLayouts = useMemo<SystemLayoutMap>(() => ({ ...stockLayouts, ...consoleLayouts }), [stockLayouts, consoleLayouts]);
  const [systemError, setSystemError] = useState<string | null>(null);

  const [mockState, setMockState] = useState<MockSystemState>({
    time: '12:00',
    battery: 85,
    isCharging: false,
    wifiStrength: 3,
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
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const [lockedIds, setLockedIds] = useState<ReadonlySet<string>>(new Set());
  const [snap, setSnap] = useState<SnapSettings>({ grid: false, gridSize: 8, guides: true });
  // Which screen is open is view state, not part of undo history.
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Built-in layouts, plus the user's console files remembered between sessions.
  useEffect(() => {
    loadStockLayouts().then(setStockLayouts);
    loadSavedSystemLayouts().then((saved) => setSystemLayouts((prev) => ({ ...saved, ...prev })));
  }, []);

  const activeScreen = project ? project.screens.find((s) => s.id === activeScreenId) || project.screens[0] : null;
  const activeId = activeScreen?.id ?? null;
  const activeSystem = activeScreen ? systemLayouts[activeScreen.target] : undefined;
  const isEditor = mode === 'edit';

  /* ------------------------------ scene ------------------------------ */

  const mainSource = useMemo(() => (activeSystem && activeScreen ? buildSource(activeSystem, activeScreen.layout, true, true) : null), [activeSystem, activeScreen?.layout]); // eslint-disable-line react-hooks/exhaustive-deps
  const commonSource = useMemo(
    () => (systemLayouts.common && activeScreen ? buildSource(systemLayouts.common, activeScreen.common ?? {}, true, false) : null),
    [systemLayouts.common, activeScreen?.common], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const scene = useMemo(
    () =>
      activeSystem && mainSource && activeScreen
        ? buildScene({ system: activeSystem, main: mainSource, common: commonSource, hasWallpaper: Boolean(activeScreen.wallpaper), mock: mockState, selectedKey })
        : null,
    [activeSystem, mainSource, commonSource, activeScreen?.wallpaper, mockState, selectedKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

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

  // Resize on canvas: size plus the position change that keeps the opposite edge in place.
  const handleResizePane = useCallback(
    (key: string, c: { dx: number; dy: number; w: number; h: number }, phase: 'start' | 'move' | 'end') => {
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
      handleEditPane(
        key,
        { position: { X: r(base.position.X + c.dx), Y: r(base.position.Y + c.dy) }, size: { X: r(Math.max(1, c.w)), Y: r(Math.max(1, c.h)) } },
        { transient: true },
      );
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
        onOpenProjectModal={() => setIsProjectModalOpen(true)}
        onCloseProject={() => {
          history.reset(null);
          selectNode(null);
          setIsProjectModalOpen(true);
        }}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onRenameProject={(name, author) => history.set((p) => (p ? { ...p, name, author } : p))}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
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
              mockState={mockState}
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

        <Viewport
          activeScreen={activeScreen}
          scene={scene}
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
            if (file.name.toLowerCase().endsWith('.szs')) handleLoadSystemSzs([file]);
            else handleReplaceWallpaper(file);
          }}
          onOpenProjectModal={() => setIsProjectModalOpen(true)}
        />

        {activeScreen && (
          <aside className="w-[288px] shrink-0 flex flex-col bg-[var(--panel)] border-l border-[var(--border)] min-h-0">
            <div className="flex-[3] min-h-[160px] border-b border-[var(--border)]">
              <LayersPanel
                scene={scene}
                selectedId={activeSelectedId}
                hiddenIds={hiddenIds}
                lockedIds={lockedIds}
                onSelect={selectNode}
                onToggleHidden={(id) => setHiddenIds((s) => toggleIn(s, id))}
                onToggleLocked={(id) => setLockedIds((s) => toggleIn(s, id))}
              />
            </div>
            <div className="flex-[2] min-h-[200px] overflow-y-auto">
              <Inspector activeScreen={activeScreen} system={activeSystem} selectedKey={selectedKey} onEditPane={handleEditPane} onRevertPane={handleRevertPane} />
            </div>
          </aside>
        )}
      </div>

      <ProjectModal
        isOpen={isProjectModalOpen}
        canClose={Boolean(project)}
        onClose={() => setIsProjectModalOpen(false)}
        onInitializeProject={(p) => {
          history.reset(p);
          setActiveScreenId(p.activeScreenId);
          selectNode(null);
          setIsProjectModalOpen(false);
        }}
      />

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
