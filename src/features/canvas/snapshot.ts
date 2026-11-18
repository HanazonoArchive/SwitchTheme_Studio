import { Rectangle, type Application } from 'pixi.js';

/** The renderer last created (the canvas preview), for snapshots of what it shows. */
let lastApp: Application | null = null;

/** Registers the preview's renderer (or clears it when `old` is the one being destroyed). */
export function setSnapshotApp(app: Application | null, old?: Application | null) {
  if (app) lastApp = app;
  else if (old === lastApp) lastApp = null;
}

/**
 * A picture of part of the preview (layout pixels), as a PNG data URL, or null when nothing is
 * drawn yet. Used for the console's default icons in the Assets tab.
 */
export function snapshotRegion(x: number, y: number, w: number, h: number): string | null {
  const app = lastApp;
  if (!app || w < 1 || h < 1) return null;
  try {
    const c = app.renderer.extract.canvas({ target: app.stage, frame: new Rectangle(x, y, w, h), resolution: 2 }) as HTMLCanvasElement;
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}


/**
 * The whole screen as the console would show it (layout pixels, 1:1), as a PNG blob: for sharing,
 * or for the screenshot Themezer asks for when uploading. Selection outlines aren't part of the
 * picture (they're drawn over the canvas, not in it).
 */
export async function snapshotScreen(width: number, height: number): Promise<Blob | null> {
  const app = lastApp;
  if (!app) return null;
  try {
    const c = app.renderer.extract.canvas({ target: app.stage, frame: new Rectangle(0, 0, width, height), resolution: 1 }) as HTMLCanvasElement;
    return await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  } catch {
    return null;
  }
}
