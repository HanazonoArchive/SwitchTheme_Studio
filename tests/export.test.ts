import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildNxTheme, newScreen, themeId, NXTHEME_VERSION } from '../src/lib/theme/nxtheme';
import { setPaneFields } from '../src/lib/layout/patch';
import type { ThemeProject } from '../src/types/theme';

const project = (screen: ReturnType<typeof newScreen>): ThemeProject => ({ id: 'proj-1', name: 'Test', author: 'Fuz', screens: [screen] }) as unknown as ThemeProject;

describe('nxtheme export', () => {
  it('writes the installer format: a zip with info.json (v17, target, ID) and layout.json', async () => {
    const screen = newScreen('home');
    screen.layout = setPaneFields(screen.layout, 'blyt/RdtBase.bflyt', 'L_BtnFlc', { Position: { X: 0, Y: -40, Z: 0 } });
    const zip = await JSZip.loadAsync(await (await buildNxTheme(project(screen), screen)).arrayBuffer());
    const info = JSON.parse(await zip.file('info.json')!.async('string'));
    expect(info).toMatchObject({ Version: NXTHEME_VERSION, Target: 'home', Author: 'Fuz', ThemeName: 'Test' });
    // NxThemeTool validate warns without an ID of 8+ characters; it stays the same per project.
    expect(info.Id).toBe(themeId('proj-1'));
    expect(info.Id).toHaveLength(8);
    const layout = JSON.parse(await zip.file('layout.json')!.async('string'));
    expect(layout.TargetName).toBe('ResidentMenu.szs');
    expect(layout.Files[0].Patches[0]).toMatchObject({ PaneName: 'L_BtnFlc', Position: { X: 0, Y: -40, Z: 0 } });
  });

  it('keeps the ID of an imported theme', async () => {
    const screen = newScreen('lock');
    screen.info = { Id: 'abcdef0123' };
    screen.layout = setPaneFields(screen.layout, 'blyt/EntMain.bflyt', 'N_Root', { Scale: { X: 1, Y: 1 } });
    const zip = await JSZip.loadAsync(await (await buildNxTheme(project(screen), screen)).arrayBuffer());
    expect(JSON.parse(await zip.file('info.json')!.async('string')).Id).toBe('abcdef0123');
  });
});
