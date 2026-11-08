import JSZip from 'jszip';
import type { ScreenTarget, ThemeProject, ThemeScreen } from '../../types/theme';
import { NO_ADJUSTMENTS } from '../../types/theme';
import { hasLayoutChanges, type LayoutPatch } from '../layout/patch';
import { normaliseTarget, TARGET_ORDER, targetInfo } from '../layout/targets';
import { parseSarc } from '../nx/sarc';
import { checkCompatibility } from '../layout/compatibility';
import type { SystemLayout, SystemLayoutMap } from '../layout/systemLayouts';
import { exportWallpaper, loadWallpaper } from './images';

/** info.json format version written by current injector/installer (CommonInfo.NxThemeFormatVersion). */
export const NXTHEME_VERSION = 17;

const KNOWN_FILES = new Set(['info.json', 'layout.json', 'common.json', 'image.jpg', 'image.dds', 'preview.png', 'preview.jpg']);

/** Reads a .nxtheme. Supports both the zip form (installer 5.0+) and the legacy Yaz0/SARC form. */
async function readContainer(blob: Blob): Promise<Map<string, Blob>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const out = new Map<string, Blob>();
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await JSZip.loadAsync(bytes);
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      out.set(entry.name.split('/').pop()!, await entry.async('blob'));
    }
  } else {
    for (const [name, data] of parseSarc(bytes)) out.set(name, new Blob([data.slice()]));
  }
  return out;
}

async function readJson<T>(files: Map<string, Blob>, name: string): Promise<T | null> {
  const b = files.get(name);
  if (!b) return null;
  try {
    // Some tools write a UTF-8 BOM.
    return JSON.parse((await b.text()).replace(/^﻿/, '')) as T;
  } catch (e) {
    throw new Error(`${name} is not valid JSON: ${(e as Error).message}`);
  }
}

export async function readNxTheme(fileName: string, blob: Blob): Promise<ThemeScreen> {
  const files = await readContainer(blob);
  const info = (await readJson<Record<string, unknown>>(files, 'info.json')) ?? {};
  const layout = (await readJson<LayoutPatch>(files, 'layout.json')) ?? {};
  const common = await readJson<LayoutPatch>(files, 'common.json');
  const target = normaliseTarget(info.Target as string | undefined, fileName);

  const imageName = files.has('image.jpg') ? 'image.jpg' : files.has('image.dds') ? 'image.dds' : null;
  const wallpaper = imageName ? await loadWallpaper(files.get(imageName)!, imageName) : null;

  const extraFiles = [...files.entries()].filter(([n]) => !KNOWN_FILES.has(n.toLowerCase())).map(([name, b]) => ({ name, blob: b }));

  return {
    id: `screen-${target}-${Math.random().toString(36).slice(2, 8)}`,
    target,
    name: targetInfo(target).label,
    wallpaper,
    adjustments: { ...NO_ADJUSTMENTS },
    layout,
    common,
    extraFiles,
    info,
  };
}

/** Expands .zip packs (e.g. Themezer downloads) and reads every .nxtheme inside. */
export async function readThemeFiles(inputs: { name: string; blob: Blob }[]): Promise<ThemeProject> {
  const themes: { name: string; blob: Blob }[] = [];
  for (const f of inputs) {
    if (f.name.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(f.blob);
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && entry.name.toLowerCase().endsWith('.nxtheme')) themes.push({ name: entry.name, blob: await entry.async('blob') });
      }
    } else {
      themes.push(f);
    }
  }
  if (themes.length === 0) throw new Error('No .nxtheme files found.');

  const screens: ThemeScreen[] = [];
  let name = '';
  let author = '';
  for (const t of themes) {
    const screen = await readNxTheme(t.name, t.blob);
    // One screen per target; later files replace earlier ones.
    const idx = screens.findIndex((s) => s.target === screen.target);
    if (idx >= 0) screens[idx] = screen;
    else screens.push(screen);
    name ||= String(screen.info.ThemeName ?? '');
    author ||= String(screen.info.Author ?? '');
  }
  screens.sort((a, b) => TARGET_ORDER.indexOf(a.target) - TARGET_ORDER.indexOf(b.target));

  return {
    id: `project-${Date.now()}`,
    name: name || 'Custom Theme',
    author: author || 'Unknown',
    screens,
    activeScreenId: screens[0].id,
  };
}

