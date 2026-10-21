'use client';

import { ReactNode } from 'react';
import { Button } from '../button';
import { Column, DataTable } from '../data-table';
import { PageToolbar } from '../page-toolbar';
import '../../enterprise.css';
import './templates.css';

type Props<T> = {
  title: ReactNode;
  /** "+ جديد" button. Omit `onNew` to hide it (read-only roles). */
  newLabel?: string;
  onNew?: () => void;
  /** Mini KPI strip, usually <StatGrid><StatCard/>…</StatGrid>. */
  kpis?: ReactNode;
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  /** Filter pills / selects. */
  filters?: ReactNode;
  /** Secondary toolbar actions (export, links). */
  actions?: ReactNode;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Opens the row as a full DocumentPage (never a drawer). */
  onOpen?: (row: T) => void;
  ready?: boolean;
  /** Remembers the user's column choice (see DataTable). */
  tableId?: string;
  empty?: ReactNode;
};

export function ListPage<T>({
  title,
  newLabel = '+ جديد',
  onNew,
  kpis,
  search,
  onSearch,
  searchPlaceholder,
  filters,
  actions,
  columns,
  rows,
  rowKey,
  onOpen,
  ready = true,
  tableId,
  empty,
}: Props<T>) {
  return (
    <div className="ent-page lp">
      <header className="tp-head">
        <h1 className="tp-title">{title}</h1>
        <div className="tp-head-end">{onNew ? <Button variant="primary" onClick={onNew}>{newLabel}</Button> : null}</div>
      </header>
      {kpis ? <div className="lp-kpis">{kpis}</div> : null}
      <div className="lp-bar">
        <PageToolbar search={search} onSearch={onSearch} searchPlaceholder={searchPlaceholder} filters={filters} actions={actions} />
      </div>
      <div className="lp-table">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={rowKey}
          onRowClick={onOpen}
          tableId={tableId}
          empty={ready ? empty : 'جارٍ التحميل…'}
        />
      </div>
    </div>
  );
}
