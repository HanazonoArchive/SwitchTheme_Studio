import React, { useEffect, useRef, useState } from 'react';
import { FilePlus2, FolderOpen, Image as ImageIcon, LayoutTemplate, Loader2, Trash2 } from 'lucide-react';
import type { ScreenTarget, ThemeProject } from '../../types/theme';
import { newScreen, readThemeFiles } from '../../lib/theme/nxtheme';
import { TARGETS } from '../../lib/layout/targets';
import { deleteProject, listProjects, loadProject, type RecentProject } from '../../lib/state/projectStore';

/**
 * What you see when no theme is open, like an IDE's start page: create a theme, open one,
 * reopen a recent one, or start from an example.
 */

interface Props {
  onOpen: (project: ThemeProject) => void;
}

const EXAMPLES = [
  { file: '/demos/purple-skies.zip', name: 'Purple Skies', by: 'Hsushi', note: 'Background image, reworked Home and lock screen' },
  { file: '/demos/vertical-oem.zip', name: 'Vertical OEM', by: 'sodasoba', note: 'Layout only: keeps the console background' },
];

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

export const StartPage: React.FC<Props> = ({ onOpen }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('My Theme');
  const [author, setAuthor] = useState('');
  const [start, setStart] = useState<'stock' | 'vertical'>('stock');
  const [targets, setTargets] = useState<ScreenTarget[]>(['home', 'lock', 'apps']);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    listProjects().then(setRecent);
  }, []);

  const run = async (label: string, fn: () => Promise<ThemeProject | null>) => {
    setBusy(label);
    setError(null);
    try {
      const p = await fn();
      if (p) onOpen(p);
    } catch (e) {
      setError((e as Error).message || 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const fetchTheme = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
    return readThemeFiles([{ name: url.split('/').pop()!, blob: await res.blob() }]);
  };

  const openFiles = (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    run('open', () => readThemeFiles(Array.from(files).map((f) => ({ name: f.name, blob: f }))));
  };

  const create = () =>
    run('new', async () => {
      let project: ThemeProject;
      if (start === 'vertical') project = await fetchTheme('/demos/vertical-oem.zip');
      else {
        const screens = targets.map(newScreen);
        project = { id: '', name: '', author: '', screens, activeScreenId: screens[0].id };
      }
      return {
        ...project,
        id: `project-${Date.now()}`,
        name: name.trim() || 'Untitled theme',
        author: author.trim() || 'Unknown',
        // Fresh theme metadata; layout credits stay with the template's author.
        screens: project.screens.map((s) => ({ ...s, info: {} })),
      };
    });

  const toggleTarget = (t: ScreenTarget) => setTargets((cur) => (cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : TARGETS.map((x) => x.target).filter((x) => x === t || cur.includes(x))));

  return (
    <section
      className="flex-1 overflow-y-auto bg-[var(--canvas)]"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        openFiles(e.dataTransfer.files);
      }}
    >
      <input ref={fileRef} type="file" multiple accept=".nxtheme,.zip" className="hidden" onChange={(e) => (openFiles(e.target.files), (e.target.value = ''))} />
      <div className={`max-w-[880px] mx-auto px-10 py-14 ${dragOver ? 'opacity-60' : ''}`}>
        <h1 className="text-[26px] font-semibold text-[var(--text)] tracking-[-0.01em]">SwitchTheme Studio</h1>
        <p className="mt-1 text-[13px] text-[var(--text-2)]">Custom themes for the Nintendo Switch home menu (.nxtheme, NXThemes Installer).</p>

        <div className="mt-10 grid grid-cols-[1fr_1fr] gap-12">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--text)] mb-3">Start</h2>
            <div className="space-y-0.5">
              <button className="start-link" onClick={() => setCreating((v) => !v)}>
                <FilePlus2 className="w-4 h-4" /> New theme…
              </button>
              <button className="start-link" onClick={() => fileRef.current?.click()}>
                <FolderOpen className="w-4 h-4" /> Open .nxtheme…
              </button>
            </div>

            {creating && (
              <div className="mt-3 p-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-[11px] text-[var(--text-2)]">Name</span>
                    <input className="ui-input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-[var(--text-2)]">Author</span>
                    <input className="ui-input w-full" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="You" />
                  </label>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] text-[var(--text-2)]">Start from</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['stock', 'Stock layout', "The console's own layout, untouched"],
                        ['vertical', 'Vertical OEM', 'A finished layout to tweak'],
                      ] as const
                    ).map(([id, label, note]) => (
                      <button
                        key={id}
                        onClick={() => setStart(id)}
                        className={`text-left p-2.5 rounded-md border ${start === id ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:bg-[var(--hover)]'}`}
                      >
                        <span className="block text-[12px] text-[var(--text)]">{label}</span>
                        <span className="block text-[11px] text-[var(--text-3)]">{note}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {start === 'stock' && (
                  <div className="space-y-1">
                    <span className="block text-[11px] text-[var(--text-2)]">Screens</span>
                    <div className="flex flex-wrap gap-1.5">
                      {TARGETS.map((t) => (
                        <button
                          key={t.target}
                          onClick={() => toggleTarget(t.target)}
                          className={`h-7 px-2.5 rounded-md text-[12px] border ${targets.includes(t.target) ? 'border-[var(--accent)] text-[var(--text)] bg-[var(--accent)]/10' : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--hover)]'}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button className="ui-btn" onClick={() => setCreating(false)}>
                    Cancel
                  </button>
                  <button className="ui-btn ui-btn-primary" onClick={create} disabled={busy !== null}>
                    {busy === 'new' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Create theme
                  </button>
                </div>
              </div>
            )}

            <h2 className="text-[13px] font-semibold text-[var(--text)] mt-9 mb-3">Recent</h2>
            {recent === null ? (
              <p className="text-[12px] text-[var(--text-3)]">…</p>
            ) : recent.length === 0 ? (
              <p className="text-[12px] text-[var(--text-3)]">Themes you work on are saved in this browser and show up here.</p>
            ) : (
              <div className="space-y-0.5">
                {recent.slice(0, 8).map((r) => (
                  <div key={r.id} className="group flex items-center gap-2 h-8 px-2 -mx-2 rounded-md hover:bg-[var(--hover)]">
                    <button className="flex-1 flex items-baseline gap-2 text-left min-w-0" onClick={() => run(r.id, () => loadProject(r.id))}>
                      <span className="text-[13px] text-[var(--accent)] truncate">{r.name}</span>
                      <span className="text-[11px] text-[var(--text-3)] truncate">
                        {r.screens} screen{r.screens === 1 ? '' : 's'}
                        {r.edits ? ` · ${r.edits} edits` : ''}
                        {r.hasImage ? ' · image' : ''} · {ago(r.updatedAt)}
                      </span>
                    </button>
                    {busy === r.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-3)]" />}
                    <button
                      className="ui-icon-btn opacity-0 group-hover:opacity-100"
                      title="Remove from this browser"
                      onClick={async () => {
                        await deleteProject(r.id);
                        setRecent(await listProjects());
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-[13px] font-semibold text-[var(--text)] mb-3">Examples</h2>
            <div className="space-y-2">
              {EXAMPLES.map((ex) => (
                <button key={ex.file} onClick={() => run(ex.file, () => fetchTheme(ex.file))} className="w-full flex gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--hover)] text-left">
                  <span className="w-9 h-9 rounded-md bg-[var(--panel-2)] flex items-center justify-center text-[var(--text-2)] shrink-0">
                    {ex.file.includes('purple') ? <ImageIcon className="w-4 h-4" /> : <LayoutTemplate className="w-4 h-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-[var(--text)]">
                      {ex.name} <span className="text-[var(--text-3)]">by {ex.by}</span>
                    </span>
                    <span className="block text-[12px] text-[var(--text-2)]">{ex.note}</span>
                  </span>
                  {busy === ex.file && <Loader2 className="w-4 h-4 animate-spin text-[var(--text-3)] self-center" />}
                </button>
              ))}
            </div>

            <h2 className="text-[13px] font-semibold text-[var(--text)] mt-9 mb-3">Good to know</h2>
            <ul className="space-y-2 text-[12px] text-[var(--text-2)] leading-relaxed">
              <li>The console's stock layouts are built in. Loading your own .szs files (Layout tab) is optional and adds the exact textures.</li>
              <li>Drop a .nxtheme or .zip anywhere on this page to open it.</li>
              <li>
                In the editor: wheel to zoom, Space + drag to pan, drag to move, handles to resize, the knob to rotate,{' '}
                <kbd className="kbd">Alt</kbd> to move without snapping, <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Z</kbd> to undo.
              </li>
              <li>
                A click selects a whole component (a game icon, an applet button); double-click to go inside it,{' '}
                <kbd className="kbd">Ctrl</kbd>+click for the exact layer.
              </li>
              <li>Themes need a modded console and NXThemes Installer to install.</li>
            </ul>
          </div>
        </div>

        {error && <p className="mt-8 text-[12px] text-[var(--danger)]">{error}</p>}
      </div>
    </section>
  );
};
