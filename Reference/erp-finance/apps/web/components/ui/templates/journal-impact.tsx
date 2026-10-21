'use client';

import { ReactNode, useEffect, useState } from 'react';
import { JournalEntryRow, getJournalBySource } from '../../../lib/api';
import { masterErrorMessage } from '../../../lib/master-errors';

type SourceType = Parameters<typeof getJournalBySource>[0];

function amount(value: string | number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '—';
  return number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  sourceType: SourceType;
  /** Posted document id. When absent the card shows `pending` (draft / new document). */
  sourceId?: string | null;
  /** Bumps to force a reload (e.g. after reversal). */
  refreshKey?: string | number;
  /** Shown while the document has no journal entry yet. */
  pending?: ReactNode;
};

/**
 * Live accounting impact for the DocumentPage aside. Read-only: it reads the real
 * journal entry already posted by the backend and never derives account codes itself.
 */
export function JournalImpact({ sourceType, sourceId, refreshKey, pending }: Props) {
  const [entry, setEntry] = useState<JournalEntryRow | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEntry(null);
    setError('');
    if (!sourceId) return;
    let cancel = false;
    setLoading(true);
    getJournalBySource(sourceType, sourceId)
      .then((row) => {
        if (!cancel) setEntry(row);
      })
      .catch((reason) => {
        if (!cancel) setError(masterErrorMessage(reason));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [sourceType, sourceId, refreshKey]);

  const debit = entry?.lines.reduce((sum, line) => sum + Number(line.debit), 0) ?? 0;
  const credit = entry?.lines.reduce((sum, line) => sum + Number(line.credit), 0) ?? 0;
  const balanced = Math.abs(debit - credit) < 0.01;

  return (
    <section className="dp-card">
      <div className="dp-card-head">
        <h3>الأثر المحاسبي</h3>
        {entry ? <span className={balanced ? 'ji-ok' : 'ji-bad'}>{balanced ? 'متوازن' : 'غير متوازن'}</span> : null}
      </div>
      {!sourceId ? <div className="ji-state">{pending ?? 'يُولَّد القيد عند الترحيل.'}</div> : null}
      {sourceId && loading ? <p className="ji-state">جارٍ تحميل القيد…</p> : null}
      {error ? <p className="ji-state ji-bad">{error}</p> : null}
      {entry ? (
        <>
          <div className="ji-meta">
            <span>قيد <b>{entry.number}</b></span>
            <span>{entry.transactionDate}</span>
          </div>
          <table className="ji-table">
            <thead>
              <tr>
                <th>الحساب</th>
                <th className="is-num">مدين</th>
                <th className="is-num">دائن</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line) => (
                <tr key={line.id}>
                  <td className="ji-acct">
                    {line.account.code} — {line.account.name}
                    {line.memo ? <small>{line.memo}</small> : null}
                  </td>
                  <td className="is-num">{amount(line.debit)}</td>
                  <td className="is-num">{amount(line.credit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>المجموع</td>
                <td className="is-num">{amount(debit)}</td>
                <td className="is-num">{amount(credit)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      ) : null}
    </section>
  );
}

export function ImpactList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <ul className="ji-effects">
      {items.map((item, index) => (
        <li key={index}>
          <span>{item.label}</span>
          <b>{item.value}</b>
        </li>
      ))}
    </ul>
  );
}
