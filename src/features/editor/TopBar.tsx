import React, { useRef, useState } from 'react';
import { BookOpen, Bug, Cpu, Download, FolderGit2, ExternalLink, FolderOpen, Keyboard, LifeBuoy, MoreHorizontal, Redo2, Shapes, ShieldAlert, Undo2, X } from 'lucide-react';
import type { ThemeProject } from '../../types/theme';
import { ContextMenu } from './ContextMenu';
import { INJECTOR_URL, ISSUES_URL, REPO_URL, type HelpTab } from './help';

interface TopBarProps {
  project: ThemeProject | null;
  mode: 'edit' | 'preview';
  onModeChange: (mode: 'edit' | 'preview') => void;
  onOpenFiles: (files: File[]) => void;
  onCloseProject: () => void;
  onOpenExportModal: () => void;
  onRenameProject: (name: string, author: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onHelp: (tab: HelpTab) => void;
  onConsoleFiles: () => void;
  /** How many of the console's layout files are loaded. */
  consoleStatus: { loaded: number; total: number; version?: string };
}

const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

export const TopBar: React.FC<TopBarProps> = ({ project, mode, onModeChange, onOpenFiles, onCloseProject, onOpenExportModal, onRenameProject, canUndo, canRedo, onUndo, onRedo, onHelp, onConsoleFiles, consoleStatus }) => {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="h-11 bg-[var(--panel)] border-b border-[var(--border)] px-3 grid grid-cols-[1fr_auto_1fr] items-center shrink-0 z-20">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[13px] font-semibold text-[var(--text)] whitespace-nowrap">SwitchTheme Studio</span>
        <button className="ui-badge-exp" title="Experimental: still a work in progress. Test every theme on your console. Click for the disclaimer." onClick={() => onHelp('legal')}>
          Experimental
        </button>
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
            <button onClick={onCloseProject} className="ui-icon-btn" title="Close (it stays in Recent on the start page)">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      <div className={`flex items-center gap-0.5 p-0.5 rounded-md bg-[var(--panel-2)] ${project ? '' : 'invisible'}`}>
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
        <input ref={fileRef} type="file" multiple accept=".nxtheme,.zip" className="hidden" onChange={(e) => (e.target.files?.length && onOpenFiles(Array.from(e.target.files)), (e.target.value = ''))} />
        <button onClick={() => fileRef.current?.click()} className="ui-btn" title="Open an .nxtheme">
          <FolderOpen className="w-3.5 h-3.5" />
          Open
        </button>
        {project && (
          <button onClick={onOpenExportModal} className="ui-btn ui-btn-primary">
            <Download className="w-3.5 h-3.5" />
            Export .nxtheme
          </button>
        )}
        <button
          className="ui-btn"
          onClick={onConsoleFiles}
          title={consoleStatus.loaded ? `${consoleStatus.loaded} of ${consoleStatus.total} layout files from your console${consoleStatus.version ? ` (firmware ${consoleStatus.version})` : ''}` : 'Using the built-in presets. Load your console\'s files for an exact preview.'}
        >
          <Cpu className="w-3.5 h-3.5" style={{ color: consoleStatus.loaded === consoleStatus.total ? 'var(--ok)' : consoleStatus.loaded ? 'var(--warn)' : undefined }} />
          Console files
          <span className="text-[11px] text-[var(--text-3)] tabular-nums">{consoleStatus.loaded ? `${consoleStatus.loaded}/${consoleStatus.total}` : 'preset'}</span>
        </button>
        <button className={`ui-icon-btn ${menu ? 'ui-on' : ''}`} title="Help, links and disclaimer" onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenu(menu ? null : { x: r.right - 240, y: r.bottom + 4 });
        }}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menu && (
          <ContextMenu
            at={menu}
            onClose={() => setMenu(null)}
            items={[
              { type: 'item', label: 'Help', icon: <BookOpen className="w-3.5 h-3.5" />, onClick: () => onHelp('start') },
              { type: 'item', label: 'If something goes wrong', hint: 'black screen…', icon: <LifeBuoy className="w-3.5 h-3.5" />, onClick: () => onHelp('trouble') },
              { type: 'item', label: 'Keyboard shortcuts', icon: <Keyboard className="w-3.5 h-3.5" />, onClick: () => onHelp('keys') },
              { type: 'item', label: 'What outlines mean', icon: <Shapes className="w-3.5 h-3.5" />, onClick: () => onHelp('outlines') },
              { type: 'sep' },
              { type: 'item', label: 'GitHub repository', icon: <FolderGit2 className="w-3.5 h-3.5" />, hint: '↗', onClick: () => open(REPO_URL) },
              { type: 'item', label: 'Report a problem', icon: <Bug className="w-3.5 h-3.5" />, hint: '↗', onClick: () => open(ISSUES_URL) },
              { type: 'item', label: 'SwitchThemeInjector', icon: <ExternalLink className="w-3.5 h-3.5" />, hint: '↗', onClick: () => open(INJECTOR_URL) },
              { type: 'sep' },
              { type: 'item', label: 'Disclaimer and caution', icon: <ShieldAlert className="w-3.5 h-3.5" />, onClick: () => onHelp('legal') },
            ]}
          />
        )}
      </div>
    </header>
  );
};
