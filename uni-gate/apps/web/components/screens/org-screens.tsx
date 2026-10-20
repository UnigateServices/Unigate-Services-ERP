'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { PasswordField } from '@/components/password-field';
import { PrimaryButton } from '@/components/primary-button';
import { AppShell, ConfirmDialog, EmptyState, PageHeader, Pagination, PlatformShell, StatusBadge } from '@/components/shell';
import { moduleLabel } from '@/lib/messages';
import { pageOf } from '@/lib/page';
import { canCreateBranch, canEditRoles, canManageUsers, canSeeRoles, seesAllBranches } from '@/lib/permissions';
import { usePreferences } from '@/lib/preferences';
import { changeOwnPassword, loadSession } from '@/lib/session';
import { useGate } from '@/lib/use-gate';
import { passwordIssue, roleKeyIssue } from '@/services/directory';
import { getSessionModule, listSessionModules } from '@/services/modules';
import {
  createCustomerUser,
  createPlatformUser,
  getCustomerUser,
  getPlatformUser,
  listCustomerUsers,
  listPlatformUsers,
  resetCustomerPassword,
  resetPlatformPassword,
  updateCustomerUser,
  updatePlatformUser,
  type CustomerUser,
} from '@/services/users';
import {
  createPlatformRole,
  listCustomerRoles,
  listPlatformRoles,
  updatePlatformRole,
  type CompanyRole,
} from '@/services/roles';
import { getPlatformCompany } from '@/services/platform-companies';
import {
  createPlatformLocation,
  listCustomerLocations,
  listPlatformLocations,
  updatePlatformLocation,
  type Branch,
} from '@/services/locations';
import type { AppSession, ModuleKey, VisibilityScope } from '@/types/auth';

function moduleLinks(enabled: ModuleKey[], messages: ReturnType<typeof usePreferences>['messages']) {
  const items = [{ href: '/app/modules', label: messages.navModules }];
  for (const key of enabled) items.push({ href: `/app/modules/${key}`, label: moduleLabel(key, messages) });
  return items;
}

function appNav(session: AppSession, enabled: ModuleKey[], messages: ReturnType<typeof usePreferences>['messages']) {
  const items = [{ href: '/app', label: messages.welcome }];
  items.push({ href: '/app/branches', label: messages.navBranches });
  if (canManageUsers(session)) items.push({ href: '/app/users', label: messages.navUsers });
  if (canSeeRoles(session)) items.push({ href: '/app/roles', label: messages.navRoles });
  items.push(...moduleLinks(enabled, messages));
  return items;
}

function supportNav(enabled: ModuleKey[], messages: ReturnType<typeof usePreferences>['messages']) {
  return [
    { href: '/platform', label: messages.navDashboard },
    { href: '/platform/companies', label: messages.navCompanies },
    { href: '/app/branches', label: messages.navBranches },
    { href: '/app/users', label: messages.navUsers },
    { href: '/app/roles', label: messages.navRoles },
    ...moduleLinks(enabled, messages),
  ];
}

