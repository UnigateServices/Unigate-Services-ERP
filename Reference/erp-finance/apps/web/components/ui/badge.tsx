import { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`ui-badge${tone === 'neutral' ? '' : ` is-${tone}`}`}>{children}</span>;
}