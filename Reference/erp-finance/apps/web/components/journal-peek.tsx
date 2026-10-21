'use client';

import { useEffect, useState } from 'react';
import { JournalEntryRow, getJournalBySource } from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { SlideOver } from './ui/slide-over';

function amount(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '—';
  return number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function JournalPeek({
  sourceType,
  sourceId,
  onClose,
}: {
  sourceType: 'SALES' | 'PURCHASE' | 'INCOME' | 'OUTCOME' | 'ADVANCE' | 'OPENING_ENTRY';
  sourceId: string;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<JournalEntryRow | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancel = false;
    getJournalBySource(sourceType, sourceId)
      .then((row) => {
        if (!cancel) setEntry(row);
      })
      .catch((reason) => {
        if (!cancel) setError(masterErrorMessage(reason));
      });
    return () => {
      cancel = true;
    };
  }, [sourceType, sourceId]);

  const debit = entry?.lines.reduce((sum, line) => sum + Number(line.debit), 0) ?? 0;
  const credit = entry?.lines.reduce((sum, line) => sum + Number(line.credit), 0) ?? 0;

  return (
    <SlideOver front title={entry ? `قيد ${entry.number}` : 'القيد المحاسبي'} onClose={onClose}>
      {error ? <p className="ent-empty">{error}</p> : null}
      {!entry && !error ? <p className="ent-empty">جارٍ تحميل القيد…</p> : null}
      {entry ? (
        <>
          <div className="ent-balance-card is-ok">
            <div>
              <span>البيان</span>
              <strong>{entry.description || '—'}</strong>
            </div>
            <ol>
              <li>
                <span>التاريخ</span>
                <b>{entry.transactionDate}</b>
              </li>
              <li>
                <span>رقم القيد</span>
                <b>{entry.number}</b>
              </li>
            </ol>
          </div>
          <div className="ent-table-wrap">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>الحساب</th>
                  <th className="is-num">مدين</th>
                  <th className="is-num">دائن</th>
                  <th>البيان</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.account.code} — {line.account.name}</td>
                    <td className="is-num">{amount(line.debit)}</td>
                    <td className="is-num">{amount(line.credit)}</td>
                    <td>{line.memo || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>المجموع</td>
                  <td className="is-num">{amount(String(debit))}</td>
                  <td className="is-num">{amount(String(credit))}</td>
                  <td>{Math.abs(debit - credit) < 0.01 ? 'متوازن' : 'غير متوازن'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : null}
    </SlideOver>
  );
}
