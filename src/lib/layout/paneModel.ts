import type { PaneKind } from '../nx/bflyt';
import { applyPanePatch, findPanePatch, findPaneBfs, splitPaneKey, stockState, UNKNOWN_STOCK, type LayoutPatch, type PanePatch, type PaneState } from './patch';
import type { SystemLayout } from './systemLayouts';

export interface PaneInfo {
  key: string;
  file: string;
  name: string;
  kind: PaneKind | null;
  /** null when the console layout isn't loaded or the pane doesn't exist in it. */
  stock: PaneState | null;
  /** What the console will show: stock + patch (or unknown-stock + patch). */
  current: PaneState;
  patch: PanePatch | undefined;
  /** The patch targets a pane that isn't in the loaded layout (it will be ignored on console). */
  missingInStock: boolean;
}

export function getPaneInfo(layout: LayoutPatch, sys: SystemLayout | undefined, key: string): PaneInfo {
  const { file, pane } = splitPaneKey(key);
  const patch = findPanePatch(layout, file, pane);
  const bflyt = sys?.layouts.get(file);
  const node = bflyt ? findPaneBfs(bflyt, pane) : undefined;
  const stock = node ? stockState(node) : null;
  return {
    key,
    file,
    name: pane,
    kind: node?.kind ?? null,
    stock,
    current: applyPanePatch(stock ?? UNKNOWN_STOCK, patch),
    patch,
    missingInStock: Boolean(sys && (!bflyt || !node)),
  };
}

/** Which properties of the patch differ from stock (for "modified" markers). */
export function changedFields(info: PaneInfo) {
  const p = info.patch;
  if (!p) return new Set<string>();
  return new Set(Object.keys(p).filter((k) => k !== 'PaneName'));
}
