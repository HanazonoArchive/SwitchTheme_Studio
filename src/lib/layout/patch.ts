import type { BflytFile, BflytPane, Origin, Vec2, Vec3 } from '../nx/bflyt';

/**
 * layout.json model, mirroring SwitchThemesCommon/Layouts/LayoutPatches.cs.
 *
 * Important semantics copied from the injector (PatchingExtension.ApplyLayoutPatch):
 *  - Position/Rotation/Scale/Size REPLACE the whole vector. The JSON is deserialized into a
 *    C# struct, so a missing component is 0, not "unchanged": {"Position":{"Y":10}} moves the
 *    pane to X=0, Y=10, Z=0.
 *  - Missing properties (no Position key at all) leave the stock value untouched.
 *  - A patch for a pane name that doesn't exist in the file is silently ignored.
 */

export interface JVec2 {
  X?: number;
  Y?: number;
}
export interface JVec3 extends JVec2 {
  Z?: number;
}

export interface PanePatch {
  PaneName: string;
  Position?: JVec3;
  Rotation?: JVec3;
  Scale?: JVec2;
  Size?: JVec2;
  Visible?: boolean;
  OriginX?: number;
  OriginY?: number;
  ParentOriginX?: number;
  ParentOriginY?: number;
  ColorTL?: string;
  ColorTR?: string;
  ColorBL?: string;
  ColorBR?: string;
  UsdPatches?: unknown[];
  [key: string]: unknown;
}

export interface LayoutFilePatch {
  FileName: string;
  Patches?: PanePatch[];
  AddGroups?: unknown[];
  Materials?: unknown[];
  PushBackPanes?: string[];
  PullFrontPanes?: string[];
  [key: string]: unknown;
}

export interface LayoutPatch {
  PatchName?: string;
  AuthorName?: string;
  TargetName?: string;
  ID?: string;
  HideOnlineBtn?: boolean;
  TargetFirmware?: number;
  Files?: LayoutFilePatch[];
  Anims?: { FileName: string; AnimJson: string }[];
  [key: string]: unknown;
}

/** Editable transform of a pane as the console will see it. */
export interface PaneState {
  visible: boolean;
  position: Vec3;
  rotation: Vec3;
  scale: Vec2;
  size: Vec2;
  originX: Origin;
  originY: Origin;
  parentOriginX: Origin;
  parentOriginY: Origin;
  colors?: { TL?: string; TR?: string; BL?: string; BR?: string };
}

export type VectorField = 'Position' | 'Rotation' | 'Scale' | 'Size';

export const paneKey = (file: string, pane: string) => `${file}::${pane}`;
export const splitPaneKey = (key: string) => {
  const i = key.lastIndexOf('::');
  return { file: key.slice(0, i), pane: key.slice(i + 2) };
};

export const v3 = (v: JVec3): Vec3 => ({ X: v.X ?? 0, Y: v.Y ?? 0, Z: v.Z ?? 0 });
export const v2 = (v: JVec2): Vec2 => ({ X: v.X ?? 0, Y: v.Y ?? 0 });

export function hasLayoutChanges(layout: LayoutPatch | undefined | null) {
  if (!layout) return false;
  return Boolean(layout.Files?.some((f) => (f.Patches?.length ?? 0) > 0 || f.AddGroups?.length || f.Materials?.length) || layout.Anims?.length);
}

export function findFilePatch(layout: LayoutPatch, file: string) {
  return layout.Files?.find((f) => f.FileName === file);
}

export function findPanePatch(layout: LayoutPatch, file: string, pane: string): PanePatch | undefined {
  return findFilePatch(layout, file)?.Patches?.find((p) => p.PaneName === pane);
}

/** Stock state of a parsed pane. */
export function stockState(p: BflytPane): PaneState {
  return {
    visible: p.visible,
    position: { ...p.position },
    rotation: { ...p.rotation },
    scale: { ...p.scale },
    size: { ...p.size },
    originX: p.originX,
    originY: p.originY,
    parentOriginX: p.parentOriginX,
    parentOriginY: p.parentOriginY,
    colors: p.colors ? { ...p.colors } : undefined,
  };
}

