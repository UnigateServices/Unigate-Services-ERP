import { ReactNode } from 'react';

export function StatCard({ label, value, hint, negative }: { label: ReactNode; value: ReactNode; hint?: ReactNode; negative?: boolean }) {
  return (
    <div className="ui-stat">
      <div className="ui-stat-label">{label}</div>
      <div className={`ui-stat-value${negative ? ' is-negative' : ''}`}>{value}</div>
      {hint ? <div className="ui-stat-hint">{hint}</div> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="ui-stats">{children}</div>;
}