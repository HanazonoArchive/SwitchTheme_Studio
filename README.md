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

## Exact preview

Positions and defaults come from your console's own layout files. Run NXThemes Installer once, copy
`sd:/themes/systemData/*.szs` to your PC, and load them in **Panes → Load ResidentMenu.szs** (or drop the
`.szs` on the canvas). Without them the preview is a labelled approximation.

## Theme kinds

- **Custom image**: ships `image.jpg` (1280×720, baseline) or a DXT1 `image.dds`.
- **Console default**: layout only; the console keeps its Basic Black / Basic White background.

See [docs/ANALYSIS.md](docs/ANALYSIS.md) for how this works and what's still missing.
