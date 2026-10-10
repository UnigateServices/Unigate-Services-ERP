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
import {
  assignableRoles,
  canCreateBranch,
  canEditRoles,
  canManageUsers,
  canSeeRoles,
  locationLocked,
  seesAllBranches,
} from '@/lib/permissions';
import { usePreferences } from '@/lib/preferences';
import { changeOwnPassword, loadSession } from '@/lib/session';
import { useGate } from '@/lib/use-gate';
import {
  createRole,
  createUser,
  getRole,
  getUserRow,
  listLocations,
  listModules,
  listRoles,
  listUsers,
  passwordIssue,
  resetUserPassword,
  roleKeyIssue,
  updateRole,
  updateUser,
} from '@/services/directory';
import { getPlatformCompany } from '@/services/platform-companies';
import {
  createPlatformLocation,
  listCustomerLocations,
  listPlatformLocations,
  updatePlatformLocation,
  type Branch,
} from '@/services/locations';
import type { AppSession, ModuleKey, VisibilityScope } from '@/types/auth';
import { MODULE_KEYS } from '@/types/auth';

function actorOf(session: AppSession) {
  return session.actor === 'platform' ? { id: session.userId, name: session.name } : null;
}

function appNav(session: AppSession, enabled: ModuleKey[], messages: ReturnType<typeof usePreferences>['messages']) {
  const items = [{ href: '/app', label: messages.welcome }];
  items.push({ href: '/app/branches', label: messages.navBranches });
  if (canManageUsers(session)) items.push({ href: '/app/users', label: messages.navUsers });
  if (canSeeRoles(session)) items.push({ href: '/app/roles', label: messages.navRoles });
  items.push({ href: '/app/modules', label: messages.navModules });
  for (const key of enabled) items.push({ href: `/app/modules/${key}`, label: moduleLabel(key, messages) });
  return items;
}

