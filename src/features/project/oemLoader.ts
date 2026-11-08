import JSZip from 'jszip';
import type { ThemeProject, ThemeScreen, ScreenTarget, PaneNode } from '../../types/theme';
import { RESIDENT_MENU_DEFAULT_PANES } from '../../constants/switchPanes';

export interface UnpackedNxTheme {
  info: Record<string, any>;
  layout: Record<string, any>;
  mainImageBlob?: Blob;
  mainImageUrl?: string;
  mainImageFileName?: string;
  previewBlob?: Blob;
  previewUrl?: string;
}

export async function unpackNxThemeBlob(blob: Blob): Promise<UnpackedNxTheme> {
  const zip = await JSZip.loadAsync(blob);
  let info: Record<string, any> = {};
  let layout: Record<string, any> = {};
  let mainImageBlob: Blob | undefined;
  let mainImageUrl: string | undefined;
  let mainImageFileName: string | undefined;
  let previewBlob: Blob | undefined;
  let previewUrl: string | undefined;

  // 1. info.json
  const infoEntry = zip.file('info.json');
  if (infoEntry) {
    const text = await infoEntry.async('text');
    try {
      info = JSON.parse(text);
    } catch (e) {
      console.warn('Failed to parse info.json', e);
    }
  }

  // 2. layout.json
  const layoutEntry = zip.file('layout.json');
  if (layoutEntry) {
    const text = await layoutEntry.async('text');
    try {
      layout = JSON.parse(text);
    } catch (e) {
      console.warn('Failed to parse layout.json', e);
    }
  }

  // 3. Background image: image.dds / image.jpg / image.png / bg.jpg / bg.png
  const mainImageEntry =
    zip.file('image.dds') ||
    zip.file('image.jpg') ||
    zip.file('image.png') ||
    zip.file('bg.jpg') ||
    zip.file('bg.png');

  if (mainImageEntry) {
    mainImageFileName = mainImageEntry.name;
    mainImageBlob = await mainImageEntry.async('blob');
    mainImageUrl = URL.createObjectURL(mainImageBlob);
  }

  // 4. Preview image: preview.png / preview.jpg
  const previewEntry =
    zip.file('preview.png') ||
    zip.file('Preview.png') ||
    zip.file('preview.jpg') ||
    zip.file('Preview.jpg');

  if (previewEntry) {
    previewBlob = await previewEntry.async('blob');
    previewUrl = URL.createObjectURL(previewBlob);
  }

  return { info, layout, mainImageBlob, mainImageUrl, mainImageFileName, previewBlob, previewUrl };
}

