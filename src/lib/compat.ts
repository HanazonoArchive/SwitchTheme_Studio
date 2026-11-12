/**
 * What the studio needs from the browser. Missing pieces are listed in a banner instead of the
 * app failing silently (a blank canvas, a theme that can't be saved).
 */
export interface CompatIssue {
  what: string;
  effect: string;
  severe: boolean;
}

export function checkCompat(): CompatIssue[] {
  const out: CompatIssue[] = [];
  if (typeof window === 'undefined') return out;
  let gl = false;
  try {
    const c = document.createElement('canvas');
    gl = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    gl = false;
  }
  if (!gl) out.push({ what: 'WebGL', effect: 'the preview can’t be drawn. Turn on hardware acceleration in the browser settings, or update the browser.', severe: true });
  if (!('indexedDB' in window)) out.push({ what: 'Site storage (IndexedDB)', effect: 'themes and console files aren’t remembered between visits (private windows often block it). Export your work.', severe: false });
  if (typeof createImageBitmap === 'undefined') out.push({ what: 'createImageBitmap', effect: 'pictures can’t be imported.', severe: true });
  if (typeof ResizeObserver === 'undefined') out.push({ what: 'ResizeObserver', effect: 'the canvas won’t follow the window size.', severe: false });
  if (typeof PointerEvent === 'undefined') out.push({ what: 'Pointer events', effect: 'dragging on the canvas won’t work.', severe: true });
  if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports('color', 'color-mix(in oklab, red, blue)'))
    out.push({ what: 'Modern CSS', effect: 'some colours may look off. Chrome/Edge 111+, Firefox 113+ or Safari 16.4+ are recommended.', severe: false });
  if (typeof Blob === 'undefined') out.push({ what: 'Blob', effect: 'files can’t be read.', severe: true });
  return out;
}
