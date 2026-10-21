'use client';

import { ReactNode } from 'react';

type TableProps = {
  children: ReactNode;
  dense?: boolean;
  className?: string;
};

export function Table({ children, dense, className }: TableProps) {
  return (
    <div className={`ui-table-wrap${className ? ` ${className}` : ''}`}>
      <table className={`ui-table${dense ? ' is-dense' : ''}`}>{children}</table>
    </div>
  );
}

type EmptyProps = {
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
};

export function EmptyState({ title, detail, action, children }: EmptyProps) {
  return (
    <div className="ui-empty">
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {action}
      {children}
    </div>
  );
}
