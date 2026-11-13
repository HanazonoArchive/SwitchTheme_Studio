#!/usr/bin/env node
/**
 * Builds the layout presets from a checkout of github.com/ThemezerNX/Layouts (MPL-2.0).
 *
 *   git clone --depth 1 https://github.com/ThemezerNX/Layouts ../Layouts
 *   node scripts/import-themezer-layouts.mjs ../Layouts
 *
 * Writes public/presets/<target>.json (one per screen) plus the licence and a NOTICE naming the
 * source commit. Only the layout JSON is taken: Themezer's overlay/option PNGs are previews of
 * the console UI, and the studio draws its own live preview instead.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const src = process.argv[2];
if (!src || !existsSync(join(src, 'targets'))) {
  console.error('Usage: node scripts/import-themezer-layouts.mjs <path to ThemezerNX/Layouts checkout>');
  process.exit(1);
}
const out = new URL('../public/presets/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const TARGETS = { ResidentMenu: 'home', Entrance: 'lock', Flaunch: 'apps', Set: 'set', Notification: 'news', MyPage: 'user', Psl: 'psl' };
const isDir = (p) => statSync(p).isDirectory();
const readJson = (p) => {
  const j = JSON.parse(readFileSync(p, 'utf8'));
  delete j.uuid;
  return j;
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function readOptions(dir, global) {
  const opts = [];
  const od = join(dir, 'options');
  if (!existsSync(od)) return opts;
  for (const folder of readdirSync(od).filter((f) => isDir(join(od, f)))) {
    const [priority, type, ...rest] = folder.split('_');
    const name = rest.join('_');
    const files = readdirSync(join(od, folder)).filter((f) => f.endsWith('.json')).sort();
    if (type === 'TOGGLE') {
      if (files.length !== 1) throw new Error(`Toggle ${folder} has ${files.length} JSON files`);
      opts.push({ name, type: 'toggle', priority: Number(priority), global, patch: readJson(join(od, folder, files[0])) });
    } else if (type === 'SELECT') {
      opts.push({ name, type: 'select', priority: Number(priority), global, choices: files.map((f) => ({ name: f.replace(/\.json$/, ''), patch: readJson(join(od, folder, f)) })) });
    } else {
      console.warn(`Skipped option ${folder}: type ${type} isn't supported yet`);
    }
  }
  return opts;
}

let total = 0;
for (const [folder, target] of Object.entries(TARGETS)) {
  const tdir = join(src, 'targets', folder);
  const names = readdirSync(tdir).filter((n) => isDir(join(tdir, n)));
  const globalOpts = names.includes('_GLOBAL') ? readOptions(join(tdir, '_GLOBAL'), true) : [];
  const layouts = [];
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    const dir = join(tdir, name);
    if (name === '_GLOBAL' || !existsSync(join(dir, 'layout.json'))) continue; // "Default" is the stock layout
    const details = existsSync(join(dir, 'details.json')) ? JSON.parse(readFileSync(join(dir, 'details.json'), 'utf8')) : {};
    const layout = readJson(join(dir, 'layout.json'));
    const common = existsSync(join(dir, 'common.json')) ? readJson(join(dir, 'common.json')) : undefined;
    const options = [...readOptions(dir, false), ...globalOpts].sort((a, b) => a.priority - b.priority);
    layouts.push({
      id: slug(name),
      name,
      description: details.description || '',
      author: layout.AuthorName || '',
      color: details.color || undefined,
      layout,
      common,
      options,
    });
  }
  const json = JSON.stringify({ target, layouts });
  writeFileSync(join(out, `${target}.json`), json);
  total += layouts.length;
  console.log(`${target}: ${layouts.length} layouts, ${(json.length / 1024).toFixed(0)} KB`);
}

copyFileSync(join(src, 'LICENSE'), join(out, 'LICENSE-themezer-layouts.txt'));
let commit = 'unknown';
try {
  commit = execSync('git rev-parse HEAD', { cwd: src }).toString().trim();
} catch {
  /* not a git checkout */
}
writeFileSync(
  join(out, 'NOTICE.txt'),
  `The layout presets in this folder come from ThemezerNX/Layouts
https://github.com/ThemezerNX/Layouts (commit ${commit})
Licensed under the Mozilla Public License 2.0 (LICENSE-themezer-layouts.txt).
Each layout belongs to its author (AuthorName in its layout.json). The files are repackaged
unchanged except for removing Themezer's internal "uuid" fields.
`,
);
console.log(`${total} layouts written to public/presets/`);
