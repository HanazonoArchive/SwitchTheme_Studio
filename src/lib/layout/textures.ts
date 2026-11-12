import { decodeTexture, type BntxTexture, type ImageDataLike } from '../nx/bntx';
import type { BflytMaterial, BflytPane } from '../nx/bflyt';
import { paletteColor } from './palette';
import { renderStockTexture } from '../stock/placeholders';
import type { StockTexture } from '../stock/stockPack';

/**
 * Turns a picture pane's material + texture into something CSS can draw, the way nn::ui2d does:
 *   color = lerp(material.black, material.white, texture) * vertexColor
 * Tinted textures are cached as canvases per (texture, colours, mirror) combination.
 */

const decoded = new WeakMap<BntxTexture | StockTexture, ImageDataLike | null>();
// Per texture object: built-in stand-ins and console textures share names, so a name key would keep
// showing the stand-in after the console's .szs is loaded.
const canvasCache = new WeakMap<BntxTexture | StockTexture, Map<string, HTMLCanvasElement>>();

export type Rgba = [number, number, number, number];

/** "AABBGGRR" -> [r,g,b,a] 0..255 */
export function parseLayoutColor(hex?: string): Rgba {
  if (!hex) return [255, 255, 255, 255];
  const n = parseInt(hex, 16) >>> 0;
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
}

const luma = (c: Rgba) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const isGray = (c: Rgba) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 24;

/**
 * The home menu recolours its neutral UI at runtime for Basic Black. Approximate that:
 * near-black ink turns light, near-white plates turn dark gray. Coloured accents are kept.
 */
export function themeColor(c: Rgba, dark: boolean): Rgba {
  // Translucent black/white are scrims and pills (e.g. "Playing"), not themed ink.
  if (!dark || !isGray(c) || c[3] < 250) return c;
  const l = luma(c);
  if (l < 0.35) return [235, 235, 235, c[3]];
  if (l > 0.85) return [70, 70, 70, c[3]];
  return c;
}