function useEnabledModuleKeys(companyId: string | null) {
  const [enabled, setEnabled] = useState<ModuleKey[]>([]);
  useEffect(() => {
    if (!companyId) {
      setEnabled([]);
      return;
    }
    let cancelled = false;
    void listSessionModules().then((result) => {
      if (cancelled) return;
      setEnabled(result.ok ? result.items.filter((item) => item.enabled).map((item) => item.key) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId]);
  return enabled;
}

export function useAppItems(session: AppSession | null, companyId: string | null) {
  const { messages } = usePreferences();
  const enabled = useEnabledModuleKeys(session?.companyId ?? null);
  if (!session || !companyId) return [{ href: '/app', label: messages.welcome }];
  if (session.actor === 'platform') return supportNav(enabled, messages);
  return appNav(session, enabled, messages);
}

export function BranchesScreen({ companyId, chrome }: { companyId: string; chrome: 'platform' | 'app' }) {
  const session = useGate(chrome);
  const { messages } = usePreferences();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Branch[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (chrome === 'platform') {
        const [company, listed] = await Promise.all([getPlatformCompany(companyId), listPlatformLocations(companyId)]);
        if (cancelled) return;
        if (!company.ok || !listed.ok) {
          const code = !company.ok ? company.code : listed.ok ? '' : listed.code;
          setMissing(code === 'NOT_FOUND');
          setLoadError(code === 'NOT_FOUND' ? '' : messages.network);
          setReady(true);
          return;
        }
        setCompanyName(company.company.name);
        setRows(listed.items);
        setReady(true);
        return;
      }
      const listed = await listCustomerLocations();
      if (cancelled) return;
      if (!listed.ok) {
        setLoadError(listed.code === 'CONFLICT' ? messages.pendingAreas : messages.network);
        setReady(true);
        return;
      }
      setRows(listed.items);
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [chrome, companyId, messages.network, messages.pendingAreas]);

  if (!session || !ready) return <p role="status">{messages.checking}</p>;
  if (chrome === 'app' && session.companyId !== companyId) return <p>{messages.forbidden}</p>;
  const displayName = chrome === 'app' ? (session.companyName ?? '') : companyName;
  const filtered = rows.filter((item) => item.name.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()));
  const view = pageOf(filtered, page);
  const base = chrome === 'platform' ? `/platform/companies/${companyId}/branches` : '/app/branches';
  return (
    <OrgFrame chrome={chrome} session={session} companyId={companyId}>
      <PageHeader
        title={messages.branchesTitle}
        crumbs={crumbs(chrome, displayName, messages.branchesTitle, messages)}
        actions={
          canCreateBranch(session) ? (
            <Link className="primary-button link-button" href={`${base}/new`}>
              {messages.newBranch}
            </Link>
          ) : null
        }
      />
      {loadError ? <InlineAlert message={loadError} /> : null}
      {missing ? <p>{messages.notFound}</p> : null}
      {!loadError && !missing ? (
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
        </div>
      ) : null}
      {!loadError && !missing && filtered.length === 0 ? (
        <EmptyState text={q ? messages.noResults : messages.empty} />
      ) : null}
      {!loadError && !missing && filtered.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{messages.name}</th>
                <th>{messages.status}</th>
                <th>{messages.open}</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((branch) => (
                <tr key={branch.id}>
                  <td>{branch.name}</td>
                  <td>
                    <StatusBadge status={branch.status} />
                  </td>
                  <td>
                    <Link href={`${base}/${branch.id}`}>{canCreateBranch(session) ? messages.edit : messages.open}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!loadError && !missing ? <Pagination page={view.page} pages={view.pages} onPage={setPage} /> : null}
    </OrgFrame>
  );
}

function OrgFrame({
  chrome,
  session,
  companyId,
  children,
}: {
  chrome: 'platform' | 'app';
  session: AppSession;
  companyId: string;
  children: React.ReactNode;
}) {
  const appItems = useAppItems(session, companyId);
  if (chrome === 'platform') return <PlatformShell session={session}>{children}</PlatformShell>;
  return (
    <AppShell session={session} items={appItems}>
      {children}
    </AppShell>
  );
}

function crumbs(
  chrome: 'platform' | 'app',
  companyName: string,
  leaf: string,
  messages: { navDashboard: string; navCompanies: string },
) {
  if (chrome === 'app') return [{ href: '/app', label: companyName }, { label: leaf }];
  return [
    { href: '/platform', label: messages.navDashboard },
    { href: '/platform/companies', label: messages.navCompanies },
    { label: companyName },
    { label: leaf },
  ];
}

export function BranchFormScreen({
  companyId,
  branchId,
  chrome,
}: {
  companyId: string;
  branchId?: string;
  chrome: 'platform' | 'app';
}) {
  const session = useGate(chrome);
  const router = useRouter();
  const { messages } = usePreferences();
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [existing, setExisting] = useState<Branch | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (chrome === 'platform') {
        const company = await getPlatformCompany(companyId);
        if (cancelled) return;
        if (!company.ok) {
          setMissing(company.code === 'NOT_FOUND');
          setLoadError(company.code === 'NOT_FOUND' ? '' : messages.network);
          setReady(true);
          return;
        }
        setCompanyName(company.company.name);
        if (!branchId) {
          setReady(true);
          return;
        }
        const listed = await listPlatformLocations(companyId);
        if (cancelled) return;
        if (!listed.ok) {
          setMissing(listed.code === 'NOT_FOUND');
          setLoadError(listed.code === 'NOT_FOUND' ? '' : messages.network);
          setReady(true);
          return;
        }
        const found = listed.items.find((item) => item.id === branchId) ?? null;
        setExisting(found);
        setMissing(!found);
        if (found) {
          setName(found.name);
          setStatus(found.status);
        }
        setReady(true);
        return;
      }
      const listed = await listCustomerLocations();
      if (cancelled) return;
      if (!listed.ok) {
        setLoadError(listed.code === 'CONFLICT' ? messages.pendingAreas : messages.network);
        setReady(true);
        return;
      }
      if (!branchId) {
        setReady(true);
        return;
      }
      const found = listed.items.find((item) => item.id === branchId) ?? null;
      setExisting(found);
      setMissing(!found);
      if (found) {
        setName(found.name);
        setStatus(found.status);
      }
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [branchId, chrome, companyId, messages.network, messages.pendingAreas]);

  if (!session || !ready) return <p role="status">{messages.checking}</p>;
  const writable = canCreateBranch(session);
  const displayName = chrome === 'app' ? (session.companyName ?? '') : companyName;
  const base = chrome === 'platform' ? `/platform/companies/${companyId}/branches` : '/app/branches';
  if (chrome === 'app' && session.companyId !== companyId) return <p>{messages.forbidden}</p>;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !writable || saving) return;
    if (!name.trim()) {
      setError(messages.required);
      return;
    }
    setSaving(true);
    setError('');
    const result = existing
      ? await updatePlatformLocation(companyId, existing.id, { name: name.trim(), status })
      : await createPlatformLocation(companyId, name.trim());
    setSaving(false);
    if (!result.ok) {
      setError(result.code === 'NAME_TAKEN' ? messages.nameTaken : messages.network);
      return;
    }
    router.push(base);
  }

  async function deactivate() {
    if (!session || !existing || saving) return;
    setSaving(true);
    setError('');
    const result = await updatePlatformLocation(companyId, existing.id, { name: existing.name, status: 'INACTIVE' });
    setSaving(false);
    setConfirm(false);
    if (!result.ok) {
      setError(result.code === 'NAME_TAKEN' ? messages.nameTaken : messages.network);
      return;
    }
    router.push(base);
  }

  return (
    <OrgFrame chrome={chrome} session={session} companyId={companyId}>
      <PageHeader
        title={existing ? (writable ? messages.editBranch : messages.branchesTitle) : messages.newBranch}
        crumbs={crumbs(chrome, displayName, messages.branchesTitle, messages)}
      />
      {loadError ? <InlineAlert message={loadError} /> : null}
      {!loadError && (missing || (!writable && !existing)) ? <p>{missing ? messages.notFound : messages.forbidden}</p> : null}
      {!loadError && !missing && (existing || writable) ? (
        <>
          {!writable ? <InlineAlert tone="info" message={messages.readOnly} /> : null}
          <form className="stack-form" onSubmit={onSubmit} noValidate>
            <FormField id="branch-name" label={messages.branchName} required error={error}>
              <input id="branch-name" value={name} disabled={!writable || saving} onChange={(event) => setName(event.target.value)} />
            </FormField>
            {existing && writable ? (
              <FormField id="branch-status" label={messages.status}>
                <select
                  id="branch-status"
                  value={status}
                  disabled={saving}
                  onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'INACTIVE')}
                >
                  <option value="ACTIVE">{messages.active}</option>
                  <option value="INACTIVE">{messages.inactiveStatus}</option>
                </select>
              </FormField>
            ) : null}
            {existing && !writable ? (
              <p>
                {messages.status}: <StatusBadge status={existing.status} />
              </p>
            ) : null}
            {writable ? <PrimaryButton disabled={saving}>{saving ? messages.saving : messages.save}</PrimaryButton> : null}
          </form>
          {existing && writable && existing.status === 'ACTIVE' ? (
            <section className="danger-zone">
              <h2>{messages.dangerZone}</h2>
              <button type="button" className="danger-button" disabled={saving} onClick={() => setConfirm(true)}>
                {messages.deactivate}
              </button>
            </section>
          ) : null}
        </>
      ) : null}
      <ConfirmDialog
        open={confirm}
        title={messages.deactivate}
        body={messages.deactivateBranchBody}
        confirmLabel={messages.deactivate}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          void deactivate();
        }}
      />
    </OrgFrame>
  );
}

