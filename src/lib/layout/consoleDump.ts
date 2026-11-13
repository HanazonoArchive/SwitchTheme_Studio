import JSZip from 'jszip';
import type { ScreenTarget } from '../../types/theme';

/**
 * The console's own layout files, as NXThemes Installer dumps them ("Extract home menu"):
 *
 *   extracted/
 *     ver.cfg                       firmware version, e.g. "23.0.1"
 *     mypage/lyt/MyPage.szs
 *     playerselect/lyt/Psl.szs
 *     qlaunch/lyt/common.szs, Entrance.szs, Flaunch.szs, Notification.szs, ResidentMenu.szs, Set.szs
 *
 * Read from a .zip of that folder, the folder itself, or loose .szs files. The files stay in this
 * browser; nothing from them is uploaded or put into an exported theme.
 */

export type ConsoleSlot = ScreenTarget | 'common';

export interface ExpectedFile {
  file: string;
  slot: ConsoleSlot;
  /** Folder inside "extracted". */
  dir: string;
  /** What it's for, in the studio. */
  what: string;
}

export const EXPECTED_FILES: ExpectedFile[] = [
  { file: 'ResidentMenu.szs', slot: 'home', dir: 'qlaunch/lyt', what: 'Home menu' },
  { file: 'Entrance.szs', slot: 'lock', dir: 'qlaunch/lyt', what: 'Lock screen' },
  { file: 'Flaunch.szs', slot: 'apps', dir: 'qlaunch/lyt', what: 'All Software' },
  { file: 'Set.szs', slot: 'set', dir: 'qlaunch/lyt', what: 'System Settings' },
  { file: 'Notification.szs', slot: 'news', dir: 'qlaunch/lyt', what: 'News' },
  { file: 'common.szs', slot: 'common', dir: 'qlaunch/lyt', what: 'Shared parts (footer, headers)' },
  { file: 'MyPage.szs', slot: 'user', dir: 'mypage/lyt', what: 'User page' },
  { file: 'Psl.szs', slot: 'psl', dir: 'playerselect/lyt', what: 'Player select' },
];

export interface DumpContents {
  /** The layout archives found, by their file name as the console names them. */
  szs: { name: string; bytes: Uint8Array }[];
  /** Firmware from ver.cfg, when present. */
  version?: string;
  /** Files that were ignored (not part of a dump). */
  ignored: string[];
}

const KNOWN = new Map(EXPECTED_FILES.map((f) => [f.file.toLowerCase(), f.file]));
const base = (path: string) => path.split(/[\\/]/).pop() ?? path;
const cleanVersion = (s: string) => s.trim().replace(/[^\w.\-+ ]/g, '').slice(0, 32) || undefined;

async function fromZip(file: Blob, out: DumpContents) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir && !/(^|\/)__MACOSX\//.test(e.name));
  for (const e of entries) {
    const name = base(e.name);
    const known = KNOWN.get(name.toLowerCase());
    if (known) out.szs.push({ name: known, bytes: await e.async('uint8array') });
    else if (name.toLowerCase() === 'ver.cfg') out.version = cleanVersion(await e.async('string'));
    else out.ignored.push(e.name);
  }
}

/** Reads a dump from any mix of a .zip, a folder's files or loose .szs files. */
export async function readConsoleDump(files: File[]): Promise<DumpContents> {
  const out: DumpContents = { szs: [], ignored: [] };
  for (const f of files) {
    const name = base((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
    const lower = name.toLowerCase();
    if (lower.endsWith('.zip')) await fromZip(f, out);
    else if (KNOWN.has(lower)) out.szs.push({ name: KNOWN.get(lower)!, bytes: new Uint8Array(await f.arrayBuffer()) });
    else if (lower === 'ver.cfg') out.version = cleanVersion(await f.text());
    else out.ignored.push(name);
  }
  // The same file twice (a folder and a zip): the last one wins.
  const seen = new Map<string, { name: string; bytes: Uint8Array }>();
  for (const s of out.szs) seen.set(s.name, s);
  out.szs = [...seen.values()];
  return out;
}

/** Whether a .zip is a console dump (has any of the layout archives) rather than a theme. */
export async function isConsoleDumpZip(file: Blob): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(file);
    return Object.keys(zip.files).some((p) => KNOWN.has(base(p).toLowerCase()));
  } catch {
    return false;
  }
}

const VERSION_KEY = 'sts.consoleVersion';
export const savedConsoleVersion = (): string | undefined => {
  try {
    return localStorage.getItem(VERSION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};
export const saveConsoleVersion = (v: string | undefined) => {
  try {
    if (v) localStorage.setItem(VERSION_KEY, v);
    else localStorage.removeItem(VERSION_KEY);
  } catch {
    /* private mode */
  }
};