export function newScreen(target: ScreenTarget): ThemeScreen {
  return {
    id: `screen-${target}-${Math.random().toString(36).slice(2, 8)}`,
    target,
    name: targetInfo(target).label,
    wallpaper: null,
    adjustments: { ...NO_ADJUSTMENTS },
    layout: {},
    common: null,
    extraFiles: [],
    info: {},
  };
}

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

export interface ExportCheck {
  level: 'error' | 'warning';
  message: string;
}

export function checkScreen(screen: ThemeScreen, sys?: SystemLayout): ExportCheck[] {
  const out: ExportCheck[] = [];
  if (sys) {
    const dropped = new Set(checkCompatibility(screen.layout, sys).filter((c) => c.severity === 'critical').map((c) => c.file));
    for (const anim of dropped) out.push({ level: 'warning', message: `${screen.name}: ${anim} targets panes or groups missing on firmware ${sys.firmwareHint}; the installer will drop it.` });
  }
  const layoutChanged = hasLayoutChanges(screen.layout);
  if (!screen.wallpaper && !layoutChanged && !screen.extraFiles.length && !hasLayoutChanges(screen.common ?? undefined)) {
    out.push({ level: 'error', message: `${screen.name} has no background and no layout changes, so the installer has nothing to install.` });
  }
  if (screen.wallpaper?.format === 'dds' && screen.wallpaper.ddsEncoding !== 'DXT1') {
    out.push({ level: 'error', message: `${screen.name}: DDS backgrounds must be DXT1 (this one is ${screen.wallpaper.ddsEncoding}).` });
  }
  if (screen.common && !targetInfo(screen.target).allowCommon) {
    out.push({ level: 'warning', message: `${screen.name}: common.json is only used for Home, User page and Player select; it will be dropped.` });
  }
  return out;
}

function layoutLabel(l: LayoutPatch) {
  if (!l.PatchName) return undefined;
  return l.AuthorName ? `${l.PatchName} by ${l.AuthorName}` : l.PatchName;
}

export async function buildNxTheme(project: ThemeProject, screen: ThemeScreen): Promise<Blob> {
  const zip = new JSZip();
  const info: Record<string, unknown> = {
    ...screen.info,
    Version: NXTHEME_VERSION,
    Target: screen.target,
    Author: project.author,
    ThemeName: project.name,
  };
  const label = hasLayoutChanges(screen.layout) ? layoutLabel(screen.layout) : undefined;
  if (label) info.LayoutInfo = label;
  else delete info.LayoutInfo;
  zip.file('info.json', JSON.stringify(info));

  if (hasLayoutChanges(screen.layout)) {
    const layout: LayoutPatch = {
      ...screen.layout,
      PatchName: screen.layout.PatchName || `${project.name} (${screen.name})`,
      AuthorName: screen.layout.AuthorName || project.author,
      TargetName: targetInfo(screen.target).szs,
    };
    zip.file('layout.json', JSON.stringify(layout));
  }

  if (screen.common && targetInfo(screen.target).allowCommon && hasLayoutChanges(screen.common)) {
    zip.file('common.json', JSON.stringify(screen.common));
  }

  if (screen.wallpaper) {
    const img = await exportWallpaper(screen.wallpaper, screen.adjustments);
    zip.file(img.name, img.blob);
  }

  for (const f of screen.extraFiles) zip.file(f.name, f.blob);

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'theme';
}

export async function buildThemePack(project: ThemeProject, systemLayouts: SystemLayoutMap = {}): Promise<Blob> {
  const pack = new JSZip();
  const folder = pack.folder(safeFileName(project.name))!;
  for (const screen of project.screens) {
    if (checkScreen(screen, systemLayouts[screen.target]).some((c) => c.level === 'error')) continue;
    folder.file(`${safeFileName(project.name)} (${screen.name}).nxtheme`, await buildNxTheme(project, screen));
  }
  folder.file(
    'README.txt',
    [
      `Theme: ${project.name}`,
      `Author: ${project.author}`,
      '',
      'Install:',
      `1. Copy the .nxtheme files to sd:/themes/${safeFileName(project.name)}/ on your Switch SD card.`,
      '2. Open NXThemes Installer, pick the files and install them.',
      '3. Reboot (or restart the home menu from the installer) to see the result.',
    ].join('\n'),
  );
  return pack.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