/** Neutral fallback used when the console's stock layout isn't loaded. */
export const UNKNOWN_STOCK: PaneState = {
  visible: true,
  position: { X: 0, Y: 0, Z: 0 },
  rotation: { X: 0, Y: 0, Z: 0 },
  scale: { X: 1, Y: 1 },
  size: { X: 0, Y: 0 },
  originX: 0,
  originY: 0,
  parentOriginX: 0,
  parentOriginY: 0,
};

/** Applies one pane patch on top of a stock state, exactly like the injector does. */
export function applyPanePatch(stock: PaneState, patch: PanePatch | undefined): PaneState {
  if (!patch) return stock;
  const s: PaneState = {
    ...stock,
    position: patch.Position ? v3(patch.Position) : stock.position,
    rotation: patch.Rotation ? v3(patch.Rotation) : stock.rotation,
    scale: patch.Scale ? v2(patch.Scale) : stock.scale,
    size: patch.Size ? v2(patch.Size) : stock.size,
    visible: patch.Visible ?? stock.visible,
    originX: (patch.OriginX ?? stock.originX) as Origin,
    originY: (patch.OriginY ?? stock.originY) as Origin,
    parentOriginX: (patch.ParentOriginX ?? stock.parentOriginX) as Origin,
    parentOriginY: (patch.ParentOriginY ?? stock.parentOriginY) as Origin,
  };
  if (patch.ColorTL || patch.ColorTR || patch.ColorBL || patch.ColorBR) {
    s.colors = {
      ...stock.colors,
      ...(patch.ColorTL ? { TL: patch.ColorTL } : {}),
      ...(patch.ColorTR ? { TR: patch.ColorTR } : {}),
      ...(patch.ColorBL ? { BL: patch.ColorBL } : {}),
      ...(patch.ColorBR ? { BR: patch.ColorBR } : {}),
    };
  }
  return s;
}

/** Breadth-first lookup, same order as BflytFile.FindPane in the injector. */
export function findPaneBfs(file: BflytFile, name: string): BflytPane | undefined {
  if (!file.root) return undefined;
  const queue = [file.root];
  while (queue.length) {
    const p = queue.shift()!;
    if (p.name === name) return p;
    queue.push(...p.children);
  }
  return undefined;
}

/** Returns a deep copy of the layout with every matching patch applied to the pane tree. */
export function applyLayoutToBflyt(file: BflytFile, filePatch: LayoutFilePatch | undefined): BflytPane | null {
  if (!file.root) return null;
  const clone = (p: BflytPane): BflytPane => ({ ...p, children: p.children.map(clone) });
  const root = clone(file.root);
  if (!filePatch?.Patches?.length) return root;

  const index = new Map<string, BflytPane>();
  const queue = [root];
  while (queue.length) {
    const p = queue.shift()!;
    if (!index.has(p.name)) index.set(p.name, p);
    queue.push(...p.children);
  }

  for (const patch of filePatch.Patches) {
    const target = index.get(patch.PaneName);
    if (!target) continue;
    const next = applyPanePatch(stockState(target), patch);
    target.visible = next.visible;
    target.position = next.position;
    target.rotation = next.rotation;
    target.scale = next.scale;
    target.size = next.size;
    target.originX = next.originX;
    target.originY = next.originY;
    target.parentOriginX = next.parentOriginX;
    target.parentOriginY = next.parentOriginY;
    if (next.colors && target.kind === 'pic1') target.colors = { ...target.colors!, ...next.colors } as BflytPane['colors'];
  }
  return root;
}

/* -------------------------------------------------------------------------- */
/* Immutable editing helpers                                                   */
/* -------------------------------------------------------------------------- */

