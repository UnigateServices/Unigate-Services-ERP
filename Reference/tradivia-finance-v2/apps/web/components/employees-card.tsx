'use client';

import { FormEvent, useMemo, useState } from 'react';
import { AuthUser, EmployeeRow, LocationRow, Role, createEmployee, roleLabel, updateEmployee } from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { OpsCard } from './ops-card';
import { OpsDialog, OpsDialogFooter } from './ops-dialog';
import { OpsSelect } from './ops-select';
import { useOpsToasts } from './ops-toasts';

type Props = {
  actor: AuthUser;
  employees: EmployeeRow[];
  locations: LocationRow[];
  onChanged: () => Promise<void>;
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'EMPLOYEE', label: 'موظف' },
  { value: 'SUPERVISOR', label: 'مشرف مكتب' },
  { value: 'MONITOR', label: 'مراقب' },
];

const ACCOUNT_OPTIONS = [
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'INACTIVE', label: 'موقوف' },
];

type Draft = {
  id: string;
  name: string;
  password: string;
  role: Role;
  locationId: string;
  accountStatus: 'ACTIVE' | 'INACTIVE';
};

export function EmployeesCard({ actor, employees, locations, onChanged }: Props) {
  const isManager = actor.role === 'GENERAL_MANAGER';
  const isMonitor = actor.role === 'MONITOR';
  const seesOffices = isManager || isMonitor;
  const title = seesOffices ? 'المستخدمون' : 'موظفو المكتب';
  const activeLocations = locations.filter((row) => row.status === 'ACTIVE');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [locationId, setLocationId] = useState(activeLocations[0]?.id || '');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const { push, node: toasts } = useOpsToasts();
  const needsOffice = role === 'EMPLOYEE' || role === 'SUPERVISOR';
  const draftNeedsOffice = draft ? draft.role === 'EMPLOYEE' || draft.role === 'SUPERVISOR' : false;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((row) => {
      const office = row.location?.name || 'كل المكاتب';
      const status = row.accountStatus === 'ACTIVE' ? 'نشط' : 'غير نشط';
      return (
        row.name.toLowerCase().includes(needle) ||
        roleLabel(row.role).includes(needle) ||
        office.toLowerCase().includes(needle) ||
        status.includes(needle)
      );
    });
  }, [employees, query]);

  function resetForm() {
    setName('');
    setPassword('');
    setRole('EMPLOYEE');
    setLocationId(activeLocations[0]?.id || '');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createEmployee({
        name,
        password,
        role: isManager ? role : 'EMPLOYEE',
        locationId: isManager && needsOffice ? locationId : undefined,
      });
      push('تمت إضافة الحساب.');
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
      await updateEmployee(draft.id, {
        name: draft.name,
        accountStatus: draft.accountStatus,
        ...(isManager
          ? {
              role: draft.role,
              locationId: draftNeedsOffice ? draft.locationId : undefined,
            }
          : {}),
        ...(draft.password ? { password: draft.password } : {}),
      });
      setDraft(null);
      push('تم حفظ الحساب.');
      await onChanged();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function onToggleStatus(row: EmployeeRow) {
    if (row.id === actor.id) return;
    try {
      const next = row.accountStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await updateEmployee(row.id, { accountStatus: next });
      push(next === 'INACTIVE' ? 'تم تجميد الحساب.' : 'تم تفعيل الحساب.');
      await onChanged();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

  return (
    <div className="ops-page admin-page">
      {isMonitor ? null : (
        <OpsCard title="إضافة حساب" collapsible defaultOpen>
          <form className="ops-form-grid admin-form-grid" onSubmit={(event) => void onSubmit(event)}>
            <label className="form-group">
              <span className="form-label">الاسم</span>
              <input
                className="form-control"
                required
                placeholder={isManager ? 'اسم المستخدم' : 'اسم الموظف'}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="form-group">
              <span className="form-label">كلمة المرور</span>
              <input
                className="form-control"
                required
                minLength={4}
                type="password"
                placeholder="كلمة المرور"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {isManager ? (
              <label className="form-group">
                <span className="form-label">الصلاحية</span>
                <OpsSelect value={role} onChange={(value) => setRole(value as Role)} options={ROLE_OPTIONS} />
              </label>
            ) : null}
            {isManager && needsOffice ? (
              <label className="form-group">
                <span className="form-label">المكتب</span>
                <OpsSelect
                  value={locationId}
                  onChange={setLocationId}
                  options={activeLocations.map((row) => ({ value: row.id, label: row.name }))}
                />
              </label>
            ) : null}
            <div className="admin-form-actions">
              <button type="submit" className="btn-submit-action" disabled={saving && !draft}>
                {saving && !draft ? 'جاري الحفظ...' : isManager ? 'إضافة مستخدم' : 'إضافة موظف'}
              </button>
            </div>
          </form>
        </OpsCard>
      )}

      <OpsCard
        className="ops-card-split"
        title={`سجل ${title}`}
        count={filtered.length}
        toolbar={<input className="form-control ops-head-search" value={query} placeholder="بحث: اسم، صلاحية، مكتب..." onChange={(event) => setQuery(event.target.value)} />}
        collapsible
        defaultOpen
      >
        {filtered.length === 0 ? (
          <p className="ops-log-empty">لا نتائج مطابقة للبحث.</p>
        ) : (
          <div className="table-wrap">
            <table className="premium-table ops-log-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الصلاحية</th>
                  {seesOffices ? <th>المكتب</th> : null}
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{roleLabel(row.role)}</td>
                    {seesOffices ? <td>{row.location?.name || 'كل المكاتب'}</td> : null}
                    <td>
                      <span className={`admin-status${row.accountStatus === 'ACTIVE' ? ' is-on' : ''}`}>
                        {row.accountStatus === 'ACTIVE' ? 'نشط' : 'موقوف'}
                      </span>
                    </td>
                    <td>
                      {isMonitor ? null : (
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => {
                              setDraft({
                                id: row.id,
                                name: row.name,
                                password: '',
                                role: row.role,
                                locationId: row.locationId || activeLocations[0]?.id || '',
                                accountStatus: row.accountStatus,
                              });
                            }}
                          >
                            تعديل
                          </button>
                          {row.id === actor.id ? null : (
                            <button type="button" className="btn-ghost" onClick={() => void onToggleStatus(row)}>
                              {row.role === 'MONITOR'
                                ? row.accountStatus === 'ACTIVE'
                                  ? 'تجميد'
                                  : 'تفعيل'
                                : row.accountStatus === 'ACTIVE'
                                  ? 'إيقاف'
                                  : 'تفعيل'}
                            </button>
                          )}
                        </div>
                      )}
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
          title="تعديل حساب"
          onClose={() => setDraft(null)}
          className="pw-card"
          footer={<OpsDialogFooter onCancel={() => setDraft(null)} formId="admin-employee-edit" saving={saving} />}
        >
          <form id="admin-employee-edit" className="admin-edit-form" onSubmit={(event) => void onSaveEdit(event)}>
            <label className="form-group">
              <span className="form-label">الاسم</span>
              <input
                className="form-control"
                required
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label className="form-group">
              <span className="form-label">كلمة مرور جديدة</span>
              <input
                className="form-control"
                type="password"
                placeholder="اتركها فارغة بدون تغيير"
                value={draft.password}
                onChange={(event) => setDraft({ ...draft, password: event.target.value })}
              />
            </label>
            {isManager ? (
              <label className="form-group">
                <span className="form-label">الصلاحية</span>
                <OpsSelect
                  value={draft.role}
                  onChange={(value) => setDraft({ ...draft, role: value as Role })}
                  options={
                    draft.role === 'GENERAL_MANAGER'
                      ? [...ROLE_OPTIONS, { value: 'GENERAL_MANAGER', label: 'مدير عام' }]
                      : ROLE_OPTIONS
                  }
                />
              </label>
            ) : null}
            {isManager && draftNeedsOffice ? (
              <label className="form-group">
                <span className="form-label">المكتب</span>
                <OpsSelect
                  value={draft.locationId}
                  onChange={(value) => setDraft({ ...draft, locationId: value })}
                  options={activeLocations.map((row) => ({ value: row.id, label: row.name }))}
                />
              </label>
            ) : null}
            <label className="form-group">
              <span className="form-label">الحالة</span>
              <OpsSelect
                value={draft.accountStatus}
                onChange={(value) => setDraft({ ...draft, accountStatus: value as 'ACTIVE' | 'INACTIVE' })}
                options={ACCOUNT_OPTIONS}
              />
            </label>
          </form>
        </OpsDialog>
      ) : null}
      {toasts}
    </div>
  );
}
