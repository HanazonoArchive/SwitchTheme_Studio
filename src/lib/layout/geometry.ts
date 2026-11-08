import type { BflytPane } from '../nx/bflyt';

/**
 * nn::ui2d reads the pane's basePosition byte as: bits 0-1 origin X, 2-3 origin Y, 4-5 parent X,
 * 6-7 parent Y. SwitchThemeInjector (and layout.json) names those same bits ParentOriginY,
 * ParentOriginX, OriginY, OriginX respectively, so map them back here. Values: 0 centre,
 * 1 left/top, 2 right/bottom.
 */
export function realAnchors(p: { originX: number; originY: number; parentOriginX: number; parentOriginY: number }) {
  return { originX: p.parentOriginY, originY: p.parentOriginX, parentX: p.originY, parentY: p.originX };
}

/**
 * Themes hide or stretch things with extreme scales that cancel out further down (Purple Skies
 * sets N_GameRoot X scale 1e-5 and N_Game 100000). Browsers drop layers with such transforms, so
 * push an extreme scale on a plain null pane into its children (same world transform).
 */
export function flattenExtremeScales(p: BflytPane) {
  const extreme = (v: number) => v !== 0 && (Math.abs(v) < 1e-2 || Math.abs(v) > 1e2);
  if (p.kind === 'pan1' && p.children.length && (extreme(p.scale.X) || extreme(p.scale.Y))) {
    const sx = extreme(p.scale.X) ? p.scale.X : 1;
    const sy = extreme(p.scale.Y) ? p.scale.Y : 1;
    p.scale = { X: p.scale.X / sx, Y: p.scale.Y / sy };
    p.size = { X: p.size.X * sx, Y: p.size.Y * sy };
    for (const c of p.children) {
      c.position = { ...c.position, X: c.position.X * sx, Y: c.position.Y * sy };
      c.scale = { X: c.scale.X * sx, Y: c.scale.Y * sy };
    }
  }
  p.children.forEach(flattenExtremeScales);
}
