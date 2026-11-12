import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A right-click menu. Items that don't apply stay visible but disabled, with the reason under
 * them ("Not applicable: ..."), so it's clear why something can't be done here.
 */

export type MenuItem =
  | { type: 'item'; label: string; icon?: React.ReactNode; hint?: string; disabled?: string | boolean; danger?: boolean; onClick: () => void }
  | { type: 'sep' }
  | { type: 'title'; label: string }
  | { type: 'custom'; key: string; render: (close: () => void) => React.ReactNode };

export const ContextMenu: React.FC<{ at: { x: number; y: number }; items: MenuItem[]; onClose: () => void }> = ({ at, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  // Keep the menu on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4)) });
  }, [at.x, at.y, items.length]);
  useEffect(() => {
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  // The menu takes focus (not its first item) so arrow keys work without highlighting anything.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      className="ui-menu max-h-[80vh] overflow-y-auto outline-none"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      tabIndex={-1}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const list = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = list.indexOf(document.activeElement as HTMLButtonElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
      }}
    >
      {items.map((it, i) => {
        if (it.type === 'sep') return items[i - 1]?.type === 'sep' || i === 0 || i === items.length - 1 ? null : <div key={i} className="ui-menu-sep" />;
        if (it.type === 'title') return <div key={i} className="ui-menu-title">{it.label}</div>;
        if (it.type === 'custom') return <React.Fragment key={it.key}>{it.render(onClose)}</React.Fragment>;
        const reason = typeof it.disabled === 'string' ? it.disabled : null;
        return (
          <button
            key={i}
            role="menuitem"
            className={`ui-menu-item ${reason ? '!h-auto py-1' : ''} ${it.danger ? 'text-red-300' : ''}`}
            disabled={!!it.disabled}
            title={reason ?? undefined}
            onClick={() => {
              it.onClick();
              onClose();
            }}
          >
            <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-80">{it.icon}</span>
            <span className="flex flex-col min-w-0">
              <span className="truncate">{it.label}</span>
              {reason && <span className="text-[11px] text-[var(--text-3)] whitespace-normal leading-snug">{reason}</span>}
            </span>
            {it.hint && <span className="ui-menu-hint">{it.hint}</span>}
          </button>
        );
      })}
    </div>
  );
};
