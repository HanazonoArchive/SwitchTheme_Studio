import { useCallback, useRef, useState } from 'react';

/**
 * Undo/redo for the project. `set(fn, { transient: true })` replaces the present without
 * creating a history entry (used while dragging), so one drag = one undo step.
 */
export function useHistory<T>(initial: T, limit = 200) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const transientBase = useRef<T | null>(null);

  const set = useCallback(
    (next: T | ((prev: T) => T), opts?: { transient?: boolean }) => {
      setState((s) => {
        const value = typeof next === 'function' ? (next as (p: T) => T)(s.present) : next;
        if (Object.is(value, s.present)) return s;
        if (opts?.transient) {
          if (transientBase.current === null) transientBase.current = s.present;
          return { ...s, present: value };
        }
        const base = transientBase.current ?? s.present;
        transientBase.current = null;
        return { past: [...s.past, base].slice(-limit), present: value, future: [] };
      });
    },
    [limit],
  );

  /** Ends a transient run (e.g. on pointer up) by turning it into one history entry. */
  const commit = useCallback(() => {
    setState((s) => {
      const base = transientBase.current;
      transientBase.current = null;
      if (base === null || Object.is(base, s.present)) return s;
      return { past: [...s.past, base].slice(-limit), present: s.present, future: [] };
    });
  }, [limit]);

  const reset = useCallback((value: T) => {
    transientBase.current = null;
    setState({ past: [], present: value, future: [] });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.past.length) return s;
      return { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s;
      return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) };
    });
  }, []);

  return {
    value: state.present,
    set,
    commit,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