export function UsersScreen({ companyId, chrome }: { companyId: string; chrome: 'platform' | 'app' }) {
  const session = useGate(chrome);
  const { messages } = usePreferences();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CustomerUser[]>([]);
  const [total, setTotal] = useState(0);
  const [companyName, setCompanyName] = useState('');
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (chrome === 'platform') {
        const [company, listed] = await Promise.all([
          getPlatformCompany(companyId),
          listPlatformUsers(companyId, { page, q }),
        ]);
        if (cancelled) return;
        if (!company.ok || !listed.ok) {
          const code = !company.ok ? company.code : listed.ok ? '' : listed.code;
          setMissing(code === 'NOT_FOUND');
          setDenied(code === 'FORBIDDEN');
          setLoadError(code === 'NOT_FOUND' || code === 'FORBIDDEN' ? '' : messages.network);
          setReady(true);
          return;
        }
        setCompanyName(company.company.name);
        setRows(listed.list.items);
        setTotal(listed.list.total);
        setReady(true);
        return;
      }
      const listed = await listCustomerUsers({ page, q });
      if (cancelled) return;
      if (!listed.ok) {
        setDenied(listed.code === 'FORBIDDEN');
        setLoadError(listed.code === 'FORBIDDEN' || listed.code === 'CONFLICT' ? '' : messages.network);
        setReady(true);
        return;
      }
      setRows(listed.list.items);
      setTotal(listed.list.total);
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [chrome, companyId, messages.network, page, q]);

  if (!session || !ready) return <p role="status">{messages.checking}</p>;
  if (!canManageUsers(session) || denied) return <p>{messages.forbidden}</p>;
  if (missing) return <p>{messages.notFound}</p>;
  if (chrome === 'app' && session.companyId !== companyId) return <p>{messages.forbidden}</p>;
  const displayName = chrome === 'app' ? (session.companyName ?? '') : companyName;
  const base = chrome === 'platform' ? `/platform/companies/${companyId}/users` : '/app/users';
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <OrgFrame chrome={chrome} session={session} companyId={companyId}>
      <PageHeader
        title={messages.usersTitle}
        crumbs={crumbs(chrome, displayName, messages.usersTitle, messages)}
        actions={
          <Link className="primary-button link-button" href={`${base}/new`}>
            {messages.newUser}
          </Link>
        }
      />
      {loadError ? <InlineAlert message={loadError} /> : null}
      {!loadError ? (
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
        </div>
      ) : null}
      {!loadError && rows.length === 0 ? <EmptyState text={q ? messages.noResults : messages.empty} /> : null}
      {!loadError && rows.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{messages.name}</th>
                <th>{messages.username}</th>
                <th>{messages.role}</th>
                <th>{messages.branch}</th>
                <th>{messages.status}</th>
                <th>{messages.edit}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.username}</td>
                  <td>{user.role.name}</td>
                  <td>{user.location?.name || messages.allBranches}</td>
                  <td>
                    <StatusBadge status={user.status} />
                  </td>
                  <td>
                    <Link href={`${base}/${user.id}`}>{messages.edit}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!loadError ? <Pagination page={page} pages={pages} onPage={setPage} /> : null}
    </OrgFrame>
  );
}

