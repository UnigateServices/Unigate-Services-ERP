'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AccountRow,
  AccountType,
  AuthUser,
  CostCenterRow,
  JournalEntryInput,
  JournalEntryRow,
  StatementLineOption,
  createAccount,
  createJournalEntry,
  deleteJournalEntry,
  listAccounts,
  listCostCenters,
  listJournalEntries,
  listStatementLines,
  postJournalEntry,
  reverseJournalEntry,
  setAccountStatus,
  updateAccount,
  updateJournalEntry,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { OpsButton } from './ops-button';
import { OpsCard } from './ops-card';
import { OpsDialog, OpsDialogFooter } from './ops-dialog';
import { OpsField, OpsInput } from './ops-field';
import { OpsSelect } from './ops-select';
import { OpsEmpty, OpsTable } from './ops-table';
import { useOpsToasts } from './ops-toasts';

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'ASSET', label: 'أصل' },
  { value: 'LIABILITY', label: 'التزام' },
  { value: 'EQUITY', label: 'حقوق ملكية' },
  { value: 'INCOME', label: 'إيراد' },
  { value: 'EXPENSE', label: 'مصروف' },
];

type DraftLine = {
  key: string;
  accountId: string;
  currency: 'USD' | 'SYP';
  debit: string;
  credit: string;
  memo: string;
  costCenterId: string;
};

function blankLine(): DraftLine {
  return { key: Math.random().toString(36).slice(2), accountId: '', currency: 'USD', debit: '', credit: '', memo: '', costCenterId: '' };
}

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function amount(value: string) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function entryStatus(row: JournalEntryRow) {
  if (row.status === 'DRAFT') return { label: 'مسودة', tone: 'wait' };
  if (row.reversedBy) return { label: 'معكوس', tone: 'wait' };
  return { label: 'مرحّل', tone: 'ok' };
}

