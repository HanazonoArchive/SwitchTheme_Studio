import { useCallback, useState } from 'react';

/**
 * Undo/redo for the project. `set(fn, { transient: true })` replaces the present without
 * creating a history entry (used while dragging), so one drag = one undo step.
 *
 * Every step carries a label ("Move N_Icon_04", "Colour P_Bg") for the History panel, which
 * can also jump to any step.
 *
 * Every update is a pure function of the previous state (React may run updaters twice in
 * development), so the start of a transient run lives in state, not in a ref.
 */
export interface Step<T> {
  value: T;
  /** What produced this value. */
  label: string;
  at: number;
}

interface State<T> {
  past: Step<T>[];
  present: Step<T>;
  future: Step<T>[];
  /** Present step before the current transient run (null when none is in progress). */
  base: Step<T> | null;
}

export interface SetOptions {
  transient?: boolean;
  /** Label of the history step (the History panel shows it). */
  label?: string;
}

export function useHistory<T>(initial: T, limit = 200, initialLabel = 'Opened') {
  const [state, setState] = useState<State<T>>(() => ({ past: [], present: { value: initial, label: initialLabel, at: Date.now() }, future: [], base: null }));

  const set = useCallback(
    (next: T | ((prev: T) => T), opts?: SetOptions) => {
      setState((s) => {
        const value = typeof next === 'function' ? (next as (p: T) => T)(s.present.value) : next;
        if (Object.is(value, s.present.value)) return s;
        const step: Step<T> = { value, label: opts?.label ?? 'Edit', at: Date.now() };
        if (opts?.transient) return { ...s, present: step, base: s.base ?? s.present };
        const base = s.base ?? s.present;
        return { past: [...s.past, base].slice(-limit), present: step, future: [], base: null };
      });
    },
    [limit],
  );

  /** Ends a transient run (e.g. on pointer up) by turning it into one history entry. */
  const commit = useCallback(() => {
    setState((s) => {
      if (s.base === null) return s;
      if (Object.is(s.base.value, s.present.value)) return { ...s, present: s.base, base: null };
      return { past: [...s.past, s.base].slice(-limit), present: s.present, future: [], base: null };
    });
  }, [limit]);

  const reset = useCallback((value: T, label = initialLabel) => {
    setState({ past: [], present: { value, label, at: Date.now() }, future: [], base: null });
  }, [initialLabel]);

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

  /** Jumps to a step of `steps` (past, present, future in order). */
  const jumpTo = useCallback((index: number) => {
    setState((s) => {
      const all = s.base ? [...s.past, s.base, ...s.future] : [...s.past, s.present, ...s.future];
      if (index < 0 || index >= all.length) return s;
      return { past: all.slice(0, index), present: all[index], future: all.slice(index + 1), base: null };
    });
  }, []);

  const steps = state.base ? [...state.past, state.base, ...state.future] : [...state.past, state.present, ...state.future];
  return {
    value: state.present.value,
    set,
    commit,
    reset,
    undo,
    redo,
    jumpTo,
    /** Every step, oldest first, and which one is current. */
    steps,
    current: state.past.length,
    canUndo: state.past.length > 0 || state.base !== null,
    canRedo: state.future.length > 0,
  };
}