function userError(code: string, messages: { nameTaken: string; locationRequired: string; selfAdmin: string; assignmentInvalid: string; passwordRules: string; forbidden: string; network: string }) {
  if (code === 'NAME_TAKEN') return messages.nameTaken;
  if (code === 'LOCATION_REQUIRED') return messages.locationRequired;
  if (code === 'CONFLICT') return messages.selfAdmin;
  if (code === 'VALIDATION_ERROR') return messages.assignmentInvalid;
  if (code === 'FORBIDDEN') return messages.forbidden;
  return messages.network;
}

export function UserFormScreen({
  companyId,
  userId,
  chrome,
}: {
  companyId: string;
  userId?: string;
  chrome: 'platform' | 'app';
}) {
  const session = useGate(chrome);
  const router = useRouter();
  const { messages } = usePreferences();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [locations, setLocations] = useState<Branch[]>([]);
  const [existing, setExisting] = useState<CustomerUser | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [reset, setReset] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const roleCall = chrome === 'platform' ? listPlatformRoles(companyId) : listCustomerRoles();
      const locationCall = chrome === 'platform' ? listPlatformLocations(companyId) : listCustomerLocations();
      const userCall = !userId ? null : chrome === 'platform' ? getPlatformUser(companyId, userId) : getCustomerUser(userId);
      const companyCall = chrome === 'platform' ? getPlatformCompany(companyId) : null;
      const [roleResult, locationResult, userResult, companyResult] = await Promise.all([roleCall, locationCall, userCall, companyCall]);
      if (cancelled) return;
      if (companyResult && !companyResult.ok) {
        setMissing(companyResult.code === 'NOT_FOUND');
        setLoadError(companyResult.code === 'NOT_FOUND' ? '' : messages.network);
        setReady(true);
        return;
      }
      if (companyResult?.ok) setCompanyName(companyResult.company.name);
      if (!roleResult.ok || !locationResult.ok) {
        const code = !roleResult.ok ? roleResult.code : !locationResult.ok ? locationResult.code : '';
        setDenied(code === 'FORBIDDEN');
        setLoadError(code === 'FORBIDDEN' || code === 'CONFLICT' ? '' : messages.network);
        setReady(true);
        return;
      }
      if (userResult && !userResult.ok) {
        setMissing(userResult.code === 'NOT_FOUND');
        setDenied(userResult.code === 'FORBIDDEN');
        setLoadError(userResult.code === 'NOT_FOUND' || userResult.code === 'FORBIDDEN' ? '' : messages.network);
        setReady(true);
        return;
      }
      setRoles(roleResult.items);
      setLocations(locationResult.items);
      if (userResult?.ok) {
        setExisting(userResult.user);
        setName(userResult.user.name);
        setUsername(userResult.user.username);
        setEmail(userResult.user.email ?? '');
        setPhone(userResult.user.phone ?? '');
        setRoleId(userResult.user.role.id);
        setLocationId(userResult.user.location?.id ?? '');
        setStatus(userResult.user.status);
      }
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [chrome, companyId, messages.network, userId]);

  if (!session || !ready) return <p role="status">{messages.checking}</p>;
  if (!canManageUsers(session) || denied) return <p>{messages.forbidden}</p>;
  if (missing) return <p>{messages.notFound}</p>;
  if (chrome === 'app' && session.companyId !== companyId) return <p>{messages.forbidden}</p>;
  const broad = seesAllBranches(session);
  const choices = roles.filter((role) => broad || role.visibilityScope !== 'ALL_BRANCHES');
  const selected = choices.find((role) => role.id === roleId) ?? roles.find((role) => role.id === roleId);
  const needsLocation = selected ? selected.visibilityScope !== 'ALL_BRANCHES' : true;
  const chosenLocation = broad ? locationId : (session.locationId ?? locationId);
  const branchChoices = locations.filter((item) => {
    const visible = broad || item.id === session.locationId;
    const active = item.status === 'ACTIVE' || item.id === existing?.location?.id;
    return visible && active;
  });
  const self = Boolean(existing && session.actor === 'member' && session.userId === existing.id);
  const displayName = chrome === 'app' ? (session.companyName ?? '') : companyName;
  const base = chrome === 'platform' ? `/platform/companies/${companyId}/users` : '/app/users';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || saving) return;
    if (!name.trim() || !username.trim() || !roleId) {
      setError(messages.required);
      return;
    }
    if (!existing) {
      const issue = passwordIssue(password);
      if (!password) return setError(messages.required);
      if (issue) return setError(messages.passwordRules);
      if (password !== confirm) return setError(messages.passwordMismatch);
    }
    if (needsLocation && !chosenLocation) return setError(messages.locationRequired);
    setSaving(true);
    setError('');
    const input = {
      name: name.trim(),
      username: username.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      roleId,
      locationId: needsLocation ? chosenLocation : null,
    };
    const result = existing
      ? chrome === 'platform'
        ? await updatePlatformUser(companyId, existing.id, { ...input, status })
        : await updateCustomerUser(existing.id, { ...input, status })
      : chrome === 'platform'
        ? await createPlatformUser(companyId, { ...input, password })
        : await createCustomerUser({ ...input, password });
    setSaving(false);
    if (!result.ok) {
      setError(userError(result.code, messages));
      return;
    }
    router.push(base);
  }

  async function resetPassword() {
    if (!existing || self || saving) return;
    const issue = passwordIssue(reset);
    if (issue) return setError(messages.passwordRules);
    if (reset !== resetConfirm) return setError(messages.passwordMismatch);
    setSaving(true);
    setError('');
    const result = chrome === 'platform'
      ? await resetPlatformPassword(companyId, existing.id, reset)
      : await resetCustomerPassword(existing.id, reset);
    setSaving(false);
    if (!result.ok) {
      setError(result.code === 'VALIDATION_ERROR' ? messages.passwordRules : userError(result.code, messages));
      return;
    }
    setReset('');
    setResetConfirm('');
    setNotice(messages.passwordSaved);
  }

  return (
    <OrgFrame chrome={chrome} session={session} companyId={companyId}>
      <PageHeader
        title={existing ? messages.editUser : messages.newUser}
        crumbs={crumbs(chrome, displayName, messages.usersTitle, messages)}
      />
      {loadError ? <InlineAlert message={loadError} /> : null}
      {self ? <InlineAlert tone="info" message={messages.selfAdmin} /> : null}
      {!loadError ? (
        <form className="stack-form" onSubmit={onSubmit} noValidate>
          <FormField id="user-name" label={messages.name} required error={error}>
            <input id="user-name" value={name} disabled={saving} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <FormField id="user-username" label={messages.username} required>
            <input id="user-username" value={username} disabled={saving} onChange={(event) => setUsername(event.target.value)} />
          </FormField>
          {!existing ? (
            <>
              <PasswordField id="user-pass" label={messages.password} value={password} onChange={setPassword} autoComplete="new-password" />
              <p className="field-hint">{messages.passwordRules}</p>
              <PasswordField id="user-confirm" label={messages.confirmPassword} value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </>
          ) : null}
          <FormField id="user-email" label={messages.email} optional hint={messages.optional}>
            <input id="user-email" value={email} disabled={saving} onChange={(event) => setEmail(event.target.value)} />
          </FormField>
          <FormField id="user-phone" label={messages.phone} optional>
            <input id="user-phone" value={phone} disabled={saving} onChange={(event) => setPhone(event.target.value)} />
          </FormField>
          <FormField id="user-role" label={messages.role} required>
            <select id="user-role" value={roleId} disabled={saving || self} onChange={(event) => setRoleId(event.target.value)}>
              <option value="">{messages.role}</option>
              {choices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
          {needsLocation ? (
            <FormField id="user-branch" label={messages.branch} required>
              <select id="user-branch" value={chosenLocation} disabled={saving || self || !broad} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">{messages.branch}</option>
                {branchChoices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
          {existing ? (
            <FormField id="user-status" label={messages.status}>
              <select id="user-status" value={status} disabled={saving || self} onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'INACTIVE')}>
                <option value="ACTIVE">{messages.active}</option>
                <option value="INACTIVE">{messages.inactiveStatus}</option>
              </select>
            </FormField>
          ) : null}
          {notice ? <InlineAlert tone="success" message={notice} /> : null}
          <PrimaryButton disabled={saving}>{saving ? messages.saving : messages.save}</PrimaryButton>
        </form>
      ) : null}
      {existing && !self && !loadError ? (
        <section className="danger-zone">
          <h2>{messages.resetPassword}</h2>
          <PasswordField id="reset-pass" label={messages.newPassword} value={reset} onChange={setReset} autoComplete="new-password" />
          <PasswordField id="reset-confirm" label={messages.confirmPassword} value={resetConfirm} onChange={setResetConfirm} autoComplete="new-password" />
          <p className="field-hint">{messages.passwordRules}</p>
          <button type="button" className="secondary-button" disabled={saving} onClick={() => void resetPassword()}>
            {messages.resetPassword}
          </button>
        </section>
      ) : null}
    </OrgFrame>
  );
}

export function RolesScreen({ companyId, chrome }: { companyId: string; chrome: 'platform' | 'app' }) {
  const session = useGate(chrome);
  const { messages } = usePreferences();
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (chrome === 'platform') {
        const [company, listed] = await Promise.all([getPlatformCompany(companyId), listPlatformRoles(companyId)]);
        if (cancelled) return;
        if (!company.ok || !listed.ok) {
          const code = !company.ok ? company.code : listed.ok ? '' : listed.code;
          setMissing(code === 'NOT_FOUND');
          setLoadError(code === 'NOT_FOUND' ? '' : messages.network);
          setReady(true);
          return;
        }
        setCompanyName(company.company.name);
        setRoles(listed.items);
        setReady(true);
        return;
      }
      const listed = await listCustomerRoles();
      if (cancelled) return;
      if (!listed.ok) {
        setDenied(listed.code === 'FORBIDDEN');
        setMissing(listed.code === 'NOT_FOUND');
        setLoadError(
          listed.code === 'CONFLICT'
            ? messages.pendingAreas
            : listed.code === 'FORBIDDEN' || listed.code === 'NOT_FOUND'
              ? ''
              : messages.network,
        );
        setReady(true);
        return;
      }
      setRoles(listed.items);
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [chrome, companyId, messages.network, messages.pendingAreas]);

  if (!session || !ready) return <p role="status">{messages.checking}</p>;
  if (!canSeeRoles(session) || denied) return <p>{messages.forbidden}</p>;
  if (missing) return <p>{messages.notFound}</p>;
  if (chrome === 'app' && session.companyId !== companyId) return <p>{messages.forbidden}</p>;
  const displayName = chrome === 'app' ? (session.companyName ?? '') : companyName;
  const base = chrome === 'platform' ? `/platform/companies/${companyId}/roles` : '/app/roles';
  return (
    <OrgFrame chrome={chrome} session={session} companyId={companyId}>
      <PageHeader
        title={messages.rolesTitle}
        crumbs={crumbs(chrome, displayName, messages.rolesTitle, messages)}
        actions={
          canEditRoles(session) ? (
            <Link className="primary-button link-button" href={`${base}/new`}>
              {messages.newRole}
            </Link>
          ) : null
        }
      />
      {loadError ? <InlineAlert message={loadError} /> : null}
      {!loadError && roles.length === 0 ? <EmptyState text={messages.empty} /> : null}
      {!loadError && roles.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{messages.name}</th>
                <th>{messages.roleKey}</th>
                <th>{messages.yourScope}</th>
                <th>{messages.manageUsersFlag}</th>
                <th>{messages.open}</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td>{role.name}</td>
                  <td>{role.key}</td>
                  <td>{role.visibilityScope === 'ALL_BRANCHES' ? messages.scopeAll : role.visibilityScope === 'BRANCH' ? messages.scopeBranch : messages.scopeOwn}</td>
                  <td>{role.canManageUsers ? messages.confirm : messages.none}</td>
                  <td>
                    <Link href={`${base}/${role.id}`}>{canEditRoles(session) ? messages.edit : messages.open}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </OrgFrame>
  );
}

export function RoleFormScreen({
  companyId,
  roleId,
  chrome,
}: {
  companyId: string;
  roleId?: string;
  chrome: 'platform' | 'app';
}) {
  const session = useGate(chrome);
  const router = useRouter();
  const { messages } = usePreferences();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [scope, setScope] = useState<VisibilityScope>('BRANCH');
  const [manage, setManage] = useState(false);
  const [editApproval, setEditApproval] = useState(false);
  const [deleteApproval, setDeleteApproval] = useState(false);
  const [existing, setExisting] = useState<CompanyRole | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (chrome === 'platform') {
        const company = await getPlatformCompany(companyId);
        if (cancelled) return;
        if (!company.ok) {
          setMissing(company.code === 'NOT_FOUND');
          setLoadError(company.code === 'NOT_FOUND' ? '' : messages.network);
          setReady(true);
          return;
        }
        setCompanyName(company.company.name);
      }
      if (!roleId) {
        setReady(true);
        return;
      }
      const listed = chrome === 'platform' ? await listPlatformRoles(companyId) : await listCustomerRoles();
      if (cancelled) return;
      if (!listed.ok) {
        setMissing(listed.code === 'NOT_FOUND' || listed.code === 'FORBIDDEN');
        setLoadError(listed.code === 'NOT_FOUND' || listed.code === 'FORBIDDEN' || listed.code === 'CONFLICT' ? '' : messages.network);
        setReady(true);
        return;
      }
      const found = listed.items.find((item) => item.id === roleId) ?? null;
      setExisting(found);
      setMissing(!found);
      if (found) {
        setName(found.name);
        setKey(found.key);
        setScope(found.visibilityScope);
        setManage(found.canManageUsers);
        setEditApproval(found.editRequiresApproval);
        setDeleteApproval(found.deleteRequiresApproval);
      }
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [chrome, companyId, messages.network, roleId]);

  if (!session || !ready) return <p role="status">{messages.checking}</p>;
  const writable = canEditRoles(session);
  if (chrome === 'app' && session.companyId !== companyId) return <p>{messages.forbidden}</p>;
  const displayName = chrome === 'app' ? (session.companyName ?? '') : companyName;
  const base = chrome === 'platform' ? `/platform/companies/${companyId}/roles` : '/app/roles';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !writable || saving) return;
    if (!name.trim()) return setError(messages.required);
    const normalized = key.trim().toUpperCase();
    if (roleKeyIssue(normalized)) return setError(messages.roleKeyInvalid);
    setSaving(true);
    setError('');
    const input = {
      name: name.trim(),
      key: normalized,
      visibilityScope: scope,
      canManageUsers: manage,
      editRequiresApproval: editApproval,
      deleteRequiresApproval: deleteApproval,
    };
    const result = existing
      ? await updatePlatformRole(companyId, existing.id, input)
      : await createPlatformRole(companyId, input);
    setSaving(false);
    if (!result.ok) {
      if (result.code === 'KEY_TAKEN') setError(messages.keyTaken);
      else if (result.code === 'CONFLICT') setError(messages.scopeConflict);
      else if (result.code === 'VALIDATION_ERROR') setError(messages.roleKeyInvalid);
      else setError(messages.network);
      return;
    }
    router.push(base);
  }

  const blocked = !loadError && (missing || (!writable && !existing));
  return (
    <OrgFrame chrome={chrome} session={session} companyId={companyId}>
      <PageHeader
        title={existing ? (writable ? messages.editRole : messages.rolesTitle) : messages.newRole}
        crumbs={crumbs(chrome, displayName, messages.rolesTitle, messages)}
      />
      {loadError ? <InlineAlert message={loadError} /> : null}
      {blocked ? <p>{missing ? messages.notFound : messages.forbidden}</p> : null}
      {!loadError && !missing && (existing || writable) ? (
        <>
          {!writable ? <InlineAlert tone="info" message={messages.rolesReadOnly} /> : null}
          <form className="stack-form" onSubmit={onSubmit} noValidate>
            <FormField id="role-name" label={messages.name} required error={error}>
              <input id="role-name" value={name} disabled={!writable || saving} onChange={(event) => setName(event.target.value)} />
            </FormField>
            <FormField id="role-key" label={messages.roleKey} required hint={messages.roleKeyHint}>
              <input id="role-key" value={key} disabled={!writable || saving} onChange={(event) => setKey(event.target.value.toUpperCase())} />
            </FormField>
            <fieldset disabled={!writable || saving}>
              <legend>{messages.yourScope}</legend>
              {(['OWN', 'BRANCH', 'ALL_BRANCHES'] as VisibilityScope[]).map((value) => (
                <label key={value} className="choice">
                  <input type="radio" name="scope" checked={scope === value} onChange={() => setScope(value)} />
                  <span>{value === 'ALL_BRANCHES' ? messages.scopeAll : value === 'BRANCH' ? messages.scopeBranch : messages.scopeOwn}</span>
                </label>
              ))}
              <label className="choice">
                <input type="checkbox" checked={manage} onChange={(event) => setManage(event.target.checked)} />
                <span>{messages.manageUsersFlag}</span>
              </label>
              <label className="choice">
                <input type="checkbox" checked={editApproval} onChange={(event) => setEditApproval(event.target.checked)} />
                <span>{messages.editApproval}</span>
              </label>
              <label className="choice">
                <input type="checkbox" checked={deleteApproval} onChange={(event) => setDeleteApproval(event.target.checked)} />
                <span>{messages.deleteApproval}</span>
              </label>
              <p className="field-hint">{messages.approvalHint}</p>
            </fieldset>
            {writable ? <PrimaryButton disabled={saving}>{saving ? messages.saving : messages.save}</PrimaryButton> : null}
          </form>
        </>
      ) : null}
    </OrgFrame>
  );
}

