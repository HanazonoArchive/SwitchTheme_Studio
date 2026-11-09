import type { ImageDataLike } from '../nx/bntx';
import { alphaBox, type StockTexture } from './stockPack';

/**
 * The studio's own stand-ins for the console's UI textures, used with the built-in layouts.
 * They are drawn from scratch as simple geometric pictograms in each texture's own pixel frame
 * (same size, same framing), so the console's materials, mirroring and UVs work unchanged:
 * e.g. RdtIcoShop is the left half of a symmetric icon that the layout mirrors.
 * White shapes on transparent, like the console's alpha masks; materials tint them.
 */

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;

const stroke = (c: CanvasRenderingContext2D, width: number, draw: () => void) => {
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  draw();
  c.stroke();
};

const fill = (c: CanvasRenderingContext2D, draw: () => void) => {
  c.beginPath();
  draw();
  c.fill();
};

/** Left half (x 0..w) of a symmetric icon whose centre line is x = w. */
const DRAWINGS: Record<string, Draw> = {
  // Balloon tips: the lower-right triangle.
  'BalloonTip^s': (c, w, h) => fill(c, () => (c.moveTo(0, 0), c.lineTo(w, 0), c.lineTo(w, h), c.closePath())),
  'BalloonTip^t': (c, w, h) => fill(c, () => (c.moveTo(0, 0), c.lineTo(w, 0), c.lineTo(w, h), c.closePath())),
  'Checkered1px^r': (c, w, h) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.fillRect(w / 2, 0, w / 2, h / 2);
    c.fillRect(0, h / 2, w / 2, h / 2);
  },
  'CursorEff_08^w': (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0.5)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  },
  // News: left half of a speech bubble with text lines (mirrored on the right).
  'EntIcoNews_00^s': (c, w, h) => newsHalf(c, w, h),
  'RdtIcoNews_00_Home^s': (c, w, h) => newsHalf(c, w, h),
  'EntIcoNews_01^t': (c, w, h) => fill(c, () => c.rect(0, 0, w * 0.92, h)),
  'RdtIcoNews_01_Home^s': (c, w, h) => fill(c, () => c.rect(0, 0, w, h)),
  'IcoArwSimpleU_32^t': (c, w, h) => stroke(c, w * 0.09, () => (c.moveTo(w * 0.15, h * 0.68), c.lineTo(w / 2, h * 0.32), c.lineTo(w * 0.85, h * 0.68))),
  // Battery outline: 3 px frame (33 x 20) and the terminal nub on the right.
  'IcoBattM_64^s': (c, w, h) => {
    const t = h * 0.15;
    const bw = w * (33 / 36);
    fill(c, () => {
      c.rect(0, 0, bw, h);
      c.rect(bw, h * 0.35, w - bw, h * 0.3);
    });
    c.globalCompositeOperation = 'destination-out';
    fill(c, () => c.rect(t, t, bw - 2 * t, h - 2 * t));
  },
  'IcoBtnPlusRev_24^s': (c, w, h) => {
    fill(c, () => c.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2));
    c.globalCompositeOperation = 'destination-out';
    fill(c, () => (c.rect(w * 0.44, h * 0.22, w * 0.12, h * 0.56), c.rect(w * 0.22, h * 0.44, w * 0.56, h * 0.12)));
  },
  'IcoGameCardIn_64^s': (c, w, h) => {
    fill(c, () => c.roundRect(w * 0.22, h * 0.06, w * 0.56, h * 0.88, w * 0.04));
    c.globalCompositeOperation = 'destination-out';
    fill(c, () => (c.moveTo(w * 0.4, h * 0.78), c.lineTo(w * 0.6, h * 0.78), c.lineTo(w / 2, h * 0.86), c.closePath()));
  },
  'IcoPencil_64^t': (c, w, h) => {
    c.translate(w / 2, h / 2);
    c.rotate(-Math.PI / 4);
    fill(c, () => c.rect(-w * 0.1, -h * 0.34, w * 0.2, h * 0.5));
    fill(c, () => (c.moveTo(-w * 0.1, h * 0.2), c.lineTo(w * 0.1, h * 0.2), c.lineTo(0, h * 0.36), c.closePath()));
  },
  // Wi-Fi (full): two arcs and a wedge fanning up from the bottom centre, 28 x 20 px of the 32 px frame.
  'IcoWifi_03_32^s': (c, w, h) => {
    const cx = w * 0.484;
    const cy = h * 0.8;
    const a0 = Math.PI * 1.25;
    const a1 = Math.PI * 1.75;
    for (const r of [0.53, 0.32]) stroke(c, w * 0.125, () => c.arc(cx, cy, w * r, a0, a1));
    c.lineJoin = 'round';
    c.lineWidth = w * 0.05;
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, w * 0.19, a0, a1);
    c.closePath();
    c.fill();
    c.stroke();
  },
  'NavBg_01^s': (c, w, h) => {
    const g = c.createRadialGradient(w, h / 2, 0, w, h / 2, w * 1.2);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0.25)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  },
  // News channel icon (a picture in the console): a neutral info badge.
  'NewsIcon_Info^w': (c, w, h) => {
    c.fillStyle = '#3d8bfd';
    fill(c, () => c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2));
    c.fillStyle = '#fff';
    fill(c, () => (c.rect(w * 0.45, h * 0.42, w * 0.1, h * 0.32), c.arc(w / 2, h * 0.3, w * 0.065, 0, Math.PI * 2)));
  },
  // Fade under news titles: clear at the top, nearly opaque at the bottom.
  'NewsMask_00^s': (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0.9)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  },
  'NtfIcoMovie^t': (c, w, h) => {
    fill(c, () => c.roundRect(0, 0, w, h, h * 0.12));
    c.fillStyle = '#16162a';
    fill(c, () => c.rect(w * 0.08, h * 0.12, w * 0.84, h * 0.76));
    c.fillStyle = '#fff';
    fill(c, () => (c.moveTo(w * 0.4, h * 0.3), c.lineTo(w * 0.66, h * 0.5), c.lineTo(w * 0.4, h * 0.7), c.closePath()));
  },
  // Controllers applet: a tilted controller outline and its buttons.
  'RdtIcoCtrl_00^s': (c, w, h) => {
    c.translate(w / 2, h / 2);
    c.rotate(-Math.PI / 4);
    stroke(c, w * 0.08, () => c.roundRect(-w * 0.42, -h * 0.17, w * 0.84, h * 0.34, h * 0.14));
  },
  'RdtIcoCtrl_01^s': (c, w, h) => fill(c, () => c.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2)),
  'RdtIcoCtrl_02^s': (c, w, h) => fill(c, () => c.arc(w / 2, h / 2, w * 0.45, 0, Math.PI * 2)),
  // Handheld / Virtual Game Card applets: halves of a device frame.
  'RdtIcoHomeSplayFrame^s': (c, w, h) => stroke(c, w * 0.16, () => (c.moveTo(w, h * 0.06), c.lineTo(w * 0.12, h * 0.06), c.lineTo(w * 0.12, h * 0.94), c.lineTo(w, h * 0.94))),
  'RdtIcoHomeSplayWaveTop^s': (c, w, h) => stroke(c, h * 0.3, () => (c.moveTo(w * 0.1, h * 0.3), c.lineTo(w, h * 0.7))),
  'RdtIcoHomeSplayWaveMid^s': (c, w, h) => stroke(c, h * 0.3, () => (c.moveTo(w * 0.1, h * 0.3), c.lineTo(w, h * 0.7))),
  'RdtIcoHomeSplayWaveBtm^s': (c, w, h) => stroke(c, h * 0.3, () => (c.moveTo(w * 0.1, h * 0.3), c.lineTo(w, h * 0.7))),
  'RdtIcoHomeVgcLineBtm^s': (c, w, h) => fill(c, () => c.rect(0, h * 0.25, w, h * 0.5)),
  'RdtIcoHomeVgc^s': (c, w, h) => stroke(c, w * 0.16, () => c.roundRect(w * 0.12, h * 0.05, w * 1.5, h * 0.9, w * 0.2)),
  // Online applet: a neutral globe (not Nintendo's mark).
  'RdtIcoLR_00^s': (c, w, h) => {
    const r = w * 0.34;
    const cx = w / 2;
    const cy = h * 0.42;
    stroke(c, w * 0.06, () => c.arc(cx, cy, r, 0, Math.PI * 2));
    stroke(c, w * 0.05, () => c.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2));
    stroke(c, w * 0.05, () => (c.moveTo(cx - r, cy), c.lineTo(cx + r, cy)));
    fill(c, () => c.roundRect(w * 0.18, h * 0.84, w * 0.64, h * 0.08, h * 0.04));
  },
  // Album: a framed picture.
  'RdtIcoPvr_00^s': (c, w, h) => {
    stroke(c, w * 0.08, () => c.rect(w * 0.06, h * 0.08, w * 0.88, h * 0.84));
    stroke(c, w * 0.07, () => (c.moveTo(w * 0.2, h * 0.75), c.lineTo(w * 0.42, h * 0.45), c.lineTo(w * 0.58, h * 0.62), c.lineTo(w * 0.68, h * 0.5), c.lineTo(w * 0.82, h * 0.75)));
  },
  // Power: left half of the ring and the stem.
  'RdtIcoPwrForm^s': (c, w, h) => {
    stroke(c, w * 0.17, () => c.arc(w, h / 2, w * 0.82, Math.PI * 0.62, Math.PI * 1.38));
    fill(c, () => c.rect(w * 0.88, h * 0.04, w * 0.12, h * 0.42));
  },
  // Settings: the top-left quarter of a gear.
  'RdtIcoSet^s': (c, w, h) => {
    stroke(c, w * 0.2, () => c.arc(w, h, w * 0.55, Math.PI, Math.PI * 1.5));
    stroke(c, w * 0.2, () => (c.moveTo(w * 0.42, h * 0.42), c.lineTo(w * 0.18, h * 0.18)));
    stroke(c, w * 0.2, () => (c.moveTo(w, h * 0.42), c.lineTo(w, h * 0.06)));
    stroke(c, w * 0.2, () => (c.moveTo(w * 0.42, h), c.lineTo(w * 0.06, h)));
  },
  // eShop: left half of a shopping bag.
  'RdtIcoShop^s': (c, w, h) => {
    stroke(c, w * 0.15, () => (c.moveTo(w, h * 0.34), c.lineTo(w * 0.12, h * 0.34), c.lineTo(w * 0.12, h * 0.92), c.lineTo(w, h * 0.92)));
    stroke(c, w * 0.13, () => c.arc(w, h * 0.34, w * 0.5, Math.PI, Math.PI * 1.5));
  },
  'waiticon_00^d': (c, w, h) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.strokeStyle = `rgba(255,255,255,${0.25 + (i / 8) * 0.75})`;
      stroke(c, w * 0.08, () => (c.moveTo(w / 2 + Math.cos(a) * w * 0.22, h / 2 + Math.sin(a) * h * 0.22), c.lineTo(w / 2 + Math.cos(a) * w * 0.4, h / 2 + Math.sin(a) * h * 0.4)));
    }
  },
};

