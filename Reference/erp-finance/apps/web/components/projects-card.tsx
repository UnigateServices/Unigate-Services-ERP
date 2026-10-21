'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  PROJECT_SHOW_OPTIONS,
  ProjectRow,
  RecordStatus,
  createProject,
  updateProject,
} from '../lib/api';
import { masterErrorMessage, statusLabel } from '../lib/master-errors';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Column, DataTable } from './ui/data-table';
import { Modal, ModalFooter } from './ui/modal';
import { Select } from './ui/select';
import { useToasts } from './ui/toasts';

const ALL_SHOW_IN = PROJECT_SHOW_OPTIONS.map((item) => item.value);

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'INACTIVE', label: 'موقوف' },
];

type Props = {
  rows: ProjectRow[];
  onChanged: () => Promise<void>;
};

type Draft = { id: string; name: string; status: RecordStatus; showIn: string[] };

export function ProjectsCard({ rows, onChanged }: Props) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<RecordStatus>('ACTIVE');
  const [showIn, setShowIn] = useState<string[]>([...ALL_SHOW_IN]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const { push, node: toasts } = useToasts();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const places = PROJECT_SHOW_OPTIONS.filter((option) => row.showIn.includes(option.value))
        .map((option) => option.label)
        .join(' ');
      return row.name.toLowerCase().includes(needle) || statusLabel(row.status).includes(needle) || places.includes(needle);
    });
  }, [query, rows]);

  function resetForm() {
    setName('');
    setStatus('ACTIVE');
    setShowIn([...ALL_SHOW_IN]);
  }

  function toggleShowIn(value: string, current: string[], apply: (next: string[]) => void) {
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    apply(next.length ? next : [...ALL_SHOW_IN]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createProject({ name, status, showIn });
      push('تمت إضافة المشروع.');
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
      await updateProject(draft.id, { name: draft.name, status: draft.status, showIn: draft.showIn });
      setDraft(null);
      push('تم حفظ التعديل.');
      await onChanged();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function onFreeze(row: ProjectRow) {
    const next: RecordStatus = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateProject(row.id, { status: next });
      if (draft?.id === row.id) setDraft({ ...draft, status: next });
      push(next === 'INACTIVE' ? 'تم تجميد المشروع.' : 'تم تفعيل المشروع.');
      await onChanged();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

  const columns: Column<ProjectRow>[] = [
    { key: 'name', header: 'الاسم', render: (row) => <strong>{row.name}</strong> },
    { key: 'status', header: 'الحالة', render: (row) => <Badge tone={row.status === 'ACTIVE' ? 'ok' : 'neutral'}>{statusLabel(row.status)}</Badge> },
    {
      key: 'showIn',
      header: 'أماكن الظهور',
      defaultHidden: false,
      render: (row) => (
        <div className="admin-tags">
          {PROJECT_SHOW_OPTIONS.filter((option) => row.showIn.includes(option.value)).map((option) => (
            <Badge key={option.value} tone="info">{option.label}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      fixed: true,
      render: (row) => (
        <div className="ui-log-actions">
          <Button variant="mini" onClick={() => setDraft({ id: row.id, name: row.name, status: row.status, showIn: row.showIn.length ? row.showIn : [...ALL_SHOW_IN] })}>تعديل</Button>
          <Button variant="mini" onClick={() => void onFreeze(row)}>{row.status === 'ACTIVE' ? 'تجميد' : 'تفعيل'}</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="ui-page admin-page">
      <Card title="إضافة مشروع" collapsible defaultOpen>
        <form className="ui-form-grid admin-form-grid" onSubmit={(event) => void onSubmit(event)}>
          <label className="form-group">
            <span className="form-label">اسم المشروع</span>
            <input
              className="form-control"
              required
              placeholder="اسم المشروع"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="form-group">
            <span className="form-label">الحالة</span>
            <Select value={status} onChange={(value) => setStatus(value as RecordStatus)} options={STATUS_OPTIONS} />
          </label>
          <div className="form-group admin-picks-wrap">
            <span className="form-label">أماكن الظهور</span>
            <div className="admin-picks">
              {PROJECT_SHOW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rpt-pill${showIn.includes(option.value) ? ' is-on' : ''}`}
                  onClick={() => toggleShowIn(option.value, showIn, setShowIn)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="btn-submit-action" disabled={saving && !draft}>
              {saving && !draft ? 'جاري الحفظ...' : 'إضافة مشروع'}
            </button>
          </div>
        </form>
      </Card>

      <Card
        className="ui-card-split"
        title="سجل المشاريع"
        count={filtered.length}
        toolbar={<input className="form-control ui-head-search" value={query} placeholder="بحث..." onChange={(event) => setQuery(event.target.value)} />}
        collapsible
        defaultOpen
      >
        {filtered.length === 0 ? (
          <p className="ui-log-empty">{rows.length === 0 ? 'لا مشاريع بعد. أضف مشروعاً من النموذج أعلاه.' : 'لا نتائج مطابقة للبحث.'}</p>
        ) : (
          <DataTable tableId="settings-projects" columns={columns} rows={filtered} rowKey={(row) => row.id} />
        )}
      </Card>

      {draft ? (
        <Modal
          title="تعديل مشروع"
          onClose={() => setDraft(null)}
          className="pw-card"
          footer={<ModalFooter onCancel={() => setDraft(null)} formId="admin-project-edit" saving={saving} />}
        >
          <form id="admin-project-edit" className="admin-edit-form" onSubmit={(event) => void onSaveEdit(event)}>
            <label className="form-group">
              <span className="form-label">اسم المشروع</span>
              <input
                className="form-control"
                required
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
            <div className="form-group">
              <span className="form-label">أماكن الظهور</span>
              <div className="admin-picks">
                {PROJECT_SHOW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`rpt-pill${draft.showIn.includes(option.value) ? ' is-on' : ''}`}
                    onClick={() => toggleShowIn(option.value, draft.showIn, (next) => setDraft({ ...draft, showIn: next }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </Modal>
      ) : null}
      {toasts}
    </div>
  );
}
