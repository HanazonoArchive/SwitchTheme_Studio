/**
 * Builds the studio's built-in layout pack (public/stock/*.json) from a console dump.
 *
 *   npm run build:stock -- <path to the dump's "extracted" folder>
 *
 * The dump is what NXThemes Installer's "Extract home menu" writes to
 * sd:/themes/systemData/extracted. The output holds only layout structure and numbers plus
 * descriptions of textures (no Nintendo files or pixels); see src/lib/stock/stockPack.ts.
 * Keep the dump itself out of the repository (*.szs is gitignored).
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseSystemSzs } from '../src/lib/layout/systemLayouts';
import { parseBflan } from '../src/lib/nx/bflan';
import { decodeTexture, type BntxTexture } from '../src/lib/nx/bntx';
import { PLACEHOLDER_NAMES } from '../src/lib/stock/placeholders';
import { STOCK_FILES, toStockArchive } from '../src/lib/stock/stockPack';

const dir = process.argv[2];
const out = process.argv[3] ?? 'public/stock';
if (!dir) {
  console.error('Usage: npm run build:stock -- <extracted folder> [output folder]');
  process.exit(1);
}

const find = (root: string): string[] =>
  readdirSync(root).flatMap((n) => {
    const p = join(root, n);
    return statSync(p).isDirectory() ? find(p) : p.toLowerCase().endsWith('.szs') ? [p] : [];
  });

const wanted = new Map(Object.values(STOCK_FILES).map((f) => [f.replace('.json', '.szs').toLowerCase(), f]));
mkdirSync(out, { recursive: true });
const drawn = new Set(PLACEHOLDER_NAMES);
let total = 0;
for (const file of find(dir)) {
  const outName = wanted.get(basename(file).toLowerCase());
  if (!outName) continue;
  const sys = parseSystemSzs(basename(file), readFileSync(file));
  const archive = toStockArchive(sys, parseBflan, (name) => decodeTexture(sys.textures.get(name) as BntxTexture), drawn);
  // f32 values to 4 decimals: same rendering, much smaller files.
  const json = JSON.stringify(archive, (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v));
  writeFileSync(join(out, outName), json);
  total += json.length;
  const kinds: Record<string, number> = {};
  for (const t of Object.values(archive.textures)) kinds[t.kind] = (kinds[t.kind] ?? 0) + 1;
  console.log(`${outName}: ${sys.layouts.size} layouts, ${Object.keys(archive.animations).length} animations, ${(json.length / 1024).toFixed(0)} KB, textures ${JSON.stringify(kinds)}`);
}
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
