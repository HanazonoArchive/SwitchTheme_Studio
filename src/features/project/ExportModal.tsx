import React, { useState } from 'react';
import { X, Download, FileArchive, PackageCheck } from 'lucide-react';
import JSZip from 'jszip';
import type { ThemeProject, ThemeScreen } from '../../types/theme';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ThemeProject;
  activeScreen: ThemeScreen;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
  activeScreen,
}) => {
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const buildSingleZip = async (screen: ThemeScreen): Promise<Blob> => {
    const zip = new JSZip();

    const infoJson = {
      Version: 17,
      ThemeName: project.name,
      Author: project.author,
      Target: screen.target,
      LayoutInfo: screen.name,
    };
    zip.file('info.json', JSON.stringify(infoJson, null, 2));

    zip.file('layout.json', JSON.stringify(screen.layoutJson, null, 2));

    if (screen.wallpaperUrl) {
      try {
        const res = await fetch(screen.wallpaperUrl);
        const blob = await res.blob();
        zip.file(screen.wallpaperFileName || 'preview.jpg', blob);
      } catch (e) {
        console.warn('Could not bundle wallpaper blob', e);
      }
    }

    return await zip.generateAsync({ type: 'blob' });
  };

  const handleExportSingle = async () => {
    setIsExporting(true);
    try {
      const blob = await buildSingleZip(activeScreen);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}_${activeScreen.target}.nxtheme`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPack = async () => {
    setIsExporting(true);
    try {
      const packZip = new JSZip();
      const folder = packZip.folder(project.name) || packZip;

      for (const screen of project.screens) {
        const nxBlob = await buildSingleZip(screen);
        folder.file(`${screen.target}.nxtheme`, nxBlob);
      }

      folder.file(
        'README.txt',
        `Theme: ${project.name}\nAuthor: ${project.author}\n\nInstall:\nCopy .nxtheme files to /themes/${project.name}/ on your Switch SD Card.\nInstall via NXThemesInstaller.`
      );

      const blob = await packZip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}_Pack.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      console.error(err);
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
          <div
            onClick={!isExporting ? handleExportSingle : undefined}
            className="p-3.5 rounded-lg border border-[#202532] bg-[#141720] hover:border-[#10b981] cursor-pointer transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <FileArchive className="w-6 h-6 text-[#10b981]" />
              <div>
                <p className="font-medium text-white text-xs">{activeScreen.name} (.nxtheme)</p>
                <p className="text-[11px] text-slate-500">Export active screen only</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </div>

          <div
            onClick={!isExporting ? handleExportPack : undefined}
            className="p-3.5 rounded-lg border border-[#202532] bg-[#141720] hover:border-[#10b981] cursor-pointer transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <PackageCheck className="w-6 h-6 text-emerald-400" />
              <div>
                <p className="font-medium text-white text-xs">Full Theme Pack (ZIP)</p>
                <p className="text-[11px] text-slate-500">All {project.screens.length} screens bundled for SD card</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="h-12 px-5 border-t border-[#1b1f28] flex items-center justify-end bg-[#0c0e12]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded hover:bg-[#161a22] text-slate-400 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

