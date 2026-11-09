import type { ScreenTarget } from '../../types/theme';
import type { BflytFile, BflytPane } from '../nx/bflyt';
import type { Animation } from '../nx/bflan';
import type { ImageDataLike } from '../nx/bntx';
import type { SystemLayout } from '../layout/systemLayouts';

/**
 * Built-in console layouts.
 *
 * The studio ships the *structure* of the stock home menu (pane trees, sizes, anchors, material
 * colours, the idle-state animation values) as its own JSON, generated from a console dump by
 * `npm run build:stock`. No Nintendo files, textures or images are included: every texture is
 * replaced by a description (a colour, a gradient, a rounded shape) or by one of the studio's
 * own placeholder drawings (see placeholders.ts). Loading a console's own .szs files still gives
 * the exact textures.
 */

export const STOCK_VERSION = 1;

/** A texture as the stock pack describes it: its size plus how to draw a stand-in. */
export type StockTextureKind =
  | { kind: 'solid'; rgba: number[] }
  | { kind: 'vgrad' | 'hgrad'; stops: number[][] }
  | { kind: 'roundrect'; r: number; rgb: number[]; a: number }
  | { kind: 'drawn' }
  | { kind: 'none' };

export type StockTexture = StockTextureKind & { stock: true; name: string; width: number; height: number };

export interface StockArchive {
  version: number;
  szsName: string;
  target: ScreenTarget;
  firmware: number;
  firmwareHint: string;
  mainLayout: string;
  fileNames: string[];
  layouts: Record<string, Omit<BflytFile, 'byName'>>;
  animations: Record<string, Animation>;
  textures: Record<string, StockTexture>;
}

/** Animations the preview's idle / focus / running recipes use (see animState.ts). */
const USED_ANIMS =
  /_(In|UnFocusKey|UnfocusKey|UnFocusTouch|Inactive|DlOut|SuspendOut|PromoOut|CardOut|CardStatusOut|DigitalBundleOut|EffectLaunchOut|Enter|RefreshIn|BtnChangeUserIn|MyPage|BaseOut|LockMainOut|SpecialNewsTextOut|ContentsIn|Out|FocusKey|Active|SuspendIn|SuspendText)\.bflan$/;

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Describes a decoded texture with a few numbers: uniform colour, 1D gradient or rounded shape. */
export function classifyTexture(img: ImageDataLike): StockTextureKind {
  const { width: w, height: h, data } = img;
  const px = (x: number, y: number, c: number) => data[(y * w + x) * 4 + c] / 255;
  const mean = [0, 0, 0, 0];
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 4; c++) mean[c] += data[i * 4 + c] / 255 / (w * h);
  let maxDev = 0;
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 4; c++) maxDev = Math.max(maxDev, Math.abs(data[i * 4 + c] / 255 - mean[c]));
  if (maxDev < 0.05) return { kind: 'solid', rgba: mean.map(round) };

  // 1D gradients: constant along one axis.
  const lineDev = (alongX: boolean) => {
    let dev = 0;
    const [n, m] = alongX ? [h, w] : [w, h];
    for (let i = 0; i < n; i++)
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let j = 0; j < m; j++) s += alongX ? px(j, i, c) : px(i, j, c);
        const avg = s / m;
        for (let j = 0; j < m; j++) dev = Math.max(dev, Math.abs((alongX ? px(j, i, c) : px(i, j, c)) - avg));
      }
    return dev;
  };
  const profile = (vertical: boolean) => {
    const n = vertical ? h : w;
    const steps = Math.min(n, 16);
    return Array.from({ length: steps }, (_, k) => {
      const i = Math.round((k * (n - 1)) / Math.max(1, steps - 1));
      const c = [0, 0, 0, 0];
      const m = vertical ? w : h;
      for (let j = 0; j < m; j++) for (let ch = 0; ch < 4; ch++) c[ch] += (vertical ? px(j, i, ch) : px(i, j, ch)) / m;
      return [round(i / Math.max(1, n - 1)), ...c.map(round)];
    });
  };
  if (h > 1 && lineDev(true) < 0.06) return { kind: 'vgrad', stops: profile(true) };
  if (w > 1 && lineDev(false) < 0.06) return { kind: 'hgrad', stops: profile(false) };

  // A uniformly coloured shape: try rounded rectangles / circles.
  let inside = 0;
  const rgb = [0, 0, 0];
  let alpha = 0;
  for (let i = 0; i < w * h; i++)
    if (data[i * 4 + 3] > 127) {
      inside++;
      for (let c = 0; c < 3; c++) rgb[c] += data[i * 4 + c] / 255;
      alpha += data[i * 4 + 3] / 255;
    }
  if (inside > w * h * 0.2) {
    let best = { r: 0, iou: 0 };
    for (let r = 0; r <= Math.floor(Math.min(w, h) / 2); r++) {
      let inter = 0;
      let uni = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const dx = Math.max(r - (x + 0.5), x + 0.5 - (w - r), 0);
          const dy = Math.max(r - (y + 0.5), y + 0.5 - (h - r), 0);
          const m = dx * dx + dy * dy <= r * r ? 1 : 0;
          const a = px(x, y, 3);
          inter += Math.min(m, a);
          uni += Math.max(m, a);
        }
      const iou = inter / Math.max(1e-6, uni);
      if (iou > best.iou) best = { r, iou };
    }
    if (best.iou > 0.93) return { kind: 'roundrect', r: round(best.r / Math.min(w, h)), rgb: rgb.map((v) => round(v / inside)), a: round(alpha / inside) };
  }
  return { kind: 'none' };
}

