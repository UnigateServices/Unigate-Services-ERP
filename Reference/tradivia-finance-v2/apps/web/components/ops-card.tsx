'use client';

import { ReactNode, useState } from 'react';

type Props = {
  title: string;
  chip?: string;
  badge?: string;
  count?: number;
  toolbar?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
};

export function OpsCard({
  title,
  chip,
  badge,
  count,
  toolbar,
  collapsible = false,
  defaultOpen = true,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const headerClass = `card-header panel-like${collapsible ? ' clickable' : ''}${open ? '' : ' collapsed'}`;
  const cardClass = `fintech-card has-accent${open ? '' : ' is-shut'}${className ? ` ${className}` : ''}`;

  function toggle() {
    if (collapsible) setOpen((current) => !current);
  }

  const main = (
    <>
      {collapsible ? (
        <svg
          className="toggle-icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      ) : null}
      <span className="card-title">{title}</span>
      {chip ? <span className="ops-chip">{chip}</span> : null}
      {badge ? <span className="ops-ref-badge">{badge}</span> : null}
      {count != null ? <span className="ops-log-count">{count}</span> : null}
    </>
  );

  return (
    <section className={cardClass}>
      <div className={headerClass}>
        {collapsible ? (
          <button
            type="button"
            className="card-header-main"
            aria-expanded={open}
            onClick={toggle}
          >
            {main}
          </button>
        ) : (
          <div className="card-header-main">{main}</div>
        )}
        {toolbar ? <div className="ops-toolbar">{toolbar}</div> : null}
      </div>
      <div className={`card-collapsible${open ? ' is-open' : ''}`}>
        <div className="card-collapsible-inner">
          <div className="ops-form-body">{children}</div>
        </div>
      </div>
    </section>
  );
}
