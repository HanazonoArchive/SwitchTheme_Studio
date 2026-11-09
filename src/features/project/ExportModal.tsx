import React, { useMemo, useState } from 'react';
import { X, Download, FileArchive, PackageCheck, AlertTriangle, XCircle } from 'lucide-react';
import type { ThemeProject, ThemeScreen } from '../../types/theme';
import type { SystemLayoutMap } from '../../lib/layout/systemLayouts';
import { buildNxTheme, buildThemePack, checkScreen, downloadBlob, safeFileName } from '../../lib/theme/nxtheme';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ThemeProject;
  activeScreen: ThemeScreen;
  systemLayouts: SystemLayoutMap;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, project, activeScreen, systemLayouts }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checks = useMemo(() => project.screens.map((s) => ({ screen: s, issues: checkScreen(s, systemLayouts[s.target]) })), [project, systemLayouts]);

  if (!isOpen) return null;

  const activeBlocked = checkScreen(activeScreen, systemLayouts[activeScreen.target]).some((c) => c.level === 'error');
  const exportable = checks.filter((c) => !c.issues.some((i) => i.level === 'error')).length;

  const run = async (fn: () => Promise<void>) => {
    setIsExporting(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      console.error(e);
      setError((e as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[var(--panel-2)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden flex flex-col text-xs text-[var(--text)]">
        <div className="h-12 px-5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--panel)]">
          <span className="font-semibold text-sm text-[var(--text)]">Export Theme</span>
          <button onClick={onClose} className="text-[var(--text-2)] hover:text-[var(--text)] p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {checks.some((c) => c.issues.length) && (
            <div className="space-y-1.5">
              {checks.flatMap(({ screen, issues }) =>
                issues.map((i) => (
                  <div key={screen.id + i.message} className={`flex gap-1.5 text-[12px] ${i.level === 'error' ? 'text-red-300' : 'text-amber-300'}`}>
                    {i.level === 'error' ? <XCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                    <span>{i.message}</span>
                  </div>
                )),
              )}
            </div>
          )}

          <button
            disabled={isExporting || activeBlocked}
            onClick={() =>
              run(async () => downloadBlob(await buildNxTheme(project, activeScreen), `${safeFileName(project.name)} (${activeScreen.name}).nxtheme`))
            }
            className="w-full text-left p-3.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)] transition flex items-center justify-between disabled:opacity-40 disabled:hover:border-[var(--border)]"
          >
            <div className="flex items-center gap-3">
              <FileArchive className="w-6 h-6 text-[var(--accent)]" />
              <div>
                <p className="font-medium text-[var(--text)] text-xs">{activeScreen.name} (.nxtheme)</p>
                <p className="text-[12px] text-[var(--text-3)]">Active screen only</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-2)]" />
          </button>

          <button
            disabled={isExporting || exportable === 0}
            onClick={() => run(async () => downloadBlob(await buildThemePack(project, systemLayouts), `${safeFileName(project.name)}.zip`))}
            className="w-full text-left p-3.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)] transition flex items-center justify-between disabled:opacity-40 disabled:hover:border-[var(--border)]"
          >
            <div className="flex items-center gap-3">
              <PackageCheck className="w-6 h-6 text-emerald-400" />
              <div>
                <p className="font-medium text-[var(--text)] text-xs">Full theme pack (.zip)</p>
                <p className="text-[12px] text-[var(--text-3)]">
                  {exportable} of {project.screens.length} screens, ready for sd:/themes/
                </p>
              </div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-2)]" />
          </button>

          <p className="text-[12px] text-[var(--text-3)] leading-relaxed">
            Backgrounds are written as a baseline 1280×720 image.jpg with your adjustments applied. Untouched valid images and DXT1 .dds files are copied as-is.
          </p>
          {error && <div className="p-2 rounded bg-red-950/40 border border-red-500/40 text-red-300 text-[12px]">{error}</div>}
          {isExporting && <div className="text-[12px] text-[var(--text-2)]">Building…</div>}
        </div>
      </div>
    </div>
  );
};
