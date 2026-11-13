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

