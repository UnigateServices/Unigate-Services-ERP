'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EmptyState, PageHeader, Pagination, PlatformShell, StatusBadge } from '@/components/shell';
import { formatDate, formatDateTime, formatUsd } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { pageOf } from '@/lib/page';
import { useGate } from '@/lib/use-gate';
import { countCompanies, getCompany, listAudit, listCompanies } from '@/services/directory';

export function PlatformDashboard() {
  const session = useGate('platform');
  const { messages, lang } = usePreferences();
  const active = session ? countCompanies('ACTIVE') : 0;
  const suspended = session ? countCompanies('SUSPENDED') : 0;
  const recent = session ? listAudit().slice(0, 5) : [];
  if (!session) return <p role="status">{messages.checking}</p>;

  return (
    <PlatformShell session={session}>
      <PageHeader
        title={messages.dashboardTitle}
        actions={
          <Link className="primary-button link-button" href="/platform/companies/new">
            {messages.newCompany}
          </Link>
        }
      />
      <div className="stat-row">
        <Link className="stat-link" href="/platform/companies?status=ACTIVE">
          <strong>{active}</strong>
          <span>{messages.activeCompanies}</span>
        </Link>
        <Link className="stat-link" href="/platform/companies?status=SUSPENDED">
          <strong>{suspended}</strong>
          <span>{messages.suspendedCompanies}</span>
        </Link>
      </div>
      <h2>{messages.recentSupport}</h2>
      {recent.length === 0 ? (
        <EmptyState text={messages.noSupportYet} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{messages.time}</th>
                <th>{messages.operator}</th>
                <th>{messages.action}</th>
                <th>{messages.target}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((entry) => {
                const company = getCompany(entry.companyId);
                return (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.createdAt, lang)}</td>
                    <td>{entry.actorName}</td>
                    <td>{actionLabel(entry.action, messages)}</td>
                    <td>
                      {company ? <Link href={`/platform/companies/${company.id}`}>{company.name}</Link> : entry.companyId}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PlatformShell>
  );
}

export function CompaniesScreen({ initialStatus }: { initialStatus?: 'ACTIVE' | 'SUSPENDED' | '' }) {
  const session = useGate('platform');
  const { messages, lang } = usePreferences();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'SUSPENDED'>(initialStatus ?? '');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => (session ? listCompanies({ q, status }) : []), [session, q, status]);
  const view = pageOf(filtered, page);
  if (!session) return <p role="status">{messages.checking}</p>;

  return (
    <PlatformShell session={session}>
      <PageHeader
        title={messages.companiesTitle}
        crumbs={[{ href: '/platform', label: messages.navDashboard }, { label: messages.companiesTitle }]}
        actions={
          <Link className="primary-button link-button" href="/platform/companies/new">
            {messages.newCompany}
          </Link>
        }
      />
      <div className="filters">
        <label>
          {messages.search}
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          {messages.status}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as '' | 'ACTIVE' | 'SUSPENDED');
              setPage(1);
            }}
          >
            <option value="">{messages.all}</option>
            <option value="ACTIVE">{messages.active}</option>
            <option value="SUSPENDED">{messages.suspended}</option>
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <EmptyState text={q || status ? messages.noResults : messages.empty} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{messages.name}</th>
                <th>{messages.code}</th>
                <th>{messages.status}</th>
                <th>{messages.expires}</th>
                <th>{messages.price}</th>
                <th>{messages.open}</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((company) => (
                <tr key={company.id}>
                  <td>{company.name}</td>
                  <td>{company.code}</td>
                  <td>
                    <StatusBadge status={company.status} />
                  </td>
                  <td>{formatDate(company.expiresOn, lang)}</td>
                  <td>{formatUsd(company.priceUsd, lang)}</td>
                  <td>
                    <Link href={`/platform/companies/${company.id}`}>{messages.open}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={view.page} pages={view.pages} onPage={setPage} />
    </PlatformShell>
  );
}

function actionLabel(action: string, messages: { actionEnter: string; actionCreate: string; actionUpdate: string; actionDelete: string }) {
  if (action === 'ENTER') return messages.actionEnter;
  if (action === 'CREATE') return messages.actionCreate;
  if (action === 'DELETE') return messages.actionDelete;
  return messages.actionUpdate;
}

export function AuditScreen() {
  const session = useGate('platform');
  const { messages, lang } = usePreferences();
  const [companyId, setCompanyId] = useState('');
  const [page, setPage] = useState(1);
  const companies = session ? listCompanies({}) : [];
  const rows = session ? listAudit(companyId || undefined) : [];
  const view = pageOf(rows, page);
  if (!session) return <p role="status">{messages.checking}</p>;
  return (
    <PlatformShell session={session}>
      <PageHeader
        title={messages.auditTitle}
        crumbs={[{ href: '/platform', label: messages.navDashboard }, { label: messages.auditTitle }]}
      />
      <div className="filters">
        <label>
          {messages.filterCompany}
          <select
            value={companyId}
            onChange={(event) => {
              setCompanyId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{messages.all}</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <EmptyState text={companyId ? messages.noResults : messages.noSupportYet} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{messages.time}</th>
                <th>{messages.operator}</th>
                <th>{messages.filterCompany}</th>
                <th>{messages.action}</th>
                <th>{messages.target}</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((entry) => {
                const company = getCompany(entry.companyId);
                return (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.createdAt, lang)}</td>
                    <td>{entry.actorName}</td>
                    <td>{company?.name ?? entry.companyId}</td>
                    <td>{actionLabel(entry.action, messages)}</td>
                    <td>
                      {entry.targetType} {entry.targetId}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={view.page} pages={view.pages} onPage={setPage} />
    </PlatformShell>
  );
}
