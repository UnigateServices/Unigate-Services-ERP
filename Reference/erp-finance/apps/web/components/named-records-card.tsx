'use client';

import { FormEvent, useMemo, useState } from 'react';
import { NamedRecord, RecordStatus } from '../lib/api';
import { masterErrorMessage, statusLabel } from '../lib/master-errors';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Column, DataTable } from './ui/data-table';
import { Modal, ModalFooter } from './ui/modal';
import { Select } from './ui/select';
import { useToasts } from './ui/toasts';

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
  const { push, node: toasts } = useToasts();

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

  const columns: Column<NamedRecord>[] = [
    { key: 'name', header: 'الاسم', render: (row) => <strong>{row.name}</strong> },
    { key: 'status', header: 'الحالة', render: (row) => <Badge tone={row.status === 'ACTIVE' ? 'ok' : 'neutral'}>{statusLabel(row.status)}</Badge> },
    {
      key: 'actions',
      header: '',
      fixed: true,
      render: (row) => (
        <div className="ui-log-actions">
          <Button variant="mini" onClick={() => setDraft({ id: row.id, name: row.name, status: row.status })}>تعديل</Button>
          <Button variant="mini" onClick={() => void onFreeze(row)}>{row.status === 'ACTIVE' ? 'تجميد' : 'تفعيل'}</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="ui-page admin-page">
      <Card title={`إضافة — ${title}`} collapsible defaultOpen>
        <form className="ui-form-grid admin-form-grid" onSubmit={(event) => void onSubmit(event)}>
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
            <Select value={status} onChange={(value) => setStatus(value as RecordStatus)} options={STATUS_OPTIONS} />
          </label>
          <div className="admin-form-actions">
            <button type="submit" className="btn-submit-action" disabled={saving && !draft}>
              {saving && !draft ? 'جاري الحفظ...' : 'إضافة'}
            </button>
          </div>
        </form>
      </Card>

      <Card
        className="ui-card-split"
        title={`سجل ${title}`}
        count={filtered.length}
        toolbar={<input className="form-control ui-head-search" value={query} placeholder="بحث..." onChange={(event) => setQuery(event.target.value)} />}
        collapsible
        defaultOpen
      >
        {filtered.length === 0 ? (
          <p className="ui-log-empty">{rows.length === 0 ? emptyText : 'لا نتائج مطابقة للبحث.'}</p>
        ) : (
          <DataTable tableId="settings-named" columns={columns} rows={filtered} rowKey={(row) => row.id} />
        )}
      </Card>

      {draft ? (
        <Modal
          title={`تعديل — ${title}`}
          onClose={() => setDraft(null)}
          className="pw-card"
          footer={<ModalFooter onCancel={() => setDraft(null)} formId="admin-named-edit" saving={saving} />}
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
              <Select
                value={draft.status}
                onChange={(value) => setDraft({ ...draft, status: value as RecordStatus })}
                options={STATUS_OPTIONS}
              />
            </label>
          </form>
        </Modal>
      ) : null}
      {toasts}
    </div>
  );
}
