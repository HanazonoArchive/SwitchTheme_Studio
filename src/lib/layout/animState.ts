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
  // Idle lock screen on 13.0+: news on the left, the suspended game and "Continue" on the right.
  EntMain: [['LockMainOut', 'end'], ['SpecialNewsTextOut', 'end']],
  FlcCntMain: [['ContentsIn', 'end'], ['RefreshIn', 'end']],
};

/**
 * Panes whose opacity qlaunch sets in code, overriding animations: game icons fade in as the row
 * appears (themes that set N_Root's alpha in Inactive, like PS5 by Rodel, still show their icons).
 */
const CODE_ALPHA: Record<string, string[]> = {
  'blyt/RdtBtnIconGame.bflyt': ['N_Root'],
};

/** Shown or hidden by code rather than animations; hidden in the idle preview. */
export const RUNTIME_HIDDEN: Record<string, string[]> = {
  'blyt/RdtBase.bflyt': ['L_ChildLock'],
  // Account buttons: the friend-request and error badges only show when there is one.
  'blyt/RdtBtnMyPage.bflyt': ['L_New', 'L_Error'],
  // Wireless toggles are only listed while flight mode is on.
  // Header shows either a plain title (N_Text) or a game's data (N_Data).
  'blyt/TextH1Ex.bflyt': ['N_Data'],
  'blyt/TextH1Ntf.bflyt': ['N_Detail'],
  'blyt/NtfBtnSquareList.bflyt': ['N_Loading', 'P_ImageSenderLoading'],
  'blyt/MypMyStatus.bflyt': ['L_Loading'],
  'blyt/EntBtnNtf.bflyt': ['P_Loading', 'P_IconMovie'],
  // The focus cursor is drawn by a border shader (S_Border* user data); the preview draws its own.
  'blyt/Cursor3.bflyt': ['N_Root', 'P_Main', 'P_Grow'],
  // Player LEDs: off in handheld mode.
  'blyt/FooterCtrl.bflyt': ['L_Indi_00'],
  'blyt/MypNav.bflyt': ['L_NewList', 'L_NewInv', 'L_New'],
  'blyt/SetCntFlightMode.bflyt': ['N_Bluetooth', 'N_Wifi', 'N_Nfc'],
  'blyt/FlcCntMain.bflyt': ['L_Loading', 'T_00', 'T_Empty'],
  // Suspended-applet button, alarm overlay, parental-controls pill, the 'press the same
  // button' prompt and news 'new' badges only appear in those states.
  'blyt/EntMain.bflyt': ['L_BtnSystemApplet', 'N_Alarm', 'L_ChildLock', 'N_Lock', 'N_LockSub', 'L_IconNew_00', 'L_IconNew_01', 'L_IconNew_02', 'L_IconNew_03'],
};

/** Shown by code once runtime content is ready (loaded images, header icons, pages). */
export const RUNTIME_SHOWN: Record<string, string[]> = {
  'blyt/TextH1Ex.bflyt': ['P_Icon'],
  'blyt/TextH1.bflyt': ['P_Icon'],
  'blyt/TextH1Ntf.bflyt': ['N_PictNtf'],
  'blyt/NtfBtnSquareList.bflyt': ['N_Image', 'N_IconSender'],
  'blyt/MypMyStatus.bflyt': ['N_Root'],
  'blyt/EntBtnNtf.bflyt': ['P_Image'],
};

export interface MaterialOverride {
  black?: [number?, number?, number?, number?];
  white?: [number?, number?, number?, number?];
}

const animCache = new WeakMap<Uint8Array, Animation | null>();

function loadStock(bytes: Uint8Array | Animation): Animation | null {
  if (!(bytes instanceof Uint8Array)) return bytes;
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
/**
 * Per-instance states of a layout used several times on one screen: the focused game icon plays
 * FocusKey + Active (a theme's Active animation is how it enlarges the focused game), the running
 * game shows its "Playing" badge (SuspendIn).
 */
export interface InstanceState {
  focused?: boolean;
  running?: boolean;
}

export function restingAnimations(sys: SystemLayout, layoutFile: string, state: InstanceState = {}): { name: string; at: 'start' | 'end' }[] {
  const base = layoutFile.replace(/^blyt\//, '').replace(/\.bflyt$/, '');
  let steps: Step[] = [...GENERIC, ...(PER_LAYOUT[base] ?? [])];
  if (state.focused) {
    steps = steps.filter(([n]) => !/^(UnFocusKey|UnfocusKey|UnFocusTouch|Inactive)$/.test(n));
    steps.push(['FocusKey', 'end'], ['Active', 'end']);
  }
  if (state.running) {
    steps = steps.filter(([n]) => n !== 'SuspendOut');
    // User_00: one player on the suspended game: their picture shows, the pill moves right of it.
    steps.push(['SuspendIn', 'end'], ['SuspendText', 'end'], ['User_00', 'end']);
  }
  // Popup balloons are closed when idle; the focused game's title balloon is open.
  if (/Balloon/.test(base)) steps.push(state.focused ? ['In', 'end'] : ['Out', 'end']);
  return steps
    .map(([suffix, at]) => ({ name: `anim/${base}_${suffix}.bflan`, at }))
    .filter((s) => sys.animations.has(s.name));
}

const FLPA = ['tx', 'ty', 'tz', 'rx', 'ry', 'rz', 'sx', 'sy', 'w', 'h'] as const;

/** Applies the resting animations to a (patched, cloned) pane tree in place. */
export function applyRestingState(
  root: BflytPane,
  sys: SystemLayout,
  layout: LayoutPatch,
  layoutFile: string,
  materials: Map<string, MaterialOverride>,
  state: InstanceState = {},
) {
  const index = new Map<string, BflytPane>();
  const walk = (p: BflytPane) => {
    if (!index.has(p.name)) index.set(p.name, p);
    p.children.forEach(walk);
  };
  walk(root);

  for (const step of restingAnimations(sys, layoutFile, state)) {
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
            else if (tag.type === 'FLVC' && c.target === 16) {
              if (!CODE_ALPHA[layoutFile]?.includes(pane.name)) pane.alpha = Math.max(0, Math.min(255, v));
            }
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

  // Code-driven states win over the animations.
  for (const n of RUNTIME_HIDDEN[layoutFile] ?? []) {
    const p = index.get(n);
    if (p) p.visible = false;
  }
  for (const n of RUNTIME_SHOWN[layoutFile] ?? []) {
    const p = index.get(n);
    if (p) {
      p.visible = true;
      p.alpha = 255;
    }
  }
}
