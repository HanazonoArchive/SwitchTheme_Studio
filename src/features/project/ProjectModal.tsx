import React, { useState, useRef } from 'react';
import { X, FolderOpen, Plus, FileUp, Sparkles, Box, LayoutGrid } from 'lucide-react';
import type { ThemeProject } from '../../types/theme';
import { loadOemProject, parseNxThemeFiles } from './oemLoader';

interface ProjectModalProps {
  isOpen: boolean;
  canClose: boolean;
  onClose: () => void;
  onInitializeProject: (project: ThemeProject) => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  canClose,
  onClose,
  onInitializeProject,
}) => {
  const [activeTab, setActiveTab] = useState<'new' | 'open' | 'demos'>('new');
  const [themeName, setThemeName] = useState('My Custom Theme');
  const [authorName, setAuthorName] = useState('SwitchThemer');
  const [starterTemplate, setStarterTemplate] = useState<'vertical' | 'stock'>('vertical');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Create new project from selected starter template
  const handleCreateNewProject = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const project = await loadOemProject();
      project.name = themeName.trim() || 'Untitled Theme';
      project.author = authorName.trim() || 'Unknown';

      // If user selected stock Nintendo layout, adjust icon dimensions
      if (starterTemplate === 'stock') {
        project.screens = project.screens.map((screen) => ({
          ...screen,
          isVerticalIcons: false,
          layoutPatchName: 'Default (Nintendo Stock)',
          panes: screen.panes.map((p) =>
            p.name === 'P_IconGame' || p.name === 'P_BtnBase'
              ? { ...p, width: 256, height: 256 }
              : p
          ),
        }));
      }

      onInitializeProject(project);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to initialize project.');
    } finally {
      setIsLoading(false);
    }
  };

  // Open .nxtheme or .zip files from user's disk
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const filePayloads = Array.from(files).map((f) => ({
        name: f.name,
        blob: f as Blob,
      }));
      const project = await parseNxThemeFiles(filePayloads);
      onInitializeProject(project);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to parse theme files.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load preset demo themes
  const handleLoadDemo = async (demo: 'vertical' | 'purpleskies') => {
    setIsLoading(true);
    setError(null);
    try {
      if (demo === 'vertical') {
        const project = await loadOemProject();
        project.name = 'Vertical-OEM';
        project.author = 'sodasoba';
        onInitializeProject(project);
      } else {
        // Purple Skies demo with custom wallpaper
        const project = await loadOemProject();
        project.name = 'Purple Skies ANIMATED';
        project.author = 'Hsushi';
        project.screens = project.screens.map((s) => ({
          ...s,
          isVerticalIcons: false,
          layoutPatchName: 'Default by Nintendo',
        }));
        onInitializeProject(project);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to load demo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept=".nxtheme,.zip"
        onChange={(e) => handleFilesSelected(e.target.files)}
        className="hidden"
      />

      <div className="w-full max-w-lg bg-[#101319] border border-[#202532] rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs text-slate-300">
        {/* Header */}
        <div className="h-12 px-5 border-b border-[#1b1f28] flex items-center justify-between bg-[#0c0e12]">
          <span className="font-semibold text-sm text-white">SwitchTheme Studio Setup</span>
          {canClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded transition">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1b1f28] bg-[#0c0e12]">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 py-2.5 font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'new'
                ? 'border-[#10b981] text-[#10b981]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Project</span>
          </button>
          <button
            onClick={() => setActiveTab('open')}
            className={`flex-1 py-2.5 font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'open'
                ? 'border-[#10b981] text-[#10b981]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open from PC</span>
          </button>
          <button
            onClick={() => setActiveTab('demos')}
            className={`flex-1 py-2.5 font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'demos'
                ? 'border-[#10b981] text-[#10b981]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Demo Themes</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {activeTab === 'new' && (
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Theme Name</label>
                <input
                  type="text"
                  value={themeName}
                  onChange={(e) => setThemeName(e.target.value)}
                  className="w-full bg-[#0c0e12] border border-[#232936] rounded px-3 py-2 text-white outline-none focus:border-[#10b981]"
                  placeholder="e.g. Horizon Clean Dark"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Author Name</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-full bg-[#0c0e12] border border-[#232936] rounded px-3 py-2 text-white outline-none focus:border-[#10b981]"
                  placeholder="Your handle or username"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1.5">Starter Layout</label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setStarterTemplate('vertical')}
                    className={`p-3 rounded-lg border cursor-pointer transition flex flex-col gap-1 ${
                      starterTemplate === 'vertical'
                        ? 'border-[#10b981] bg-[#10b981]/10 text-white'
                        : 'border-[#202532] bg-[#141720] text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <LayoutGrid className="w-3.5 h-3.5 text-[#10b981]" />
                      <span>Vertical OEM</span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Portrait 256×384 cards with OEM layout patch
                    </span>
                  </div>

                  <div
                    onClick={() => setStarterTemplate('stock')}
                    className={`p-3 rounded-lg border cursor-pointer transition flex flex-col gap-1 ${
                      starterTemplate === 'stock'
                        ? 'border-[#10b981] bg-[#10b981]/10 text-white'
                        : 'border-[#202532] bg-[#141720] text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <Box className="w-3.5 h-3.5 text-blue-400" />
                      <span>Nintendo Stock</span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Square 256×256 standard Nintendo layout
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'open' && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesSelected(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-[#232936] hover:border-[#10b981] rounded-xl p-8 text-center space-y-2 cursor-pointer transition bg-[#0c0e12] group"
            >
              <FileUp className="w-8 h-8 text-slate-500 group-hover:text-[#10b981] mx-auto transition" />
              <p className="text-xs font-semibold text-white">Click or drag &amp; drop .nxtheme or .zip files</p>
              <p className="text-[11px] text-slate-400">
                Supports multiple screen themes (Home, Lockscreen, All Apps)
              </p>
            </div>
          )}

          {activeTab === 'demos' && (
            <div className="space-y-2">
              <div
                onClick={() => handleLoadDemo('vertical')}
                className="p-3 rounded-lg bg-[#141720] hover:bg-[#181d28] border border-[#202532] hover:border-[#10b981] cursor-pointer transition flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-xs text-white">Vertical-OEM (by sodasoba)</div>
                  <div className="text-[11px] text-slate-400">
                    Type 2 layout-only theme (No background image, pure BFLYT coordinate patch)
                  </div>
                </div>
                <span className="px-2 py-1 rounded bg-[#10b981]/10 text-[#10b981] font-medium text-[10px]">
                  Load
                </span>
              </div>

              <div
                onClick={() => handleLoadDemo('purpleskies')}
                className="p-3 rounded-lg bg-[#141720] hover:bg-[#181d28] border border-[#202532] hover:border-[#10b981] cursor-pointer transition flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-xs text-white">Purple Skies (by Hsushi)</div>
                  <div className="text-[11px] text-slate-400">
                    Type 1 artwork theme with custom animated wallpaper &amp; stock layout
                  </div>
                </div>
                <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-medium text-[10px]">
                  Load
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded bg-red-950/40 border border-red-500/40 text-red-300 text-[11px]">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 px-5 border-t border-[#1b1f28] flex items-center justify-end gap-2 bg-[#0c0e12]">
          {canClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded hover:bg-[#161a22] text-slate-400 transition"
            >
              Cancel
            </button>
          )}
          {activeTab === 'new' && (
            <button
              onClick={handleCreateNewProject}
              disabled={isLoading}
              className="px-4 py-1.5 rounded bg-[#10b981] hover:bg-[#0ea572] text-[#0c0e12] font-semibold transition flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isLoading ? 'Creating...' : 'Create Project'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
