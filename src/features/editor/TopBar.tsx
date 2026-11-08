import React from 'react';
import { Upload, Settings, Plus, X, MonitorPlay, PenTool } from 'lucide-react';
import type { ThemeProject } from '../../types/theme';

interface TopBarProps {
  project: ThemeProject | null;
  activeTab: 'editor' | 'motion';
  onSelectTab: (tab: 'editor' | 'motion') => void;
  onOpenProjectModal: () => void;
  onCloseProject: () => void;
  onOpenExportModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  project,
  activeTab,
  onSelectTab,
  onOpenProjectModal,
  onCloseProject,
  onOpenExportModal,
}) => {
  return (
    <header className="h-12 bg-[#0c0e12] border-b border-[#1b1f28] px-4 flex items-center justify-between select-none shrink-0 z-20">
      {/* Left: App Brand & Project Tabs */}
      <div className="flex items-center gap-3">
        <span className="font-semibold text-sm tracking-tight text-white">
          SwitchTheme Studio
        </span>

        <div className="h-4 w-[1px] bg-[#1e232e] mx-1" />

        {/* Tab Strip with Close & New Tab */}
        <div className="flex items-center gap-1.5">
          {project ? (
            <div className="flex items-center bg-[#141720] border border-[#202532] rounded-md px-3 py-1 gap-2 text-xs text-white shadow-sm">
              <span className="font-medium text-slate-200">{project.name}</span>
              <button
                onClick={onCloseProject}
                className="text-slate-400 hover:text-red-400 transition p-0.5 rounded hover:bg-[#1f2430]"
                title="Close project"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic px-2">No active project</div>
          )}

          {/* Add New Tab / Open Project Button */}
          <button
            onClick={onOpenProjectModal}
            className="p-1.5 rounded-md bg-[#13161d] hover:bg-[#1a1f29] border border-[#202532] text-slate-400 hover:text-white transition"
            title="Create or open project"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center: Mode Tabs (Theme Editor vs Live Simulator) */}
      <div className="flex items-center bg-[#13161d] border border-[#1e232e] rounded-lg p-0.5">
        <button
          onClick={() => onSelectTab('editor')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            activeTab === 'editor'
              ? 'bg-[#1e2430] text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PenTool className="w-3.5 h-3.5 text-[#10b981]" />
          <span>Theme Editor</span>
        </button>

        <button
          onClick={() => onSelectTab('motion')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            activeTab === 'motion'
              ? 'bg-[#1e2430] text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MonitorPlay className="w-3.5 h-3.5 text-blue-400" />
          <span>Live Simulator</span>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenExportModal}
          disabled={!project}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#10b981] hover:bg-[#0ea572] text-[#0c0e12] text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-40"
        >
          <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Export</span>
        </button>

        <button
          onClick={onOpenProjectModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#13161d] hover:bg-[#1a1f29] border border-[#202532] text-slate-300 text-xs font-medium transition"
          title="Project settings"
        >
          <Settings className="w-3.5 h-3.5 text-slate-400" />
          <span>Settings</span>
        </button>
      </div>
    </header>
  );
};