export function useAppItems(session: AppSession | null, companyId: string | null) {
  const { messages } = usePreferences();
  if (!session || !companyId) return [{ href: '/app', label: messages.welcome }];
  const enabled = listModules(companyId)
    .filter((item) => item.enabled)
    .map((item) => item.moduleKey);
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
  const { messages } = usePreferences();
  const appItems = useAppItems(session, companyId);
  if (chrome === 'platform') return <PlatformShell session={session}>{children}</PlatformShell>;
  const items =
    session.actor === 'platform'
      ? [
          { href: '/platform', label: messages.navDashboard },
          { href: '/platform/companies', label: messages.navCompanies },
          { href: '/app/branches', label: messages.navBranches },
        ]
      : appItems;
  return (
    <AppShell session={session} items={items}>
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
  if (!session) return <p role="status">{messages.checking}</p>;
  if (!canManageUsers(session)) return <p>{messages.forbidden}</p>;
  const rows = listUsers(companyId).filter((user) => {
    const inScope =
      seesAllBranches(session) || session.visibility === 'PLATFORM' || user.locationId === session.locationId;
    return inScope && user.name.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase());
  });
  const view = pageOf(rows, page);
  const base = chrome === 'platform' ? `/platform/companies/${companyId}/users` : '/app/users';
  return (
    <OrgFrame chrome={chrome} session={session} companyId={companyId}>
      <PageHeader
        title={messages.usersTitle}
        actions={
          <Link className="primary-button link-button" href={`${base}/new`}>
            {messages.newUser}
          </Link>
        }
      />
      <div className="filters">
        <label>
          {messages.search}
          <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} />
        </label>
      </div>
      {rows.length === 0 ? (
        <EmptyState text={q ? messages.noResults : messages.empty} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{messages.name}</th>
                <th>{messages.role}</th>
                <th>{messages.branch}</th>
                <th>{messages.status}</th>
                <th>{messages.edit}</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((user) => (
                <tr key={user.userId}>
                  <td>{user.name}</td>
                  <td>{user.roleName}</td>
                  <td>{user.locationName || messages.allBranches}</td>
                  <td>
                    <StatusBadge status={user.status} />
                  </td>
                  <td>
                    <Link href={`${base}/${user.userId}`}>{messages.edit}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={view.page} pages={view.pages} onPage={setPage} />
    </OrgFrame>
  );
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
  const existing = userId ? getUserRow(companyId, userId) : null;
  const roles = session ? assignableRoles(session, listRoles(companyId)) : [];
  const locations = listLocations(companyId).filter((item) => item.status === 'ACTIVE' || item.id === existing?.locationId);
  const [name, setName] = useState(existing?.name ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [roleId, setRoleId] = useState(existing?.roleId ?? roles[0]?.id ?? '');
  const [locationId, setLocationId] = useState(existing?.locationId ?? '');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(existing?.status ?? 'ACTIVE');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [reset, setReset] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [askRole, setAskRole] = useState(false);
  const [askStop, setAskStop] = useState(false);
  if (!session) return <p role="status">{messages.checking}</p>;
  if (!canManageUsers(session)) return <p>{messages.forbidden}</p>;
  const role = roles.find((item) => item.id === roleId) ?? listRoles(companyId).find((item) => item.id === roleId);
  const needsLocation = role ? role.visibilityScope !== 'ALL_BRANCHES' : true;
  const locked = locationLocked(session);
  const base = chrome === 'platform' ? `/platform/companies/${companyId}/users` : '/app/users';

  function save(forceRole: boolean) {
    if (!session) return;
    if (!name.trim()) {
      setError(messages.required);
      return;
    }
    if (!existing) {
      const issue = passwordIssue(password);
      if (!password) {
        setError(messages.required);
        return;
      }
      if (issue === 'short') {
        setError(messages.passwordShort);
        return;
      }
      if (issue === 'weak') {
        setError(messages.passwordWeak);
        return;
      }
      if (password !== confirm) {
        setError(messages.passwordMismatch);
        return;
      }
    }
    if (existing && existing.roleId !== roleId && !forceRole) {
      setAskRole(true);
      return;
    }
    if (needsLocation && !locationId && !locked) {
      setError(messages.locationRequired);
      return;
    }
    const chosenLocation = locked ? session.locationId : needsLocation ? locationId : null;
    const result = existing
      ? updateUser(
          companyId,
          existing.userId,
          { name, email, phone, status, roleId, locationId: chosenLocation },
          actorOf(session),
        )
      : createUser(
          companyId,
          { name, password, email, phone, roleId, locationId: chosenLocation },
          actorOf(session),
        );
    if (!result.ok) {
      setError(result.code === 'NAME_TAKEN' ? messages.nameTaken : result.code === 'LOCATION_REQUIRED' ? messages.locationRequired : messages.network);
      return;
    }
    if (!result.financeAccess) setWarning(messages.financeWarning);
    else router.push(base);
  }

  return (
    <OrgFrame chrome={chrome} session={session} companyId={companyId}>
      <PageHeader title={existing ? messages.editUser : messages.newUser} />
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          save(false);
        }}
        noValidate
      >
        <FormField id="user-name" label={messages.username} required error={error}>
          <input id="user-name" value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        {!existing ? (
          <>
            <PasswordField id="user-pass" label={messages.password} value={password} onChange={setPassword} autoComplete="new-password" />
            <p className="field-hint">{messages.passwordRules}</p>
            <PasswordField id="user-confirm" label={messages.confirmPassword} value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </>
        ) : null}
        <FormField id="user-email" label={messages.email} optional hint={messages.optional}>
          <input id="user-email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
        <FormField id="user-phone" label={messages.phone} optional>
          <input id="user-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </FormField>
        <FormField id="user-role" label={messages.role} required>
          <select id="user-role" value={roleId} onChange={(event) => setRoleId(event.target.value)}>
            {roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </FormField>
        {needsLocation ? (
          <FormField id="user-branch" label={messages.branch} required>
            <select
              id="user-branch"
              value={locked ? session.locationId ?? '' : locationId}
              disabled={locked}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">{messages.branch}</option>
              {locations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
        {existing ? (
          <FormField id="user-status" label={messages.status}>
            <select id="user-status" value={status} onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'INACTIVE')}>
              <option value="ACTIVE">{messages.active}</option>
              <option value="INACTIVE">{messages.inactiveStatus}</option>
            </select>
          </FormField>
        ) : null}
        {warning ? <InlineAlert tone="info" message={warning} /> : null}
        <PrimaryButton>{messages.save}</PrimaryButton>
      </form>
      {existing ? (
        <section className="danger-zone">
          <h2>{messages.resetPassword}</h2>
          <PasswordField id="reset-pass" label={messages.newPassword} value={reset} onChange={setReset} autoComplete="new-password" />
          <PasswordField id="reset-confirm" label={messages.confirmPassword} value={resetConfirm} onChange={setResetConfirm} autoComplete="new-password" />
          <p className="field-hint">{messages.passwordRules}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const issue = passwordIssue(reset);
              if (issue === 'short') return setError(messages.passwordShort);
              if (issue === 'weak') return setError(messages.passwordWeak);
              if (reset !== resetConfirm) return setError(messages.passwordMismatch);
              resetUserPassword(companyId, existing.userId, reset, actorOf(session));
              setReset('');
              setResetConfirm('');
              setError('');
              setWarning(messages.passwordSaved);
            }}
          >
            {messages.resetPassword}
          </button>
          {status === 'INACTIVE' ? null : (
            <button type="button" className="danger-button" onClick={() => setAskStop(true)}>
              {messages.deactivate}
            </button>
          )}
        </section>
      ) : null}
      <ConfirmDialog
        open={askRole}
        title={messages.role}
        body={messages.roleChangeBody}
        confirmLabel={messages.confirm}
        onClose={() => setAskRole(false)}
        onConfirm={() => {
          setAskRole(false);
          save(true);
        }}
      />
      <ConfirmDialog
        open={askStop}
        title={messages.deactivate}
        body={messages.deactivateUserBody}
        confirmLabel={messages.deactivate}
        onClose={() => setAskStop(false)}
        onConfirm={() => {
          if (!existing) return;
          updateUser(
            companyId,
            existing.userId,
            { name, email, phone, status: 'INACTIVE', roleId, locationId: needsLocation ? locationId || session.locationId : null },
            actorOf(session),
          );
          setAskStop(false);
          router.push(base);
        }}
      />
    </OrgFrame>
  );
}

export function RolesScreen({ companyId, chrome }: { companyId: string; chrome: 'platform' | 'app' }) {
  const session = useGate(chrome);
  const { messages } = usePreferences();
  if (!session) return <p role="status">{messages.checking}</p>;
  if (!canSeeRoles(session)) return <p>{messages.forbidden}</p>;
  const roles = listRoles(companyId);
  const base = chrome === 'platform' ? `/platform/companies/${companyId}/roles` : '/app/roles';
  return (
    <OrgFrame chrome={chrome} session={session} companyId={companyId}>
      <PageHeader
        title={messages.rolesTitle}
        actions={
          canEditRoles(session) ? (
            <Link className="primary-button link-button" href={`${base}/new`}>
              {messages.newRole}
            </Link>
          ) : null
        }
      />
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
  const existing = roleId ? getRole(roleId) : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [key, setKey] = useState(existing?.key ?? '');
  const [scope, setScope] = useState<VisibilityScope>(existing?.visibilityScope ?? 'BRANCH');
  const [manage, setManage] = useState(existing?.canManageUsers ?? false);
  const [editApproval, setEditApproval] = useState(existing?.editRequiresApproval ?? false);
  const [deleteApproval, setDeleteApproval] = useState(existing?.deleteRequiresApproval ?? false);
  const [error, setError] = useState('');
  if (!session) return <p role="status">{messages.checking}</p>;
  const writable = canEditRoles(session);
  if (!writable && !existing) return <p>{messages.forbidden}</p>;
  const base = chrome === 'platform' ? `/platform/companies/${companyId}/roles` : '/app/roles';

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !writable) return;
    if (!name.trim()) return setError(messages.required);
    const normalized = key.trim().toUpperCase();
    if (roleKeyIssue(normalized)) return setError(messages.roleKeyInvalid);
    const actor = actorOf(session);
    if (!actor) return;
    const payload = {
      name,
      key: normalized,
      visibilityScope: scope,
      canManageUsers: manage,
      editRequiresApproval: editApproval,
      deleteRequiresApproval: deleteApproval,
    };
    const result = existing ? updateRole(existing.id, payload, actor) : createRole(companyId, payload, actor);
    if (!result.ok) {
      setError(result.code === 'KEY_TAKEN' ? messages.keyTaken : messages.network);
      return;
    }
    router.push(base);
  }

  return (
    <OrgFrame chrome={chrome} session={session} companyId={companyId}>
      <PageHeader title={existing ? messages.editRole : messages.newRole} />
      {!writable ? <InlineAlert tone="info" message={messages.rolesReadOnly} /> : null}
      <form className="stack-form" onSubmit={onSubmit} noValidate>
        <FormField id="role-name" label={messages.name} required error={error}>
          <input id="role-name" value={name} disabled={!writable} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField id="role-key" label={messages.roleKey} required hint={messages.roleKeyHint}>
          <input id="role-key" value={key} disabled={!writable} onChange={(event) => setKey(event.target.value.toUpperCase())} />
        </FormField>
        <fieldset disabled={!writable}>
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
        {writable ? <PrimaryButton>{messages.save}</PrimaryButton> : null}
      </form>
    </OrgFrame>
  );
}

export function CustomerDashboard() {
  const session = useGate('app');
  const { messages } = usePreferences();
  const appItems = useAppItems(session, session?.companyId ?? null);
  const [branchCount, setBranchCount] = useState<number | null>(null);
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

  if (!session) return <p role="status">{messages.checking}</p>;
  if (!session.companyId) return <p className="field-hint">{messages.pendingAreas}</p>;
  const items =
    session.actor === 'platform'
      ? [
          { href: '/platform', label: messages.navDashboard },
          { href: '/platform/companies', label: messages.navCompanies },
          { href: '/app/branches', label: messages.navBranches },
        ]
      : appItems;
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
          <div className="stat-link">
            <strong>{messages.countsUsersLater}</strong>
            <span>{messages.countsUsers}</span>
          </div>
        ) : null}
      </div>
      <p className="field-hint">{messages.pendingAreas}</p>
    </AppShell>
  );
}

