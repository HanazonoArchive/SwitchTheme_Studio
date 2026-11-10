# Engineering notes

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

## Rendering the console's own graphics

- **Textures:** `timg/__Combined.bntx` is parsed and unswizzled from the Tegra block-linear layout. It
  decodes R8, R8G8, RGB565, RGBA8, BC1–BC5, and applies each texture's channel mapping (most icons
  are BC4 masks).
- **Materials:** `mat1` black/white colours and texture wrap/UVs are applied. Mirrored half-icons
  render whole, and `S_RoundRadius` user data gives the rounded plates. Basic Black recolours
  neutral UI the way qlaunch does at runtime.
- **Idle state:** layouts ship with every optional element visible, and qlaunch hides them by playing
  animations. The `.bflan` files are read, and each screen gets an explicit idle recipe (checked
  against a 23.0.1 dump). Names describe system events, so a name-based guess hid the whole home
  menu (`RdtBase_GameIn` is "a game is launching"). Theme animations replace stock ones, as on
  console.
- **Runtime content:** game icons (Home and All Software), account buttons per user, clock and
  battery, the focused game's cursor and title, and the Settings navigation/content are injected
  where qlaunch creates them by code. Layout text is always a developer placeholder, so only known
  runtime strings are shown.

## Matching real-console screenshots

Checked side by side against real console captures (stock Basic White and Purple Skies):

- **Anchor bits were read backwards.** nn::ui2d stores origin X/Y in bits 0-3 and the parent
  anchor in bits 4-7 of the pane's anchor byte. SwitchThemeInjector (and therefore `layout.json`)
  names those same bits the other way round. The renderer now places panes the way the console
  does (`lib/layout/geometry.ts`), and the Inspector labels the fields by their effect. This
  put the footer, the lock screen's left panel and Purple Skies' five lock tiles where they
  belong.
- **Footer from `common.szs`** (line + button hints) is drawn on Home, All Software and Settings.
- **System palette:** most UI colours are palette indices (`C_W` / `C_B` user data) that qlaunch
  resolves at runtime. `lib/layout/palette.ts` holds values calibrated from screenshots.
- **Extreme scales:** themes hide or stretch rows with scales like 1e-5 × 100000. Browsers
  drop such layers, so cancelling scales are folded into the children before drawing.
- **Clamped UVs:** panes that sample one edge texel (UV 0..390 with clamp) draw as a solid colour.
- **Runtime-only states hidden:** alarm overlay, parental-controls pill, "press the same button"
  prompt, suspended-applet button, news "new" badges.
- **Runtime content mocked:** HUD clock/battery (instead of the digit glyph parts), suspended
  game art on the lock screen, "Change User", glyph + label buttons ("Continue",
  "Featured News"), and the All Software title.

## Round 3: every screen, and the engine features behind them

- **All seven screens render.** Settings, News, User Page and Player Select are built from the
  layouts qlaunch instantiates by code (nav lists, pages, headers, news cards, user cards),
  placed in their slots and scissored between the header and footer like the console.
- **Vertical parent anchors were upside down** (top/bottom swapped). Fixing it put Player Select,
  list rows and many small elements where they belong.
- **Text position** inside its box was read from the wrong bits (same swap as the anchors).
- **Parts magnify** (a resized part): positions and sizes scale, nothing is distorted, and
  panes flagged "ignore parts magnify" keep their size. The lock screen news tiles and settings
  rows now have the right shape, and text is no longer squashed.
- **Framebuffer alpha masks** (`lib/layout/blend.ts`): panes that only write alpha, and panes
  drawn through it (blend src = dstAlpha), are resolved into CSS masks or tinted text. Fixes the
  Album icon, header titles and balloons.
- **ASTC decoding** (`lib/nx/astc.ts`): all 47 ASTC textures in the 23.0.1 dump decode
  identically to a reference decoder.
- **Per-instance states**: the focused game plays FocusKey + Active (a theme's Active animation is
  how Purple Skies enlarges it) and the running game shows its "Playing" badge.
- Mocked runtime content: cursor, footer controller icon, Settings strings, news articles, profile,
  play activity, user cards.

## Round 4: built-in layouts, a WebGL canvas and a Figma-style editor

