import type { ImageAdjustments, Wallpaper, WallpaperFormat } from '../../types/theme';

export const SCREEN_W = 1280;
export const SCREEN_H = 720;

/** Reads JPEG dimensions and whether it is progressive (SOF2) by walking the markers. */
export function readJpegInfo(bytes: Uint8Array): { width: number; height: number; progressive: boolean } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
        progressive: marker === 0xc2 || marker === 0xc6 || marker === 0xca || marker === 0xce,
      };
    }
    i += 2 + len;
  }
  return null;
}

/** Reads a DDS header (FourCC + size). */
export function readDdsInfo(bytes: Uint8Array): { width: number; height: number; fourCC: string } | null {
  if (bytes.length < 128 || bytes[0] !== 0x44 || bytes[1] !== 0x44 || bytes[2] !== 0x53 || bytes[3] !== 0x20) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    height: v.getUint32(12, true),
    width: v.getUint32(16, true),
    fourCC: String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87]),
  };
}

/** BC1/DXT1 decoder, only used to preview .dds wallpapers (browsers can't show DDS). */
export function decodeDxt1(bytes: Uint8Array, width: number, height: number): ImageData {
  const out = new ImageData(width, height);
  const px = out.data;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 128;
  const c565 = (c: number) => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];
  for (let by = 0; by < Math.ceil(height / 4); by++) {
    for (let bx = 0; bx < Math.ceil(width / 4); bx++) {
      if (o + 8 > bytes.length) return out;
      const c0 = v.getUint16(o, true);
      const c1 = v.getUint16(o + 2, true);
      const bits = v.getUint32(o + 4, true);
      o += 8;
      const a = c565(c0);
      const b = c565(c1);
      const palette =
        c0 > c1
          ? [a, b, a.map((x, i) => (2 * x + b[i]) / 3), a.map((x, i) => (x + 2 * b[i]) / 3)]
          : [a, b, a.map((x, i) => (x + b[i]) / 2), [0, 0, 0]];
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const X = bx * 4 + x;
          const Y = by * 4 + y;
          if (X >= width || Y >= height) continue;
          const idx = (bits >> (2 * (y * 4 + x))) & 3;
          const p = (Y * width + X) * 4;
          px[p] = palette[idx][0];
          px[p + 1] = palette[idx][1];
          px[p + 2] = palette[idx][2];
          px[p + 3] = c0 <= c1 && idx === 3 ? 0 : 255;
        }
      }
    }
  }
  return out;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), type, quality),
  );
}

function formatFromName(name: string): WallpaperFormat {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  if (ext === 'dds') return 'dds';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  return 'other';
}

/** Builds a Wallpaper from any image the user drops, or from image.jpg / image.dds in an nxtheme. */
export async function loadWallpaper(blob: Blob, fileName: string): Promise<Wallpaper> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const format = formatFromName(fileName);

  if (format === 'dds' || readDdsInfo(bytes)) {
    const info = readDdsInfo(bytes);
    if (!info) throw new Error(`${fileName} is not a valid DDS file`);
    let displayUrl = '';
    if (info.fourCC === 'DXT1') {
      const canvas = document.createElement('canvas');
      canvas.width = info.width;
      canvas.height = info.height;
      canvas.getContext('2d')!.putImageData(decodeDxt1(bytes, info.width, info.height), 0, 0);
      displayUrl = URL.createObjectURL(await canvasToBlob(canvas, 'image/png'));
    }
    return { blob, fileName, format: 'dds', width: info.width, height: info.height, ddsEncoding: info.fourCC, displayUrl };
  }

  const jpg = readJpegInfo(bytes);
  if (jpg) {
    return { blob, fileName, format: 'jpg', width: jpg.width, height: jpg.height, progressive: jpg.progressive, displayUrl: URL.createObjectURL(blob) };
  }

  const bmp = await createImageBitmap(blob);
  const res: Wallpaper = { blob, fileName, format, width: bmp.width, height: bmp.height, displayUrl: URL.createObjectURL(blob) };
  bmp.close();
  return res;
}

/** Problems the installer would reject, or that change how the image looks on the console. */
export function wallpaperIssues(w: Wallpaper): string[] {
  const issues: string[] = [];
  if (w.width !== SCREEN_W || w.height !== SCREEN_H) issues.push(`Image is ${w.width}×${w.height}; it will be cropped to fill 1280×720 on export.`);
  if (w.format === 'jpg' && w.progressive) issues.push('Progressive JPEG; it will be re-encoded as baseline on export.');
  if (w.format === 'dds' && w.ddsEncoding !== 'DXT1') issues.push(`DDS is ${w.ddsEncoding}; only DXT1 is allowed for backgrounds. Re-import as JPG/PNG.`);
  if (w.format === 'png' || w.format === 'webp' || w.format === 'other') issues.push('Will be converted to image.jpg on export.');
  return issues;
}

/** Same math the preview and export share: CSS brightness() then contrast(), then a black dim layer. */
export function adjustPixels(data: Uint8ClampedArray, a: ImageAdjustments) {
  const keep = 1 - a.dim;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = data[i + c] / 255;
      v *= a.brightness;
      v = (v - 0.5) * a.contrast + 0.5;
      v *= keep;
      data[i + c] = Math.round(Math.min(1, Math.max(0, v)) * 255);
    }
  }
}

/**
 * Renders the wallpaper exactly as it will be shipped: center-cropped to 1280×720 with
 * adjustments baked in. Used for both the viewport and the export, so they can't drift.
 */
export async function renderWallpaper(w: Wallpaper, a: ImageAdjustments): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = w.displayUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const scale = Math.max(SCREEN_W / img.naturalWidth, SCREEN_H / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.drawImage(img, (SCREEN_W - dw) / 2, (SCREEN_H - dh) / 2, dw, dh);
  if (a.brightness !== 1 || a.contrast !== 1 || a.dim !== 0) {
    const data = ctx.getImageData(0, 0, SCREEN_W, SCREEN_H);
    adjustPixels(data.data, a);
    ctx.putImageData(data, 0, 0);
  }
  return canvas;
}

/** Returns the file to put in the .nxtheme: { name: image.jpg | image.dds, blob }. */
export async function exportWallpaper(w: Wallpaper, a: ImageAdjustments): Promise<{ name: string; blob: Blob; reencoded: boolean }> {
  const untouched = a.brightness === 1 && a.contrast === 1 && a.dim === 0;
  const right = w.width === SCREEN_W && w.height === SCREEN_H;
  if (untouched && right && w.format === 'jpg' && !w.progressive) return { name: 'image.jpg', blob: w.blob, reencoded: false };
  if (untouched && right && w.format === 'dds' && w.ddsEncoding === 'DXT1') return { name: 'image.dds', blob: w.blob, reencoded: false };
  if (w.format === 'dds' && w.ddsEncoding !== 'DXT1') throw new Error(`The ${w.ddsEncoding} DDS wallpaper can't be exported; only DXT1 DDS or JPG are allowed.`);
  const canvas = await renderWallpaper(w, a);
  // Browser canvas encoders write baseline JPEGs, which is what the installer needs.
  return { name: 'image.jpg', blob: await canvasToBlob(canvas, 'image/jpeg', 0.95), reencoded: true };
}
