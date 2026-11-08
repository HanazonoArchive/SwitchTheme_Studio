import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThemeProject, ThemeScreen } from './types/theme';
import type { MockSystemState } from './types/simulation';
import type { RailTab } from './features/editor/LeftRail';
import { DEFAULT_MOCK_USERS, DEFAULT_MOCK_GAMES } from './constants/switchPanes';

import { TopBar } from './features/editor/TopBar';
import { LeftRail } from './features/editor/LeftRail';
import { LeftDrawer } from './features/editor/LeftDrawer';
import { Viewport } from './features/editor/Viewport';
import { Inspector } from './features/editor/Inspector';
import { ScreenTimeline } from './features/editor/ScreenTimeline';
import { ProjectModal } from './features/project/ProjectModal';
import { ExportModal } from './features/project/ExportModal';

import { useHistory } from './lib/state/useHistory';
import { editPane, hasLayoutChanges, revertPane, type PaneEdit, type PanePatch, type PaneState } from './lib/layout/patch';
import { FW, stampFirmware } from './lib/layout/installerFixes';
import { getPaneInfo } from './lib/layout/paneModel';
import { isCommonSzs, loadSavedSystemLayouts, parseSystemSzs, removeSystemSzs, saveSystemSzs, type SystemLayoutMap } from './lib/layout/systemLayouts';
import { loadWallpaper } from './lib/theme/images';
import { newScreen } from './lib/theme/nxtheme';
import type { ScreenTarget } from './types/theme';

export function App() {
  const history = useHistory<ThemeProject | null>(null);
  const project = history.value;

  const [systemLayouts, setSystemLayouts] = useState<SystemLayoutMap>({});
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
  const [activeTopTab, setActiveTopTab] = useState<'editor' | 'motion'>('editor');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Which screen is open is view state, not part of undo history.
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Stock layouts from the user's console, remembered between sessions.
  useEffect(() => {
    loadSavedSystemLayouts().then((saved) => setSystemLayouts((prev) => ({ ...saved, ...prev })));
  }, []);

  const activeScreen = project ? project.screens.find((s) => s.id === activeScreenId) || project.screens[0] : null;
  const activeId = activeScreen?.id ?? null;
  const activeSystem = activeScreen ? systemLayouts[activeScreen.target] : undefined;
  const isEditor = activeTopTab === 'editor';

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
        setSelectedKey(null);
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
  }, [history, isEditor, selectedKey, activeScreen, systemLayouts, handleEditPane]);

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
    setSelectedKey(null);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0d11] text-[#f1f5f9] select-none font-sans">
      <TopBar
        project={project}
        activeTab={activeTopTab}
        onSelectTab={setActiveTopTab}
        onOpenProjectModal={() => setIsProjectModalOpen(true)}
        onCloseProject={() => {
          history.reset(null);
          setSelectedKey(null);
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
        <LeftRail activeTab={activeRailTab} onSelectTab={setActiveRailTab} />

        {activeScreen && (
          <LeftDrawer
            activeTab={activeRailTab}
            activeScreen={activeScreen}
            system={activeSystem}
            systemLayouts={systemLayouts}
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
        )}

        <Viewport
          activeScreen={activeScreen}
          system={activeSystem}
          common={systemLayouts.common}
          mockState={mockState}
          activeTopTab={activeTopTab}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onDragPane={handleDragPane}
          onUpdateMockState={(u) => setMockState((p) => ({ ...p, ...u }))}
          onDropFile={(file) => {
            if (file.name.toLowerCase().endsWith('.szs')) handleLoadSystemSzs([file]);
            else handleReplaceWallpaper(file);
          }}
          onOpenProjectModal={() => setIsProjectModalOpen(true)}
          onOpenPanes={() => setActiveRailTab('panes')}
        />

        {activeScreen && (
          <Inspector
            activeScreen={activeScreen}
            system={activeSystem}
            selectedKey={selectedKey}
            onEditPane={handleEditPane}
            onRevertPane={handleRevertPane}
          />
        )}
      </div>

      {project && (
        <ScreenTimeline
          screens={project.screens}
          activeScreenId={activeScreen?.id ?? ''}
          systemLayouts={systemLayouts}
          onSelectScreen={(id) => {
            setActiveScreenId(id);
            setSelectedKey(null);
          }}
          onAddScreen={handleAddScreen}
        />
      )}

      <ProjectModal
        isOpen={isProjectModalOpen}
        canClose={Boolean(project)}
        onClose={() => setIsProjectModalOpen(false)}
        onInitializeProject={(p) => {
          history.reset(p);
          setActiveScreenId(p.activeScreenId);
          setSelectedKey(null);
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
