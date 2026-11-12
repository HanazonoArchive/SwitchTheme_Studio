import React, { useEffect, useRef } from 'react';

/**
 * Number inputs, the same everywhere: a styled up/down stepper (hold to repeat), drag the label
 * left/right to scrub (Shift = ×10, Alt = ×0.1), wheel while focused, arrow keys (Shift = ×10).
 * Plain text inputs underneath, so no browser draws its own spinner.
 */

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const fix = (n: number) => Number(n.toFixed(3));

/** Up/down arrows that repeat while held. */
export const Stepper: React.FC<{ onStep: (dir: 1 | -1, big: boolean) => void; disabled?: boolean }> = ({ onStep, disabled }) => {
  const timer = useRef<{ t: number; i: number } | null>(null);
  const stop = () => {
    if (!timer.current) return;
    clearTimeout(timer.current.t);
    clearInterval(timer.current.i);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const press = (dir: 1 | -1) => (e: React.PointerEvent) => {
    if (e.button !== 0 || disabled) return;
    e.preventDefault();
    onStep(dir, e.shiftKey);
    const big = e.shiftKey;
    stop();
    timer.current = { t: window.setTimeout(() => timer.current && (timer.current.i = window.setInterval(() => onStep(dir, big), 60)), 380), i: 0 };
  };
  return (
    <span className="ui-stepper" aria-hidden>
      <button type="button" tabIndex={-1} disabled={disabled} onPointerDown={press(1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} title="Increase (hold to repeat, Shift ×10)">
        <svg viewBox="0 0 8 5" width="8" height="5">
          <path d="M1 4 L4 1 L7 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" tabIndex={-1} disabled={disabled} onPointerDown={press(-1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} title="Decrease (hold to repeat, Shift ×10)">
        <svg viewBox="0 0 8 5" width="8" height="5">
          <path d="M1 1 L4 4 L7 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  );
};

interface NumberFieldProps {
  label: string;
  value: number;
  stock?: number | null;
  step?: number;
  min?: number;
  max?: number;
  /** Shown as the input's hover text (cautions about this field). */
  note?: string;
  noteLevel?: 'error' | 'warn' | 'info';
  onChange: (val: number) => void;
  /** Called when a scrub or a held stepper ends (one undo step). */
  onDone?: () => void;
  className?: string;
}

export const NumberField: React.FC<NumberFieldProps> = ({ label, value, stock, step = 1, min = -Infinity, max = Infinity, note, noteLevel, onChange, onDone, className = '' }) => {
  const [draft, setDraft] = React.useState<string | null>(null);
  const differs = stock !== undefined && stock !== null && Math.abs(stock - value) > 1e-4;
  const clamp = (n: number) => fix(Math.min(max, Math.max(min, n)));
  const set = (n: number) => onChange(clamp(n));
  const commit = (raw: string) => {
    const parsed = parseFloat(raw.replace(',', '.'));
    if (!isNaN(parsed) && isFinite(parsed)) set(parsed);
    setDraft(null);
  };
  const scrub = useRef<{ x: number; v: number } | null>(null);
  // A held stepper repeats from the latest value, not the one it was pressed at.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const noteColor = noteLevel === 'error' ? 'var(--danger)' : noteLevel === 'warn' ? 'var(--warn)' : undefined;
  const title = [stock !== undefined && stock !== null ? `Stock: ${fmt(stock)}` : 'Stock value unknown', note].filter(Boolean).join('\n');
  return (
    <div
      onWheel={(e) => {
        if (document.activeElement !== e.currentTarget.querySelector('input')) return;
        set(value + (e.deltaY < 0 ? step : -step));
      }}
      className={`ui-number group ${differs ? 'ui-number-changed' : ''} ${className}`}
      style={noteColor ? { borderColor: noteColor } : undefined}
      title={title}
    >
      <span
        className="ui-number-label"
        style={noteColor ? { color: noteColor } : undefined}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          scrub.current = { x: e.clientX, v: value };
        }}
        onPointerMove={(e) => {
          const s = scrub.current;
          if (!s) return;
          const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
          set(s.v + Math.round((e.clientX - s.x) / 2) * step * k);
        }}
        onPointerUp={() => {
          if (scrub.current) onDone?.();
          scrub.current = null;
        }}
        onPointerCancel={() => (scrub.current = null)}
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        spellCheck={false}
        value={draft ?? fmt(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setDraft(null);
            set(value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? step * 10 : step));
          }
        }}
        className="ui-number-input"
      />
      <Stepper onStep={(d, big) => set((latest.current = clamp(latest.current + d * step * (big ? 10 : 1))))} />
    </div>
  );
};
