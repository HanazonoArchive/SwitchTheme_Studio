import { useCallback, useState } from 'react';

/**
 * Undo/redo for the project. `set(fn, { transient: true })` replaces the present without
 * creating a history entry (used while dragging), so one drag = one undo step.
 *
 * Every update is a pure function of the previous state (React may run updaters twice in
 * development), so the start of a transient run lives in state, not in a ref.
 */
interface State<T> {
  past: T[];
  present: T;
  future: T[];
  /** Present value before the current transient run (null when none is in progress). */
  base: T | null;
}

export function useHistory<T>(initial: T, limit = 200) {
  const [state, setState] = useState<State<T>>({ past: [], present: initial, future: [], base: null });

  const set = useCallback(
    (next: T | ((prev: T) => T), opts?: { transient?: boolean }) => {
      setState((s) => {
        const value = typeof next === 'function' ? (next as (p: T) => T)(s.present) : next;
        if (Object.is(value, s.present)) return s;
        if (opts?.transient) return { ...s, present: value, base: s.base ?? s.present };
        const base = s.base ?? s.present;
        return { past: [...s.past, base].slice(-limit), present: value, future: [], base: null };
      });
    },
    [limit],
  );

  /** Ends a transient run (e.g. on pointer up) by turning it into one history entry. */
  const commit = useCallback(() => {
    setState((s) => {
      if (s.base === null) return s;
      if (Object.is(s.base, s.present)) return { ...s, base: null };
      return { past: [...s.past, s.base].slice(-limit), present: s.present, future: [], base: null };
    });
  }, [limit]);

  const reset = useCallback((value: T) => {
    setState({ past: [], present: value, future: [], base: null });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      // An unfinished drag is undone back to where it started.
      if (s.base !== null) return { ...s, present: s.base, base: null, future: [s.present, ...s.future] };
      if (!s.past.length) return s;
      return { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future], base: null };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s;
      return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1), base: null };
    });
  }, []);

  return {
    value: state.present,
    set,
    commit,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0 || state.base !== null,
    canRedo: state.future.length > 0,
  };
}
