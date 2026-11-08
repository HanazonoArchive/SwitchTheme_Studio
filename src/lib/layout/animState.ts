import { animationFromJson, curveValue, parseBflan, type Animation } from '../nx/bflan';
import type { BflytPane } from '../nx/bflyt';
import type { LayoutPatch } from './patch';
import type { SystemLayout } from './systemLayouts';

/**
 * Resting state of a screen, rebuilt from the console's own animations.
 *
 * Layouts are authored with every optional element visible; qlaunch puts the screen in its idle
 * state by playing animations. Their names describe system events, not elements (RdtBase_GameIn is
 * "a game is launching" and fades the whole menu out), so the idle recipe is explicit, checked
 * against firmware 23.0.1 dumps:
 *  - every layout: In, unfocused, inactive; optional features (downloads, suspend, promos, game card,
 *    balloons) at the end of their Out;
 *  - per-layout extras below.
 */
type Step = [suffix: string, at: 'start' | 'end'];

const GENERIC: Step[] = [
  ['In', 'end'],
  ['UnFocusKey', 'end'],
  ['UnfocusKey', 'end'],
  ['UnFocusTouch', 'end'],
  ['Inactive', 'end'],
  ['DlOut', 'end'],
  ['SuspendOut', 'end'],
  ['PromoOut', 'end'],
  ['CardOut', 'end'],
  ['CardStatusOut', 'end'],
  ['DigitalBundleOut', 'end'],
  ['EffectLaunchOut', 'end'],
];

const PER_LAYOUT: Record<string, Step[]> = {
  RdtBase: [['Enter', 'end'], ['RefreshIn', 'end'], ['BtnChangeUserIn', 'end'], ['MyPage', 'end']],
  RdtBtnIconGame: [['BaseOut', 'end']],
  EntMain: [['LockMainIn', 'end'], ['SpecialNewsTextOut', 'end']],
  FlcCntMain: [['ContentsIn', 'end'], ['RefreshIn', 'end']],
};

/** Shown or hidden by code rather than animations; hidden in the idle preview. */
export const RUNTIME_HIDDEN: Record<string, string[]> = {
  'blyt/RdtBase.bflyt': ['L_ChildLock'],
  'blyt/FlcCntMain.bflyt': ['L_Loading', 'T_00', 'T_Empty'],
};

export interface MaterialOverride {
  black?: [number?, number?, number?, number?];
  white?: [number?, number?, number?, number?];
}

const animCache = new WeakMap<Uint8Array, Animation | null>();

function loadStock(bytes: Uint8Array): Animation | null {
  if (!animCache.has(bytes)) {
    try {
      animCache.set(bytes, parseBflan(bytes));
    } catch {
      animCache.set(bytes, null);
    }
  }
  return animCache.get(bytes) ?? null;
}

/** Theme animations replace stock files with the same name (as the installer does). */
function getAnimation(sys: SystemLayout, layout: LayoutPatch, name: string): Animation | null {
  const themed = layout.Anims?.find((a) => a.FileName === name);
  if (themed) {
    try {
      return animationFromJson(themed.AnimJson);
    } catch {
      /* fall back to stock */
    }
  }
  const bytes = sys.animations.get(name);
  return bytes ? loadStock(bytes) : null;
}

/** Ordered list of (animation, which end) that brings `layoutFile` to rest. */
export function restingAnimations(sys: SystemLayout, layoutFile: string): { name: string; at: 'start' | 'end' }[] {
  const base = layoutFile.replace(/^blyt\//, '').replace(/\.bflyt$/, '');
  const steps: Step[] = [...GENERIC, ...(PER_LAYOUT[base] ?? [])];
  // Popup balloons are closed when idle.
  if (/Balloon/.test(base)) steps.push(['Out', 'end']);
  return steps
    .map(([suffix, at]) => ({ name: `anim/${base}_${suffix}.bflan`, at }))
    .filter((s) => sys.animations.has(s.name));
}

const FLPA = ['tx', 'ty', 'tz', 'rx', 'ry', 'rz', 'sx', 'sy', 'w', 'h'] as const;

/** Applies the resting animations to a (patched, cloned) pane tree in place. */
export function applyRestingState(root: BflytPane, sys: SystemLayout, layout: LayoutPatch, layoutFile: string, materials: Map<string, MaterialOverride>) {
  const index = new Map<string, BflytPane>();
  const walk = (p: BflytPane) => {
    if (!index.has(p.name)) index.set(p.name, p);
    p.children.forEach(walk);
  };
  walk(root);
  for (const n of RUNTIME_HIDDEN[layoutFile] ?? []) {
    const p = index.get(n);
    if (p) p.visible = false;
  }

  for (const step of restingAnimations(sys, layoutFile)) {
    const anim = getAnimation(sys, layout, step.name);
    if (!anim) continue;
    for (const entry of anim.entries) {
      if (entry.target === 0) {
        const pane = index.get(entry.name);
        if (!pane) continue;
        for (const tag of entry.tags) {
          for (const c of tag.curves) {
            const v = curveValue(c, step.at);
            if (v === undefined) continue;
            if (tag.type === 'FLVI' && c.target === 0) pane.visible = v >= 0.5;
            else if (tag.type === 'FLVC' && c.target === 16) pane.alpha = Math.max(0, Math.min(255, v));
            else if (tag.type === 'FLPA') {
              const k = FLPA[c.target];
              if (k === 'tx') pane.position = { ...pane.position, X: v };
              else if (k === 'ty') pane.position = { ...pane.position, Y: v };
              else if (k === 'rz') pane.rotation = { ...pane.rotation, Z: v };
              else if (k === 'sx') pane.scale = { ...pane.scale, X: v };
              else if (k === 'sy') pane.scale = { ...pane.scale, Y: v };
              else if (k === 'w') pane.size = { ...pane.size, X: v };
              else if (k === 'h') pane.size = { ...pane.size, Y: v };
            }
          }
        }
      } else if (entry.target === 1) {
        for (const tag of entry.tags) {
          if (tag.type !== 'FLMC') continue;
          const o = materials.get(entry.name) ?? {};
          for (const c of tag.curves) {
            const v = curveValue(c, step.at);
            if (v === undefined) continue;
            const which = c.target < 4 ? 'black' : 'white';
            const arr = [...(o[which] ?? [])] as [number?, number?, number?, number?];
            arr[c.target % 4] = Math.max(0, Math.min(255, v));
            o[which] = arr;
          }
          materials.set(entry.name, o);
        }
      }
    }
  }
}