export function CustomerDashboard() {
  const session = useGate('app');
  const { messages } = usePreferences();
  const appItems = useAppItems(session, session?.companyId ?? null);
  const [branchCount, setBranchCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!session?.companyId) return;
    let cancelled = false;
    void listCustomerLocations().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.code === 'CONFLICT' ? messages.pendingAreas : messages.network);
        setBranchCount(null);
        return;
      }
      setLoadError('');
      setBranchCount(result.items.length);
    });
    return () => {
      cancelled = true;
    };
  }, [messages.network, messages.pendingAreas, session?.companyId]);

  useEffect(() => {
    if (!session?.companyId || !session.canManageUsers) return;
    let cancelled = false;
    void listCustomerUsers({ page: 1 }).then((result) => {
      if (cancelled || !result.ok) return;
      setUserCount(result.list.total);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.canManageUsers, session?.companyId]);

  if (!session) return <p role="status">{messages.checking}</p>;
  if (!session.companyId) return <p className="field-hint">{messages.pendingAreas}</p>;
  const items = appItems;
  const scope =
    session.visibility === 'PLATFORM' || session.visibility === 'ALL_BRANCHES'
      ? messages.scopeAll
      : session.visibility === 'BRANCH'
        ? messages.scopeBranch
        : messages.scopeOwn;
  return (
    <AppShell session={session} items={items}>
      <PageHeader title={messages.welcome} />
      <p>
        {session.companyName}
        {session.roleName ? ` — ${messages.yourRole}: ${session.roleName}` : ''}
        {` — ${messages.yourScope}: ${scope}`}
      </p>
      {loadError ? <InlineAlert message={loadError} /> : null}
      <div className="stat-row">
        <Link className="stat-link" href="/app/branches">
          <strong>{branchCount === null ? '…' : branchCount}</strong>
          <span>{messages.countsBranches}</span>
        </Link>
        {session.canManageUsers ? (
          <Link className="stat-link" href="/app/users">
            <strong>{userCount === null ? '…' : userCount}</strong>
            <span>{messages.countsUsers}</span>
          </Link>
        ) : null}
      </div>
    </AppShell>
  );
}

export function ModulesOverviewScreen() {
  const session = useGate('app');
  const { messages } = usePreferences();
  const items = useAppItems(session, session?.companyId ?? null);
  const [enabled, setEnabled] = useState<ModuleKey[] | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void listSessionModules().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setEnabled([]);
        setNotice(result.code === 'CONFLICT' ? messages.pendingAreas : messages.network);
        return;
      }
      setNotice('');
      setEnabled(result.items.filter((item) => item.enabled).map((item) => item.key));
    });
    return () => {
      cancelled = true;
    };
  }, [messages.network, messages.pendingAreas, session]);

  if (!session || enabled === null) return <p role="status">{messages.checking}</p>;
  return (
    <AppShell session={session} items={items}>
      <PageHeader title={messages.modulesOverview} />
      {notice ? <p className="field-hint">{notice}</p> : null}
      {!notice && enabled.length === 0 ? <EmptyState text={messages.noModules} /> : null}
      {!notice && enabled.length > 0 ? (
        <ul className="module-list">
          {enabled.map((key) => (
            <li key={key}>
              <Link href={`/app/modules/${key}`}>
                {moduleLabel(key, messages)}
                <small>{messages.notReadyYet}</small>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </AppShell>
  );
}

export function ModulePlaceholderScreen({ moduleKey }: { moduleKey: string }) {
  const session = useGate('app');
  const { messages } = usePreferences();
  const items = useAppItems(session, session?.companyId ?? null);
  const [view, setView] = useState<'loading' | 'unavailable' | 'unknown' | 'conflict' | 'network' | 'placeholder'>('loading');

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void getSessionModule(moduleKey).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setView('placeholder');
        return;
      }
      if (result.code === 'FORBIDDEN') setView('unavailable');
      else if (result.code === 'NOT_FOUND') setView('unknown');
      else if (result.code === 'CONFLICT') setView('conflict');
      else setView('network');
    });
    return () => {
      cancelled = true;
    };
  }, [moduleKey, session]);

  if (!session || view === 'loading') return <p role="status">{messages.checking}</p>;
  return (
    <AppShell session={session} items={items}>
      {view === 'unknown' ? <p>{messages.unknownSection}</p> : null}
      {view === 'unavailable' ? <p>{messages.moduleUnavailable}</p> : null}
      {view === 'conflict' ? <p className="field-hint">{messages.pendingAreas}</p> : null}
      {view === 'network' ? <InlineAlert message={messages.network} /> : null}
      {view === 'placeholder' ? (
        <>
          <PageHeader title={moduleLabel(moduleKey, messages)} />
          <EmptyState
            text={messages.placeholderTitle}
            action={<Link href="/app">{messages.backDashboard}</Link>}
          />
          <p className="field-hint">{messages.placeholderBody}</p>
        </>
      ) : null}
    </AppShell>
  );
}

