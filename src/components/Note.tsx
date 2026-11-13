import React from 'react';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';

/**
 * Notes and cautions, one look everywhere: a quiet panel with a coloured edge, a coloured icon
 * and label saying what kind of note it is, and the text in the normal text colour.
 */
export type NoteTone = 'error' | 'warn' | 'info' | 'ok';

const TONES: Record<NoteTone, { color: string; Icon: React.FC<{ className?: string; style?: React.CSSProperties }>; label: string }> = {
  error: { color: 'var(--danger)', Icon: OctagonAlert, label: 'Not supported' },
  warn: { color: 'var(--warn)', Icon: AlertTriangle, label: 'Caution' },
  info: { color: 'var(--info)', Icon: Info, label: 'Note' },
  ok: { color: 'var(--ok)', Icon: CheckCircle2, label: 'OK' },
};

export const Note: React.FC<{ tone: NoteTone; title?: React.ReactNode; children: React.ReactNode; className?: string; compact?: boolean }> = ({ tone, title, children, className = '', compact }) => {
  const t = TONES[tone];
  return (
    <div className={`ui-note ${compact ? 'ui-note-compact' : ''} ${className}`} style={{ '--tone': t.color } as React.CSSProperties} role={tone === 'error' || tone === 'warn' ? 'alert' : 'note'}>
      <t.Icon className="ui-note-icon" />
      <div className="min-w-0">
        <div className="ui-note-title">{title ?? t.label}</div>
        <div className="ui-note-body">{children}</div>
      </div>
    </div>
  );
};
