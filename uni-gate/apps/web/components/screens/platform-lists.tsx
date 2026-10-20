'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, PageHeader, Pagination, PlatformShell, StatusBadge } from '@/components/shell';
import { InlineAlert } from '@/components/inline-alert';
import { formatDate, formatDateTime, formatUsd } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { useGate } from '@/lib/use-gate';
import { listPlatformAudit, type AuditEntryRow } from '@/services/audit';
import { countPlatformCompanies, listPlatformCompanies, type PlatformCompany } from '@/services/platform-companies';

export function PlatformDashboard() {
  const session = useGate('platform');
  const { messages, lang } = usePreferences();
  const [active, setActive] = useState<number | null>(null);
  const [suspended, setSuspended] = useState<number | null>(null);
  const [recent, setRecent] = useState<AuditEntryRow[]>([]);
  const [recentReady, setRecentReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.all([countPlatformCompanies('ACTIVE'), countPlatformCompanies('SUSPENDED')]).then(([activeResult, suspendedResult]) => {
      if (cancelled) return;
      if (!activeResult.ok || !suspendedResult.ok) {
        setError(messages.network);
        return;
      }
      setActive(activeResult.total);
      setSuspended(suspendedResult.total);
    });
    return () => {
      cancelled = true;
    };
  }, [session, messages.network]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    listPlatformAudit({ page: 1, pageSize: 5 }).then((result) => {
      if (cancelled) return;
      setRecentReady(true);
      if (!result.ok) {
        setError(messages.network);
        setRecent([]);
        return;
      }
      setRecent(result.list.items);
    });
    return () => {
      cancelled = true;
    };
  }, [session, messages.network]);

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
      {error ? <InlineAlert message={error} /> : null}
      <div className="stat-row">
        <Link className="stat-link" href="/platform/companies?status=ACTIVE">
          <strong>{active ?? '…'}</strong>
          <span>{messages.activeCompanies}</span>
        </Link>
        <Link className="stat-link" href="/platform/companies?status=SUSPENDED">
          <strong>{suspended ?? '…'}</strong>
          <span>{messages.suspendedCompanies}</span>
        </Link>
      </div>
      <h2>{messages.recentSupport}</h2>
      {!recentReady ? (
        <p role="status">{messages.checking}</p>
      ) : recent.length === 0 ? (
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
              {recent.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.createdAt, lang)}</td>
                  <td>{entry.actorName}</td>
                  <td>{actionLabel(entry.action, messages)}</td>
                  <td>{entry.companyName}</td>
                </tr>
              ))}
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
  const [rows, setRows] = useState<PlatformCompany[]>([]);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setReady(false);
    listPlatformCompanies({ page, q, status }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(messages.network);
        setRows([]);
        setTotal(0);
        setReady(true);
        return;
      }
      setError('');
      setRows(result.list.items);
      setTotal(result.list.total);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [session, page, q, status, messages.network]);

  if (!session) return <p role="status">{messages.checking}</p>;
  const pages = Math.max(1, Math.ceil(total / 20));

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
      {error ? <InlineAlert message={error} /> : null}
      {!ready ? (
        <p role="status">{messages.checking}</p>
      ) : rows.length === 0 ? (
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
              {rows.map((company) => (
                <tr key={company.id}>
                  <td>{company.name}</td>
                  <td>{company.code}</td>
                  <td>
                    <StatusBadge status={company.status} />
                  </td>
                  <td>{formatDate(company.expiresOn, lang)}</td>
                  <td>{formatUsd(Number(company.priceUsd), lang)}</td>
                  <td>
                    <Link href={`/platform/companies/${company.id}`}>{messages.open}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pages={pages} onPage={setPage} />
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
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [rows, setRows] = useState<AuditEntryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    async function loadCompanies() {
      const collected: PlatformCompany[] = [];
      let nextPage = 1;
      let pages = 1;
      while (nextPage <= pages) {
        const result = await listPlatformCompanies({ page: nextPage, pageSize: 100 });
        if (cancelled) return;
        if (!result.ok) return;
        collected.push(...result.list.items);
        pages = Math.max(1, Math.ceil(result.list.total / 100));
        nextPage += 1;
      }
      if (!cancelled) setCompanies(collected);
    }
    void loadCompanies();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setReady(false);
    listPlatformAudit({ page, companyId: companyId || undefined }).then((result) => {
      if (cancelled) return;
      setReady(true);
      if (!result.ok) {
        setRows([]);
        setTotal(0);
        setDenied(result.code === 'FORBIDDEN');
        setMissing(result.code === 'NOT_FOUND');
        setError(result.code === 'FORBIDDEN' || result.code === 'NOT_FOUND' ? '' : messages.network);
        return;
      }
      setDenied(false);
      setMissing(false);
      setError('');
      setRows(result.list.items);
      setTotal(result.list.total);
    });
    return () => {
      cancelled = true;
    };
  }, [session, page, companyId, messages.network]);

  if (!session) return <p role="status">{messages.checking}</p>;
  const pages = Math.max(1, Math.ceil(total / 20));
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
      {error ? <InlineAlert message={error} /> : null}
      {denied ? <p>{messages.forbidden}</p> : null}
      {missing ? <p>{messages.notFound}</p> : null}
      {!ready ? (
        <p role="status">{messages.checking}</p>
      ) : !denied && !error && rows.length === 0 ? (
        <EmptyState text={companyId ? messages.noResults : messages.noSupportYet} />
      ) : rows.length > 0 ? (
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
              {rows.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.createdAt, lang)}</td>
                  <td>{entry.actorName}</td>
                  <td>{entry.companyName}</td>
                  <td>{actionLabel(entry.action, messages)}</td>
                  <td>
                    {entry.targetType} {entry.targetId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pagination page={page} pages={pages} onPage={setPage} />
    </PlatformShell>
  );
}
