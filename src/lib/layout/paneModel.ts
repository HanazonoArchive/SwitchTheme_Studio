import type { PaneKind } from '../nx/bflyt';
import {
  applyPanePatch,
  findFilePatch,
  findPanePatch,
  findPaneBfs,
  splitPaneKey,
  stockState,
  UNKNOWN_STOCK,
  type LayoutFilePatch,
  type LayoutPatch,
  type PanePatch,
  type PaneState,
} from './patch';
import type { SystemLayout } from './systemLayouts';
import { installerFixes, type FixLayer } from './installerFixes';

export interface PaneInfo {
  key: string;
  file: string;
  name: string;
  kind: PaneKind | null;
  /**
   * What the theme starts from on this console: the stock pane plus any installer fixes
   * applied before the theme. null when the console layout isn't loaded or lacks the pane.
   */
  stock: PaneState | null;
  /** What the console will show: base + theme patch + installer fixes applied after it. */
  current: PaneState;
  patch: PanePatch | undefined;
  /** The patch targets a pane that isn't in the loaded layout (it will be ignored on console). */
  missingInStock: boolean;
  /** Installer fixes that touch this pane. */
  fixes: FixLayer[];
}

/** Installer fixes for a screen, given the console's layout (none when it isn't loaded). */
export function fixesFor(layout: LayoutPatch, sys: SystemLayout | undefined) {
  return sys ? installerFixes(layout, sys.target, sys.firmware) : { before: [], after: [] };
}

/** Every patch layer for one layout file, in the order the installer applies them. */
export function fileLayers(layout: LayoutPatch, sys: SystemLayout | undefined, file: string): (LayoutFilePatch | undefined)[] {
  const { before, after } = fixesFor(layout, sys);
  return [...before.map((f) => findFilePatch(f.patch, file)), findFilePatch(layout, file), ...after.map((f) => findFilePatch(f.patch, file))];
}

export function getPaneInfo(layout: LayoutPatch, sys: SystemLayout | undefined, key: string): PaneInfo {
  const { file, pane } = splitPaneKey(key);
  const patch = findPanePatch(layout, file, pane);
  const bflyt = sys?.layouts.get(file);
  const node = bflyt ? findPaneBfs(bflyt, pane) : undefined;
  const { before, after } = fixesFor(layout, sys);

  let base: PaneState | null = node ? stockState(node) : null;
  if (base) for (const f of before) base = applyPanePatch(base, findPanePatch(f.patch, file, pane));

  let current = applyPanePatch(base ?? UNKNOWN_STOCK, patch);
  for (const f of after) current = applyPanePatch(current, findPanePatch(f.patch, file, pane));

  return {
    key,
    file,
    name: pane,
    kind: node?.kind ?? null,
    stock: base,
    current,
    patch,
    missingInStock: Boolean(sys && (!bflyt || !node)),
    fixes: [...before, ...after].filter((f) => findPanePatch(f.patch, file, pane)),
  };
}

/** Which properties of the patch differ from stock (for "modified" markers). */
export function changedFields(info: PaneInfo) {
  const p = info.patch;
  if (!p) return new Set<string>();
  return new Set(Object.keys(p).filter((k) => k !== 'PaneName'));
}
