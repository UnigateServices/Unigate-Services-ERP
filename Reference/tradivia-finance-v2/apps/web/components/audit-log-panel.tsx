'use client';

import { useEffect, useMemo, useState } from 'react';
import { OpsCard } from './ops-card';
import { OpsDialog } from './ops-dialog';
import { AuditDetails, AuditRequestRow, listAuditHistory } from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';

const FIELD_LABELS: Record<string, string> = {
  transactionDate: 'التاريخ',
  description: 'الوصف',
  fund: 'الصندوق',
  sender: 'المرسل',
  receiver: 'المستلم',
  deliverer: 'المسلّم',
  currency: 'العملة',
  quantity: 'الكمية',
  amount: 'المبلغ',
  notes: 'ملاحظات',
  exchangeType: 'نوع التصريف',
  exchangeAmount: 'مبلغ التصريف',
  exchangeRate: 'سعر الصرف',
  fromFund: 'الصندوق المرسل',
  toFund: 'الصندوق المستلم',
  advanceType: 'نوع السلفة',
  fromCurrency: 'من عملة',
  toCurrency: 'إلى عملة',
  projectName: 'المشروع',
  bankName: 'البنك',
  fromBankName: 'البنك المرسل',
  toBankName: 'البنك المستلم',
  borrowerName: 'المستلف',
};

const VALUE_LABELS: Record<string, string> = {
  VAULT: 'الخزنة',
  SHAM_CASH: 'شام كاش',
  BANK: 'البنك',
  ADVANCES: 'السلف',
  USD: 'دولار',
  SYP: 'ليرة',
  BUY: 'شراء',
  SELL: 'بيع',
  OUTCOME: 'صادر',
  EXCHANGE: 'تصريف',
  income: 'وارد',
  outcome: 'صادر',
  exchange: 'تصريف',
  transfer: 'تحويل',
  advance: 'سلف',
};

const SKIP_KEYS = new Set([
  'kind',
  'id',
  'status',
  'employeeId',
  'locationId',
  'reference',
  'operationNumber',
  'systemDate',
  'attachments',
  'total',
  'paidCurrency',
  'receivedCurrency',
  'projectId',
  'bankId',
  'fromBankId',
  'toBankId',
  'borrowerId',
]);

function formatValue(value: unknown) {
  if (value == null || value === '') return '—';
  const text = String(value);
  return VALUE_LABELS[text] || text;
}

function sectionLabel(details: AuditDetails) {
  return VALUE_LABELS[String(details.kind || '')] || '—';
}

function typeLabel(details: AuditDetails) {
  if (details.kind === 'exchange') return formatValue(details.exchangeType);
  if (details.kind === 'advance') return formatValue(details.advanceType);
  return sectionLabel(details);
}

function opNumber(row: AuditRequestRow) {
  const number = row.oldDetails?.operationNumber;
  return number == null || number === '' ? row.originalReference : `#${number}`;
}

