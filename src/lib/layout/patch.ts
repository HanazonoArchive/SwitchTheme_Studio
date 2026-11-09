import type { BflytFile, BflytMaterial, BflytPane, Origin, Vec2, Vec3 } from '../nx/bflyt';

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
  UsdPatches?: UsdPatch[];
  [key: string]: unknown;
}

/** User data (usd1) edit: replaces a property with the same value count, or adds it. */
export interface UsdPatch {
  PropName: string;
  PropValues: string[];
  type: number;
}

/**
 * Material edit (SwitchThemesCommon MaterialPatch). ForegroundColor/BackgroundColor are the
 * material's first and second colour in the file, i.e. the black and white interpolation colours.
 */
export interface MaterialPatch {
  MaterialName: string;
  ForegroundColor?: string | null;
  BackgroundColor?: string | null;
  Refs?: { Name: string; WrapS?: number | null; WrapT?: number | null }[] | null;
  Transforms?: { Name: string; X?: number | null; Y?: number | null; Rotation?: number | null; ScaleX?: number | null; ScaleY?: number | null }[] | null;
}

export interface LayoutFilePatch {
  FileName: string;
  Patches?: PanePatch[];
  AddGroups?: unknown[];
  Materials?: MaterialPatch[];
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
  /** Legacy: makes the home applet icons draw from their alpha channel only, so they take the theme's colours. */
  PatchAppletColorAttrib?: boolean;
  TargetFirmware?: number;
  /** Obsolete pre-ID flag, still read by the installer to pick legacy fixes. */
  Ready8X?: boolean;
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

/**
 * Returns a deep copy of the layout with patches applied to the pane tree, in order
 * (installer fixes before the theme, the theme, fixes after), like SzsPatcher does: pane
 * patches, then PullFrontPanes (moved to the start of their parent = drawn first, behind) and
 * PushBackPanes (moved to the end = drawn last, in front).
 */
export function applyLayoutToBflyt(file: BflytFile, filePatches: LayoutFilePatch | undefined | (LayoutFilePatch | undefined)[]): BflytPane | null {
  if (!file.root) return null;
  const clone = (p: BflytPane): BflytPane => ({ ...p, children: p.children.map(clone) });
  const root = clone(file.root);
  const layers = (Array.isArray(filePatches) ? filePatches : [filePatches]).filter(
    (f): f is LayoutFilePatch => Boolean(f?.Patches?.length || f?.PullFrontPanes?.length || f?.PushBackPanes?.length),
  );
  if (!layers.length) return root;

  const index = new Map<string, BflytPane>();
  const parents = new Map<BflytPane, BflytPane>();
  const queue = [root];
  while (queue.length) {
    const p = queue.shift()!;
    if (!index.has(p.name)) index.set(p.name, p);
    for (const c of p.children) parents.set(c, p);
    queue.push(...p.children);
  }

  for (const layer of layers) {
    for (const patch of layer.Patches ?? []) {
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
      // On text panes the same four fields are the font and shadow colours (top/bottom).
      if (target.kind === 'txt1' && (patch.ColorTL || patch.ColorBL)) {
        target.fontColor = patch.ColorTL ?? target.fontColor;
        target.fontColorBottom = patch.ColorBL ?? patch.ColorTL ?? target.fontColorBottom;
        target.fontColorPatched = true;
      }
      if (patch.UsdPatches?.length) Object.assign(target, applyUsdPatches(target, patch.UsdPatches));
    }
    const move = (name: string, front: boolean) => {
      const p = index.get(name);
      const parent = p && parents.get(p);
      if (!p || !parent) return;
      const kids = parent.children.filter((c) => c !== p);
      parent.children = front ? [p, ...kids] : [...kids, p];
    };
    for (const n of layer.PullFrontPanes ?? []) move(n, true);
    for (const n of layer.PushBackPanes ?? []) move(n, false);
  }
  return root;
}

/**
 * usd1 edits, as the injector does them: a property with the same value count and type is
 * replaced, a missing one is added, anything else is left alone. Only numbers are supported.
 * Themes often add float properties (S_RoundRadius) typed as int32 holding the float's bits;
 * qlaunch reads those bits as a float, so huge ints are reinterpreted.
 */
export function applyUsdPatches(pane: Pick<BflytPane, 'userData' | 'userDataTypes'>, patches: UsdPatch[]): Pick<BflytPane, 'userData' | 'userDataTypes'> {
  const values: Record<string, number[]> = { ...(pane.userData ?? {}) };
  const types: Record<string, number> = { ...(pane.userDataTypes ?? {}) };
  const bits = new DataView(new ArrayBuffer(4));
  for (const u of patches) {
    if (u.type !== 1 && u.type !== 2) continue;
    let nums = (u.PropValues ?? []).map((v) => (u.type === 1 ? parseInt(v, 10) : parseFloat(v)));
    if (nums.some((v) => Number.isNaN(v))) continue;
    const cur = values[u.PropName];
    if (cur) {
      if (cur.length !== nums.length || (types[u.PropName] ?? u.type) !== u.type) continue;
    } else {
      types[u.PropName] = u.type;
      if (u.type === 1)
        nums = nums.map((v) => {
          if (Math.abs(v) < 1 << 24) return v;
          bits.setInt32(0, v);
          return bits.getFloat32(0);
        });
    }
    values[u.PropName] = nums;
  }
  return { userData: values, userDataTypes: types };
}

/** Material edits for one file (ApplyMaterialsPatch): colours, texture wrap and texture transforms. */
export function applyMaterialPatches(materials: BflytMaterial[], filePatches: (LayoutFilePatch | undefined)[]): BflytMaterial[] {
  const patches = filePatches.flatMap((f) => f?.Materials ?? []);
  if (!patches.length) return materials;
  return materials.map((m) => {
    let out = m;
    for (const p of patches) {
      if (p.MaterialName !== m.name) continue;
      out = { ...out, textures: [...out.textures], transforms: [...out.transforms] };
      if (p.ForegroundColor) out.black = p.ForegroundColor.toUpperCase();
      if (p.BackgroundColor) out.white = p.BackgroundColor.toUpperCase();
      for (const r of p.Refs ?? []) {
        const i = out.textures.findIndex((t) => t.name === r.Name);
        if (i < 0) continue;
        out.textures[i] = { ...out.textures[i], wrapS: r.WrapS ?? out.textures[i].wrapS, wrapT: r.WrapT ?? out.textures[i].wrapT };
      }
      for (const t of p.Transforms ?? []) {
        const i = out.textures.findIndex((x) => x.name === t.Name);
        const cur = out.transforms[i];
        if (i < 0 || !cur) continue;
        out.transforms[i] = { x: t.X ?? cur.x, y: t.Y ?? cur.y, rotation: t.Rotation ?? cur.rotation, scaleX: t.ScaleX ?? cur.scaleX, scaleY: t.ScaleY ?? cur.scaleY };
      }
    }
    return out;
  });
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