export interface PaneEdit {
  visible?: boolean;
  position?: Partial<Vec3>;
  rotation?: Partial<Vec3>;
  scale?: Partial<Vec2>;
  size?: Partial<Vec2>;
  originX?: Origin;
  originY?: Origin;
  parentOriginX?: Origin;
  parentOriginY?: Origin;
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Applies an edit to a pane and returns a new layout. Only the fields that are edited are
 * written, and vectors are always written with every component filled in from the pane's
 * current effective value, so the injector's "missing component = 0" rule can't bite.
 */
export function editPane(layout: LayoutPatch, file: string, pane: string, current: PaneState, edit: PaneEdit): LayoutPatch {
  const files = [...(layout.Files ?? [])];
  let fi = files.findIndex((f) => f.FileName === file);
  if (fi < 0) {
    files.push({ FileName: file, Patches: [] });
    fi = files.length - 1;
  }
  const fp = { ...files[fi], Patches: [...(files[fi].Patches ?? [])] };
  let pi = fp.Patches.findIndex((p) => p.PaneName === pane);
  if (pi < 0) {
    fp.Patches.push({ PaneName: pane });
    pi = fp.Patches.length - 1;
  }
  const p: PanePatch = { ...fp.Patches[pi] };

  if (edit.position) {
    const n = { ...current.position, ...edit.position };
    p.Position = { X: round(n.X), Y: round(n.Y), Z: round(n.Z) };
  }
  if (edit.rotation) {
    const n = { ...current.rotation, ...edit.rotation };
    p.Rotation = { X: round(n.X), Y: round(n.Y), Z: round(n.Z) };
  }
  if (edit.scale) {
    const n = { ...current.scale, ...edit.scale };
    p.Scale = { X: round(n.X), Y: round(n.Y) };
  }
  if (edit.size) {
    const n = { ...current.size, ...edit.size };
    p.Size = { X: round(n.X), Y: round(n.Y) };
  }
  if (edit.visible !== undefined) p.Visible = edit.visible;
  if (edit.originX !== undefined) p.OriginX = edit.originX;
  if (edit.originY !== undefined) p.OriginY = edit.originY;
  if (edit.parentOriginX !== undefined) p.ParentOriginX = edit.parentOriginX;
  if (edit.parentOriginY !== undefined) p.ParentOriginY = edit.parentOriginY;

  fp.Patches[pi] = p;
  files[fi] = fp;
  return { ...layout, Files: files };
}

/** Removes one property (or the whole patch when `field` is omitted) for a pane. */
export function revertPane(layout: LayoutPatch, file: string, pane: string, field?: keyof PanePatch): LayoutPatch {
  const files = (layout.Files ?? [])
    .map((f) => {
      if (f.FileName !== file) return f;
      const patches = (f.Patches ?? [])
        .map((p) => {
          if (p.PaneName !== pane) return p;
          if (!field) return null;
          const next = { ...p };
          delete next[field];
          return Object.keys(next).length > 1 ? next : null;
        })
        .filter((p): p is PanePatch => p !== null);
      return { ...f, Patches: patches };
    })
    .filter((f) => (f.Patches?.length ?? 0) > 0 || f.AddGroups?.length || f.Materials?.length || f.PushBackPanes || f.PullFrontPanes);
  return { ...layout, Files: files };
}

/** Lists patch fields that set a vector with missing components (relevant for imported themes). */
export function findImplicitZeroVectors(layout: LayoutPatch) {
  const issues: { file: string; pane: string; field: VectorField; missing: string[] }[] = [];
  for (const f of layout.Files ?? []) {
    for (const p of f.Patches ?? []) {
      for (const field of ['Position', 'Rotation', 'Scale', 'Size'] as const) {
        const v = p[field] as JVec3 | undefined;
        if (!v) continue;
        const keys = field === 'Position' || field === 'Rotation' ? ['X', 'Y', 'Z'] : ['X', 'Y'];
        const missing = keys.filter((k) => (v as Record<string, number | undefined>)[k] === undefined);
        // Z is almost always 0 in stock layouts, don't flag it.
        const meaningful = missing.filter((k) => k !== 'Z');
        if (meaningful.length) issues.push({ file: f.FileName, pane: p.PaneName, field, missing: meaningful });
      }
    }
  }
  return issues;
}
