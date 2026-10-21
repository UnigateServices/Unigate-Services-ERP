'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** Plain-text name shown in the column picker (falls back to `header` when it is a string). */
  label?: string;
  numeric?: boolean;
  /** Optional column: hidden until the user turns it on from the column picker. */
  defaultHidden?: boolean;
  /** Always visible and not listed in the picker (e.g. the row-actions column). */
  fixed?: boolean;
  render: (row: T) => ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  isRowClickable?: (row: T) => boolean;
  empty?: ReactNode;
  /** Stable id: enables remembering the user's column choice in localStorage. */
  tableId?: string;
};

const STORE = 'unigate.cols.';

function columnName<T>(column: Column<T>) {
  return column.label ?? (typeof column.header === 'string' ? column.header : column.key);
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, isRowClickable, empty = 'لا بيانات في هذا العرض.', tableId }: Props<T>) {
  const optional = columns.some((column) => column.defaultHidden);
  const pickable = columns.filter((column) => !column.fixed);
  const defaults = useMemo(() => columns.filter((column) => column.defaultHidden).map((column) => column.key), [columns]);
  const [hidden, setHidden] = useState<string[]>(defaults);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tableId) return;
    try {
      const raw = window.localStorage.getItem(STORE + tableId);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) setHidden(saved.filter((key): key is string => typeof key === 'string'));
    } catch {
      /* ignore corrupt storage */
    }
  }, [tableId]);

  function commit(next: string[]) {
    setHidden(next);
    if (!tableId) return;
    try {
      window.localStorage.setItem(STORE + tableId, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shown = columns.filter((column) => column.fixed || !hidden.includes(column.key));
  const wide = optional && hidden.length === 0;
  const isDefault = hidden.length === defaults.length && defaults.every((key) => hidden.includes(key));

  return (
    <div className="ui-datatable-box">
      {optional ? (
        <div className="ui-datatable-tools" ref={boxRef}>
          <button type="button" className="ui-cols-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16M15 4v16" />
            </svg>
            الأعمدة ▾
          </button>
          {open ? (
            <div className="ui-cols-menu" role="group" aria-label="الأعمدة">
              <div className="ui-cols-quick">
                <button type="button" onClick={() => commit([])}>إظهار الكل</button>
                <button type="button" disabled={isDefault} onClick={() => commit(defaults)}>الافتراضي</button>
              </div>
              {pickable.map((column) => {
                const on = !hidden.includes(column.key);
                const onlyOne = on && shown.filter((item) => !item.fixed).length <= 1;
                return (
                  <label key={column.key} className="ui-cols-item">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={onlyOne}
                      onChange={() => commit(on ? [...hidden, column.key] : hidden.filter((key) => key !== column.key))}
                    />
                    <span>{columnName(column)}</span>
                    {column.defaultHidden ? <small>اختياري</small> : null}
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={`ui-datatable-wrap${wide ? ' is-wide' : ''}`}>
        {rows.length === 0 ? (
          <p className="ui-datatable-empty">{empty}</p>
        ) : (
          <table className="ui-datatable">
            <thead>
              <tr>
                {shown.map((column) => (
                  <th key={column.key} className={column.numeric ? 'is-num' : undefined}>{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const clickable = Boolean(onRowClick) && (isRowClickable ? isRowClickable(row) : true);
                return (
                  <tr key={rowKey(row)} className={clickable ? 'is-clickable' : undefined} onClick={clickable ? () => onRowClick?.(row) : undefined}>
                    {shown.map((column) => (
                      <td key={column.key} className={column.numeric ? 'is-num' : undefined}>{column.render(row)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
