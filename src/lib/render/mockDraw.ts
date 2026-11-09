/**
 * Canvas drawing for runtime content qlaunch makes by code (text from message files, button
 * glyphs, avatars, cursor, controller icon). Every function draws with its bounds' top-left
 * at 0,0, in layout pixels; the renderer scales the canvas for sharpness.
 */

export const FONT = "'Nunito Sans', 'Poppins', 'Segoe UI', system-ui, sans-serif";
const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`;

let measureCtx: CanvasRenderingContext2D | null = null;
export function measure(text: string, size: number, weight = 400): number {
  if (typeof document === 'undefined') return text.length * size * 0.55;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx!.font = font(size, weight);
  return measureCtx!.measureText(text).width;
}

export interface TextLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  lines: { text: string; x: number; y: number }[];
}

/** Places text in a box like the layout's text pane: alignment, wrapping, or an ellipsis. */
export function layoutText(text: string, size: number, w: number, h: number, alignX: number, alignY: number, wrap: boolean, ellipsis: boolean): TextLayout {
  const ax = (lw: number, boxW: number) => (alignX === 1 ? 0 : alignX === 2 ? boxW - lw : (boxW - lw) / 2);
  const ay = (lh: number) => (alignY === 1 ? 0 : alignY === 2 ? h - lh : (h - lh) / 2);
  if (!wrap) {
    let t = text;
    let tw = measure(t, size);
    if (ellipsis && tw > w) {
      while (t.length > 1 && measure(t + '…', size) > w) t = t.slice(0, -1);
      t += '…';
      tw = measure(t, size);
    }
    const lh = size * 1.25;
    return { x: ax(tw, w), y: ay(lh), w: Math.ceil(tw) + 2, h: lh, size, lines: [{ text: t, x: 0, y: lh / 2 }] };
  }
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && measure(next, size) > w) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const lh = size * 1.375;
  const total = lines.length * lh;
  return {
    x: 0,
    y: ay(total),
    w,
    h: total,
    size,
    lines: lines.map((t, i) => ({ text: t, x: ax(measure(t, size), w), y: i * lh + lh / 2 })),
  };
}

export function textBlock(c: CanvasRenderingContext2D, l: TextLayout, color: string) {
  c.font = font(l.size);
  c.fillStyle = color;
  c.textBaseline = 'middle';
  for (const line of l.lines) c.fillText(line.text, line.x, line.y);
}

export function text(c: CanvasRenderingContext2D, t: string, w: number, h: number, size: number, color: string, align: 'left' | 'right' | 'center') {
  c.font = font(size);
  c.fillStyle = color;
  c.textBaseline = 'middle';
  c.textAlign = align;
  c.fillText(t, align === 'left' ? 0 : align === 'right' ? w - 1 : w / 2, h / 2);
}

/** A round controller-button glyph (A, B, Y, +). */
export function glyph(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, letter: string, fill: string, ink: string) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(cx, cy, size / 2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = ink;
  c.font = font(size * 0.62, 700);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(letter, cx, cy + size * 0.03);
  c.textAlign = 'left';
}

/** Glyph then label, vertically centred on `cy`. */
export function glyphLabel(c: CanvasRenderingContext2D, x: number, cy: number, letter: string, label: string, size: number, glyphSize: number, color: string, glyphInk: string, glyphFill: string) {
  glyph(c, x + glyphSize / 2, cy, glyphSize, letter, glyphFill, glyphInk);
  c.font = font(size);
  c.fillStyle = color;
  c.textBaseline = 'middle';
  c.fillText(label, x + glyphSize + Math.max(6, glyphSize * 0.4), cy);
}

export function hintsWidth(hints: [string, string][], size: number, glyphSize: number) {
  return hints.reduce((s, [, label], i) => s + glyphSize + 8 + measure(label, size) + (i ? 40 : 0), 0) + 2;
}

export function hints(c: CanvasRenderingContext2D, items: [string, string][], size: number, glyphSize: number, ink: string, glyphInk: string) {
  let x = 0;
  items.forEach(([k, label], i) => {
    if (i) x += 40;
    glyph(c, x + glyphSize / 2, 16, glyphSize, k, ink, glyphInk);
    c.font = font(size);
    c.fillStyle = ink;
    c.textBaseline = 'middle';
    c.fillText(label, x + glyphSize + 8, 16);
    x += glyphSize + 8 + measure(label, size);
  });
}

export function avatar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, icon: string, round: boolean, ring: boolean) {
  c.save();
  c.beginPath();
  if (round) c.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  else c.roundRect(x, y, w, h, Math.min(w, h) * 0.06);
  c.fillStyle = bg;
  c.fill();
  if (ring) {
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.stroke();
  }
  c.clip();
  c.font = `${Math.min(w, h) * 0.5}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(icon, x + w / 2, y + h / 2 + Math.min(w, h) * 0.04);
  c.restore();
}

export function cursor(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  c.save();
  c.shadowColor = color;
  c.shadowBlur = 10;
  c.strokeStyle = color;
  c.lineWidth = 5;
  c.beginPath();
  c.roundRect(x - 2.5, y - 2.5, w + 5, h + 5, 6);
  c.stroke();
  c.restore();
}

/** Footer controller placeholder: a handheld console. */
export function handheldIcon(c: CanvasRenderingContext2D, w: number, h: number, color: string) {
  c.save();
  c.scale(w / 80, h / 64);
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(6, 18, 68, 30, 8);
  c.rect(20, 22, 40, 22);
  c.moveTo(20, 18);
  c.lineTo(20, 48);
  c.moveTo(60, 18);
  c.lineTo(60, 48);
  c.stroke();
  c.restore();
}

export function gearIcon(c: CanvasRenderingContext2D, w: number, h: number, color: string) {
  const s = Math.min(w, h);
  c.save();
  c.translate(w / 2, h / 2);
  c.strokeStyle = color;
  c.lineWidth = s * 0.075;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(0, 0, s * 0.13, 0, Math.PI * 2);
  c.moveTo(s * 0.27, 0);
  c.arc(0, 0, s * 0.27, 0, Math.PI * 2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.moveTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3);
    c.lineTo(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4);
  }
  c.stroke();
  c.restore();
}

/** Game title above the focused icon; All Software shows it on a plate with a tip. */
export function tip(c: CanvasRenderingContext2D, title: string, w: number, h: number, size: number, color: string, plate: boolean, dark: boolean) {
  if (plate) {
    const bg = dark ? 'rgba(70,70,70,0.94)' : 'rgba(255,255,255,0.94)';
    c.fillStyle = bg;
    c.shadowColor = 'rgba(0,0,0,0.15)';
    c.shadowBlur = 3;
    c.fillRect(0, 0, w, h);
    c.shadowBlur = 0;
    c.beginPath();
    c.moveTo(w / 2 - 9, h);
    c.lineTo(w / 2 + 9, h);
    c.lineTo(w / 2, h + 9);
    c.fill();
  }
  c.font = font(size);
  c.fillStyle = color;
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillText(title, w / 2, h / 2);
  c.textAlign = 'left';
}

/** "All Software" header: a grid icon and the title. */
export function gridTitle(c: CanvasRenderingContext2D, title: string, size: number, color: string) {
  c.strokeStyle = color;
  c.lineWidth = 3;
  for (const [x, y] of [
    [3, 7],
    [23, 7],
    [3, 27],
    [23, 27],
  ])
    c.strokeRect(x, y, 14, 14);
  c.font = font(size);
  c.fillStyle = color;
  c.textBaseline = 'middle';
  c.fillText(title, 52, 24);
}
