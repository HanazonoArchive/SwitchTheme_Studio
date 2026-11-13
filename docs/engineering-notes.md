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
- **The lock screen has two resting states, picked by whether a game is suspended.** With a
  suspended game, `EntMain_LockMainOut`: status bar, news column and Continue button, content 180 px
  right of centre (Lava Lamp's and Project Clean's screenshots show the status bar). With nothing
  suspended, `EntMain_LockMainIn`: content centred, no status bar, and `N_SystemApplet` with the HOME
  icon or the theme's `lock.png` (PS5 by Rodel's screenshot). The lock screen preview starts with
  nothing suspended; the Console tab switches it.
- **Texture scroll (FLTS) is applied at rest.** The lock screen's left panel is one checker texel
  scrolled to dark (news column shown) or to the background colour (`LockMainIn`), so it only
  disappears once the texture SRT track is applied. The HOME button's stand-in icon is drawn as the
  left half of a house because the console mirrors that texture.
- **Editor components.** prt1 parts and the slots qlaunch fills in code are components: a click
  selects the whole thing, resizing it changes its Scale so everything inside follows, and the
  rotation knob edits Rotation Z. Equal-spacing snapping measures gaps between siblings.
- **Style editing.** The Inspector writes `ColorTL`…`ColorBR`, material colours, `UsdPatches` and
  draw order. User data keeps the stock value count and type (the installer silently ignores a
  patch that changes either); new float properties use type 2. The installer's draw-order names
  describe the child list: `PullFrontPanes` moves a pane to index 0 (drawn first, behind) and
  `PushBackPanes` to the end (on top), so "Bring to front" writes `PushBackPanes`.
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

## Round 7: precision tools, multi-select and the editor's own conventions

- **History with labels.** `useHistory` keeps a label and time per step (set at the call site:
  `editLabel` derives "Move/Resize/Scale/Rotate/Hide in theme X" from the edit) and can `jumpTo` any
  step. A transient run (a drag) is still one step; the History panel lists past, present and the
  undone future.
- **Selection model.** The primary selection (`selectedKey` + `selectedId`, what the Inspector edits)
  plus `extraIds`. Moves go through `onMove(MoveDelta[])`: the overlay converts the one screen delta
  into each layer's own parent space and position scale, and App writes each distinct pane key once
  (a layout used twelve times moves once). Layers inside another moving layer are left out, so a
  component and its child don't move twice.
- **Outline meanings** (`geometry.ts`, `MEANING`/`LINES`) are shared by the overlay, Layers and the
  legend: colour = what (component, changed, hidden in theme, locked), line = state (solid selected,
  dashed hover, dotted not drawn by the console).
- **Console limits** (`limits.ts`): runtime overrides found earlier (HUD row X, MypNav section Y,
  balloon width, part RootPane transform, code-slot size, game icon alpha, runtime text) become
  notes per pane and field. The Inspector shows them, fields get the note's colour, the drag readout
  shows the caution while the value changes, and the layer menu disables what can't work with the
  reason ("Not supported: …", "Not applicable: …").
- **Layer view** builds a separate scene: each drawn layer of a component is cloned with its
  children dropped, forced visible, and given a matrix (`SceneNode.matrix`, drawn with
  `Container.setFromMatrix`) that fits it into a tile. Clones keep ids and keys and get the tile
  transform applied to `world` and `parentWorld`, so selection and dragging work unchanged.
- **Preview font.** `mockDraw.FONT` is a live binding changed by `setPreviewFontFamily`; the counter
  `fontVersion` is part of the canvas texture cache key and App's `fontTick` rebuilds the scene so
  text is measured again.
- **Compatibility.** `lib/compat.ts` checks WebGL, IndexedDB, createImageBitmap, pointer events,
  ResizeObserver and modern CSS at start and lists what's missing. Number inputs are text inputs
  with our own stepper (no engine spinners), range inputs are styled for WebKit and Gecko, Firefox
  gets `scrollbar-width/color`, `color-mix` has an rgba fallback, and the canvas uses
  `touch-action: none` for pens and touch screens. `beforeunload` asks before closing a tab with a
  theme open.

## Gengar theme pack (issue: unsupported top navigation)

Gengar by rafa_c136 (Home: Unison R Pastel Compact by petey) draws its applet row as four pastel
pills. The pack ships a console screenshot; four things differed and are fixed:

