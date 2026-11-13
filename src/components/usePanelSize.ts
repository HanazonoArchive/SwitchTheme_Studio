import { useCallback, useState } from 'react';

/** Panel sizes, remembered in this browser (localStorage, ignored when unavailable). */
const read = (key: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(`sts.size.${key}`));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: number) => {
  try {
    localStorage.setItem(`sts.size.${key}`, String(Math.round(v)));
  } catch {
    /* private mode: not remembered */
  }
};

/** A panel size in px that can be dragged between min and max. */
export function usePanelSize(key: string, fallback: number, min: number, max: number) {
  const [size, setSize] = useState(() => Math.min(max, Math.max(min, read(key, fallback))));
  const set = useCallback(
    (v: number) => {
      const c = Math.min(max, Math.max(min, v));
      setSize(c);
      write(key, c);
    },
    [key, min, max],
  );
  return [size, set, () => set(fallback)] as const;
}

