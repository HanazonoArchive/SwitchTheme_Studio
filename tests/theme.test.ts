import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { adjustPixels, readJpegInfo } from '../src/lib/theme/images';
import { buildNxTheme, checkScreen, readThemeFiles, newScreen } from '../src/lib/theme/nxtheme';
import { hasLayoutChanges } from '../src/lib/layout/patch';

const demo = (name: string) => [{ name, blob: new Blob([readFileSync(`public/demos/${name}`)]) }];

describe('images', () => {
  it('tells baseline and progressive JPEGs apart', () => {
    const sof = (marker: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, marker, 0x00, 0x11, 8, 0x02, 0xd0, 0x05, 0x00, 3]);
    expect(readJpegInfo(sof(0xc0))).toEqual({ width: 1280, height: 720, progressive: false });
    expect(readJpegInfo(sof(0xc2))?.progressive).toBe(true);
  });

  it('neutral adjustments leave pixels alone, dim darkens', () => {
    const px = new Uint8ClampedArray([10, 128, 250, 255]);
    adjustPixels(px, { brightness: 1, contrast: 1, dim: 0 });
    expect([...px]).toEqual([10, 128, 250, 255]);
    adjustPixels(px, { brightness: 1, contrast: 1, dim: 0.5 });
    expect([...px]).toEqual([5, 64, 125, 255]);
  });
});

describe('nxtheme import', () => {
  it('reads the Vertical-OEM pack as a layout-only theme', async () => {
    const p = await readThemeFiles(demo('vertical-oem.zip'));
    expect(p.screens.map((s) => s.target)).toEqual(['home', 'lock', 'apps']);
    expect(p.screens.every((s) => s.wallpaper === null)).toBe(true);
    expect(p.screens.every((s) => hasLayoutChanges(s.layout))).toBe(true);
    expect(p.screens[0].common?.PatchName).toBe('Vertical-OEM (Home Menu Common)');
  });

  it('reads the Purple Skies pack with backgrounds on every screen', async () => {
    const p = await readThemeFiles(demo('purple-skies.zip'));
    expect(p.screens.map((s) => s.target)).toEqual(['home', 'lock', 'apps', 'set']);
    for (const s of p.screens) {
      expect(s.wallpaper?.format).toBe('jpg');
      expect([s.wallpaper?.width, s.wallpaper?.height]).toEqual([1280, 720]);
    }
    const settings = p.screens.find((s) => s.target === 'set')!;
    expect(hasLayoutChanges(settings.layout)).toBe(false);
    expect(p.screens[0].layout.Anims?.length).toBe(4);
  });
});

describe('nxtheme export', () => {
  it('round-trips a layout-only screen without inventing data', async () => {
    const p = await readThemeFiles(demo('vertical-oem.zip'));
    const home = p.screens[0];
    const zip = await JSZip.loadAsync(await (await buildNxTheme(p, home)).arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['common.json', 'info.json', 'layout.json']);
    const info = JSON.parse(await zip.file('info.json')!.async('text'));
    expect(info).toMatchObject({ Version: 17, Target: 'home', LayoutInfo: 'Vertical-OEM (Home Menu) by autoDiff' });
    const layout = JSON.parse(await zip.file('layout.json')!.async('text'));
    expect(layout.Files).toEqual(home.layout.Files);
  });

  it('copies a valid untouched background as image.jpg byte-for-byte', async () => {
    const p = await readThemeFiles(demo('purple-skies.zip'));
    const set = p.screens.find((s) => s.target === 'set')!;
    const zip = await JSZip.loadAsync(await (await buildNxTheme(p, set)).arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['image.jpg', 'info.json']);
    const out = new Uint8Array(await zip.file('image.jpg')!.async('arraybuffer'));
    expect(out).toEqual(new Uint8Array(await set.wallpaper!.blob.arrayBuffer()));
  });

  it('refuses to export an empty screen', () => {
    expect(checkScreen(newScreen('lock'))[0].level).toBe('error');
  });
});