export function ModulesOverviewScreen() {
  const session = useGate('app');
  const { messages } = usePreferences();
  const items = useAppItems(session, session?.companyId ?? null);
  if (!session?.companyId) return <p role="status">{messages.checking}</p>;
  const enabled = listModules(session.companyId).filter((item) => item.enabled);
  return (
    <AppShell session={session} items={items}>
      <PageHeader title={messages.modulesOverview} />
      {enabled.length === 0 ? (
        <EmptyState text={messages.noModules} />
      ) : (
        <ul className="module-list">
          {enabled.map((item) => (
            <li key={item.moduleKey}>
              <Link href={`/app/modules/${item.moduleKey}`}>
                {moduleLabel(item.moduleKey, messages)}
                <small>{messages.notReadyYet}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

export function ModulePlaceholderScreen({ moduleKey }: { moduleKey: string }) {
  const session = useGate('app');
  const { messages } = usePreferences();
  const items = useAppItems(session, session?.companyId ?? null);
  if (!session?.companyId) return <p role="status">{messages.checking}</p>;
  const known = (MODULE_KEYS as readonly string[]).includes(moduleKey);
  const row = listModules(session.companyId).find((item) => item.moduleKey === moduleKey);
  return (
    <AppShell session={session} items={items}>
      {!known ? <p>{messages.unknownSection}</p> : null}
      {known && !row?.enabled ? <p>{messages.forbidden}</p> : null}
      {known && row?.enabled ? (
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