- **No dump needed.** `public/stock/*.json` describes the stock layouts of firmware 20.0+ (generated by
  `npm run build:stock` from a 23.0.1 dump; ~300 KB gzipped). It holds structure and numbers only. Each
  texture is a size plus a stand-in: a colour, a gradient or a rounded shape for plain textures, and for
  the 33 pictograms the screens actually show, the studio's own drawings (`lib/stock/placeholders.ts`),
  framed like the originals so mirroring and UVs work unchanged. A console's own `.szs` still overrides
  them per screen for exact textures.
- **PixiJS renderer.** `lib/render/scene.ts` turns the patched pane trees into a scene (world matrices,
  content descriptions, clipping); `features/canvas/PixiView.tsx` draws it with WebGL: alpha masks for
  the framebuffer tricks, stencil clipping for scroll areas, rounded corners and shadows, sharp text at
  any zoom. Only the file being edited is re-patched while dragging.
- **Editor.** An overlay hit-tests the same scene (so you click what you see), with hover, selection,
  resize handles, a snap grid and smart guides. The Layers panel shows the whole composed hierarchy with
  editor-only eye and lock. The separate simulator is gone: Preview is the same view without editing.
- **UI.** Neutral tool styling (Inter, flat panels, one accent) instead of the earlier look.

## Round 5: console behaviour and the injector's full layout.json

- **Focused game in front.** qlaunch draws the focused game above its neighbours, so a theme that
  enlarges it on focus (Purple Skies) overlaps the row instead of being covered by the next icon.
  The scene now moves the slot holding the focused game to the end of its row (Home `N_Game`, All
  Software blocks and rows); hit testing follows, because it uses the same draw order.
- **"Playing" badge.** The pill is `P_Suspend_00` (black through the translucent `White1x1A220`
  texture, a 3 px white border from its `S_Border*` user data). Two fixes: the pill kept its
  colour in Basic Black (translucent 1x1 scrims are no longer theme-recoloured), and the running
  state now also plays `User_00`, which shows the player's picture and moves the text pill right
  of it (`N_TextPos` X = 27 at home, 17 in All Software), as on the console.
- **Borders.** qlaunch's border shader (`S_BorderDrawMode`, `S_BorderSize`, `S_BorderVolume`,
  `S_BorderColorSelect0` palette index or `S_BorderColor0`) is drawn for every picture pane.
- **Profile pictures.** Eight original illustrations in `public/avatars` (a character on a coloured
  backdrop, like the console's own pictures) replace the emoji. Console tab > Users edits names and
  pictures, including your own image. Idle account buttons no longer show the friend/error badges.
- **Everything SwitchThemesCommon applies** (`SzsPatcher.ApplyLayoutPatch`, `PatchingExtension.cs`):
  - `Materials`: `ForegroundColor` / `BackgroundColor` (the material's first and second colour,
    i.e. black and white), texture `Refs` wrap modes and `Transforms`.
  - `UsdPatches`: same count and type replaces, a missing property is added. Themes add float
    properties typed int32 holding the float's bits (Purple Skies' `S_RoundRadius` 1106247680 =
    30.0), which qlaunch reads as floats; the preview does the same.
  - `ColorTL`..`ColorBR` on text panes are font colours (top/bottom), not vertex colours.
  - `PullFrontPanes` (to the start of the parent: drawn first, behind) and `PushBackPanes` (to the
    end: in front), after the pane patches, like the injector.
  - `PatchAppletColorAttrib`: the home applet icons read from their alpha channel.
  - `AddGroups` only matters to animations that target the new groups; the preview applies
    animations by pane, so it has no visible effect here.
- The theme's `L_Balloon` visibility now hides the game title (Purple Skies hides it).

- **Status bar.** The clock and battery are rows of one-digit glyph parts (`L_GTNum_xx`, 14 x 24
  cells) that qlaunch shows or hides; the preview now draws each digit in its own cell instead of
  one text string, and lays the bar out right to left like qlaunch: battery icon, percentage (as
  wide as its visible digits), 16 px margin, Wi-Fi, 20 px margin, clock. Spacing matches console
  screenshots to a pixel or two. The Wi-Fi and battery pictograms were redrawn to the textures'
  real framing (Wi-Fi fills 28 x 20 of its 32 px frame), the gauge fills to the charge level and
  the gap inside the outline is the screen background (palette 52). Battery and Wi-Fi are no
  longer mock settings (fixed at 85 % and full signal); the clock still is.