- **Vertex colours from theme animations.** The pill and glyph colours aren't in the patches; the
  theme's `RdtBtn*_Inactive` animations key them with `FLVC` targets 0–15 (TL/TR/BL/BR × RGBA).
  The resting state only applied target 16 (pane alpha); it now applies the colour channels to
  pic1 panes. Pill colours match the screenshot to ±1.
- **`C_W` 0 is not recoloured.** With `C_W` explicitly 0 the console draws the material's white as
  is, also in Basic Black; the preview had darkened it with the Basic Black heuristic.
- **Corner radius after scale.** `P_PictBase` is 72×72, scaled 2×1.3, radius 58: the console draws
  a pill with round ends, so the radius is clamped to the scaled size and undone per axis
  (`render/corners.ts`). Uniformly scaled panes are unchanged.
- **Clock lifted with X 0.** The theme lifts `N_Time` out of the status row with Y 631 and X 0;
  the console still gives it the row's X (clock at the far left). Purple Skies lifts it with its
  own X (-140) and keeps it. Rule: the X is kept only when the theme sets both a non-zero X and Y.
- **Empty alpha masks.** The theme makes the Album's `P_PictMask` transparent; what it masks
  (`P_Color`) is no longer drawn.

Still different: the Album glyph is tinted by palette 92 (blue) in the preview, while the
screenshot shows it grey-blue (the animation's vertex colour × ~0.8). The screenshot may come from
an older firmware's palette; left as is until a 20.0+ console shot shows otherwise. The game row
and focused card (lower half) weren't part of the issue. The other four packs render pixel-identical
before and after these changes.

## Game icon size and focus zoom (how the console treats a focused game)

Checked against the console's own RdtBtnIconGame animations (ResidentMenu.szs) and four packs:

- **All game icons are one layout.** RdtBtnIconGame is instantiated once per slot, so a size
  change applies to every game icon; there's no per-icon size.
- **Stock, focus doesn't change the size.** `FocusKey` has no keys and `Active` only fades the
  cursor frame in (`P_InnerCursor` alpha 0 → 255 in 1 frame); `Inactive` fades it out. Pressing
  plays `DecideKey`/`DecideTouch`, an 8-frame bounce to 94%. There's no console setting for
  enlarging the focused game.
- **Themes enlarge it with animations.** They replace `RdtBtnIconGame_Active`/`_Inactive` with
  versions that add FLPA scale keys on a pane, plus a group (AddGroups) containing that pane:
  Purple Skies N_Root 1 → 1.8 under a RootPane scale of 0.5, Gengar RootPane 0.47 → 0.75, another
  pack N_Root 2 → 3–4.
- **The editor** (Inspector → Game icon size, with a game icon or slot selected) reads those
  values as "All %" and "Focus %" relative to the console size and writes them back: editing the
  theme's animations when it has them; otherwise a plain N_Root scale (no zoom) or new
  Active/Inactive animations started from the console's own files (`nx/bflanJson.ts` reads a
  BFLAN into the installer's JSON form, so the stock cursor keys stay) with a group
  `STS_G_Focus` = the stock group's panes + N_Root. Slot spacing (N_Icon_xx) isn't changed.

## Layer view as an exploded stack

Layer view draws the component's layers as a stack of semi-transparent slabs projected at an
angle (rotate 45°, half height), bottom layer lowest, each slab showing its layer in place, with
two side faces for thickness. Tiles (thumbnail, name, kind, state) sit in two columns and connect
to their slab's corner with a line. The tile card and the slab carry the layer's key (the card's
id is `id#tile`, mapped back on select); clicks only select there (no handles).

## Animations rest at their frame count

A layout animation stops at its FrameSize even when keys go further: Gengar's
`RdtBtnIconGame_Inactive` is 6 frames long with RootPane Y going 120 → 0 at frame 12, so unfocused
icons rest at 60 (Hermite between the keys), which puts the game row exactly where the pack's
console screenshot has it (it was 60 px low). Curves are now sampled with Hermite interpolation
(Blend is the slope per frame). `RdtBtnIconGame_User_xx` are the exception: qlaunch seeks them to
the frame for the number of players, so their keys past the end (the player's picture at frame
10 of a 1-frame animation) are reached, as the console screenshots of the other packs show. The
other packs render pixel-identical with this rule.

## Panels, Layer view navigation, default icons

- Dividers between Screens/tabs, the left column/canvas, the canvas/right column, Layers/Inspector
  and the canvas/bottom dock are draggable (keyboard too), remembered in this browser, double-click
  to reset (`components/Splitter.tsx`, `usePanelSize.ts`).
- In Layer view, picking a component in Layers opens it there; picking anything outside the open
  component says it isn't one. Layer view draws on the canvas background, without the screen.
- Assets shows the console's default icon for each slot by taking a picture of that pane from the
  preview (`canvas/snapshot.ts`, Pixi extract), or says the theme hides it.

## Known gaps / next steps

1. UI text comes from message files, so strings are mocked (English) per screen.
2. All Software row positions, Settings pages and news card content are set by code; the preview
   approximates them with the real layouts.
3. Animations are applied as end states only. Playing them (and previewing a theme's custom
   animations in motion) is a next step.
4. Verified against a real firmware 23.0.1 dump: all 579 layouts parse, every parts pane resolves,
   and the sample themes' patches all match. Other firmware versions haven't been tested.

## Export verified with the injector's own code

Exports were checked with NxThemeTool (built from exelix11/SwitchThemeInjector, Themes common 4.9)
against a real firmware 23.0.1 dump:

- Five real theme packs (32 screens) were opened in the studio and exported again. `validate` was
  clean for every exported .nxtheme, and `apply` produced patched .szs files **byte-identical** to
  applying the original .nxtheme. Images (image.jpg, icon PNGs) are copied byte-for-byte.
  Only `preview.jpg` (a store thumbnail the installer doesn't use) is not carried over.
- A new theme (stock layout + moved pane + custom icon + game-icon focus scale) validates clean and
  applies: the patched ResidentMenu.szs has the moved pane and the `STS_G_Focus` animation with the
  1.3 scale keys. A background swapped to DXT1 .dds replaces `White1x1A128^s` with a 1280×720 BC1
  texture, as the installer does on the console (it converts image.jpg itself; NxThemeTool can't).
- Loading the patched .szs back into the studio renders within DXT1 noise of the studio's own
  preview of the theme (mean pixel difference 1.9/255).
- info.json now carries an `Id` (8 hex chars, stable per project; an imported theme keeps its own),
  which the injector's tools warn about when missing.
- The injector's background picture (material `P_Custm`) isn't recoloured for Basic Black, so an
  installed .szs loaded as console files previews at full brightness.

## Layout presets (Themezer layouts)

`public/presets/<target>.json` is generated by `scripts/import-themezer-layouts.mjs` from a checkout
of ThemezerNX/Layouts (MPL-2.0; licence and source commit in `public/presets/`). Only the JSON is
taken: Themezer's overlay PNGs are renders of the console UI, and the studio previews live anyway.

- Folder `targets/<szs>/<layout>/` → one preset: `layout.json`, optional `common.json` (home),
  `details.json` (description, colour). `Default` has no layout.json (it is the stock layout).
- `options/<priority>_<TYPE>_<name>/`: `TOGGLE` holds one patch, `SELECT` one per choice. `_GLOBAL`
  options apply to every layout of that screen. Only TOGGLE and SELECT are used in the repo
  (INTEGER/DECIMAL/STRING/COLOR exist in Themezer's validator but no layout uses them).
- Options merge in priority order (`mergeLayoutPatch`): files, panes, materials, groups and user
  data by name, fields from the option win; animations replaced by file name. An entry with
  `"__self": null` deletes the matching entry (57 uses, e.g. "Square" game icons removes the
  `S_RoundRadius` user data). Markers that find nothing to delete are dropped before export: left
  in, the injector fails with "only single and int32 usd properties" / null reference errors.
- All 199 variants (each layout as designed, each choice, all toggles on) validate and apply with
  NxThemeTool against the 23.0.1 dump with no errors.
- The applied preset and its options are kept on the screen (`ThemeScreen.preset`, editor-only).
  Changing an option rebuilds the layout from the preset; the panel says so when the layout was
  edited by hand since.
- Footer: qlaunch draws it through `Footer.bflyt` (its `L_Footer` part is `FooterAll.bflyt`), so the
  preview now renders from `Footer.bflyt`; presets that hide `L_Footer` hide the footer in the
  preview too.
