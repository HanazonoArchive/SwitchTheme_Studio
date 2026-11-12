/**
 * Corner radii in the pane's own space. qlaunch rounds corners after the pane's scale: a 72×72
 * pane scaled 2×1.3 with radius 58 is a pill with round ends (Gengar's applet buttons on the
 * console), not an ellipse. With a uniform scale this is the plain clamped radius.
 */
export function cornerRadii(r: number, w: number, h: number, sx: number, sy: number): [number, number] {
  const ax = Math.abs(sx) || 1;
  const ay = Math.abs(sy) || 1;
  if (Math.abs(ax - ay) < 1e-3) {
    const k = Math.max(0, Math.min(r, w / 2, h / 2));
    return [k, k];
  }
  const R = Math.max(0, Math.min(r * Math.min(ax, ay), (w * ax) / 2, (h * ay) / 2));
  return [R / ax, R / ay];
}