function dateTime(value: string | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 16);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const clock = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${day} ${clock}`;
}

function eventTime(row: AuditRequestRow) {
  const system = row.oldDetails?.systemDate;
  if (typeof system === 'string' && system.includes('T')) return dateTime(system);
  return dateTime(row.requestedAt);
}

function decisionText(row: AuditRequestRow) {
  if (row.actionType === 'DELETE') {
    if (row.requestStatus === 'REJECTED') return 'رفض الإلغاء';
    if (row.requestStatus === 'APPROVED') return 'موافقة على الإلغاء';
    return 'إلغاء مباشر';
  }
  if (row.requestStatus === 'APPROVED') return 'موافقة — عُدّل';
  if (row.requestStatus === 'REJECTED') return 'رفض التعديل';
  return 'تعديل مباشر';
}

function oldValue(oldDetails: AuditDetails, key: string) {
  if (key === 'projectId') return oldDetails.projectName ?? oldDetails.projectId;
  if (key === 'bankId') return oldDetails.bankName ?? oldDetails.bankId;
  if (key === 'fromBankId') return oldDetails.fromBankName ?? oldDetails.fromBankId;
  if (key === 'toBankId') return oldDetails.toBankName ?? oldDetails.toBankId;
  if (key === 'borrowerId') return oldDetails.borrowerName ?? oldDetails.borrowerId;
  return oldDetails[key];
}

function changes(row: AuditRequestRow) {
  return Object.entries(row.newDetails || {}).filter(([key, value]) => value !== undefined && !SKIP_KEYS.has(key) && !key.endsWith('Name') && key !== 'locationId');
}

function summary(row: AuditRequestRow) {
  const first = changes(row)[0];
  if (!first) return row.reason || '—';
  const [key, value] = first;
  return `${FIELD_LABELS[key] || key}: ${formatValue(oldValue(row.oldDetails, key))} → ${formatValue(value)}`;
}

function matches(row: AuditRequestRow, query: string) {
  if (!query) return true;
  const haystack = [
    row.originalReference,
    opNumber(row),
    row.requester.name,
    row.reason,
    sectionLabel(row.oldDetails),
    typeLabel(row.oldDetails),
    summary(row),
    decisionText(row),
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

export function AuditLogPanel() {
  const [rows, setRows] = useState<AuditRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [cancelQuery, setCancelQuery] = useState('');
  const [editQuery, setEditQuery] = useState('');
  const [details, setDetails] = useState<AuditRequestRow | null>(null);

  useEffect(() => {
    void listAuditHistory()
      .then(setRows)
      .catch((error) => setMessage(masterErrorMessage(error)))
      .finally(() => setLoading(false));
  }, []);

  const cancellations = useMemo(
    () => rows.filter((row) => row.actionType === 'DELETE' && matches(row, cancelQuery.trim().toLowerCase())),
    [rows, cancelQuery],
  );
  const edits = useMemo(
    () => rows.filter((row) => row.actionType === 'UPDATE' && matches(row, editQuery.trim().toLowerCase())),
    [rows, editQuery],
  );

  return (
    <div className="ops-page ops-wide">
      {message ? <p className="ops-log-empty">{message}</p> : null}
      <OpsCard
        className="ops-card-split"
        title="سجل الإلغاء"
        count={loading ? undefined : cancellations.length}
        toolbar={<input className="form-control ops-head-search" value={cancelQuery} placeholder="بحث: مرجع، موظف، سبب..." onChange={(event) => setCancelQuery(event.target.value)} />}
      >
        {loading ? <p className="ops-log-empty">جاري التحميل...</p> : cancellations.length === 0 ? <p className="ops-log-empty">لا عمليات إلغاء في السجل.</p> : (
          <div className="ops-table-wrap">
            <table className="premium-table ops-log-table">
              <thead>
                <tr>
                  <th>رقم العملية</th>
                  <th>التاريخ والوقت</th>
                  <th>الموظف</th>
                  <th>نوع العملية</th>
                  <th>القسم</th>
                  <th>سبب الإلغاء</th>
                  <th>قرار المشرف</th>
                  <th>تاريخ القرار</th>
                </tr>
              </thead>
              <tbody>
                {cancellations.map((row) => (
                  <tr key={row.id}>
                    <td>{opNumber(row)}</td>
                    <td>{eventTime(row)}</td>
                    <td>{row.requester.name}</td>
                    <td>{typeLabel(row.oldDetails)}</td>
                    <td>{sectionLabel(row.oldDetails)}</td>
                    <td className="ops-log-note">{row.reason || '—'}</td>
                    <td>{decisionText(row)}</td>
                    <td>{dateTime(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OpsCard>

      <OpsCard
        className="ops-card-split"
        title="سجل التعديل"
        count={loading ? undefined : edits.length}
        toolbar={<input className="form-control ops-head-search" value={editQuery} placeholder="بحث: مرجع، موظف، حقل..." onChange={(event) => setEditQuery(event.target.value)} />}
      >
        {loading ? <p className="ops-log-empty">جاري التحميل...</p> : edits.length === 0 ? <p className="ops-log-empty">لا عمليات تعديل في السجل.</p> : (
          <div className="ops-table-wrap">
            <table className="premium-table ops-log-table">
              <thead>
                <tr>
                  <th>رقم العملية</th>
                  <th>التاريخ والوقت</th>
                  <th>الموظف</th>
                  <th>نوع العملية</th>
                  <th>القسم</th>
                  <th>ملخص التعديل</th>
                  <th>قرار المشرف</th>
                  <th>تاريخ القرار</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {edits.map((row) => (
                  <tr key={row.id}>
                    <td>{opNumber(row)}</td>
                    <td>{eventTime(row)}</td>
                    <td>{row.requester.name}</td>
                    <td>{typeLabel(row.oldDetails)}</td>
                    <td>{sectionLabel(row.oldDetails)}</td>
                    <td className="ops-log-note">{summary(row)}</td>
                    <td>{decisionText(row)}</td>
                    <td>{dateTime(row.updatedAt)}</td>
                    <td><button type="button" className="ops-mini-btn" onClick={() => setDetails(row)}>تفاصيل</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OpsCard>

      {details ? (
        <OpsDialog title={`تفاصيل التعديل ${opNumber(details)}`} onClose={() => setDetails(null)} closeLabel="إغلاق" wide>
          <p className="ops-log-empty">{details.requester.name} · {sectionLabel(details.oldDetails)} · {decisionText(details)}</p>
          {details.reason ? <p className="ops-log-note">السبب: {details.reason}</p> : null}
          <ul className="diff-list">
            {changes(details).map(([key, value]) => (
              <li key={key}>
                <span>{FIELD_LABELS[key] || key}</span>
                <span className="muted">{formatValue(oldValue(details.oldDetails, key))}</span>
                <span>{formatValue(value)}</span>
              </li>
            ))}
          </ul>
        </OpsDialog>
      ) : null}
    </div>
  );
}