export function AccountScreen() {
  const router = useRouter();
  const { messages, lang, theme, setLang, setTheme } = usePreferences();
  const [session, setSession] = useState<AppSession | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'danger' | 'success'>('success');
  const items = useAppItems(session, session?.companyId ?? null);

  useEffect(() => {
    let cancelled = false;
    loadSession().then((currentSession) => {
      if (cancelled) return;
      if (!currentSession) {
        router.replace('/login/platform');
        return;
      }
      setSession(currentSession);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!session) return <p role="status">{messages.checking}</p>;
  const body = (
    <>
      <PageHeader title={messages.accountTitle} />
      <fieldset>
        <legend>{messages.languageLabel}</legend>
        <div className="choice-row">
          <button type="button" className="secondary-button" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')}>
            {messages.arabic}
          </button>
          <button type="button" className="secondary-button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            {messages.english}
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>{messages.appearance}</legend>
        <div className="choice-row">
          <button type="button" className="secondary-button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
            {messages.dayMode}
          </button>
          <button type="button" className="secondary-button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
            {messages.nightMode}
          </button>
        </div>
      </fieldset>
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (session.actor !== 'member' && session.actor !== 'platform') return;
          if (next !== confirm) {
            setTone('danger');
            setMessage(messages.passwordMismatch);
            return;
          }
          const issue = passwordIssue(next);
          if (issue) {
            setTone('danger');
            setMessage(issue === 'short' ? messages.passwordShort : messages.passwordWeak);
            return;
          }
          void changeOwnPassword(current, next).then((result) => {
            if (!result.ok) {
              setTone('danger');
              setMessage(result.code === 'VALIDATION_ERROR' ? messages.passwordWeak : messages.wrongCredentials);
              return;
            }
            router.replace(session.actor === 'platform' ? '/login/platform' : '/login');
          });
        }}
      >
        <h2>{messages.changePassword}</h2>
        <PasswordField id="current-pass" label={messages.currentPassword} value={current} onChange={setCurrent} />
        <PasswordField id="next-pass" label={messages.newPassword} value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField id="confirm-pass" label={messages.confirmPassword} value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <p className="field-hint">{messages.passwordRules}</p>
        {message ? <InlineAlert tone={tone} message={message} /> : null}
        <PrimaryButton>{messages.save}</PrimaryButton>
      </form>
    </>
  );
  if (session.actor === 'member' && session.companyId) {
    return (
      <AppShell session={session} items={items}>
        {body}
      </AppShell>
    );
  }
  return <PlatformShell session={session}>{body}</PlatformShell>;
}