const stripByName = (f: BflytFile): Omit<BflytFile, 'byName'> => {
  const { byName, ...rest } = f;
  void byName;
  return rest;
};

/** Build side: one archive's stock description. `decode` returns a texture's pixels. */
export function toStockArchive(
  sys: SystemLayout,
  parseAnim: (bytes: Uint8Array) => Animation,
  decode: (name: string) => ImageDataLike | null,
  drawnNames: Set<string>,
): StockArchive {
  const layouts: StockArchive['layouts'] = {};
  for (const [n, f] of sys.layouts) layouts[n] = stripByName(f);
  const animations: StockArchive['animations'] = {};
  for (const [n, a] of sys.animations) if (USED_ANIMS.test(n)) animations[n] = a instanceof Uint8Array ? parseAnim(a) : a;
  const textures: StockArchive['textures'] = {};
  for (const [name, t] of sys.textures) {
    let kind: StockTextureKind = { kind: 'none' };
    if (drawnNames.has(name)) kind = { kind: 'drawn' };
    else {
      const img = decode(name);
      if (img) kind = classifyTexture(img);
    }
    textures[name] = { ...kind, stock: true, name, width: t.width, height: t.height };
  }
  return {
    version: STOCK_VERSION,
    szsName: sys.szsName,
    target: sys.target,
    firmware: sys.firmware,
    firmwareHint: sys.firmwareHint,
    mainLayout: sys.mainLayout,
    fileNames: [...sys.fileNames],
    layouts,
    animations,
    textures,
  };
}

function indexPanes(f: Omit<BflytFile, 'byName'>): BflytFile {
  const byName = new Map<string, BflytPane>();
  const walk = (p: BflytPane) => {
    if (!byName.has(p.name)) byName.set(p.name, p);
    p.children.forEach(walk);
  };
  if (f.root) walk(f.root);
  return { ...f, byName };
}

/** Browser side: a stock archive as a SystemLayout the renderer and editor understand. */
export function systemLayoutFromStock(a: StockArchive): SystemLayout {
  return {
    target: a.target,
    szsName: a.szsName,
    layouts: new Map(Object.entries(a.layouts).map(([n, f]) => [n, indexPanes(f)])),
    mainLayout: a.mainLayout,
    firmware: a.firmware,
    firmwareHint: a.firmwareHint,
    fileNames: new Set(a.fileNames),
    animations: new Map(Object.entries(a.animations)),
    textures: new Map(Object.entries(a.textures)),
    loadedAt: 0,
    source: 'stock',
  };
}

/** Archives in the built-in pack, by the slot App keeps them in. */
export const STOCK_FILES: Record<ScreenTarget | 'common', string> = {
  home: 'ResidentMenu.json',
  lock: 'Entrance.json',
  apps: 'Flaunch.json',
  set: 'Set.json',
  news: 'Notification.json',
  user: 'MyPage.json',
  psl: 'Psl.json',
  common: 'common.json',
};

export async function loadStockLayouts(base = `${import.meta.env.BASE_URL}stock/`): Promise<Partial<Record<ScreenTarget | 'common', SystemLayout>>> {
  const out: Partial<Record<ScreenTarget | 'common', SystemLayout>> = {};
  await Promise.all(
    Object.entries(STOCK_FILES).map(async ([slot, file]) => {
      try {
        const res = await fetch(base + file);
        if (!res.ok) return;
        const json = (await res.json()) as StockArchive;
        if (json.version !== STOCK_VERSION) return;
        out[slot as ScreenTarget | 'common'] = systemLayoutFromStock(json);
      } catch (e) {
        console.warn('Built-in layout missing:', file, e);
      }
    }),
  );
  return out;
}
