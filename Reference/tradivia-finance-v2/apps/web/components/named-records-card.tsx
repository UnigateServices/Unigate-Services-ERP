'use client';

import { FormEvent, useMemo, useState } from 'react';
import { NamedRecord, RecordStatus } from '../lib/api';
import { masterErrorMessage, statusLabel } from '../lib/master-errors';
import { OpsCard } from './ops-card';
import { OpsDialog, OpsDialogFooter } from './ops-dialog';
import { OpsSelect } from './ops-select';
import { useOpsToasts } from './ops-toasts';

type NamedApi = {
  create: (input: { name: string; status?: RecordStatus }) => Promise<NamedRecord>;
  update: (id: string, input: { name?: string; status?: RecordStatus }) => Promise<NamedRecord>;
};

type Props = {
  title: string;
  namePlaceholder: string;
  emptyText: string;
  rows: NamedRecord[];
  api: NamedApi;
  onChanged: () => Promise<void>;
};

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'INACTIVE', label: 'موقوف' },
];

type Draft = { id: string; name: string; status: RecordStatus };

export function NamedRecordsCard({ title, namePlaceholder, emptyText, rows, api, onChanged }: Props) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<RecordStatus>('ACTIVE');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const { push, node: toasts } = useOpsToasts();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(needle) || statusLabel(row.status).includes(needle));
  }, [query, rows]);

  function resetForm() {
    setName('');
    setStatus('ACTIVE');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.create({ name, status });
      push('تمت الإضافة.');
      resetForm();
      await onChanged();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      await api.update(draft.id, { name: draft.name, status: draft.status });
      setDraft(null);
      push('تم حفظ التعديل.');
      await onChanged();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function onFreeze(row: NamedRecord) {
    const next: RecordStatus = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.update(row.id, { status: next });
      if (draft?.id === row.id) setDraft({ ...draft, status: next });
      push(next === 'INACTIVE' ? 'تم تجميد السجل.' : 'تم تفعيل السجل.');
      await onChanged();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

  return (
    <div className="ops-page admin-page">
      <OpsCard title={`إضافة — ${title}`} collapsible defaultOpen>
        <form className="ops-form-grid admin-form-grid" onSubmit={(event) => void onSubmit(event)}>
          <label className="form-group">
            <span className="form-label">الاسم</span>
            <input
              className="form-control"
              required
              placeholder={namePlaceholder}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="form-group">
            <span className="form-label">الحالة</span>
            <OpsSelect value={status} onChange={(value) => setStatus(value as RecordStatus)} options={STATUS_OPTIONS} />
          </label>
          <div className="admin-form-actions">
            <button type="submit" className="btn-submit-action" disabled={saving && !draft}>
              {saving && !draft ? 'جاري الحفظ...' : 'إضافة'}
            </button>
          </div>
        </form>
      </OpsCard>

      <OpsCard
        className="ops-card-split"
        title={`سجل ${title}`}
        count={filtered.length}
        toolbar={<input className="form-control ops-head-search" value={query} placeholder="بحث..." onChange={(event) => setQuery(event.target.value)} />}
        collapsible
        defaultOpen
      >
        {filtered.length === 0 ? (
          <p className="ops-log-empty">{rows.length === 0 ? emptyText : 'لا نتائج مطابقة للبحث.'}</p>
        ) : (
          <div className="table-wrap">
            <table className="premium-table ops-log-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>
                      <span className={`admin-status${row.status === 'ACTIVE' ? ' is-on' : ''}`}>{statusLabel(row.status)}</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => setDraft({ id: row.id, name: row.name, status: row.status })}
                        >
                          تعديل
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => void onFreeze(row)}>
                          {row.status === 'ACTIVE' ? 'تجميد' : 'تفعيل'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OpsCard>

      {draft ? (
        <OpsDialog
          title={`تعديل — ${title}`}
          onClose={() => setDraft(null)}
          className="pw-card"
          footer={<OpsDialogFooter onCancel={() => setDraft(null)} formId="admin-named-edit" saving={saving} />}
        >
          <form id="admin-named-edit" className="admin-edit-form" onSubmit={(event) => void onSaveEdit(event)}>
            <label className="form-group">
              <span className="form-label">الاسم</span>
              <input
                className="form-control"
                required
                placeholder={namePlaceholder}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label className="form-group">
              <span className="form-label">الحالة</span>
              <OpsSelect
                value={draft.status}
                onChange={(value) => setDraft({ ...draft, status: value as RecordStatus })}
                options={STATUS_OPTIONS}
              />
            </label>
          </form>
        </OpsDialog>
      ) : null}
      {toasts}
    </div>
  );
}
