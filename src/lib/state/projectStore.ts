import type { ThemeProject } from '../../types/theme';
import { loadWallpaper } from '../theme/images';

/**
 * Projects are saved in the browser (IndexedDB) as you work, so the start page can list and
 * reopen recent themes. Images are stored as their original bytes; preview URLs are rebuilt
 * on load. Nothing leaves the browser.
 */

const DB = 'switchtheme-projects';
const STORE = 'projects';

export interface RecentProject {
  id: string;
  name: string;
  author: string;
  screens: number;
  edits: number;
  hasImage: boolean;
  updatedAt: number;
}

interface Stored {
  id: string;
  updatedAt: number;
  project: ThemeProject;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(project: ThemeProject): Promise<void> {
  // displayUrl is an object URL for this session only.
  const copy: ThemeProject = { ...project, screens: project.screens.map((s) => (s.wallpaper ? { ...s, wallpaper: { ...s.wallpaper, displayUrl: '' } } : s)) };
  await tx('readwrite', (s) => s.put({ id: project.id, updatedAt: Date.now(), project: copy } satisfies Stored));
}

export async function listProjects(): Promise<RecentProject[]> {
  try {
    const all = (await tx('readonly', (s) => s.getAll())) as Stored[];
    return all
      .map(({ id, updatedAt, project: p }) => ({
        id,
        name: p.name,
        author: p.author,
        screens: p.screens.length,
        edits: p.screens.reduce((n, s) => n + (s.layout.Files ?? []).reduce((m, f) => m + (f.Patches?.length ?? 0), 0), 0),
        hasImage: p.screens.some((s) => s.wallpaper),
        updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function loadProject(id: string): Promise<ThemeProject | null> {
  const stored = (await tx('readonly', (s) => s.get(id))) as Stored | undefined;
  if (!stored) return null;
  const p = stored.project;
  const screens = await Promise.all(p.screens.map(async (s) => (s.wallpaper ? { ...s, wallpaper: await loadWallpaper(s.wallpaper.blob, s.wallpaper.fileName) } : s)));
  return { ...p, screens };
}

export async function deleteProject(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}
