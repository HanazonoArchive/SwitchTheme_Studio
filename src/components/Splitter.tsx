import React, { useEffect, useRef, useState } from 'react';

/**
 * Draggable dividers between panels. A size is remembered per panel in this browser
 * (localStorage, ignored when unavailable). Double-click a divider to go back to the default.
 */

/**
 * The divider itself. `axis` is the direction it moves: 'x' for a vertical bar between columns,
 * 'y' for a horizontal bar between stacked panels. `invert` when growing the panel means moving
 * left/up (a panel on the right or bottom of the divider).
 */
export const Splitter: React.FC<{
  axis: 'x' | 'y';
  size: number;
  onSize: (v: number) => void;
  onReset?: () => void;
  invert?: boolean;
  label: string;
}> = ({ axis, size, onSize, onReset, invert, label }) => {
  const drag = useRef<{ p: number; s: number } | null>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    return () => {
      document.body.style.cursor = prev;
    };
  }, [active, axis]);
  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={Math.round(size)}
      tabIndex={0}
      title={`${label}: drag to resize, double-click to reset`}
      className={`ui-splitter ui-splitter-${axis} ${active ? 'ui-splitter-active' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { p: axis === 'x' ? e.clientX : e.clientY, s: size };
        setActive(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const delta = (axis === 'x' ? e.clientX : e.clientY) - d.p;
        onSize(d.s + (invert ? -delta : delta));
      }}
      onPointerUp={() => {
        drag.current = null;
        setActive(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setActive(false);
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        const grow = axis === 'x' ? (invert ? 'ArrowLeft' : 'ArrowRight') : invert ? 'ArrowUp' : 'ArrowDown';
        const shrink = axis === 'x' ? (invert ? 'ArrowRight' : 'ArrowLeft') : invert ? 'ArrowDown' : 'ArrowUp';
        if (e.key === grow) onSize(size + step);
        else if (e.key === shrink) onSize(size - step);
        else return;
        e.preventDefault();
      }}
    />
  );
};
