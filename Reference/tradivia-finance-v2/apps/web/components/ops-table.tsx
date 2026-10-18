'use client';

import { ReactNode } from 'react';

type TableProps = {
  children: ReactNode;
  dense?: boolean;
  className?: string;
};

export function OpsTable({ children, dense, className }: TableProps) {
  return (
    <div className={`ops-table-wrap${className ? ` ${className}` : ''}`}>
      <table className={`ops-table${dense ? ' is-dense' : ''}`}>{children}</table>
    </div>
  );
}

type EmptyProps = {
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
};

export function OpsEmpty({ title, detail, action, children }: EmptyProps) {
  return (
    <div className="ops-empty">
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {action}
      {children}
    </div>
  );
}
