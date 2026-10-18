'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuBox, placeFloatingMenu } from './ops-menu';

export type OpsMultiOption = {
  value: string;
  label: ReactNode;
};

export function OpsMultiSelect({
  values,
  options,
  onChange,
  disabled,
  allLabel = 'الكل',
  countLabel,
}: {
  values: string[];
  options: OpsMultiOption[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  allLabel?: string;
  countLabel?: (count: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const all = values.length === 0;
  const label = all
    ? allLabel
    : values.length === 1
      ? options.find((item) => item.value === values[0])?.label || values[0]
      : countLabel?.(values.length) || `${values.length} مختار`;

  function placeMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setBox(placeFloatingMenu(rect));
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onMove(event: Event) {
      if (menuRef.current?.contains(event.target as Node)) return;
      placeMenu();
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    function onWheel(event: WheelEvent) {
      const node = menuRef.current;
      if (!node || node.scrollHeight <= node.clientHeight + 1) return;
      event.preventDefault();
      event.stopPropagation();
      node.scrollTop += event.deltaY;
    }
    menu.addEventListener('wheel', onWheel, { passive: false });
    return () => menu.removeEventListener('wheel', onWheel);
  }, [open, box]);

  function toggleOne(value: string) {
    if (all) {
      onChange([value]);
      return;
    }
    const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
    onChange(next.length === 0 || next.length === options.length ? [] : next);
  }

  return (
    <div className={`ops-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control ops-select-btn"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="ops-select-value">{label}</span>
        <svg className="ops-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && box
        ? createPortal(
            <ul
              ref={menuRef}
              className="ops-select-menu is-fixed"
              role="listbox"
              style={{
                top: box.top,
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
                transform: box.up ? 'translateY(-100%)' : undefined,
              }}
            >
              <li>
                <button type="button" role="option" aria-selected={all} onClick={() => onChange([])}>
                  {allLabel}
                </button>
              </li>
              {options.map((item) => (
                <li key={item.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={!all && values.includes(item.value)}
                    onClick={() => toggleOne(item.value)}
                  >
                    <span className={`staff-check${!all && values.includes(item.value) ? ' is-on' : ''}`} aria-hidden="true" />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