function newsHalf(c: CanvasRenderingContext2D, w: number, h: number) {
  const lw = w * 0.14;
  stroke(c, lw, () => {
    c.moveTo(w, lw);
    c.lineTo(lw * 2, lw);
    c.quadraticCurveTo(lw, lw, lw, lw * 2);
    c.lineTo(lw, h * 0.72);
    c.quadraticCurveTo(lw, h * 0.8, lw * 2, h * 0.8);
    c.lineTo(w * 0.62, h * 0.8);
    c.lineTo(w * 0.82, h - lw);
  });
  stroke(c, lw, () => (c.moveTo(w * 0.42, h * 0.42), c.lineTo(w, h * 0.42)));
}

/** Fills and gradients that aren't pictograms: drawn as they are, never refitted. */
const NO_FIT = new Set(['Checkered1px^r', 'CursorEff_08^w', 'NavBg_01^s', 'NewsMask_00^s', 'NewsIcon_Info^w', 'NtfIcoMovie^t', 'IcoBattM_64^s']);

export const hasPlaceholderDrawing = (name: string) => name in DRAWINGS;
export const PLACEHOLDER_NAMES = Object.keys(DRAWINGS);

function canvas(w: number, h: number) {
  const el = document.createElement('canvas');
  el.width = Math.max(1, w);
  el.height = Math.max(1, h);
  return el;
}

