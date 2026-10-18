'use client';

import { useEffect, useState } from 'react';
import {
  AuthUser,
  NotificationRow,
  decideAudit,
  deleteNotification,
  listNotifications,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';

type Section = 'pending' | 'approved' | 'rejected';

const TABS: { value: Section; label: string }[] = [
  { value: 'pending', label: 'معلقة' },
  { value: 'approved', label: 'موافق عليها' },
  { value: 'rejected', label: 'مرفوضة' },
];

type Props = {
  actor: AuthUser;
  onChanged?: () => Promise<void>;
};

function actionLabel(value: string) {
  return value === 'DELETE' ? 'حذف' : value === 'UPDATE' ? 'تعديل' : value || '—';
}

function dateTime(value: string) {
  return String(value || '').replace('T', ' ').slice(0, 16);
}

export function NotificationsPanel({ actor, onChanged }: Props) {
  const canDecide = actor.role === 'GENERAL_MANAGER' || actor.role === 'SUPERVISOR';
  const [section, setSection] = useState<Section>('pending');
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(next = section) {
    setLoading(true);
    try {
      setRows(await listNotifications(next));
    } catch (error) {
      setMessage(masterErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load('pending');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onTab(next: Section) {
    setSection(next);
    setMessage('');
    await load(next);
  }

  async function onDecide(row: NotificationRow, decision: 'APPROVE' | 'REJECT') {
    if (!row.requestId) return;
    const verb = decision === 'APPROVE' ? 'الموافقة على' : 'رفض';
    if (!window.confirm(`${verb} طلب ${actionLabel(row.actionType)} للعملية ${row.reference}؟`)) {
      return;
    }
    setMessage('');
    try {
      await decideAudit(row.requestId, decision);
      setMessage(decision === 'APPROVE' ? 'تمت الموافقة.' : 'تم الرفض.');
      await load(section);
      if (onChanged) await onChanged();
    } catch (error) {
      setMessage(masterErrorMessage(error));
    }
  }

  async function onDelete(row: NotificationRow) {
    if (section === 'pending') return;
    if (!window.confirm('حذف هذا الإشعار؟')) return;
    setMessage('');
    try {
      await deleteNotification(row.id);
      await load(section);
      if (onChanged) await onChanged();
    } catch (error) {
      setMessage(masterErrorMessage(error));
    }
  }

  return (
    <section className="card">
      <h2>الإشعارات</h2>
      <p className="muted">طلبات الحذف والقرارات. المعلقة تُزال بعد الموافقة أو الرفض.</p>
      <div className="type-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={section === tab.value ? 'btn' : 'nav-btn'}
            onClick={() => void onTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {message ? <p className="muted">{message}</p> : null}
      <div className="notice-pane" key={section}>
      {loading ? <p className="muted notice-loading">جاري تحميل الإشعارات...</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="muted">لا توجد إشعارات في هذا القسم.</p>
      ) : null}
      {!loading && rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>الرسالة</th>
                <th>المرجع</th>
                <th>الإجراء</th>
                <th>مقدم الطلب</th>
                <th>الوقت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.message}</td>
                  <td>{row.reference || '—'}</td>
                  <td>{actionLabel(row.actionType)}</td>
                  <td>{row.requester?.name || '—'}</td>
                  <td>{dateTime(row.occurredAt)}</td>
                  <td>
                    {section === 'pending' && canDecide && row.requestId ? (
                      <div className="form-actions">
                        <button type="button" className="btn" onClick={() => void onDecide(row, 'APPROVE')}>
                          موافقة
                        </button>
                        <button type="button" className="btn-danger" onClick={() => void onDecide(row, 'REJECT')}>
                          رفض
                        </button>
                      </div>
                    ) : null}
                    {section !== 'pending' ? (
                      <button type="button" className="nav-btn" onClick={() => void onDelete(row)}>
                        حذف
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      </div>
    </section>
  );
}
