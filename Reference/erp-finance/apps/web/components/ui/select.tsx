'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuBox, placeFloatingMenu } from './menu';

export type SelectOption = {
  value: string;
  label: ReactNode;
};

export function Select({
  value,
  options,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const current = options.find((item) => item.value === value);

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
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onMove(event: Event) {
      if (menuRef.current?.contains(event.target as Node)) return;
      placeMenu();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
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

  return (
    <div className={`ui-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control ui-select-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span className="ui-select-value">{current ? current.label : placeholder || '—'}</span>
        <svg className="ui-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && box
        ? createPortal(
            <ul
              ref={menuRef}
              className="ui-select-menu is-fixed"
              role="listbox"
              style={{
                top: box.top,
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
                transform: box.up ? 'translateY(-100%)' : undefined,
              }}
            >
              {options.map((item) => (
                <li key={item.value || 'empty'}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.value === value}
                    onClick={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
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
