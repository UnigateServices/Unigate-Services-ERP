'use client';

import { useEffect, useState } from 'react';
import { AuditDetails, AuditRequestRow, decideAudit, listAuditRequests } from '../lib/api';
import { confirmAction } from '../lib/dialogs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Column, DataTable } from './ui/data-table';
import { FilterPills } from './ui/page-toolbar';
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
    const accepted = await confirmAction({
      title: decision === 'APPROVE' ? 'تأكيد الموافقة' : 'تأكيد الرفض',
      message: `${verb} طلب ${actionLabel(row.actionType)} للعملية ${row.originalReference}؟`,
      confirmLabel: decision === 'APPROVE' ? 'موافقة' : 'رفض',
      danger: decision === 'REJECT',
    });
    if (!accepted) return;
    setMessage('');
    try {
      await decideAudit(row.id, decision);
      setMessage(decision === 'APPROVE' ? 'تمت الموافقة.' : 'تم الرفض.');
      await load(tab);
    } catch (error) {
      setMessage(masterErrorMessage(error));
    }
  }

  const columns: Column<AuditRequestRow>[] = [
    { key: 'ref', header: 'المرجع', render: (row) => <strong dir="ltr" className="stmt-num">{row.originalReference}</strong> },
    { key: 'action', header: 'الإجراء', render: (row) => <Badge tone={row.actionType === 'DELETE' ? 'danger' : 'info'}>{actionLabel(row.actionType)}</Badge> },
    { key: 'who', header: 'المنفّذ', render: (row) => row.requester.name },
    {
      key: 'details',
      header: 'التفاصيل',
      render: (row) => (
        <div>
          <div>{row.reason || '—'}</div>
          {row.actionType === 'UPDATE' ? <AuditDiff oldDetails={row.oldDetails || {}} newDetails={row.newDetails || {}} /> : null}
        </div>
      ),
    },
    { key: 'time', header: 'الوقت', render: (row) => <span dir="ltr" className="stmt-num">{dateTime(row.requestedAt)}</span> },
    {
      key: 'status',
      header: 'الحالة',
      render: (row) => <Badge tone={row.requestStatus === 'REJECTED' ? 'danger' : row.requestStatus === 'APPROVED' ? 'ok' : row.requestStatus === 'PENDING' ? 'warn' : 'neutral'}>{statusLabel(row.requestStatus)}</Badge>,
    },
    { key: 'id', header: 'رقم الطلب', defaultHidden: true, render: (row) => <span dir="ltr" className="stmt-num">{row.id}</span> },
    {
      key: 'actions',
      header: '',
      fixed: true,
      render: (row) =>
        tab === 'PENDING' && row.requestStatus === 'PENDING' ? (
          <div className="ui-log-actions">
            <Button variant="primary" onClick={() => void onDecide(row, 'APPROVE')}>موافقة</Button>
            <Button variant="danger" onClick={() => void onDecide(row, 'REJECT')}>رفض</Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="ui-page ui-wide">
      <header className="tp-head"><h1 className="tp-title">الموافقات</h1></header>
      <p className="stmt-hint">
        طلبات حذف وتعديل الموظفين، وسجل التنفيذ المباشر للمشرف والمدير. الموافقة على الحذف تُخرج العملية من الأرصدة،
        والموافقة على التعديل تطبّق القيم الجديدة. الرفض يعيد العملية مكتملة كما كانت.
      </p>
      <div className="stmt-bar">
        <FilterPills value={tab} onChange={(next) => void onTab(next)} options={[['PENDING', 'بانتظار الموافقة'], ['DIRECT', 'منفّذ مباشرة']] as const} />
        <div className="stmt-bar-actions">
          <Button variant="secondary" onClick={() => void load(tab)} disabled={loading}>
            {loading ? 'جاري التحديث...' : 'تحديث'}
          </Button>
        </div>
      </div>
      {message ? <p className="ui-note">{message}</p> : null}
      <DataTable
        tableId="approvals"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={loading ? 'جاري التحميل...' : tab === 'DIRECT' ? 'لا عمليات منفّذة مباشرة في السجل.' : 'لا طلبات بانتظار الموافقة.'}
      />
    </div>
  );
}
