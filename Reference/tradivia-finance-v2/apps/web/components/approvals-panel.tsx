'use client';

import { useEffect, useState } from 'react';
import { AuditDetails, AuditRequestRow, decideAudit, listAuditRequests } from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';

const FIELD_LABELS: Record<string, string> = {
  transactionDate: 'التاريخ',
  projectId: 'المشروع',
  projectName: 'المشروع',
  description: 'الوصف',
  fund: 'الصندوق',
  bankId: 'البنك',
  bankName: 'البنك',
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
  fromBankId: 'البنك المرسل',
  toBankId: 'البنك المستلم',
  fromBankName: 'البنك المرسل',
  toBankName: 'البنك المستلم',
  borrowerId: 'المستلف',
  borrowerName: 'المستلف',
  advanceType: 'نوع السلفة',
  fromCurrency: 'من عملة',
  toCurrency: 'إلى عملة',
};

const VALUE_LABELS: Record<string, string> = {
  VAULT: 'الخزنة',
  SHAM_CASH: 'شام كاش',
  BANK: 'البنك',
  ADVANCES: 'السلف',
  USD: 'دولار',
  SYP: 'ليرة سورية',
  BUY: 'شراء',
  SELL: 'بيع',
  OUTCOME: 'صادر',
  EXCHANGE: 'تصريف',
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
  'amountCurrency',
  'projectId',
  'bankId',
  'fromBankId',
  'toBankId',
  'borrowerId',
]);

function actionLabel(value: string) {
  return value === 'DELETE' ? 'حذف' : 'تعديل';
}

function statusLabel(value: string) {
  if (value === 'PENDING') return 'بانتظار الموافقة';
  if (value === 'APPROVED') return 'موافق عليه';
  if (value === 'REJECTED') return 'مرفوض';
  if (value === 'DIRECT') return 'منفّذ مباشرة';
  return value;
}

function dateTime(value: string) {
  return String(value || '').replace('T', ' ').slice(0, 16);
}

function formatValue(value: unknown) {
  if (value == null || value === '') return '—';
  const text = String(value);
  return VALUE_LABELS[text] || text;
}

function oldValue(oldDetails: AuditDetails, key: string) {
  if (key === 'projectId') return oldDetails.projectName ?? oldDetails.projectId;
  if (key === 'bankId') return oldDetails.bankName ?? oldDetails.bankId;
  if (key === 'fromBankId') return oldDetails.fromBankName ?? oldDetails.fromBankId;
  if (key === 'toBankId') return oldDetails.toBankName ?? oldDetails.toBankId;
  if (key === 'borrowerId') return oldDetails.borrowerName ?? oldDetails.borrowerId;
  return oldDetails[key];
}

function AuditDiff({ oldDetails, newDetails }: { oldDetails: AuditDetails; newDetails: AuditDetails }) {
  const rows = Object.entries(newDetails || {}).filter(([key]) => !SKIP_KEYS.has(key) && !key.endsWith('Name'));
  if (rows.length === 0) return null;
  return (
    <ul className="diff-list">
      {rows.map(([key, value]) => (
        <li key={key}>
          <span>{FIELD_LABELS[key] || key}</span>
          <span className="muted">{formatValue(oldValue(oldDetails, key))}</span>
          <span>{formatValue(value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ApprovalsPanel() {
  const [tab, setTab] = useState<'PENDING' | 'DIRECT'>('PENDING');
  const [rows, setRows] = useState<AuditRequestRow[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(next = tab) {
    setLoading(true);
    try {
      setRows(await listAuditRequests(next));
    } catch (error) {
      setMessage(masterErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load('PENDING');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onTab(next: 'PENDING' | 'DIRECT') {
    setTab(next);
    setMessage('');
    await load(next);
  }

  async function onDecide(row: AuditRequestRow, decision: 'APPROVE' | 'REJECT') {
    const verb = decision === 'APPROVE' ? 'الموافقة على' : 'رفض';
    if (!window.confirm(`${verb} طلب ${actionLabel(row.actionType)} للعملية ${row.originalReference}؟`)) {
      return;
    }
    setMessage('');
    try {
      await decideAudit(row.id, decision);
      setMessage(decision === 'APPROVE' ? 'تمت الموافقة.' : 'تم الرفض.');
      await load(tab);
    } catch (error) {
      setMessage(masterErrorMessage(error));
    }
  }

  return (
    <section className="card">
      <h2>الموافقات</h2>
      <p className="muted">
        طلبات حذف وتعديل الموظفين، وسجل التنفيذ المباشر للمشرف والمدير. الموافقة على الحذف تُخرج العملية من الأرصدة،
        والموافقة على التعديل تطبّق القيم الجديدة. الرفض يعيد العملية مكتملة كما كانت.
      </p>
      <div className="type-tabs">
        <button type="button" className={tab === 'PENDING' ? 'btn' : 'nav-btn'} onClick={() => void onTab('PENDING')}>
          بانتظار الموافقة
        </button>
        <button type="button" className={tab === 'DIRECT' ? 'btn' : 'nav-btn'} onClick={() => void onTab('DIRECT')}>
          منفّذ مباشرة
        </button>
      </div>
      <div className="form-actions">
        <button type="button" className="nav-btn" onClick={() => void load(tab)} disabled={loading}>
          {loading ? 'جاري التحديث...' : 'تحديث'}
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
      {rows.length === 0 && !loading ? (
        <p className="muted">
          {tab === 'DIRECT' ? 'لا عمليات منفّذة مباشرة في السجل.' : 'لا طلبات بانتظار الموافقة.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>الطلب</th>
                <th>المرجع</th>
                <th>الإجراء</th>
                <th>المنفّذ</th>
                <th>التفاصيل</th>
                <th>الوقت</th>
                <th>الحالة</th>
                {tab === 'PENDING' ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.originalReference}</td>
                  <td>{actionLabel(row.actionType)}</td>
                  <td>{row.requester.name}</td>
                  <td>
                    <div>{row.reason || '—'}</div>
                    {row.actionType === 'UPDATE' ? (
                      <AuditDiff oldDetails={row.oldDetails || {}} newDetails={row.newDetails || {}} />
                    ) : null}
                  </td>
                  <td>{dateTime(row.requestedAt)}</td>
                  <td>{statusLabel(row.requestStatus)}</td>
                  {tab === 'PENDING' ? (
                    <td>
                      {row.requestStatus === 'PENDING' ? (
                        <div className="form-actions">
                          <button type="button" className="btn" onClick={() => void onDecide(row, 'APPROVE')}>
                            موافقة
                          </button>
                          <button type="button" className="btn-danger" onClick={() => void onDecide(row, 'REJECT')}>
                            رفض
                          </button>
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
