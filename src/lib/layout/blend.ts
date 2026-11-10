import type { BflytMaterial, BflytPane } from '../nx/bflyt';
import { realAnchors } from './geometry';

/**
 * qlaunch builds masks in the framebuffer's alpha channel: some panes write only alpha (a mask
 * shape, a text run, a reset), and a later pane draws its colour weighted by that alpha
 * (blend src = dstAlpha). The Album icon fill, header titles and the All Software title balloon
 * all work like this. The DOM preview has no framebuffer, so the pattern is resolved here into
 * "draw this pane through these mask layers" or "colour this text with that pane's colour".
 */

export interface MaskLayer {
  pane: BflytPane;
  /** Offset of the layer's rect from the masked pane's rect, in the shared parent's space. */
  dx: number;
  dy: number;
}

export interface MaskInfo {
  /** Panes that draw nothing visible (alpha-only writers, resets). */
  alphaOnly: Set<string>;
  /** Masked pane -> picture layers forming its mask. */
  masked: Map<string, MaskLayer[]>;
  /** Masked panes whose mask is text: hidden; the text takes their colour instead. */
  textTint: Map<string, string>;
  hiddenTargets: Set<string>;
}

const isAlphaOnly = (m?: BflytMaterial) => !!m?.blend && m.blend.op === 1 && m.blend.src === 0 && m.blend.dst === 1;
const usesDstAlpha = (m?: BflytMaterial) => !!m?.blend && m.blend.op === 1 && m.blend.src === 6;

/** Top-left of a pane's rect in its parent's space (y down), ignoring rotation. */
function rectTopLeft(p: BflytPane, parentW: number, parentH: number) {
  const a = realAnchors(p);
  const ax = (o: number, s: number) => (o === 1 ? -s / 2 : o === 2 ? s / 2 : 0);
  const px = ax(a.parentX, parentW) + p.position.X;
  const py = ax(a.parentY, parentH) - p.position.Y;
  const w = p.size.X * p.scale.X;
  const h = p.size.Y * p.scale.Y;
  const ox = a.originX === 1 ? 0 : a.originX === 2 ? -w : -w / 2;
  const oy = a.originY === 1 ? 0 : a.originY === 2 ? -h : -h / 2;
  return { x: px + ox, y: py + oy };
}

export function analyseMasks(root: BflytPane, materials: BflytMaterial[]): MaskInfo {
  const info: MaskInfo = { alphaOnly: new Set(), masked: new Map(), textTint: new Map(), hiddenTargets: new Set() };
  // Writers since the last reset, with their parent for geometry.
  let writers: { pane: BflytPane; parent: BflytPane | null }[] = [];
  const walk = (p: BflytPane, parent: BflytPane | null) => {
    const mat = p.materialIndex !== undefined ? materials[p.materialIndex] : undefined;
    if (mat && (p.kind === 'pic1' || p.kind === 'txt1' || p.kind === 'wnd1')) {
      // Scroll fades (W_Fade) only shape the alpha of what scrolls under them.
      if (isAlphaOnly(mat) || (p.kind === 'wnd1' && /Fade/.test(p.name))) info.alphaOnly.add(p.name);
      const ab = mat.blendAlpha;
      if (ab && ab.op === 1) {
        if (ab.src === 0 && ab.dst === 0) writers = [];
        // Overwriting alpha where glyphs are: consecutive text runs add up (title + subtitle).
        else if (ab.dst === 0) writers = p.kind === 'txt1' ? [...writers.filter((w) => w.pane.kind === 'txt1'), { pane: p, parent }] : [{ pane: p, parent }];
        else if (p.kind !== 'wnd1') writers.push({ pane: p, parent }); // multiply/add: intersect (edge fades skipped)
      }
      if (usesDstAlpha(mat) && writers.length) {
        if (writers.some((w) => w.pane.kind === 'txt1')) {
          info.hiddenTargets.add(p.name);
          for (const w of writers) if (w.pane.kind === 'txt1') info.textTint.set(w.pane.name, p.name);
        } else if (parent && writers.every((w) => w.parent === parent)) {
          const me = rectTopLeft(p, parent.size.X, parent.size.Y);
          info.masked.set(
            p.name,
            writers.map((w) => {
              const r = rectTopLeft(w.pane, parent.size.X, parent.size.Y);
              return { pane: w.pane, dx: r.x - me.x, dy: r.y - me.y };
            }),
          );
        }
      }
    }
    p.children.forEach((c) => walk(c, p));
  };
  walk(root, null);
  return info;
}
