import type { ScreenTarget } from '../../types/theme';
import { parseSarc } from '../nx/sarc';
import { parseBflyt, type BflytFile } from '../nx/bflyt';
import { parseBntx, type BntxTexture } from '../nx/bntx';
import type { Animation } from '../nx/bflan';
import type { StockTexture } from '../stock/stockPack';
import { targetFromSzsName, targetInfo } from './targets';
import { detectFirmware, firmwareLabel } from './installerFixes';

/**
 * Console layouts: built in (lib/stock, our own description of the stock layouts with
 * stand-in graphics), or the user's own console files for exact textures. NXThemes Installer's
 * "Extract home menu" writes those to sd:/themes/systemData/extracted/{qlaunch,mypage,playerselect}/lyt/*.szs.
 */
export interface SystemLayout {
  target: ScreenTarget;
  szsName: string;
  layouts: Map<string, BflytFile>;
  /** Layout used as the preview root. */
  mainLayout: string;
  /** ConsoleFirmware value the installer detects for this file (FirmwareDetection.cs); 0 = unknown. */
  firmware: number;
  firmwareHint: string;
  /** Every file in the archive (animations included), for compatibility checks. */
  fileNames: Set<string>;
  /** .bflan files (raw from a console, parsed in the built-in pack), for resting states. */
  animations: Map<string, Uint8Array | Animation>;
  /** Textures: the console's own (timg/__Combined.bntx) or the built-in stand-ins. */
  textures: Map<string, BntxTexture | StockTexture>;
  loadedAt: number;
  /** 'console': the user's own .szs (exact textures). 'stock': the built-in layouts. */
  source?: 'console' | 'stock';
}

/** Screen archives by target, plus common.szs (shared footer/header layouts) under "common". */
export type SystemLayoutMap = Partial<Record<ScreenTarget | 'common', SystemLayout>>;

export const isCommonSzs = (fileName: string) => /(^|[\\/])common\.szs$/i.test(fileName);

/** Picks the layout to preview: the configured one if present, otherwise the largest layout no other layout uses as a part. */
function pickMainLayout(preferred: string, layouts: Map<string, BflytFile>) {
  if (layouts.has(preferred)) return preferred;
  const usedAsPart = new Set<string>();
  for (const f of layouts.values()) {
    const walk = (p: NonNullable<BflytFile['root']>) => {
      if (p.kind === 'prt1') usedAsPart.add(`blyt/${p.partName || p.name.replace(/^L_/, '')}.bflyt`);
      p.children.forEach(walk);
    };
    if (f.root) walk(f.root);
  }
  let best = '';
  let bestCount = -1;
  for (const [name, f] of layouts) {
    if (usedAsPart.has(name)) continue;
    const count = f.byName.size;
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best || [...layouts.keys()][0] || '';
}

function readTextures(bntx: Uint8Array | undefined) {
  if (!bntx) return new Map<string, BntxTexture>();
  try {
    return parseBntx(bntx);
  } catch (e) {
    console.warn('Could not read textures', e);
    return new Map<string, BntxTexture>();
  }
}

export function parseSystemSzs(fileName: string, bytes: Uint8Array, forcedTarget?: ScreenTarget): SystemLayout {
  const common = isCommonSzs(fileName);
  const target = forcedTarget ?? targetFromSzsName(fileName) ?? (common ? 'home' : null);
  if (!target) {
    throw new Error(`"${fileName}" isn't a known theme target. Expected ResidentMenu.szs, Entrance.szs, Flaunch.szs, Set.szs, Notification.szs, MyPage.szs, Psl.szs or common.szs.`);
  }
  const files = parseSarc(bytes);
  const layouts = new Map<string, BflytFile>();
  for (const [name, data] of files) {
    if (!name.endsWith('.bflyt')) continue;
    try {
      layouts.set(name, parseBflyt(data));
    } catch (e) {
      console.warn(`Skipping ${name}:`, e);
    }
  }
  if (layouts.size === 0) throw new Error(`${fileName} has no layouts in it. Is it the right file?`);
  const info = targetInfo(target);
  return {
    target,
    szsName: common ? 'common.szs' : info.szs,
    layouts,
    mainLayout: common ? 'blyt/FooterAll.bflyt' : pickMainLayout(info.mainLayout, layouts),
    firmware: detectFirmware(target, new Set(files.keys())),
    firmwareHint: firmwareLabel(detectFirmware(target, new Set(files.keys()))),
    fileNames: new Set(files.keys()),
    textures: readTextures(files.get('timg/__Combined.bntx')),
    animations: new Map([...files].filter(([n]) => n.endsWith('.bflan'))),
    loadedAt: Date.now(),
    source: 'console',
  };
}

/** Resolves the layout file a parts pane instantiates. */
export function resolvePartLayout(sys: SystemLayout, pane: { name: string; partName?: string }) {
  const candidates = [pane.partName, pane.name.replace(/^L_/, ''), pane.name.replace(/^L_/, '').replace(/_\d+$/, '')]
    .filter(Boolean)
    .map((n) => `blyt/${n}.bflyt`);
  return candidates.find((c) => sys.layouts.has(c));
}

/* -------------------------------------------------------------------------- */
/* Persistence: keep the raw SZS bytes in IndexedDB so users load them once.   */
/* -------------------------------------------------------------------------- */

const DB = 'switchtheme-studio';
const STORE = 'system-szs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSystemSzs(target: ScreenTarget | 'common', fileName: string, bytes: Uint8Array) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ fileName, bytes }, target);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Could not persist system layout', e);
  }
}

export async function removeSystemSzs(target: ScreenTarget | 'common') {
  try {
    const db = await openDb();
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(target);
  } catch {
    /* ignore */
  }
}

export async function loadSavedSystemLayouts(): Promise<SystemLayoutMap> {
  const out: SystemLayoutMap = {};
  try {
    const db = await openDb();
    const entries = await new Promise<{ key: IDBValidKey; value: { fileName: string; bytes: Uint8Array } }[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const res: { key: IDBValidKey; value: { fileName: string; bytes: Uint8Array } }[] = [];
      const cur = store.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return resolve(res);
        res.push({ key: c.key, value: c.value });
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    for (const { key, value } of entries) {
      try {
        const isCommon = key === 'common';
        const sys = parseSystemSzs(value.fileName, value.bytes, isCommon ? undefined : (key as ScreenTarget));
        out[isCommon ? 'common' : sys.target] = sys;
      } catch (e) {
        console.warn('Saved system layout is unreadable, dropping it', e);
      }
    }
  } catch {
    /* IndexedDB unavailable (private mode) */
  }
  return out;
}
