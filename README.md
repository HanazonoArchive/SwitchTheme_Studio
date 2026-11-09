# SwitchTheme Studio

A browser editor for Nintendo Switch custom themes (`.nxtheme`) in the format used by
[SwitchThemeInjector / NXThemes Installer](https://github.com/exelix11/SwitchThemeInjector). Requires a
modded console to install.

## Run

```bash
npm install
npm run dev     # editor
npm test        # parser / patch / export tests
npm run build
```

## Console layouts

The stock layouts are **built in** (`public/stock/*.json`): the pane trees, sizes, anchors, colours and
idle animation values of firmware 20.0+, with the studio's own stand-in icons. No Nintendo files or
images are included, so nothing needs to be dumped to start.

For the console's own textures (an exact check before installing), load your files in **Layout → Console
layout**, or drop a `.szs` on the canvas: in NXThemes Installer open **Extract home menu → Extract szs
layout files** and copy `sd:/themes/systemData/extracted/{qlaunch,mypage,playerselect}/lyt/*.szs`. They stay
in your browser. Don't commit or share them (`*.szs` is gitignored).

To regenerate the built-in pack from a dump (e.g. for a new firmware):

```bash
npm run build:stock -- path/to/extracted
```

## Editing

- **Canvas** (PixiJS/WebGL): Ctrl/⌘ + wheel zooms, wheel or Space + drag pans, double-click fits.
- **Select** a layer by clicking it; **Shift+Enter** selects its parent, **Enter** its first child.
  **Alt+click** picks the top layer under the cursor even inside the current selection.
- **Move** by dragging (snaps to other layers and the screen; hold **Alt** to move freely, **Shift** to
  lock an axis), **resize** with the handles (Shift keeps the ratio), **nudge** with the arrow keys.
- **Grid**: toggle and size in the canvas toolbar; moves snap to it.
- **Layers** (right): the whole hierarchy, including parts and the layouts the console creates by code.
  The eye and lock only affect the editor. Hiding a pane *in the theme* is the eye in the Inspector.
- **Preview** (top): use the screen like the console: click a game or use the arrow keys to move focus.

## Theme kinds

- **Custom image**: ships `image.jpg` (1280×720, baseline) or a DXT1 `image.dds`.
- **Console default**: layout only; the console keeps its Basic Black / Basic White background.

See [docs/ANALYSIS.md](docs/ANALYSIS.md) for how this works and what's still missing.
