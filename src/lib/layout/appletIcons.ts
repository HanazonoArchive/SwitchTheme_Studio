import type { ScreenTarget, ThemeScreen } from '../../types/theme';
import type { LayoutFilePatch } from './patch';

/**
 * Custom icons a theme can ship next to layout.json (album.png, news.png, ... lock.png), as
 * SwitchThemesCommon's TextureReplacement defines them. The installer applies each icon's layout
 * patch (it sizes the picture to the icon and hides the stock decorations) before the theme's
 * own layout, replaces the texture and resets the pane's UVs. Applet icons are recoloured: their
 * texture is read through its alpha channel only (channel swizzle 0x05050505), so they draw as a
 * silhouette in the palette colour C_W 100. The lock screen icon keeps its colours.
 */

export interface AppletIconSlot {
  /** File name in the .nxtheme without extension. */
  name: string;
  target: ScreenTarget;
  file: string;
  pane: string;
  /** Drawn as a silhouette in the icon colour (alpha only). */
  mono: boolean;
  patch: LayoutFilePatch;
}

const cw100 = [{ PropName: 'C_W', PropValues: ['100', '100', '100', '100'], type: 1 }];
const size = { X: 64, Y: 56 };

export const APPLET_ICON_SLOTS: AppletIconSlot[] = [
  {
    name: 'album',
    target: 'home',
    file: 'blyt/RdtBtnPvr.bflyt',
    pane: 'P_Pict_00',
    mono: true,
    patch: {
      FileName: 'blyt/RdtBtnPvr.bflyt',
      Patches: [
        { PaneName: 'P_Pict_00', Size: size, Position: { X: 22, Y: 13, Z: 0 }, UsdPatches: cw100 },
        { PaneName: 'N_02', Visible: false },
        { PaneName: 'N_01', Visible: false },
        { PaneName: 'P_Pict_01', Visible: false },
        { PaneName: 'P_Color', Visible: false },
      ],
    },
  },
  {
    name: 'news',
    target: 'home',
    file: 'blyt/RdtBtnNtf.bflyt',
    pane: 'P_PictNtf_00',
    mono: true,
    patch: {
      FileName: 'blyt/RdtBtnNtf.bflyt',
      Patches: [
        { PaneName: 'P_PictNtf_00', Size: size, UsdPatches: cw100 },
        { PaneName: 'P_PictNtf_01', Visible: false },
      ],
    },
  },
  { name: 'shop', target: 'home', file: 'blyt/RdtBtnShop.bflyt', pane: 'P_Pict', mono: true, patch: { FileName: 'blyt/RdtBtnShop.bflyt', Patches: [{ PaneName: 'P_Pict', Size: size, UsdPatches: cw100 }] } },
  {
    name: 'controller',
    target: 'home',
    file: 'blyt/RdtBtnCtrl.bflyt',
    pane: 'P_Form',
    mono: true,
    patch: {
      FileName: 'blyt/RdtBtnCtrl.bflyt',
      Patches: [{ PaneName: 'P_Form', Size: size, UsdPatches: cw100 }, ...['P_Stick', 'P_Y', 'P_X', 'P_A', 'P_B'].map((PaneName) => ({ PaneName, Visible: false }))],
    },
  },
  { name: 'settings', target: 'home', file: 'blyt/RdtBtnSet.bflyt', pane: 'P_Pict', mono: true, patch: { FileName: 'blyt/RdtBtnSet.bflyt', Patches: [{ PaneName: 'P_Pict', Size: size, UsdPatches: cw100 }] } },
  { name: 'power', target: 'home', file: 'blyt/RdtBtnPow.bflyt', pane: 'P_Pict_00', mono: true, patch: { FileName: 'blyt/RdtBtnPow.bflyt', Patches: [{ PaneName: 'P_Pict_00', Size: size, UsdPatches: cw100 }] } },
  {
    name: 'nso',
    target: 'home',
    file: 'blyt/RdtBtnLR.bflyt',
    pane: 'P_LR_00',
    mono: true,
    patch: {
      FileName: 'blyt/RdtBtnLR.bflyt',
      Patches: [
        { PaneName: 'P_LR_00', Size: size },
        { PaneName: 'P_LR_01', Visible: false },
      ],
    },
  },
  {
    name: 'card',
    target: 'home',
    file: 'blyt/RdtBtnVgc.bflyt',
    pane: 'P_Pict_00',
    mono: true,
    patch: {
      FileName: 'blyt/RdtBtnVgc.bflyt',
      Patches: [
        { PaneName: 'P_Pict_00', Size: size, UsdPatches: cw100 },
        { PaneName: 'P_00', Visible: false },
        { PaneName: 'P_01', Visible: false },
      ],
    },
  },
  {
    name: 'share',
    target: 'home',
    file: 'blyt/RdtBtnSplay.bflyt',
    pane: 'P_Pict_00',
    mono: true,
    patch: {
      FileName: 'blyt/RdtBtnSplay.bflyt',
      Patches: [{ PaneName: 'P_Pict_00', Size: size, UsdPatches: cw100 }, ...['N_Wave', 'P_Pict_01', 'P_Pict_02', 'P_Pict_03'].map((PaneName) => ({ PaneName, Visible: false }))],
    },
  },
  {
    name: 'lock',
    target: 'lock',
    file: 'blyt/EntBtnResumeSystemApplet.bflyt',
    pane: 'P_PictHome',
    mono: false,
    patch: { FileName: 'blyt/EntBtnResumeSystemApplet.bflyt', Patches: [{ PaneName: 'P_PictHome', Size: { X: 184, Y: 168 }, Position: { X: 0, Y: 0, Z: 0 } }] },
  },
];

/** A custom icon ready for the preview. */
export interface AppletIcon {
  slot: AppletIconSlot;
  /** Image to draw: for mono icons a white silhouette (tinted by the renderer). */
  url: string;
}

/** The icon files in a screen (name.png or name.dds), for its target. */
export function iconFiles(screen: ThemeScreen): { slot: AppletIconSlot; file: { name: string; blob: Blob } }[] {
  const out: { slot: AppletIconSlot; file: { name: string; blob: Blob } }[] = [];
  for (const slot of APPLET_ICON_SLOTS) {
    if (slot.target !== screen.target) continue;
    const file = screen.extraFiles.find((f) => f.name.toLowerCase() === `${slot.name}.png`);
    if (file) out.push({ slot, file });
  }
  return out;
}

/** Loads a screen's custom icons as data URLs (applet icons as white silhouettes). */
export async function loadAppletIcons(screen: ThemeScreen): Promise<AppletIcon[]> {
  const out: AppletIcon[] = [];
  for (const { slot, file } of iconFiles(screen)) {
    try {
      const bmp = await createImageBitmap(file.blob);
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const g = c.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      if (slot.mono) {
        const d = g.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
        g.putImageData(d, 0, 0);
      }
      out.push({ slot, url: c.toDataURL('image/png') });
    } catch {
      /* not an image we can read: the preview keeps the stock icon */
    }
  }
  return out;
}