export function LedgerPanel({ actor }: { actor: AuthUser }) {
  const canWrite = actor.role === 'GENERAL_MANAGER' || actor.role === 'SUPERVISOR';
  const { push, node: toasts } = useOpsToasts();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [linesCatalog, setLinesCatalog] = useState<StatementLineOption[]>([]);
  const [centers, setCenters] = useState<CostCenterRow[]>([]);
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('EXPENSE');
  const [parentId, setParentId] = useState('');
  const [statementLine, setStatementLine] = useState('');
  const [editor, setEditor] = useState<null | { id: string | null }>(null);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()]);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [nextAccounts, nextEntries, nextCenters, nextLines] = await Promise.all([
      listAccounts(),
      listJournalEntries(),
      listCostCenters(),
      listStatementLines(),
    ]);
    setAccounts(nextAccounts);
    setEntries(nextEntries);
    setCenters(nextCenters);
    setLinesCatalog(nextLines);
    setReady(true);
  }

  useEffect(() => {
    load().catch((error) => push(masterErrorMessage(error), 'err'));
  }, []);

  const activeAccounts = accounts.filter((row) => row.status === 'ACTIVE' && !row.hasChildren);
  const lineChoices = linesCatalog.filter((line) => line.section === type);
  const parentChoices = accounts.filter((row) => row.type === type);
  const tree = useMemo(() => {
    const ordered: { row: AccountRow; depth: number }[] = [];
    const walk = (id: string | null, depth: number) => {
      accounts
        .filter((row) => (row.parentId || null) === id)
        .sort((a, b) => a.code.localeCompare(b.code))
        .forEach((row) => {
          ordered.push({ row, depth });
          walk(row.id, depth + 1);
        });
    };
    walk(null, 0);
    return ordered;
  }, [accounts]);
  const totals = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const row = map.get(line.currency) ?? { debit: 0, credit: 0 };
      row.debit += amount(line.debit);
      row.credit += amount(line.credit);
      map.set(line.currency, row);
    }
    return [...map.entries()];
  }, [lines]);

  function openNew() {
    setEditor({ id: null });
    setDate(today());
    setDescription('');
    setLines([blankLine(), blankLine()]);
  }

  function openEdit(row: JournalEntryRow) {
    setEditor({ id: row.id });
    setDate(row.transactionDate);
    setDescription(row.description);
    setLines(row.lines.map((line) => ({
      key: line.id,
      accountId: line.accountId,
      currency: line.currency,
      debit: Number(line.debit) ? line.debit : '',
      credit: Number(line.credit) ? line.credit : '',
      memo: line.memo,
      costCenterId: line.costCenterId ?? '',
    })));
  }

  function payload(post: boolean): JournalEntryInput {
    return {
      transactionDate: date,
      description,
      post,
      lines: lines
        .filter((line) => line.accountId && (amount(line.debit) > 0 || amount(line.credit) > 0))
        .map((line) => ({
          accountId: line.accountId,
          currency: line.currency,
          debit: amount(line.debit),
          credit: amount(line.credit),
          memo: line.memo,
          ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}),
        })),
    };
  }

  async function saveEntry(post: boolean) {
    setSaving(true);
    try {
      const body = payload(post);
      if (editor?.id) await updateJournalEntry(editor.id, body);
      else await createJournalEntry(body);
      setEditor(null);
      push(post ? 'رُحّل القيد.' : 'حُفظت المسودة.', 'ok');
      await load();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      push(ok, 'ok');
      await load();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

  return (
    <div className="ops-page">
      {toasts}
      <OpsCard title="دليل الحسابات" count={accounts.length}>
        {canWrite ? (
          <form
            className="ops-form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await createAccount({
                  code,
                  name,
                  type,
                  ...(parentId ? { parentId } : {}),
                  ...(statementLine ? { statementLine } : {}),
                });
                setCode('');
                setName('');
                setParentId('');
                setStatementLine('');
              }, 'أُضيف الحساب.');
            }}
          >
            <OpsField label="الرمز"><OpsInput value={code} onChange={(event) => setCode(event.target.value)} required maxLength={20} /></OpsField>
            <OpsField label="الاسم"><OpsInput value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} /></OpsField>
            <OpsField label="النوع">
              <OpsSelect value={type} onChange={(value) => { setType(value as AccountType); setParentId(''); setStatementLine(''); }} options={TYPES} />
            </OpsField>
            <OpsField label="يتبع">
              <OpsSelect
                value={parentId}
                onChange={setParentId}
                placeholder="بدون أب"
                options={[{ value: '', label: 'بدون أب' }, ...parentChoices.map((row) => ({ value: row.id, label: `${row.code} ${row.name}` }))]}
              />
            </OpsField>
            <OpsField label="بند القائمة">
              <OpsSelect
                value={statementLine}
                onChange={setStatementLine}
                placeholder="حسب النوع"
                options={[{ value: '', label: 'حسب النوع' }, ...lineChoices.map((line) => ({ value: line.code, label: line.name }))]}
              />
            </OpsField>
            <div className="ops-span-all"><OpsButton type="submit" variant="primary">إضافة حساب</OpsButton></div>
          </form>
        ) : null}
        {!ready ? <OpsEmpty title="جاري تحميل الدليل..." /> : (
          <OpsTable dense>
            <thead>
              <tr><th>الرمز</th><th>الاسم</th><th>النوع</th><th>بند القائمة</th><th>الحالة</th>{canWrite ? <th /> : null}</tr>
            </thead>
            <tbody>
              {tree.map(({ row, depth }) => (
                <tr key={row.id}>
                  <td>{row.code}</td>
                  <td style={{ paddingInlineStart: 12 + depth * 16 }}>{depth ? '↳ ' : ''}{row.name}{row.hasChildren ? ' — مجموعة' : ''}</td>
                  <td>{TYPES.find((item) => item.value === row.type)?.label}</td>
                  <td>
                    {canWrite ? (
                      <OpsSelect
                        value={row.statementLine}
                        onChange={(statementLine) => void run(() => updateAccount(row.id, { statementLine }), 'تحدّث بند القائمة.')}
                        options={linesCatalog.filter((line) => line.section === row.type).map((line) => ({ value: line.code, label: line.name }))}
                      />
                    ) : linesCatalog.find((line) => line.code === row.statementLine)?.name || row.statementLine}
                  </td>
                  <td><span className={`ops-status${row.status === 'ACTIVE' ? ' is-ok' : ' is-wait'}`}>{row.status === 'ACTIVE' ? 'نشط' : 'موقوف'}</span></td>
                  {canWrite ? (
                    <td>
                      {row.system ? 'نظام' : (
                        <OpsButton
                          variant="mini"
                          onClick={() => void run(() => setAccountStatus(row.id, row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'), 'تحدّثت حالة الحساب.')}
                        >
                          {row.status === 'ACTIVE' ? 'إيقاف' : 'تفعيل'}
                        </OpsButton>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </OpsTable>
        )}
      </OpsCard>

      <OpsCard
        title="قيود اليومية"
        count={entries.length}
        toolbar={canWrite ? <OpsButton variant="primary" onClick={openNew}>قيد جديد</OpsButton> : null}
      >
        {!ready ? <OpsEmpty title="جاري تحميل القيود..." /> : entries.length === 0 ? (
          <OpsEmpty title="لا قيود بعد" detail="القيد يُحفظ فقط إذا تساوى المدين والدائن في كل عملة." />
        ) : (
          <OpsTable dense>
            <thead>
              <tr>
                <th>الرقم</th><th>التاريخ</th><th>البيان</th><th>المركز</th><th>الحالة</th><th>الموظف</th>{canWrite ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => {
                const state = entryStatus(row);
                return (
                  <tr key={row.id}>
                    <td>{row.number}</td>
                    <td>{row.transactionDate}</td>
                    <td>
                      {row.description || '—'}
                      {row.reversalOf ? <small> عكس {row.reversalOf.number}</small> : null}
                    </td>
                    <td>{[...new Set(row.lines.map((line) => line.costCenter?.name).filter(Boolean))].join('، ') || '—'}</td>
                    <td><span className={`ops-status is-${state.tone}`}>{state.label}</span></td>
                    <td>{row.employee.name}</td>
                    {canWrite ? (
                      <td>
                        <div className="ops-log-actions">
                          {row.status === 'DRAFT' ? (
                            <>
                              <OpsButton variant="mini" onClick={() => void run(() => postJournalEntry(row.id), 'رُحّل القيد.')}>ترحيل</OpsButton>
                              <OpsButton variant="mini" onClick={() => openEdit(row)}>تعديل</OpsButton>
                              <OpsButton variant="mini" className="is-danger" onClick={() => void run(() => deleteJournalEntry(row.id), 'حُذفت المسودة.')}>حذف</OpsButton>
                            </>
                          ) : null}
                          {row.status === 'POSTED' && !row.reversedBy ? (
                            <OpsButton variant="mini" className="is-danger" onClick={() => void run(() => reverseJournalEntry(row.id), 'أُنشئ القيد العكسي.')}>عكس</OpsButton>
                          ) : null}
                          {row.reversedBy ? <span>عكس {row.reversedBy.number}</span> : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </OpsTable>
        )}
      </OpsCard>

      {editor ? (
        <OpsDialog
          wide
          title={editor.id ? 'تعديل مسودة' : 'قيد جديد'}
          onClose={() => setEditor(null)}
          footer={
            <OpsDialogFooter
              onCancel={() => setEditor(null)}
              formId="journal-form"
              saveLabel="حفظ مسودة"
              saving={saving}
            />
          }
        >
          <form id="journal-form" onSubmit={(event) => { event.preventDefault(); void saveEntry(false); }}>
            <div className="ops-form-grid">
              <OpsField label="التاريخ"><OpsInput type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></OpsField>
              <OpsField label="البيان" className="ops-span-all"><OpsInput value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /></OpsField>
            </div>
            <OpsTable dense>
              <thead>
                <tr><th>الحساب</th><th>المركز</th><th>العملة</th><th>مدين</th><th>دائن</th><th>ملاحظة</th><th /></tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key}>
                    <td>
                      <OpsSelect
                        value={line.accountId}
                        placeholder="الحساب"
                        onChange={(accountId) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, accountId } : item))}
                        options={activeAccounts.map((row) => ({ value: row.id, label: `${row.code} ${row.name}` }))}
                      />
                    </td>
                    <td>
                      <OpsSelect
                        value={line.costCenterId}
                        placeholder="بدون مركز"
                        onChange={(costCenterId) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, costCenterId } : item))}
                        options={[{ value: '', label: 'بدون مركز' }, ...centers.map((row) => ({ value: row.id, label: row.name }))]}
                      />
                    </td>
                    <td>
                      <OpsSelect
                        value={line.currency}
                        onChange={(currency) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, currency: currency as 'USD' | 'SYP' } : item))}
                        options={[{ value: 'USD', label: 'USD' }, { value: 'SYP', label: 'ل.س' }]}
                      />
                    </td>
                    <td><OpsInput inputMode="decimal" value={line.debit} onChange={(event) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, debit: event.target.value, credit: event.target.value ? '' : item.credit } : item))} /></td>
                    <td><OpsInput inputMode="decimal" value={line.credit} onChange={(event) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, credit: event.target.value, debit: event.target.value ? '' : item.debit } : item))} /></td>
                    <td><OpsInput value={line.memo} onChange={(event) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, memo: event.target.value } : item))} /></td>
                    <td>{lines.length > 2 ? <OpsButton variant="mini" className="is-danger" onClick={() => setLines((rows) => rows.filter((item) => item.key !== line.key))}>حذف</OpsButton> : null}</td>
                  </tr>
                ))}
              </tbody>
            </OpsTable>
            <OpsButton variant="secondary" onClick={() => setLines((rows) => [...rows, blankLine()])}>بند جديد</OpsButton>
            <p className="ops-log-count-line">
              {totals.map(([currency, row]) => `${currency}: مدين ${row.debit} / دائن ${row.credit}${row.debit === row.credit ? '' : ' — غير متوازن'}`).join(' · ') || 'أدخل البنود'}
            </p>
            <OpsButton type="button" variant="primary" disabled={saving} onClick={() => void saveEntry(true)}>حفظ وترحيل</OpsButton>
          </form>
        </OpsDialog>
      ) : null}
    </div>
  );
}
