import type { ScreenTarget } from '../../types/theme';
import type { LayoutFilePatch, LayoutPatch, MaterialPatch, PanePatch, UsdPatch } from './patch';

/**
 * Ready-made layouts to start from, per screen: the community layouts published on Themezer
 * (github.com/ThemezerNX/Layouts, MPL-2.0), repackaged by scripts/import-themezer-layouts.mjs into
 * public/presets/<target>.json. Like on Themezer, a layout can have options: toggles and
 * choices that are small layout patches merged on top of it.
 */

export interface PresetOption {
  name: string;
  /** toggle: on/off; select: one of `choices`; integer/decimal/string: a value put into `patch`. */
  type: 'toggle' | 'select' | 'integer' | 'decimal' | 'string';
  priority: number;
  /** Offered for every layout of this screen (Themezer's _GLOBAL options). */
  global: boolean;
  /** Toggle: the patch merged when it's on. Value options: the patch, with ??{integer}?? tokens. */
  patch?: LayoutPatch;
  /** Value options: limits (a string's length for 'string'). */
  min?: number;
  max?: number;
  /** Select: one patch per choice; nothing selected leaves the layout as it is. */
  choices?: { name: string; patch: LayoutPatch }[];
}

export interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  author: string;
  color?: string;
  layout: LayoutPatch;
  /** common.json (home only on Themezer). */
  common?: LayoutPatch;
  options: PresetOption[];
}

/** Option values: a toggle's on/off, or the chosen name of a select (absent = none). */
export type PresetChoices = Record<string, boolean | string | undefined>;

const cache = new Map<ScreenTarget, Promise<LayoutPreset[]>>();

export function loadPresets(target: ScreenTarget): Promise<LayoutPreset[]> {
  let p = cache.get(target);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}presets/${target}.json`)
      .then((r) => (r.ok ? r.json() : { layouts: [] }))
      .then((j: { layouts: LayoutPreset[] }) => j.layouts ?? [])
      .catch(() => {
        cache.delete(target);
        return [];
      });
    cache.set(target, p);
  }
  return p;
}

const byKey = <T>(base: T[] | undefined, add: T[] | undefined, key: (t: T) => string, merge: (a: T, b: T) => T): T[] | undefined => {
  if (!add) return base;
  const out = [...(base ?? [])];
  for (const item of add) {
    const i = out.findIndex((o) => key(o) === key(item));
    // Themezer's delete marker: { <key>, "__self": null } removes that entry from the layout.
    if ((item as { __self?: unknown }).__self === null) {
      if (i >= 0) out.splice(i, 1);
    } else if (i >= 0) out[i] = merge(out[i], item);
    else out.push(item);
  }
  return out.length || base ? out : undefined;
};

const mergeUsd = (a: UsdPatch[] | undefined, b: UsdPatch[] | undefined) => byKey(a, b, (u) => u.PropName, (_x, y) => y);

const mergePane = (a: PanePatch, b: PanePatch): PanePatch => {
  const out: PanePatch = { ...a, ...b };
  if (a.UsdPatches || b.UsdPatches) out.UsdPatches = mergeUsd(a.UsdPatches, b.UsdPatches);
  return out;
};

const mergeFile = (a: LayoutFilePatch, b: LayoutFilePatch): LayoutFilePatch => {
  const out: LayoutFilePatch = { ...a, ...b };
  out.Patches = byKey(a.Patches, b.Patches, (p) => p.PaneName, mergePane);
  out.Materials = byKey(a.Materials, b.Materials, (m: MaterialPatch) => m.MaterialName, (x, y) => ({ ...x, ...y }));
  out.AddGroups = byKey(a.AddGroups as { GroupName?: string }[] | undefined, b.AddGroups as { GroupName?: string }[] | undefined, (g) => String(g.GroupName), (_x, y) => y);
  for (const k of ['PushBackPanes', 'PullFrontPanes'] as const) {
    if (a[k] || b[k]) out[k] = [...new Set([...(a[k] ?? []), ...(b[k] ?? [])])];
  }
  for (const k of Object.keys(out) as (keyof LayoutFilePatch)[]) if (out[k] === undefined) delete out[k];
  return out;
};

/**
 * Layers `add` over `base` the way a layout option is meant to apply: files by name, panes by
 * name (fields from `add` win), materials, groups and user data by name, animations replaced.
 */
export function mergeLayoutPatch(base: LayoutPatch, add: LayoutPatch): LayoutPatch {
  const out: LayoutPatch = { ...base, ...add };
  out.Files = byKey(base.Files, add.Files, (f) => f.FileName, mergeFile);
  out.Anims = byKey(base.Anims, add.Anims, (a) => a.FileName, (_x, y) => y);
  if (!out.Files) delete out.Files;
  if (!out.Anims) delete out.Anims;
  return out;
}

/** Drops delete markers left over (an entry deleted where the layout had nothing to delete). */
function dropDeleteMarkers<T>(v: T): T {
  if (Array.isArray(v)) return v.filter((x) => !(x && typeof x === 'object' && (x as { __self?: unknown }).__self === null)).map(dropDeleteMarkers) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (k !== '__self') out[k] = dropDeleteMarkers(x);
    return out as T;
  }
  return v;
}

/** A value option's patch with its token (??{integer}??, ??{decimal}??, ??{string}??) filled in. */
function withValue(patch: LayoutPatch, type: string, value: string): LayoutPatch {
  const token = `??{${type}}??`;
  const fill = (v: unknown): unknown =>
    typeof v === 'string' ? v.split(token).join(value) : Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
  return fill(patch) as LayoutPatch;
}

/** Whether a typed value suits a value option (numbers within limits, string length). */
export function validOptionValue(o: PresetOption, v: string): boolean {
  if (o.type === 'string') return (o.min === undefined || v.length >= o.min) && (o.max === undefined || v.length <= o.max);
  const n = Number(v);
  if (v.trim() === '' || !Number.isFinite(n) || (o.type === 'integer' && !Number.isInteger(n))) return false;
  return (o.min === undefined || n >= o.min) && (o.max === undefined || n <= o.max);
}

/** The preset's layout with the chosen options applied, in Themezer's priority order. */
export function composePreset(preset: LayoutPreset, choices: PresetChoices): { layout: LayoutPatch; common: LayoutPatch | null } {
  let layout: LayoutPatch = structuredClone(preset.layout);
  for (const o of preset.options) {
    const v = choices[o.name];
    const patch =
      o.type === 'toggle'
        ? v === true
          ? o.patch
          : undefined
        : o.type === 'select'
          ? o.choices?.find((c) => c.name === v)?.patch
          : typeof v === 'string' && v !== '' && o.patch
            ? withValue(o.patch, o.type, v)
            : undefined;
    if (patch) layout = mergeLayoutPatch(layout, structuredClone(patch));
  }
  return { layout: dropDeleteMarkers(layout), common: preset.common ? dropDeleteMarkers(structuredClone(preset.common)) : null };
}

/** Name the editor shows for an applied preset, kept in layout.json's PatchName. */
export const presetPatchName = (preset: LayoutPreset, choices: PresetChoices) => {
  const on = preset.options
    .filter((o) => (o.type === 'toggle' ? choices[o.name] === true : typeof choices[o.name] === 'string'))
    .map((o) => (o.type === 'toggle' ? o.name : o.type === 'select' ? String(choices[o.name]) : `${o.name} ${choices[o.name]}`));
  return on.length ? `${preset.name} (${on.join(', ')})` : preset.name;
};
