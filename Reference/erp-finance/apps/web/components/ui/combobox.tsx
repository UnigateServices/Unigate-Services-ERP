'use client';

import { createPortal } from 'react-dom';
import { MenuBox, placeFloatingMenu } from './menu';
import { FormEvent, ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal, ModalFooter } from './modal';

export type ComboOption = {
  value: string;
  label: string;
  keywords?: string;
};

type Props = {
  value: string;
  options: ComboOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onCreate?: (name: string) => void;
};

export function Combobox({ value, options, placeholder = 'بحث...', disabled, onChange, onCreate }: Props) {
  const selected = options.find((item) => item.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<MenuBox | null>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) setBox(placeFloatingMenu(rect));
    };
    place();
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) place();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((item) => `${item.label} ${item.keywords || ''}`.toLowerCase().includes(needle));
  }, [options, query]);

  const typed = query.trim();
  const exact = options.some((item) => {
    const name = item.label.split('·')[0]?.trim().toLowerCase();
    return name === typed.toLowerCase() || item.label.trim().toLowerCase() === typed.toLowerCase();
  });
  const canCreate = Boolean(onCreate && typed && !exact);
  const count = filtered.length + (canCreate ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function choose(index: number) {
    if (index < filtered.length) {
      onChange(filtered[index].value);
      setOpen(false);
      setQuery('');
      return;
    }
    if (canCreate && onCreate) {
      onCreate(typed);
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div className={`combo${open ? ' is-open' : ''}`} ref={rootRef}>
      <input
        ref={inputRef}
        dir="auto"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        className="ui-input form-control"
        placeholder={placeholder}
        value={open ? query : selected?.label || ''}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setQuery('');
          setActive(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
            setOpen(true);
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, Math.max(count - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (count) choose(active);
          } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery('');
          }
        }}
      />
      {open && !disabled && box ? createPortal(
        <div
          ref={menuRef}
          className="combo-menu is-fixed"
          id={listId}
          role="listbox"
          style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight, transform: box.up ? 'translateY(-100%)' : undefined }}
        >
          {filtered.length === 0 && !canCreate ? <p className="combo-empty">لا نتائج</p> : null}
          {filtered.map((item, index) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === value}
              className={index === active ? 'is-active' : ''}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              {item.label}
            </button>
          ))}
          {canCreate ? (
            <button
              type="button"
              className={`combo-create${active === filtered.length ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(filtered.length)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(filtered.length)}
            >
              + إضافة "{typed}" (إنشاء سريع)
            </button>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function QuickCreateDialog({
  title,
  children,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  children: ReactNode;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Modal title={title} onClose={onClose} footer={<ModalFooter formId="quick-create" onCancel={onClose} saveLabel="حفظ" saving={saving} />}>
      <form id="quick-create" className="quick-create" onSubmit={onSubmit}>
        {children}
        {error ? <p className="combo-error">{error}</p> : null}
      </form>
    </Modal>
  );
}
