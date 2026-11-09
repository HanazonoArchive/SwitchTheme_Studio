import React, { useState } from 'react';
import { Download, FolderOpen, Redo2, Undo2, X } from 'lucide-react';
import type { ThemeProject } from '../../types/theme';

interface TopBarProps {
  project: ThemeProject | null;
  mode: 'edit' | 'preview';
  onModeChange: (mode: 'edit' | 'preview') => void;
  onOpenProjectModal: () => void;
  onCloseProject: () => void;
  onOpenExportModal: () => void;
  onRenameProject: (name: string, author: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ project, mode, onModeChange, onOpenProjectModal, onCloseProject, onOpenExportModal, onRenameProject, canUndo, canRedo, onUndo, onRedo }) => {
  const [editing, setEditing] = useState(false);
  return (
    <header className="h-11 bg-[var(--panel)] border-b border-[var(--border)] px-3 grid grid-cols-[1fr_auto_1fr] items-center shrink-0 z-20">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[13px] font-semibold text-[var(--text)] whitespace-nowrap">SwitchTheme Studio</span>
        {project && (
          <>
            <span className="text-[var(--text-3)]">/</span>
            {editing ? (
              <input
                autoFocus
                defaultValue={project.name}
                onBlur={(e) => {
                  onRenameProject(e.target.value.trim() || project.name, project.author);
                  setEditing(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="ui-input w-48"
              />
            ) : (
              <button onClick={() => setEditing(true)} className="text-[13px] text-[var(--text-2)] hover:text-[var(--text)] truncate" title="Rename">
                {project.name}
              </button>
            )}
            <button onClick={onCloseProject} className="ui-icon-btn" title="Close theme">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[var(--panel-2)]">
        {(['edit', 'preview'] as const).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`h-7 px-3 rounded text-[12px] ${mode === m ? 'bg-[var(--panel)] text-[var(--text)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]' : 'text-[var(--text-2)] hover:text-[var(--text)]'}`}
            title={m === 'edit' ? 'Select, move and resize layers' : 'Use it like the console: click games, arrow keys move focus'}
          >
            {m === 'edit' ? 'Edit' : 'Preview'}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-end gap-1">
        {project && (
          <>
            <button onClick={onUndo} disabled={!canUndo} className="ui-icon-btn" title="Undo (Ctrl+Z)">
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className="ui-icon-btn" title="Redo (Ctrl+Shift+Z)">
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <span className="ui-sep" />
          </>
        )}
        <button onClick={onOpenProjectModal} className="ui-btn" title="New or open a theme">
          <FolderOpen className="w-3.5 h-3.5" />
          Open
        </button>
        {project && (
          <button onClick={onOpenExportModal} className="ui-btn ui-btn-primary">
            <Download className="w-3.5 h-3.5" />
            Export .nxtheme
          </button>
        )}
      </div>
    </header>
  );
};
