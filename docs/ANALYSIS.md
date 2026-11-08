# SwitchTheme Studio: analysis and rework notes

Reference format: [exelix11/SwitchThemeInjector](https://github.com/exelix11/SwitchThemeInjector), mainly
`SwitchThemesCommon/Layouts/LayoutPatches.cs` and `Bflyt/PatchingExtension.cs`.

## Why the editor and the simulator never matched

1. **There was no real layout behind the preview.** The home screen was hand-drawn HTML with hard-coded
   offsets (`640 + hud.x - 220`, `focusX = 412`, `cardTop = 212`). A layout patch is a set of changes to a
   *tree* of panes; each pane's position is relative to its parent, its anchors, and the parent's scale.
   Without the stock pane tree you can't place anything exactly.
2. **"Defaults" didn't exist for the same reason.** Stock values live in the console's own `.szs` files
   (`ResidentMenu.szs`, `Entrance.szs`, ...). The old fallbacks were Vertical-OEM's numbers, so every
   stock theme was drawn with Vertical-OEM's positions.
3. **The editor hid the UI on themes with a background.** `Viewport` only drew the UI when there was no
   wallpaper/preview, so image themes showed a bare picture in the editor and the UI only in the simulator.
4. **The wireframe used a different coordinate formula** from the renderer, so outlines didn't line up.

## Bugs that produced broken or wrong themes

| Problem | Effect |
|---|---|
| Only 6 pane names were read from `layout.json`; everything else was ignored | Vertical-OEM has 39 home patches, FairTech 66; the preview ignored almost all of them |
| Editing a pane wrote `Size` and `Scale` from the mock, even for panes the user didn't resize | Exported themes contained invented values (e.g. `N_MyPage` size 120×60) |
| Patches were matched by pane name across all files | `N_Tip` exists in `RdtBtnPvr`, `RdtBtnIconGame` and `RdtBtnFullLauncher`; editing one could write into the Album button |
| A new patch always went to `blyt/RdtBase.bflyt` | Wrong file for icon/hud/part panes, and for every non-home screen |
| Patch arrays were mutated in place | React state shared objects; undo was impossible |
| Partial vectors read as "keep the other axis" | The injector deserializes into a C# struct: `{"Position":{"Y":-219}}` means **X = 0**. Preview and installer disagreed |
| "Purple Skies" demo loaded the Vertical-OEM files and just renamed them | The image-theme demo never actually showed an image theme |
| Wallpaper exported under its original file name (`my-art.png`) | The installer only reads `image.jpg` / `image.dds` |
| Brightness/contrast/dim were CSS-only | The console showed the unadjusted image |
| No size/format checks | The installer rejects non-1280×720, progressive JPEG and non-DXT1 DDS backgrounds |
| `info.json` `LayoutInfo` was the screen name; `common.json` and extra icon files were dropped | Wrong credits; partial themes on re-export |

## What changed

- `src/lib/nx/`: Yaz0, SARC and BFLYT readers (pane tree, transforms, anchors, visibility, vertex colors,
  text, parts).
- `src/lib/layout/patch.ts`: the layout.json model with the injector's exact semantics. Edits are immutable,
  scoped to `(file, pane)`, write only changed fields, and always write full vectors.
- **Exact preview.** Load the console's own `.szs` (NXThemes Installer → Extract home menu writes them to `sd:/themes/systemData/extracted/`).
  The real pane tree is rendered as nested DOM nodes, so parent transforms compose like on the console. Stock
  values show in the Inspector, with per-field revert. Files are kept in IndexedDB.
- Without the `.szs`, the old mock is still used but clearly labelled **Approximate**.
- One render path for editor and simulator; the editor only adds selection, drag, and nudge.
- Backgrounds: "Custom image" vs "Console default" per screen. The preview uses the same code as the exporter
  (crop to 1280×720, adjustments baked in), so what you see is what goes into `image.jpg`. Valid untouched
  JPG / DXT1 DDS are copied byte-for-byte. DDS wallpapers are decoded for preview.
- Undo/redo (one drag = one step), arrow-key nudging, full pane browser, live `layout.json` editor, export checks.
- Tests: `npm test` (parsers, patch semantics, import/export of both demo packs).

## Installer behaviour now simulated

From a deep dive of SwitchLayoutEditor and the SwitchThemesCommon code it builds on:

- **Firmware fixes.** On 20.0+ the installer stacks its own patches under older themes
  (`20_DowngradeTo19`, `20_LegacyAppletButtons`, plus fixes for known layouts by ID or name). The
  decision logic (`NewFirmFixes.cs`, `SzsPatcher.PatchLayouts`) and the fix files are ported, and the
  preview applies them in the same order. The firmware is detected per `.szs` like `FirmwareDetection.cs`.
- **Export targets your firmware.** Layouts started in the studio get `TargetFirmware` (and
  `HideOnlineBtn: false` on Home) on the first edit, as the injector's LayoutDiff does. Imported themes
  keep their value, with a one-click "Target 20.0+ instead".
- **Compatibility checker** (`LayoutCompatibility.cs`). Patches for missing panes are skipped by the
  installer. Animations that reference missing panes or groups are dropped, because they would crash
  the console. Both are shown in the Panes tab and the export dialog.

SwitchLayoutEditor itself only draws pane bounding boxes and doesn't render parts or textures, so it
doesn't help with texture decoding. Worth borrowing later: LayoutDiff (import a layout edited in another
tool from an edited `.szs`), and its BFLAN editor and templates for building animations.

## Known gaps / next steps

1. **Textures.** Pictures are placeholders until BNTX (`timg/__Combined.bntx`) decoding lands: BC1/BC3/BC4/BC5
   plus Tegra block-linear unswizzling. This is the biggest step toward a pixel-accurate preview.
2. Not simulated yet: materials and `UsdPatches` (e.g. `S_RoundRadius`), `AddGroups`, `.bflan` animations,
   the `HideOnlineBtn` animation fix, and the installer's per-firmware compatibility fixes (`NewFirmFixes.cs`).
3. `common.json` targets `common.szs`, which can't be loaded yet; it is passed through untouched.
4. Parts property overrides (the prt1 entry list) are ignored; parts render their own layout.
5. Root layout names for Settings, News, User page and Player select are guesses with an automatic fallback.
6. Verified against a real firmware 23.0.1 dump: all 579 layouts in the 7 archives parse, every parts pane
   resolves, and 100% of the Vertical-OEM and FairTech home patches match real panes. qlaunch fills some
   slots at runtime (game icons, account buttons, clock); the preview mocks those. The screen root for
   Settings / User page is still a guess.
7. Initial animation state (which popups start hidden) comes from `.bflan`; porting the Bflan reader from
   SwitchThemesCommon is the next step after textures. Note both reference repos are GPL.