/** Pixels for a stock texture: its drawing, or its colour / gradient / shape description. */
export function renderStockTexture(t: StockTexture): ImageDataLike | null {
  if (typeof document === 'undefined' || t.kind === 'none') return null;
  const w = t.width;
  const h = t.height;
  const el = canvas(w, h);
  const c = el.getContext('2d')!;
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  const css = (v: number[]) => `rgba(${Math.round(v[0] * 255)},${Math.round(v[1] * 255)},${Math.round(v[2] * 255)},${v[3]})`;
  switch (t.kind) {
    case 'drawn': {
      const draw = DRAWINGS[t.name];
      if (!draw) break;
      if (!t.box || NO_FIT.has(t.name)) {
        draw(c, w, h);
        break;
      }
      // Draw, then move our picture onto the console picture's footprint in the frame, so the
      // layout's positions, mirroring and UVs line it up exactly where the console's sits.
      const tmp = canvas(w, h);
      const tc = tmp.getContext('2d')!;
      tc.fillStyle = '#fff';
      tc.strokeStyle = '#fff';
      draw(tc, w, h);
      const ours = alphaBox({ width: w, height: h, data: tc.getImageData(0, 0, w, h).data });
      if (!ours) break;
      const [x0, y0, x1, y1] = t.box;
      c.drawImage(tmp, ours[0], ours[1], ours[2] - ours[0], ours[3] - ours[1], x0, y0, x1 - x0, y1 - y0);
      break;
    }
    case 'solid':
      c.fillStyle = css(t.rgba);
      c.fillRect(0, 0, w, h);
      break;
    case 'vgrad':
    case 'hgrad': {
      const g = t.kind === 'vgrad' ? c.createLinearGradient(0, 0, 0, h) : c.createLinearGradient(0, 0, w, 0);
      for (const [at, ...rgba] of t.stops) g.addColorStop(at, css(rgba));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      break;
    }
    case 'roundrect':
      c.fillStyle = css([...t.rgb, t.a]);
      c.beginPath();
      c.roundRect(0, 0, w, h, t.r * Math.min(w, h));
      c.fill();
      break;
  }
  const d = c.getImageData(0, 0, el.width, el.height);
  return { width: el.width, height: el.height, data: d.data };
}
