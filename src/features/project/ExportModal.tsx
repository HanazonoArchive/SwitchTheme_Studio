import React, { useMemo, useState } from 'react';
import { X, Download, FileArchive, PackageCheck, AlertTriangle, XCircle } from 'lucide-react';
import type { ThemeProject, ThemeScreen } from '../../types/theme';
import { buildNxTheme, buildThemePack, checkScreen, downloadBlob, safeFileName } from '../../lib/theme/nxtheme';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ThemeProject;
  activeScreen: ThemeScreen;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, project, activeScreen }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checks = useMemo(() => project.screens.map((s) => ({ screen: s, issues: checkScreen(s) })), [project]);

  if (!isOpen) return null;

  const activeBlocked = checkScreen(activeScreen).some((c) => c.level === 'error');
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
      <div className="w-full max-w-md bg-[#101319] border border-[#202532] rounded-lg shadow-2xl overflow-hidden flex flex-col text-xs text-slate-300">
        <div className="h-12 px-5 border-b border-[#1b1f28] flex items-center justify-between bg-[#0c0e12]">
          <span className="font-semibold text-sm text-white">Export Theme</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {checks.some((c) => c.issues.length) && (
            <div className="space-y-1.5">
              {checks.flatMap(({ screen, issues }) =>
                issues.map((i) => (
                  <div key={screen.id + i.message} className={`flex gap-1.5 text-[11px] ${i.level === 'error' ? 'text-red-300' : 'text-amber-300'}`}>
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
            className="w-full text-left p-3.5 rounded-lg border border-[#202532] bg-[#141720] hover:border-[#10b981] transition flex items-center justify-between disabled:opacity-40 disabled:hover:border-[#202532]"
          >
            <div className="flex items-center gap-3">
              <FileArchive className="w-6 h-6 text-[#10b981]" />
              <div>
                <p className="font-medium text-white text-xs">{activeScreen.name} (.nxtheme)</p>
                <p className="text-[11px] text-slate-500">Active screen only</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </button>

          <button
            disabled={isExporting || exportable === 0}
            onClick={() => run(async () => downloadBlob(await buildThemePack(project), `${safeFileName(project.name)}.zip`))}
            className="w-full text-left p-3.5 rounded-lg border border-[#202532] bg-[#141720] hover:border-[#10b981] transition flex items-center justify-between disabled:opacity-40 disabled:hover:border-[#202532]"
          >
            <div className="flex items-center gap-3">
              <PackageCheck className="w-6 h-6 text-emerald-400" />
              <div>
                <p className="font-medium text-white text-xs">Full theme pack (.zip)</p>
                <p className="text-[11px] text-slate-500">
                  {exportable} of {project.screens.length} screens, ready for sd:/themes/
                </p>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </button>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Backgrounds are written as a baseline 1280×720 image.jpg with your adjustments applied. Untouched valid images and DXT1 .dds files are copied as-is.
          </p>
          {error && <div className="p-2 rounded bg-red-950/40 border border-red-500/40 text-red-300 text-[11px]">{error}</div>}
          {isExporting && <div className="text-[11px] text-slate-400">Building…</div>}
        </div>
      </div>
    </div>
  );
};
