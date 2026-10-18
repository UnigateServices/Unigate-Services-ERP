'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AuthUser,
  CURRENCIES,
  EmployeeRow,
  NamedRecord,
  OPERATION_FUNDS,
  ProjectRow,
  ReportCatalog,
  ReportDoc,
  getReportCatalog,
  runReport,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { OpsCard } from './ops-card';
import { OpsMultiSelect } from './ops-multi-select';
import { ReportChartCard } from './report-charts';

type Props = {
  actor: AuthUser;
  employees?: EmployeeRow[];
  projects: ProjectRow[];
  borrowers: NamedRecord[];
};

const PERIODS = [
  { id: 'today', label: 'اليوم' },
  { id: 'week', label: 'أسبوع' },
  { id: 'month', label: 'شهر' },
  { id: 'all', label: 'الكل' },
  { id: 'custom', label: 'مخصص' },
] as const;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function money(value: number, currency?: string) {
  const digits = currency === 'SYP' ? 0 : 2;
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function joinFilter(values: string[]) {
  return values.length ? values.join(',') : undefined;
}

export function ReportsPanel({ actor, employees = [], projects, borrowers }: Props) {
  const canPickEmployee = actor.role !== 'EMPLOYEE';
  const [catalog, setCatalog] = useState<ReportCatalog | null>(null);
  const [groupId, setGroupId] = useState('ops');
  const [reportId, setReportId] = useState('overview');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('today');
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [funds, setFunds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [borrowerIds, setBorrowerIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [exchangeTypes, setExchangeTypes] = useState<string[]>([]);
  const [advanceTypes, setAdvanceTypes] = useState<string[]>([]);
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getReportCatalog()
      .then((result) => {
        setCatalog(result);
        const first = result.reports[0];
        if (first) {
          setGroupId(first.group);
          setReportId(first.id);
        }
      })
      .catch((error) => setMessage(masterErrorMessage(error)));
  }, []);

  const reports = useMemo(
    () => (catalog?.reports || []).filter((item) => item.group === groupId),
    [catalog, groupId],
  );
  const current = catalog?.reports.find((item) => item.id === reportId);
  const filters = current?.filters || [];

  async function onRun(event?: FormEvent) {
    event?.preventDefault();
    if (!reportId) return;
    setLoading(true);
    setMessage('');
    try {
      const result = await runReport({
        reportId,
        period,
        from: period === 'custom' ? from : undefined,
        to: period === 'custom' ? to : undefined,
        employeeId: joinFilter(employeeIds),
        currency: joinFilter(currencies),
        fund: joinFilter(funds),
        projectId: joinFilter(projectIds),
        borrowerId: joinFilter(borrowerIds),
        status: statuses.length ? joinFilter(statuses) : 'ALL',
        exchangeType: joinFilter(exchangeTypes),
        advanceType: joinFilter(advanceTypes),
      });
      setDoc(result);
    } catch (error) {
      setMessage(masterErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function onPickReport(id: string) {
    setReportId(id);
    setDoc(null);
  }

  function sectionCsv(section: ReportDoc['sections'][number]) {
    const header = section.columns.map((col) => col.label).join(',');
    const lines = section.rows.map((row) =>
      section.columns.map((col) => csvCell(row[col.key])).join(','),
    );
    return [section.title, header, ...lines].join('\n');
  }

  function exportCsv() {
    if (!doc?.sections[0]) return;
    downloadText(`${doc.title}.csv`, sectionCsv(doc.sections[0]));
  }

  function exportFull() {
    if (!doc) return;
    downloadText(`${doc.title}-كامل.csv`, doc.sections.map(sectionCsv).join('\n\n'));
  }

  return (
    <div className="ops-page ops-wide rpt-shell">
      <OpsCard className="rpt-chrome rpt-pick" title="اختيار التقرير" collapsible>
        <div className="rpt-pills rpt-pills-groups">
          {(catalog?.groups || []).map((group) =>
            (catalog?.reports || []).some((item) => item.group === group.id) ? (
              <button
                key={group.id}
                type="button"
                className={`rpt-pill${groupId === group.id ? ' is-on' : ''}`}
                onClick={() => {
                  setGroupId(group.id);
                  const next = catalog?.reports.find((item) => item.group === group.id);
                  if (next) onPickReport(next.id);
                }}
              >
                {group.title}
              </button>
            ) : null,
          )}
        </div>
        <div className="rpt-pills">
          {reports.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rpt-pill${item.id === reportId ? ' is-on' : ''}`}
              onClick={() => onPickReport(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
      </OpsCard>

      <form onSubmit={(event) => void onRun(event)}>
        <OpsCard className="rpt-chrome rpt-filters" title={`فلترة التقرير — ${current?.title || ''}`} collapsible>
          {filters.includes('period') ? (
            <div className="rpt-period-line">
              <span className="rpt-period-label">الفترة</span>
              <div className="rpt-pills">
                {PERIODS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`rpt-pill${period === item.id ? ' is-on' : ''}`}
                    onClick={() => setPeriod(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {period === 'custom' ? (
            <div className="rpt-filter-grid rpt-custom-dates">
              <label className="rpt-field">
                من
                <input className="form-control" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="rpt-field">
                إلى
                <input className="form-control" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
            </div>
          ) : null}
          <div className="rpt-filter-grid">
            {filters.includes('employee') && canPickEmployee ? (
              <label className="rpt-field">
                الموظف
                <OpsMultiSelect
                  values={employeeIds}
                  onChange={setEmployeeIds}
                  countLabel={(count) => `${count} موظفين`}
                  options={employees.map((row) => ({ value: row.id, label: row.name }))}
                />
              </label>
            ) : null}
            {filters.includes('fund') ? (
              <label className="rpt-field">
                الصندوق
                <OpsMultiSelect
                  values={funds}
                  onChange={setFunds}
                  countLabel={(count) => `${count} صناديق`}
                  options={[
                    ...OPERATION_FUNDS.map((item) => ({ value: item.value, label: item.label })),
                    { value: 'ADVANCES', label: 'السلف' },
                  ]}
                />
              </label>
            ) : null}
            {filters.includes('project') ? (
              <label className="rpt-field">
                المشروع
                <OpsMultiSelect
                  values={projectIds}
                  onChange={setProjectIds}
                  countLabel={(count) => `${count} مشاريع`}
                  options={projects.map((row) => ({ value: row.id, label: row.name }))}
                />
              </label>
            ) : null}
            {filters.includes('borrower') ? (
              <label className="rpt-field">
                المستلف
                <OpsMultiSelect
                  values={borrowerIds}
                  onChange={setBorrowerIds}
                  countLabel={(count) => `${count} مستلفين`}
                  options={borrowers.map((row) => ({ value: row.id, label: row.name }))}
                />
              </label>
            ) : null}
            {filters.includes('currency') ? (
              <label className="rpt-field">
                العملة
                <OpsMultiSelect
                  values={currencies}
                  onChange={setCurrencies}
                  countLabel={(count) => `${count} عملات`}
                  options={CURRENCIES.map((item) => ({ value: item.value, label: item.label }))}
                />
              </label>
            ) : null}
            {filters.includes('exchangeType') ? (
              <label className="rpt-field">
                نوع التصريف
                <OpsMultiSelect
                  values={exchangeTypes}
                  onChange={setExchangeTypes}
                  options={[
                    { value: 'BUY', label: 'شراء' },
                    { value: 'SELL', label: 'بيع' },
                  ]}
                />
              </label>
            ) : null}
            {filters.includes('advanceType') ? (
              <label className="rpt-field">
                نوع السلفة
                <OpsMultiSelect
                  values={advanceTypes}
                  onChange={setAdvanceTypes}
                  options={[
                    { value: 'OUTCOME', label: 'صادر' },
                    { value: 'EXCHANGE', label: 'تصريف' },
                  ]}
                />
              </label>
            ) : null}
            {filters.includes('status') ? (
              <label className="rpt-field">
                الحالة
                <OpsMultiSelect
                  values={statuses}
                  onChange={setStatuses}
                  options={[
                    { value: 'COMPLETED', label: 'مكتملة' },
                    { value: 'PENDING_APPROVAL', label: 'معلّقة' },
                  ]}
                />
              </label>
            ) : null}
          </div>
          <div className="rpt-actions">
            <button type="submit" className="btn-submit-action rpt-actions-main" disabled={loading}>
              {loading ? 'جاري الإعداد...' : 'عرض التقرير'}
            </button>
            <button type="button" className="btn-submit-action btn-soft" disabled={!doc} onClick={() => window.print()}>
              PDF / طباعة
            </button>
            <button type="button" className="btn-submit-action btn-soft" disabled={!doc} onClick={exportCsv}>
              تصدير Excel
            </button>
            <button type="button" className="btn-submit-action btn-soft" disabled={!doc} onClick={exportFull}>
              تصدير كامل
            </button>
          </div>
          {message ? <p className="ops-log-empty">{message}</p> : null}
        </OpsCard>
      </form>

      <OpsCard title="النتيجة" collapsible>
        {!doc ? (
          <p className="rpt-empty">اضغط «عرض التقرير» بعد اختيار الفلاتر.</p>
        ) : (
        <div className="rpt-result" id="rptPrintRoot">
          <section className="card rpt-letterhead">
            <p className="brand-powered">
              Powered by <strong>UNI GATE</strong>
            </p>
            <h2>{doc.title}</h2>
            <p className="muted">{doc.description}</p>
            <p>
              {doc.periodLabel}
              {doc.from && doc.to ? ` · ${doc.from} — ${doc.to}` : ''}
            </p>
            <p className="muted">{new Date(doc.generatedAt).toLocaleString('ar-SY')}</p>
          </section>

          <div className="rpt-kpis">
            {doc.kpis.map((item) => (
              <article key={item.id} className={`rpt-kpi${item.tone ? ` rpt-kpi--${item.tone}` : ''}`}>
                <span>{item.label}</span>
                <strong>
                  {item.format === 'money' ? money(item.value, item.currency) : item.value.toLocaleString('en-US')}
                </strong>
              </article>
            ))}
          </div>

          <div className="rpt-charts">
            {doc.charts.map((item) => (
              <ReportChartCard key={item.id} chart={item} />
            ))}
          </div>

          {doc.sections.map((section) => (
            <section key={section.id} className="card">
              <h3>{section.title}</h3>
              {section.rows.length === 0 ? (
                <p className="muted">لا بيانات في الفترة المحددة.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {section.columns.map((col) => (
                          <th key={col.key}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, index) => (
                        <tr key={index}>
                          {section.columns.map((col) => (
                            <td key={col.key}>
                              {col.format === 'num' || col.format === 'money'
                                ? money(Number(row[col.key] || 0))
                                : String(row[col.key] ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}

          <section className="card">
            <ul className="rpt-notes">
              {doc.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
        )}
      </OpsCard>
    </div>
  );
}

function csvCell(value: string | number | undefined) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadText(name: string, body: string) {
  const blob = new Blob(['\ufeff', body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
