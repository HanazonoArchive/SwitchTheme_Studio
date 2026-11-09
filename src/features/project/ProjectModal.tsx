import React, { useState, useRef } from 'react';
import { X, FolderOpen, Plus, FileUp, Sparkles, Box, LayoutGrid } from 'lucide-react';
import type { ThemeProject } from '../../types/theme';
import { newScreen, readThemeFiles } from '../../lib/theme/nxtheme';

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

  const run = async (fn: () => Promise<ThemeProject>) => {
    setIsLoading(true);
    setError(null);
    try {
      const project = await fn();
      onInitializeProject(project);
      onClose();
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDemo = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
    return readThemeFiles([{ name: url.split('/').pop()!, blob: await res.blob() }]);
  };

  const handleCreateNewProject = () =>
    run(async () => {
      let project: ThemeProject;
      if (starterTemplate === 'vertical') {
        project = await fetchDemo('/demos/vertical-oem.zip');
      } else {
        const screens = (['home', 'lock', 'apps'] as const).map(newScreen);
        project = { id: `project-${Date.now()}`, name: '', author: '', screens, activeScreenId: screens[0].id };
      }
      project.name = themeName.trim() || 'Untitled Theme';
      project.author = authorName.trim() || 'Unknown';
      // Fresh theme metadata; layout credits (PatchName/AuthorName) stay with the template's author.
      project.screens = project.screens.map((s) => ({ ...s, info: {} }));
      return project;
    });

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    run(() => readThemeFiles(Array.from(files).map((f) => ({ name: f.name, blob: f as Blob }))));
  };

  const handleLoadDemo = (demo: 'vertical' | 'purpleskies') =>
    run(() => fetchDemo(demo === 'vertical' ? '/demos/vertical-oem.zip' : '/demos/purple-skies.zip'));

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

      <div className="w-full max-w-lg bg-[var(--panel-2)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden flex flex-col text-xs text-[var(--text)]">
        {/* Header */}
        <div className="h-12 px-5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--panel)]">
          <span className="font-semibold text-sm text-[var(--text)]">SwitchTheme Studio Setup</span>
          {canClose && (
            <button onClick={onClose} className="text-[var(--text-2)] hover:text-[var(--text)] p-1 rounded transition">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] bg-[var(--panel)]">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 py-2.5 font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'new'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-2)] hover:text-[var(--text)]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Project</span>
          </button>
          <button
            onClick={() => setActiveTab('open')}
            className={`flex-1 py-2.5 font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'open'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-2)] hover:text-[var(--text)]'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open from PC</span>
          </button>
          <button
            onClick={() => setActiveTab('demos')}
            className={`flex-1 py-2.5 font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'demos'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-2)] hover:text-[var(--text)]'
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
                <label className="text-[12px] text-[var(--text-2)] block mb-1">Theme Name</label>
                <input
                  type="text"
                  value={themeName}
                  onChange={(e) => setThemeName(e.target.value)}
                  className="w-full bg-[var(--panel)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  placeholder="e.g. Horizon Clean Dark"
                />
              </div>

              <div>
                <label className="text-[12px] text-[var(--text-2)] block mb-1">Author Name</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-full bg-[var(--panel)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  placeholder="Your handle or username"
                />
              </div>

              <div>
                <label className="text-[12px] text-[var(--text-2)] block mb-1.5">Starter Layout</label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setStarterTemplate('vertical')}
                    className={`p-3 rounded-lg border cursor-pointer transition flex flex-col gap-1 ${
                      starterTemplate === 'vertical'
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                        : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--text-2)] hover:border-[var(--text-3)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <LayoutGrid className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Vertical OEM</span>
                    </div>
                    <span className="text-[12px] text-[var(--text-2)]">
                      Start from the Vertical-OEM layout (portrait game cards)
                    </span>
                  </div>

                  <div
                    onClick={() => setStarterTemplate('stock')}
                    className={`p-3 rounded-lg border cursor-pointer transition flex flex-col gap-1 ${
                      starterTemplate === 'stock'
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                        : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--text-2)] hover:border-[var(--text-3)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <Box className="w-3.5 h-3.5 text-blue-400" />
                      <span>Stock layout</span>
                    </div>
                    <span className="text-[12px] text-[var(--text-2)]">
                      Home, Lock and All Apps with no changes
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
              className="border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] rounded-lg p-8 text-center space-y-2 cursor-pointer transition bg-[var(--panel)] group"
            >
              <FileUp className="w-8 h-8 text-[var(--text-3)] group-hover:text-[var(--accent)] mx-auto transition" />
              <p className="text-xs font-semibold text-[var(--text)]">Click or drag &amp; drop .nxtheme or .zip files</p>
              <p className="text-[12px] text-[var(--text-2)]">
                Pick several .nxtheme files (one per screen) or a Themezer pack .zip
              </p>
            </div>
          )}

          {activeTab === 'demos' && (
            <div className="space-y-2">
              <div
                onClick={() => handleLoadDemo('vertical')}
                className="p-3 rounded-lg bg-[var(--panel-2)] hover:bg-[var(--panel-2)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-xs text-[var(--text)]">Vertical-OEM (by sodasoba)</div>
                  <div className="text-[12px] text-[var(--text-2)]">
                    Layout-only theme: no image, keeps the console background
                  </div>
                </div>
                <span className="px-2 py-1 rounded bg-[var(--accent)]/10 text-[var(--accent)] font-medium text-[12px]">
                  Load
                </span>
              </div>

              <div
                onClick={() => handleLoadDemo('purpleskies')}
                className="p-3 rounded-lg bg-[var(--panel-2)] hover:bg-[var(--panel-2)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-xs text-[var(--text)]">Purple Skies (by Hsushi)</div>
                  <div className="text-[12px] text-[var(--text-2)]">
                    Image theme: custom backgrounds on 4 screens plus FairTech/Doge layouts
                  </div>
                </div>
                <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-medium text-[12px]">
                  Load
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded bg-red-950/40 border border-red-500/40 text-red-300 text-[12px]">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 px-5 border-t border-[var(--border)] flex items-center justify-end gap-2 bg-[var(--panel)]">
          {canClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded hover:bg-[var(--panel-2)] text-[var(--text-2)] transition"
            >
              Cancel
            </button>
          )}
          {activeTab === 'new' && (
            <button
              onClick={handleCreateNewProject}
              disabled={isLoading}
              className="px-4 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text)] font-semibold transition flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
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
