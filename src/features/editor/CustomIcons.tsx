import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import type { ThemeScreen } from '../../types/theme';
import { APPLET_ICON_SLOTS, type AppletIconSlot } from '../../lib/layout/appletIcons';

/**
 * Custom icons a theme can ship (album.png … share.png on the Home menu, lock.png on the lock
 * screen). The installer requires PNGs of an exact size (64×56, the lock icon 184×168); pictures
 * of another size are fitted onto a transparent canvas of that size.
 */

const SIZE: Record<string, [number, number]> = { lock: [184, 168] };
const sizeOf = (slot: AppletIconSlot) => SIZE[slot.name] ?? [64, 56];

const LABEL: Record<string, string> = {
  album: 'Album',
  news: 'News',
  shop: 'Nintendo eShop',
  controller: 'Controllers',
  settings: 'System Settings',
  power: 'Sleep Mode',
  nso: 'Switch Online',
  card: 'Virtual game cards',
  share: 'GameShare',
  lock: 'HOME button',
};

/** Fits any picture into the slot's size (contain, centred) and returns a PNG. */
async function toIconPng(file: Blob, w: number, h: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const k = Math.min(w / bmp.width, h / bmp.height);
  const dw = bmp.width * k;
  const dh = bmp.height * k;
  g.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the icon'))), 'image/png'));
}

export const CustomIcons: React.FC<{ screen: ThemeScreen; onChange: (extraFiles: ThemeScreen['extraFiles']) => void }> = ({ screen, onChange }) => {
  const slots = APPLET_ICON_SLOTS.filter((s) => s.target === screen.target);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<AppletIconSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const files = useMemo(() => new Map(screen.extraFiles.map((f) => [f.name.toLowerCase(), f])), [screen.extraFiles]);
  const urls = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of slots) {
      const f = files.get(`${s.name}.png`);
      if (f) m.set(s.name, URL.createObjectURL(f.blob));
    }
    return m;
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  if (!slots.length) return null;

  const put = async (slot: AppletIconSlot, file: File) => {
    try {
      const [w, h] = sizeOf(slot);
      const blob = await toIconPng(file, w, h);
      const name = `${slot.name}.png`;
      onChange([...screen.extraFiles.filter((f) => f.name.toLowerCase() !== name), { name, blob }]);
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'That file is not a picture the browser can read.');
    }
  };
  const remove = (slot: AppletIconSlot) => onChange(screen.extraFiles.filter((f) => f.name.toLowerCase() !== `${slot.name}.png`));

  return (
    <div className="space-y-2">
      <span className="text-[12px] font-semibold text-[var(--text-2)]">Custom icons</span>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && pending) put(pending, f);
          e.target.value = '';
        }}
      />
      <div className="space-y-1">
        {slots.map((s) => {
          const url = urls.get(s.name);
          const [w, h] = sizeOf(s);
          return (
            <div key={s.name} className="flex items-center gap-2 bg-[var(--panel)] border border-[var(--border)] rounded-lg px-2 py-1.5">
              <span className="w-8 h-7 rounded shrink-0 flex items-center justify-center" style={{ background: 'repeating-conic-gradient(#555 0 25%, #777 0 50%) 0 0/8px 8px' }}>
                {url && <img src={url} alt="" className="max-w-full max-h-full" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] text-[var(--text)] truncate">{LABEL[s.name] ?? s.name}</span>
                <span className="block text-[11px] text-[var(--text-3)] font-mono">
                  {s.name}.png · {w}×{h}
                </span>
              </span>
              <button
                onClick={() => {
                  setPending(s);
                  input.current?.click();
                }}
                className="ui-row-action"
                title={url ? 'Replace' : 'Add'}
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              {url && (
                <button onClick={() => remove(s)} className="ui-row-action ui-row-action-danger" title="Remove (back to the console icon)">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <div className="text-[12px] text-red-300">{error}</div>}
      <div className="text-[12px] text-[var(--text-3)] leading-relaxed">
        {screen.target === 'home'
          ? 'Applet icons are drawn from their shape (alpha) in the system icon colour, like the console does. Pictures are fitted to 64×56.'
          : 'Shown on the round button when nothing is suspended, in its own colours. Pictures are fitted to 184×168.'}
      </div>
    </div>
  );
};
