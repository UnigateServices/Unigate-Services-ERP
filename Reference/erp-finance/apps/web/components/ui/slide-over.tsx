'use client';

import { ReactNode, useRef, useState } from 'react';
import { useDismiss } from './modal';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  front?: boolean;
  footer?: ReactNode;
};

export function SlideOver({ title, onClose, children, wide, front, footer }: Props) {
  const [leaving, setLeaving] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  function close() {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => onCloseRef.current(), 220);
  }

  useDismiss(() => close());

  return (
    <div className={`ent-drawer-root${leaving ? ' is-leaving' : ''}${front ? ' is-front' : ''}`}>
      <button type="button" className="ent-drawer-backdrop" aria-label="إغلاق" onClick={close} />
      <aside className={`ent-drawer${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="ent-drawer-head">
          <strong>{title}</strong>
          <button type="button" className="ent-drawer-x" onClick={close} aria-label="إغلاق">
            ×
          </button>
        </header>
        <div className="ent-drawer-body">{children}</div>
        {footer ? <footer className="ent-drawer-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}
