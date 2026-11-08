import { useState, useEffect } from 'react';
import type { ThemeProject, ThemeScreen, PaneNode } from './types/theme';
import type { MockSystemState } from './types/simulation';
import type { RailTab } from './features/editor/LeftRail';
import type { OemComponentDefinition } from './constants/switchPanes';
import { DEFAULT_MOCK_USERS, DEFAULT_MOCK_GAMES } from './constants/switchPanes';

import { TopBar } from './features/editor/TopBar';
import { LeftRail } from './features/editor/LeftRail';
import { LeftDrawer } from './features/editor/LeftDrawer';
import { Viewport } from './features/editor/Viewport';
import { Inspector } from './features/editor/Inspector';
import { ScreenTimeline } from './features/editor/ScreenTimeline';
import { ProjectModal } from './features/project/ProjectModal';
import { ExportModal } from './features/project/ExportModal';
import { AddComponentModal } from './features/editor/AddComponentModal';

export function App() {
  // Theme Project State: Starts as null, so user is prompted to open or create
  const [project, setProject] = useState<ThemeProject | null>(null);

  // Mock Environment State
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

  // Navigation & Selection State
  const [activeRailTab, setActiveRailTab] = useState<RailTab>('media');
  const [activeTopTab, setActiveTopTab] = useState<'editor' | 'motion'>('editor');
  const [selectedPaneId, setSelectedPaneId] = useState<string | null>(null);

  // Modals: Project Modal starts open if no project is loaded
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAddComponentModalOpen, setIsAddComponentModalOpen] = useState(false);

  // Keyboard navigation for carousel in Live Simulator
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight' || e.key === 'd') {
        setMockState((prev) => ({
          ...prev,
          selectedGameIndex: Math.min(prev.games.length - 1, prev.selectedGameIndex + 1),
        }));
      } else if (e.key === 'ArrowLeft' || e.key === 'a') {
        setMockState((prev) => ({
          ...prev,
          selectedGameIndex: Math.max(0, prev.selectedGameIndex - 1),
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeScreen = project
    ? project.screens.find((s) => s.id === project.activeScreenId) || project.screens[0]
    : null;

  const selectedPane =
    activeScreen?.panes.find((p) => p.id === selectedPaneId) || null;

  const handleUpdateActiveScreen = (updates: Partial<ThemeScreen>) => {
    if (!project) return;
    setProject((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        screens: prev.screens.map((screen) =>
          screen.id === prev.activeScreenId ? { ...screen, ...updates } : screen
        ),
      };
    });
  };

  // Live Inspector Updates: Updates panes and synchronizes layout.json patches
  const handleUpdatePane = (paneId: string, updates: Partial<PaneNode>) => {
    if (!activeScreen) return;

    const updatedPanes = activeScreen.panes.map((p) =>
      p.id === paneId ? { ...p, ...updates } : p
    );

    const targetPane = updatedPanes.find((p) => p.id === paneId);
    if (!targetPane) return;

    // Update layoutJson patch structure
    const currentFiles = [...(activeScreen.layoutJson?.Files || [])];
    let fileFound = false;

    for (let f of currentFiles) {
      if (Array.isArray(f.Patches)) {
        const patchIdx = f.Patches.findIndex((pt: any) => pt.PaneName === targetPane.name);
        if (patchIdx >= 0) {
          f.Patches[patchIdx] = {
            ...f.Patches[patchIdx],
            Position: { X: targetPane.x, Y: targetPane.y },
            Size: { X: targetPane.width, Y: targetPane.height },
            Scale: { X: targetPane.scaleX, Y: targetPane.scaleY },
            Visible: targetPane.visible,
          };
          fileFound = true;
          break;
        }
      }
    }

    if (!fileFound) {
      currentFiles.push({
        FileName: 'blyt/RdtBase.bflyt',
        Patches: [
          {
            PaneName: targetPane.name,
            Position: { X: targetPane.x, Y: targetPane.y },
            Size: { X: targetPane.width, Y: targetPane.height },
            Scale: { X: targetPane.scaleX, Y: targetPane.scaleY },
            Visible: targetPane.visible,
          },
        ],
      });
    }

    handleUpdateActiveScreen({
      panes: updatedPanes,
      layoutJson: {
        ...activeScreen.layoutJson,
        Files: currentFiles,
      },
    });
  };

  // Add Switch Component from OEM palette modal
  const handleAddComponent = (compDef: OemComponentDefinition) => {
    if (!activeScreen) return;

    const newPaneId = `pane-${activeScreen.target}-${compDef.name}-${Date.now()}`;
    const newPane: PaneNode = {
      ...compDef.defaultPane,
      id: newPaneId,
    };

    const updatedPanes = [...activeScreen.panes, newPane];

    // Append patch to layoutJson
    const currentFiles = [...(activeScreen.layoutJson?.Files || [])];
    const targetFile = currentFiles.find((f: any) => f.FileName === compDef.targetFile);

    if (targetFile) {
      targetFile.Patches = targetFile.Patches || [];
      targetFile.Patches.push({
        PaneName: compDef.name,
        Position: { X: compDef.defaultPane.x, Y: compDef.defaultPane.y },
        Size: { X: compDef.defaultPane.width, Y: compDef.defaultPane.height },
        Scale: { X: compDef.defaultPane.scaleX, Y: compDef.defaultPane.scaleY },
        Visible: compDef.defaultPane.visible,
      });
    } else {
      currentFiles.push({
        FileName: compDef.targetFile,
        Patches: [
          {
            PaneName: compDef.name,
            Position: { X: compDef.defaultPane.x, Y: compDef.defaultPane.y },
            Size: { X: compDef.defaultPane.width, Y: compDef.defaultPane.height },
            Scale: { X: compDef.defaultPane.scaleX, Y: compDef.defaultPane.scaleY },
            Visible: compDef.defaultPane.visible,
          },
        ],
      });
    }

    handleUpdateActiveScreen({
      panes: updatedPanes,
      layoutJson: {
        ...activeScreen.layoutJson,
        Files: currentFiles,
      },
    });

    setSelectedPaneId(newPaneId);
  };

  // Delete component from screen and layout.json
  const handleDeletePane = (paneId: string) => {
    if (!activeScreen) return;

    const paneToDelete = activeScreen.panes.find((p) => p.id === paneId);
    if (!paneToDelete) return;

    const updatedPanes = activeScreen.panes.filter((p) => p.id !== paneId);

    // Remove from layoutJson
    const currentFiles = (activeScreen.layoutJson?.Files || []).map((f: any) => ({
      ...f,
      Patches: (f.Patches || []).filter((pt: any) => pt.PaneName !== paneToDelete.name),
    }));

    handleUpdateActiveScreen({
      panes: updatedPanes,
      layoutJson: {
        ...activeScreen.layoutJson,
        Files: currentFiles,
      },
    });

    if (selectedPaneId === paneId) {
      setSelectedPaneId(null);
    }
  };

  const handleCloseProject = () => {
    setProject(null);
    setSelectedPaneId(null);
    setIsProjectModalOpen(true);
  };

  const handleReplaceWallpaper = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        handleUpdateActiveScreen({
          wallpaperUrl: e.target.result,
          wallpaperFileName: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleExtractWallpaper = () => {
    if (!activeScreen?.wallpaperUrl) return;
    const a = document.createElement('a');
    a.href = activeScreen.wallpaperUrl;
    a.download = activeScreen.wallpaperFileName || `${activeScreen.target}_wallpaper.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0d11] text-[#f1f5f9] select-none font-sans">
      {/* 1. Top Bar with Project Tabs, Close button, and Mode Tabs */}
      <TopBar
        project={project}
        activeTab={activeTopTab}
        onSelectTab={setActiveTopTab}
        onOpenProjectModal={() => setIsProjectModalOpen(true)}
        onCloseProject={handleCloseProject}
        onOpenExportModal={() => setIsExportModalOpen(true)}
      />

      {/* 2. Middle Studio Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <LeftRail activeTab={activeRailTab} onSelectTab={setActiveRailTab} />

        {activeScreen && (
          <LeftDrawer
            activeTab={activeRailTab}
            activeScreen={activeScreen}
            mockState={mockState}
            selectedPaneId={selectedPaneId}
            onSelectPane={setSelectedPaneId}
            onUpdateActiveScreen={handleUpdateActiveScreen}
            onUpdateMockState={(updates) => setMockState((prev) => ({ ...prev, ...updates }))}
            onReplaceWallpaper={handleReplaceWallpaper}
            onExtractWallpaper={handleExtractWallpaper}
            onOpenAddComponentModal={() => setIsAddComponentModalOpen(true)}
            onDeletePane={handleDeletePane}
          />
        )}

        <Viewport
          activeScreen={activeScreen}
          mockState={mockState}
          activeTopTab={activeTopTab}
          selectedPaneId={selectedPaneId}
          onSelectPane={setSelectedPaneId}
          onUpdateMockState={(updates) => setMockState((prev) => ({ ...prev, ...updates }))}
          onDropWallpaper={handleReplaceWallpaper}
          onOpenProjectModal={() => setIsProjectModalOpen(true)}
        />

        {activeScreen && (
          <Inspector
            activeScreen={activeScreen}
            selectedPane={selectedPane}
            onUpdatePane={handleUpdatePane}
            onDeletePane={handleDeletePane}
          />
        )}
      </div>

      {/* 3. Bottom Timeline / Slide Strip (when project is loaded) */}
      {project && (
        <ScreenTimeline
          screens={project.screens}
          activeScreenId={project.activeScreenId}
          onSelectScreen={(screenId) => {
            setProject((prev) => (prev ? { ...prev, activeScreenId: screenId } : null));
            setSelectedPaneId(null);
          }}
        />
      )}

      {/* Project Setup Modal */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        canClose={Boolean(project)}
        onClose={() => setIsProjectModalOpen(false)}
        onInitializeProject={(newProj) => {
          setProject(newProj);
          setSelectedPaneId(null);
          setIsProjectModalOpen(false);
        }}
      />

      {/* Add BFLYT Component Modal */}
      <AddComponentModal
        isOpen={isAddComponentModalOpen}
        onClose={() => setIsAddComponentModalOpen(false)}
        onSelectComponent={handleAddComponent}
      />

      {/* Export Theme Modal */}
      {project && activeScreen && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          project={project}
          activeScreen={activeScreen}
        />
      )}
    </div>
  );
}

export default App;