export async function parseNxThemeFiles(files: { name: string; blob: Blob }[]): Promise<ThemeProject> {
  const screens: ThemeScreen[] = [];
  let projectName = 'Custom Theme';
  let projectAuthor = 'Author';

  for (const { name: fileName, blob } of files) {
    const unpacked = await unpackNxThemeBlob(blob);

    if (unpacked.info.ThemeName) projectName = unpacked.info.ThemeName;
    if (unpacked.info.Author) projectAuthor = unpacked.info.Author;

    const targetRaw = (unpacked.info.Target || unpacked.info.target || '').toLowerCase();
    let target: ScreenTarget = 'home';
    let szsName = 'ResidentMenu.szs';
    let bflytName = 'ResidentMenu.bflyt';
    let screenName = 'Home Menu';

    if (targetRaw.includes('lock') || fileName.toLowerCase().includes('lock')) {
      target = 'lock';
      szsName = 'Entrance.szs';
      bflytName = 'Entrance.bflyt';
      screenName = 'Lock Screen';
    } else if (targetRaw.includes('app') || fileName.toLowerCase().includes('allapps')) {
      target = 'apps';
      szsName = 'Flaunch.szs';
      bflytName = 'Flaunch.bflyt';
      screenName = 'All Software';
    } else if (targetRaw.includes('set') || fileName.toLowerCase().includes('settings')) {
      target = 'set';
      szsName = 'Set.szs';
      bflytName = 'Set.bflyt';
      screenName = 'System Settings';
    } else {
      target = 'home';
      szsName = 'ResidentMenu.szs';
      bflytName = 'ResidentMenu.bflyt';
      screenName = 'Home Menu';
    }

    // Inspect layout.json to detect layout characteristics
    const patchName = unpacked.layout?.PatchName || unpacked.info?.LayoutInfo || 'Default by Nintendo';
    const authorName = unpacked.layout?.AuthorName || 'Nintendo';
    const hideOnlineBtn = Boolean(unpacked.layout?.HideOnlineBtn);

    let isCustomLayout = false;
    let isVerticalIcons = patchName.toLowerCase().includes('vertical');

    // Clean Switch Home Menu Skeleton: Start with the 6 standard primary components
    let panes: PaneNode[] = target === 'home'
      ? RESIDENT_MENU_DEFAULT_PANES.map((p) => ({ ...p }))
      : [];

    if (unpacked.layout && Array.isArray(unpacked.layout.Files) && unpacked.layout.Files.length > 0) {
      isCustomLayout = true;
      for (const fileEntry of unpacked.layout.Files) {
        if (Array.isArray(fileEntry.Patches)) {
          for (const patch of fileEntry.Patches) {
            const paneName = patch.PaneName;

            // 1. Detect portrait / vertical card icon patch
            if (paneName === 'P_IconGame' || paneName === 'P_BtnBase') {
              if (patch.Size?.Y === 384) {
                isVerticalIcons = true;
              }
              const existing = panes.find((p) => p.name === 'P_IconGame');
              if (existing) {
                if (patch.Size?.X) existing.width = patch.Size.X;
                if (patch.Size?.Y) existing.height = patch.Size.Y;
                if (patch.Position?.X !== undefined) existing.x = patch.Position.X;
                if (patch.Position?.Y !== undefined) existing.y = patch.Position.Y;
                if (patch.Scale?.X !== undefined) existing.scaleX = patch.Scale.X;
                if (patch.Scale?.Y !== undefined) existing.scaleY = patch.Scale.Y;
              }
            }

            // 2. Profile avatars (N_MyPage)
            else if (paneName === 'N_MyPage') {
              const existing = panes.find((p) => p.name === 'N_MyPage');
              if (existing) {
                if (patch.Position?.X !== undefined) existing.x = patch.Position.X;
                if (patch.Position?.Y !== undefined) existing.y = patch.Position.Y;
                if (patch.Scale?.X !== undefined) {
                  existing.scaleX = patch.Scale.X;
                  existing.scaleY = patch.Scale.Y ?? patch.Scale.X;
                }
              }
            }

            // 3. Status HUD (L_Hud)
            else if (paneName === 'L_Hud') {
              const existing = panes.find((p) => p.name === 'L_Hud');
              if (existing) {
                if (patch.Position?.X !== undefined) existing.x = patch.Position.X;
                if (patch.Position?.Y !== undefined) existing.y = patch.Position.Y;
                if (patch.Scale?.X !== undefined) {
                  existing.scaleX = patch.Scale.X;
                  existing.scaleY = patch.Scale.Y ?? patch.Scale.X;
                }
              }
            }

            // 4. System Applets Bar (N_System)
            else if (paneName === 'N_System') {
              const existing = panes.find((p) => p.name === 'N_System');
              if (existing) {
                if (patch.Position?.X !== undefined) existing.x = patch.Position.X;
                if (patch.Position?.Y !== undefined) existing.y = patch.Position.Y;
                if (patch.Scale?.X !== undefined) {
                  existing.scaleX = patch.Scale.X;
                  existing.scaleY = patch.Scale.Y ?? patch.Scale.X;
                }
              }
            }

            // 5. Game Title Hint Banner (N_Tip)
            else if (paneName === 'N_Tip') {
              const existing = panes.find((p) => p.name === 'N_Tip');
              if (existing) {
                if (patch.Position?.X !== undefined) existing.x = patch.Position.X;
                if (patch.Position?.Y !== undefined) existing.y = patch.Position.Y;
                if (patch.Scale?.X !== undefined) {
                  existing.scaleX = patch.Scale.X;
                  existing.scaleY = patch.Scale.Y ?? patch.Scale.X;
                }
              }
            }

            // 6. Button prompt legend (L_BtnFooter)
            else if (paneName === 'L_BtnFooter') {
              const existing = panes.find((p) => p.name === 'L_BtnFooter');
              if (existing) {
                if (patch.Position?.X !== undefined) existing.x = patch.Position.X;
                if (patch.Position?.Y !== undefined) existing.y = patch.Position.Y;
                if (patch.Scale?.X !== undefined) {
                  existing.scaleX = patch.Scale.X;
                  existing.scaleY = patch.Scale.Y ?? patch.Scale.X;
                }
              }
            }
          }
        }
      }
    }

    screens.push({
      id: `screen-${target}`,
      name: screenName,
      target,
      szsFileName: szsName,
      bflytName,
      wallpaperUrl: unpacked.mainImageUrl || null,
      wallpaperFileName: unpacked.mainImageFileName || 'image.jpg',
      previewUrl: unpacked.previewUrl || null,
      brightness: 1.0,
      contrast: 1.0,
      dimOverlay: 0,
      layoutPatchName: patchName,
      layoutAuthor: authorName,
      isCustomLayout,
      isVerticalIcons,
      hideOnlineBtn,
      layoutJson: unpacked.layout,
      infoJson: unpacked.info,
      panes,
    });
  }

  // Sort screens to ensure Home -> Lock -> Apps -> Settings order
  const order: Record<ScreenTarget, number> = { home: 1, lock: 2, apps: 3, set: 4, user: 5, news: 6 };
  screens.sort((a, b) => (order[a.target] || 99) - (order[b.target] || 99));

  const activeScreenId = screens.find((s) => s.target === 'home')?.id || screens[0]?.id || 'screen-home';

  // Determine theme type: layout-only, wallpaper-only, or full
  const hasAnyWallpapers = screens.some((s) => s.wallpaperUrl !== null);
  const hasAnyCustomLayouts = screens.some((s) => s.isCustomLayout);

  let themeType: 'layout_only' | 'wallpaper_only' | 'full' = 'full';
  if (!hasAnyWallpapers && hasAnyCustomLayouts) {
    themeType = 'layout_only';
  } else if (hasAnyWallpapers && !hasAnyCustomLayouts) {
    themeType = 'wallpaper_only';
  }

  return {
    id: `project-${Date.now()}`,
    name: projectName,
    author: projectAuthor,
    version: '1.0.0',
    layoutInfo: screens[0]?.layoutPatchName,
    themeType,
    screens,
    activeScreenId,
  };
}

export async function loadOemProject(oemSource?: Blob | File | string): Promise<ThemeProject> {
  let zipData: Blob;

  if (oemSource instanceof Blob) {
    zipData = oemSource;
  } else {
    // Fetch /OEM.zip from public directory
    const response = await fetch('/OEM.zip');
    if (!response.ok) {
      throw new Error(`Failed to load OEM.zip: ${response.statusText}`);
    }
    zipData = await response.blob();
  }

  const zip = await JSZip.loadAsync(zipData);
  const nxThemeFiles = Object.keys(zip.files).filter((name) => name.toLowerCase().endsWith('.nxtheme'));
  const fileBlobs: { name: string; blob: Blob }[] = [];

  for (const filePath of nxThemeFiles) {
    const file = zip.file(filePath);
    if (!file) continue;
    const blob = await file.async('blob');
    fileBlobs.push({ name: filePath, blob });
  }

  return parseNxThemeFiles(fileBlobs);
}
