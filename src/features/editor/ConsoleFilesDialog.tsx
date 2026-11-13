import React, { useEffect, useRef, useState } from 'react';
import { Check, Cpu, FileArchive, FolderOpen, Trash2, Upload, X } from 'lucide-react';
import { Note } from '../../components/Note';
import { EXPECTED_FILES, type ConsoleSlot } from '../../lib/layout/consoleDump';
import type { SystemLayoutMap } from '../../lib/layout/systemLayouts';

/**
 * One place for the console's layout files: drop the zipped "extracted" folder NXThemes Installer
 * makes (or the folder, or single .szs files). Each file replaces the built-in preset for its
 * screen; anything missing keeps using the preset.
 */
export const ConsoleFilesDialog: React.FC<{
  consoleLayouts: SystemLayoutMap;
  stockLayouts: SystemLayoutMap;
  version?: string;
  busy: boolean;
  error: string | null;
  report: string | null;
  onFiles: (files: File[]) => void;
  onForget: (slot: ConsoleSlot | 'all') => void;
  onClose: () => void;
}> = ({ consoleLayouts, stockLayouts, version, busy, error, report, onFiles, onForget, onClose }) => {
  const zipInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopImmediatePropagation(), onClose());
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  useEffect(() => {
    dirInput.current?.setAttribute('webkitdirectory', '');
  }, []);
  const loaded = EXPECTED_FILES.filter((f) => consoleLayouts[f.slot]).length;
  // Versions come from ver.cfg (the installer's per-file detection is only a category like "20.0+").
  const firmwares = new Set(EXPECTED_FILES.map((f) => consoleLayouts[f.slot]?.consoleVersion).filter(Boolean));
  const stockVersion = Object.values(stockLayouts).find((s) => s?.consoleVersion)?.consoleVersion;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Console files" className="w-[640px] max-w-full max-h-full flex flex-col rounded-xl overflow-hidden bg-[var(--panel)] border border-[var(--border)] shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        <div className="h-11 px-4 flex items-center justify-between border-b border-[var(--border)] shrink-0">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <Cpu className="w-4 h-4 text-[var(--accent)]" /> Console files
          </span>
          <button className="ui-icon-btn" onClick={onClose} title="Close (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-[12.5px]">
          <p className="text-[var(--text-2)] leading-relaxed">
            Your console's own layout files make the preview use its exact layouts, animations and pictures for your firmware. Without them the studio uses its
            built-in presets{stockVersion ? ` (firmware ${stockVersion})` : ''}.
          </p>
          <ol className="list-decimal pl-5 text-[var(--text-2)] space-y-0.5">
            <li>On the console, open NXThemes Installer → <b>Extract home menu</b>.</li>
            <li>
              Copy <span className="font-mono text-[var(--text)]">sd:/themes/systemData/extracted</span> to your computer and zip it.
            </li>
            <li>Drop the .zip here (or pick the folder, or single .szs files).</li>
          </ol>

          <div
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
            }}
            className={`rounded-lg border-2 border-dashed p-5 flex flex-col items-center gap-2 text-center transition-colors ${over ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)]'}`}
          >
            <FileArchive className="w-6 h-6 text-[var(--text-3)]" />
            <div className="text-[var(--text)]">{busy ? 'Reading…' : 'Drop extracted.zip here'}</div>
            <div className="flex gap-2">
              <button className="ui-btn" disabled={busy} onClick={() => zipInput.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> Choose .zip or .szs
              </button>
              <button className="ui-btn" disabled={busy} onClick={() => dirInput.current?.click()}>
                <FolderOpen className="w-3.5 h-3.5" /> Choose folder
              </button>
            </div>
            <input ref={zipInput} type="file" multiple accept=".zip,.szs,.cfg" className="hidden" onChange={(e) => (e.target.files && onFiles(Array.from(e.target.files)), (e.target.value = ''))} />
            <input ref={dirInput} type="file" multiple className="hidden" onChange={(e) => (e.target.files && onFiles(Array.from(e.target.files)), (e.target.value = ''))} />
          </div>

          {error && <Note tone="error" title="Couldn't read that">{error}</Note>}
          {report && !error && <Note tone="ok" title="Loaded">{report}</Note>}
          {firmwares.size > 1 && (
            <Note tone="warn" title="Mixed firmware">
              These files come from different firmware versions ({[...firmwares].join(', ')}). Load one complete dump so every screen matches the same console.
            </Note>
          )}

          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            <div className="h-8 px-3 flex items-center justify-between bg-[var(--panel-2)] text-[12px]">
              <span className="font-semibold text-[var(--text-2)]">
                {loaded}/{EXPECTED_FILES.length} from your console{version ? ` · firmware ${version}` : ''}
              </span>
              {loaded > 0 && (
                <button className="flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--danger)]" onClick={() => onForget('all')}>
                  <Trash2 className="w-3.5 h-3.5" /> Remove all
                </button>
              )}
            </div>
            {EXPECTED_FILES.map((f) => {
              const mine = consoleLayouts[f.slot];
              const stock = stockLayouts[f.slot];
              return (
                <div key={f.file} className="group h-9 px-3 flex items-center gap-2 border-t border-[var(--border)] hover:bg-[var(--hover)]">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${mine ? 'bg-[var(--ok)] text-black' : 'border border-[var(--text-3)]'}`}>{mine && <Check className="w-3 h-3" />}</span>
                  <span className="font-mono text-[12px] w-[140px] shrink-0 text-[var(--text)]">{f.file}</span>
                  <span className="flex-1 min-w-0 truncate text-[var(--text-2)]">{f.what}</span>
                  <span className="text-[11px] text-[var(--text-3)] whitespace-nowrap">{mine ? `Your console${mine.consoleVersion ? ` · ${mine.consoleVersion}` : ''}` : stock ? 'Built-in preset' : 'Not available'}</span>
                  {mine && (
                    <button className="ui-row-action ui-row-action-danger !w-6 opacity-0 group-hover:opacity-100" title="Use the built-in preset" onClick={() => onForget(f.slot)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[12px] text-[var(--text-3)] leading-relaxed">
            The files stay in this browser and are never uploaded or put into an exported theme. They're Nintendo's files: don't share them.
          </p>
        </div>
      </div>
    </div>
  );
};