export const toCss = (c: Rgba) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${(c[3] / 255).toFixed(3)})`;

function averageVertexColor(p: BflytPane): Rgba {
  if (!p.colors) return [255, 255, 255, 255];
  const cs = [p.colors.TL, p.colors.TR, p.colors.BL, p.colors.BR].map(parseLayoutColor);
  return [0, 1, 2, 3].map((i) => cs.reduce((s, c) => s + c[i], 0) / 4) as Rgba;
}

const isMirror = (w: number) => w === 2 || w === 6 || w === 3 || w === 7;
const isRepeat = (w: number) => w === 1 || w === 5;

export interface PaneVisual {
  /** Solid fill (no texture, a 1×1 texture or a single sampled texel). */
  color?: string;
  /** Tinted texture (material colours applied, mirrored halves expanded). */
  canvas?: HTMLCanvasElement;
  /** How the texture maps onto the pane rect, like CSS background-size / -position (px). */
  bgW?: number;
  bgH?: number;
  bgX?: number;
  bgY?: number;
  repeatX?: boolean;
  repeatY?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  /** Texture the preview can't decode. */
  unsupported?: string;
}

/** Textures read through their alpha channel only (see PatchAppletColorAttrib), keyed by the wrapper. */
const ALPHA_ONLY = new WeakMap<BntxTexture | StockTexture, BntxTexture | StockTexture>();
export function alphaOnlyTexture<T extends BntxTexture | StockTexture>(tex: T): T {
  const wrapper = { ...tex };
  ALPHA_ONLY.set(wrapper, tex);
  return wrapper;
}

export function paneVisual(
  pane: BflytPane,
  material: BflytMaterial | undefined,
  textures: Map<string, BntxTexture | StockTexture>,
  w: number,
  h: number,
  dark: boolean,
): PaneVisual | null {
  if (!material) return null;
  const vertex = averageVertexColor(pane);
  // System palette (C_W / C_B user data) wins; otherwise the material colours, recoloured for the theme.
  // C_W 0 means "no palette colour": the material's own white colour stays.
  const cw = pane.userData?.C_W?.[0] ? paletteColor(pane.userData.C_W[0], dark) : undefined;
  const cb = paletteColor(pane.userData?.C_B?.[0], dark);
  const matWhite = parseLayoutColor(material.white);
  const black = cb ?? themeColor(parseLayoutColor(material.black), dark);
  // Keep the material's alpha (animations fade panes through it).
  // A theme that sets C_W to 0 opts out of the palette: the console draws the material's white as
  // is, in Basic Black too (Gengar's pastel pills, Zhi's white cursors).
  const cwOff = pane.userData?.C_W !== undefined && !pane.userData.C_W[0];
  const white: Rgba = cw ? [cw[0], cw[1], cw[2], Math.min(cw[3], matWhite[3])] : cwOff ? matWhite : themeColor(matWhite, dark);
  const mul = (c: Rgba): Rgba => [(c[0] * vertex[0]) / 255, (c[1] * vertex[1]) / 255, (c[2] * vertex[2]) / 255, (c[3] * vertex[3]) / 255];

  const ref = material.textures[0];
  const tex = ref ? textures.get(ref.name) : undefined;
  if (!ref || !tex) {
    // No texture: the material's white color times the vertex color.
    const c = mul(white);
    return c[3] < 2 ? null : { color: toCss(c) };
  }

  if (!decoded.has(tex)) {
    const base = ALPHA_ONLY.get(tex) ?? tex;
    let img = 'stock' in base ? renderStockTexture(base) : decodeTexture(base);
    if (img && base !== tex) {
      // Channel swizzle (A, A, A, A): the picture becomes a white silhouette the material colours.
      const data = new Uint8ClampedArray(img.data);
      for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = data[i + 3];
      img = { ...img, data };
    }
    decoded.set(tex, img);
  }
  const img = decoded.get(tex);
  if (!img) return { unsupported: ref.name };

  if (img.width * img.height === 1) {
    const t = img.data;
    // A translucent 1x1 (e.g. White1x1A220 under the "Playing" pill) is a scrim: keep its colours.
    const [b0, w0] = t[3] < 250 ? [cb ?? parseLayoutColor(material.black), cw ? white : matWhite] : [black, white];
    const c = mul([0, 1, 2, 3].map((i) => b0[i] + ((w0[i] - b0[i]) * t[i]) / 255) as Rgba);
    return c[3] < 2 ? null : { color: toCss(c) };
  }

  // UVs: first set, TL and BR corners. Mirror wrap with UVs past 1 = a half image mirrored.
  const uv = pane.uv ?? [{ X: 0, Y: 0 }, { X: 1, Y: 0 }, { X: 0, Y: 1 }, { X: 1, Y: 1 }];
  let [u0, v0, u1, v1] = [uv[0].X, uv[0].Y, uv[3].X, uv[3].Y];
  const tr = material.transforms[0];
  if (tr && (tr.scaleX !== 1 || tr.scaleY !== 1 || tr.x || tr.y)) {
    [u0, u1] = [u0 * tr.scaleX + tr.x, u1 * tr.scaleX + tr.x];
    [v0, v1] = [v0 * tr.scaleY - tr.y, v1 * tr.scaleY - tr.y];
  }
  // Clamp-sampled UVs far outside 0..1 (e.g. the lock screen's left panel uses U 0..390, V 0) read
  // a single edge texel: draw that as a solid colour.
  const single = (a: number, b: number, wrap: number) => a === b || (!isMirror(wrap) && !isRepeat(wrap) && Math.abs(b - a) > 2);
  if (single(u0, u1, ref.wrapS) && single(v0, v1, ref.wrapT)) {
    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
    const sx = Math.min(img.width - 1, Math.floor(clamp01((u0 + u1) / 2) * img.width));
    const sy = Math.min(img.height - 1, Math.floor(clamp01((v0 + v1) / 2) * img.height));
    const t = img.data.subarray((sy * img.width + sx) * 4);
    const c = mul([0, 1, 2, 3].map((i) => black[i] + ((white[i] - black[i]) * t[i]) / 255) as Rgba);
    return c[3] < 2 ? null : { color: toCss(c) };
  }

  // Mirror wrap with UVs outside 0..1 (e.g. -1..1 for a fade at both ends): tile a doubled texture.
  const outside = (a: number, b: number) => Math.max(a, b) > 1.001 || Math.min(a, b) < -0.001;
  const mirrorX = isMirror(ref.wrapS) && outside(u0, u1);
  const mirrorY = isMirror(ref.wrapT) && outside(v0, v1);

  const key = `${ref.name}${ALPHA_ONLY.has(tex) ? '#a' : ''}|${black.join(',')}|${white.join(',')}|${vertex.join(',')}|${mirrorX}|${mirrorY}`;
  let perTex = canvasCache.get(tex);
  if (!perTex) canvasCache.set(tex, (perTex = new Map()));
  let canvas = perTex.get(key);
  if (!canvas) {
    const W = img.width * (mirrorX ? 2 : 1);
    const H = img.height * (mirrorY ? 2 : 1);
    canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const out = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const sy = y < img.height ? y : 2 * img.height - 1 - y;
      for (let x = 0; x < W; x++) {
        const sx = x < img.width ? x : 2 * img.width - 1 - x;
        const s = (sy * img.width + sx) * 4;
        const d = (y * W + x) * 4;
        for (let i = 0; i < 4; i++) out.data[d + i] = ((black[i] + ((white[i] - black[i]) * img.data[s + i]) / 255) * vertex[i]) / 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    perTex.set(key, canvas);
  }
  if (mirrorX) {
    u0 /= 2;
    u1 /= 2;
  }
  if (mirrorY) {
    v0 /= 2;
    v1 /= 2;
  }

  const du = Math.abs(u1 - u0) || 1;
  const dv = Math.abs(v1 - v0) || 1;
  const bgW = w / du;
  const bgH = h / dv;
  return {
    canvas,
    bgW,
    bgH,
    bgX: -Math.min(u0, u1) * bgW,
    bgY: -Math.min(v0, v1) * bgH,
    repeatX: isRepeat(ref.wrapS) || mirrorX,
    repeatY: isRepeat(ref.wrapT) || mirrorY,
    flipX: u1 < u0,
    flipY: v1 < v0,
  };
}