- **Applet icons centred.** Many console icon textures don't fill their frame (the Album picture
  sits in the top-left 40 x 27 px of a 52 x 45 texture), so stand-ins drawn edge to edge landed off
  centre. The stock pack now records where each console picture sits in its frame (four numbers,
  no pixels) and our drawing is fitted onto that footprint, so every layout position, mirror and
  UV lines it up where the console's sits.
- **IgnorePartsMagnify keeps the offset too**, not only the size. This put the lock screen news
  scrim (and its title) back at the bottom of each tile. The news mask gradient also runs the
  right way now (clear at the top), and white text without a palette colour stays white.

- **All Software is a list laid out by code.** The rows' positions in `FlcCntMain` are ignored on
  the console: rows stack 20 px below the `N_Top` spacer, each as tall as its own `Size.Y`. Old
  layouts such as Vertical OEM (made with autoDiff on an older firmware) carry row positions that
  overlap (`L_BtnIconGame_05` only 40 px under `_04`), which broke the preview; with the list model
  both the stock grid (first row centred at y = 274, rows 184 px apart) and Vertical OEM's taller
  rows (centred at 324, 284 px apart) match console screenshots to a pixel. The list is clipped to
  the area between the header and footer lines and scrolls to keep the focused row visible. With no
  group filter, only the sort order shows at the right edge.

## Round 6: third-party theme packs

Three community packs (Vertical Blue Lava Lamp, Project Clean, PS5 Theme) were checked screen by
screen against the console screenshots that ship with them. What they exercised:

- **Custom icons.** `album.png`, `news.png`, `shop.png`, `controller.png`, `settings.png`,
  `power.png`, `nso.png`, `card.png`, `share.png` and `lock.png` are applied like
  SwitchThemesCommon's `TextureReplacement`: the icon's own layout patch (size, hidden decorations,
  `C_W` 100) goes before the theme's layout, the pane's UVs are reset, and applet icons are drawn as
  a silhouette (alpha channel) in palette colour 100. The lock icon keeps its colours.
- **Parts ignore their RootPane.** A prt1 pane replaces the part's RootPane, so a theme hiding or
  moving `RootPane` inside `HudTime.bflyt` changes nothing (Project Clean's clock and Wi-Fi).
- **Palette 0 means "none".** `C_W` 0 keeps the material colour instead of resolving to transparent
  black (Lava's Settings navigation text).
- **Code-owned alpha.** qlaunch sets `N_Root` alpha on game icons itself, so a theme `Inactive`
  animation that fades it to 2 doesn't hide unfocused icons (PS5).
- **Title balloons.** The focused game's balloon is measured to its title and centred on the icon
  by code; title and subtitle together mask the colour plate; `W_Fade` windows are alpha-only. The
  tint colour is the plate's own colour, not recoloured for Basic Black.
- **Hidden parts stay hidden.** All Software's header title and sort button follow the theme's
  `L_Header` / `L_BtnSort` visibility.
- **Player select** opens over the blurred Home menu, and the add-user button gets its plus icon.
- **The User page navigation is stacked by code.** Sections follow each other from `N_Top` down,
  so Lava Lamp's `N_Account` at Y -340 still shows "Profile" at the top, as on its console screenshot.
- **qlaunch lays out the status row.** A theme's X for the clock, Wi-Fi and battery is replaced by
  the row layout, unless the theme lifts the pane out of the row with a Y offset. Project Clean
  (and the injector's Legacy_Diamond) set `N_Time` to X 10 and the console still shows the clock
  left of the Wi-Fi icon; Purple Skies moves the clock 640 px up into its top bar and it stays where
  the theme put it.
- **Console toggle** for whether the first game is suspended, which switches the lock screen between
  the Resume card and the HOME-button icon.

Remaining differences mostly come from the packs' screenshots being taken on older firmware (User
page and News structure, an extra Settings entry).

## Known gaps / next steps

1. UI text comes from message files, so strings are mocked (English) per screen.
2. All Software row positions, Settings pages and news card content are set by code; the preview
   approximates them with the real layouts.
3. Animations are applied as end states only. Playing them (and previewing a theme's custom
   animations in motion) is a next step.
4. Verified against a real firmware 23.0.1 dump: all 579 layouts parse, every parts pane resolves,
   and the sample themes' patches all match. Other firmware versions haven't been tested.
