'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import qrcode from 'qrcode-generator';
import { Button, type ButtonVariant } from '../ui/button';
import type { PrintDoc, PrintMode } from './print-types';

const COMPANY = 'TRADIVIA';

/** QR خفيف: رقم المستند | التاريخ | الإجمالي | العملة (ASCII فقط). */
export function DocQr({ doc, size = 96 }: { doc: PrintDoc; size?: number }) {
  const svg = useMemo(() => {
    const payload = [doc.number, doc.date, doc.total, doc.currency].join('|');
    const qr = qrcode(0, 'L');
    qr.addData(payload);
    qr.make();
    return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
  }, [doc.number, doc.date, doc.total, doc.currency]);
  return <div className="pl-qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function PrintLayout({ doc, mode }: { doc: PrintDoc; mode: PrintMode }) {
  const thermal = mode === 'THERMAL';
  const signatures = doc.signatures ?? ['المحاسب', 'المدير المالي', 'المستلم'];
  return (
    <article className={`pl-sheet ${thermal ? 'is-thermal' : 'is-a4'}`} dir="rtl">
      <header className="pl-head">
        <img className="pl-logo" src="/brand/logo-green-no-bg.png" alt="" />
        <div className="pl-company">
          <strong>{COMPANY}</strong>
          {doc.officeName ? <span>{doc.officeName}</span> : null}
        </div>
        {!thermal ? <DocQr doc={doc} /> : null}
      </header>

      <h1 className="pl-title">{doc.title}</h1>
      <dl className="pl-meta">
        <div><dt>الرقم</dt><dd>{doc.number}</dd></div>
        <div><dt>التاريخ</dt><dd>{doc.date}</dd></div>
        {doc.partyName ? <div><dt>{doc.partyLabel || 'الطرف'}</dt><dd>{doc.partyName}</dd></div> : null}
        {doc.status ? <div><dt>الحالة</dt><dd>{doc.status}</dd></div> : null}
        {(doc.meta ?? []).map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>

      {doc.lines && doc.lines.length ? (
        <table className="pl-table">
          <thead>
            <tr>
              <th>البند</th>
              {!thermal ? <th>الكمية</th> : null}
              {!thermal ? <th>السعر</th> : null}
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line, i) => (
              <tr key={i}>
                <td>
                  {line.name}
                  {thermal && line.quantity ? <small> ×{line.quantity}</small> : null}
                </td>
                {!thermal ? <td className="is-num">{line.quantity ?? ''}</td> : null}
                {!thermal ? <td className="is-num">{line.unitPrice ?? ''}</td> : null}
                <td className="is-num">{line.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div className="pl-totals">
        {(doc.totals ?? []).map(([label, value]) => (
          <div key={label}><span>{label}</span><b>{value}</b></div>
        ))}
        <div className="is-grand"><span>الإجمالي</span><b>{doc.total} {doc.currency}</b></div>
      </div>

      {doc.notes ? <p className="pl-notes">ملاحظات: {doc.notes}</p> : null}
      {doc.journalRef ? <p className="pl-journal">رقم القيد المحاسبي المرجعي: <b>{doc.journalRef}</b></p> : null}

      {thermal ? (
        <div className="pl-thermal-foot">
          <DocQr doc={doc} size={110} />
          <span>شكراً لتعاملكم معنا</span>
        </div>
      ) : (
        <footer className="pl-signs">
          {signatures.map((name) => (
            <div key={name}><span>{name}</span></div>
          ))}
        </footer>
      )}
    </article>
  );
}

/** معاينة طباعة نظيفة مع تبديل A4 / 80mm. */
export function PrintPreview({ doc, onClose }: { doc: PrintDoc; onClose: () => void }) {
  const [mode, setMode] = useState<PrintMode>('A4');

  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.plPage = '1';
    style.textContent =
      mode === 'THERMAL' ? '@page { size: 80mm auto; margin: 3mm; }' : '@page { size: A4; margin: 14mm; }';
    document.head.appendChild(style);
    return () => style.remove();
  }, [mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="pl-portal" role="dialog" aria-modal="true" aria-label="معاينة الطباعة">
      <div className="pl-dialog">
      <div className="pl-toolbar">
        <div className="pl-modes">
          <button type="button" className={mode === 'A4' ? 'is-on' : ''} onClick={() => setMode('A4')}>A4 رسمي</button>
          <button type="button" className={mode === 'THERMAL' ? 'is-on' : ''} onClick={() => setMode('THERMAL')}>حراري 80mm</button>
        </div>
        <div className="pl-actions">
          <button type="button" className="is-primary" onClick={() => window.print()}>طباعة</button>
          <button type="button" onClick={onClose}>إغلاق</button>
        </div>
      </div>
      <div className="pl-stage">
        <PrintLayout doc={doc} mode={mode} />
      </div></div>
    </div>,
    document.body,
  );
}

/** زر الطباعة الموحد. `getDoc` يُستدعى عند الضغط لبناء المستند. */
export function PrintButton({
  getDoc,
  label = 'طباعة',
  className,
  variant = 'secondary',
  disabled,
}: {
  getDoc: () => PrintDoc | null;
  label?: string;
  className?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
}) {
  const [doc, setDoc] = useState<PrintDoc | null>(null);
  return (
    <>
      <Button variant={variant} className={className} disabled={disabled} onClick={() => setDoc(getDoc())}>{label}</Button>
      {doc ? <PrintPreview doc={doc} onClose={() => setDoc(null)} /> : null}
    </>
  );
}
