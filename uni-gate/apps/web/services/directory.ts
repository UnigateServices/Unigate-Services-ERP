import { createId, loadDb, saveDb } from '@/mocks/db';
import { isPastDate } from '@/lib/dates';
import type {
  AppSession,
  AuditAction,
  Company,
  CompanyModule,
  ModuleKey,
  Role,
  RolePreset,
  VisibilityScope,
} from '@/types/auth';
import { FINANCE_ROLE_KEYS, MODULE_KEYS } from '@/types/auth';

export type ActorRef = { id: string; name: string };

export type ServiceFail = { ok: false; code: string };

function fail(code: string): ServiceFail {
  return { ok: false, code };
}

function audit(
  db: ReturnType<typeof loadDb>,
  actor: ActorRef | null,
  companyId: string,
  action: AuditAction,
  targetType: string,
  targetId: string,
) {
  if (!actor) return;
  db.audit.unshift({
    id: createId('aud'),
    actorUserId: actor.id,
    actorName: actor.name,
    companyId,
    action,
    targetType,
    targetId,
    createdAt: new Date().toISOString(),
  });
}

function roleTemplates(companyId: string, preset: RolePreset): Role[] {
  if (preset === 'tradivia') {
    return [
      { id: createId('role'), companyId, key: 'GENERAL_MANAGER', name: 'مدير عام', canManageUsers: true, visibilityScope: 'ALL_BRANCHES', editRequiresApproval: false, deleteRequiresApproval: false },
      { id: createId('role'), companyId, key: 'MONITOR', name: 'مراقب', canManageUsers: false, visibilityScope: 'ALL_BRANCHES', editRequiresApproval: false, deleteRequiresApproval: false },
      { id: createId('role'), companyId, key: 'SUPERVISOR', name: 'مشرف', canManageUsers: true, visibilityScope: 'BRANCH', editRequiresApproval: false, deleteRequiresApproval: false },
      { id: createId('role'), companyId, key: 'EMPLOYEE', name: 'موظف', canManageUsers: false, visibilityScope: 'OWN', editRequiresApproval: true, deleteRequiresApproval: true },
    ];
  }
  return [
    { id: createId('role'), companyId, key: 'OWNER', name: 'مالك', canManageUsers: true, visibilityScope: 'ALL_BRANCHES', editRequiresApproval: false, deleteRequiresApproval: false },
    { id: createId('role'), companyId, key: 'STAFF', name: 'موظف', canManageUsers: false, visibilityScope: 'BRANCH', editRequiresApproval: true, deleteRequiresApproval: true },
  ];
}

export function listCompanies(query: { q?: string; status?: '' | 'ACTIVE' | 'SUSPENDED' }) {
  const q = (query.q ?? '').trim().toLocaleLowerCase();
  return loadDb()
    .companies.filter((company) => {
      const matchesStatus = !query.status || company.status === query.status;
      const matchesQuery =
        !q || company.name.toLocaleLowerCase().includes(q) || company.code.includes(q);
      return matchesStatus && matchesQuery;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function countCompanies(status: 'ACTIVE' | 'SUSPENDED') {
  return loadDb().companies.filter((company) => company.status === status).length;
}

export function getCompany(id: string) {
  return loadDb().companies.find((company) => company.id === id) ?? null;
}

export function companyCounts(companyId: string) {
  const db = loadDb();
  return {
    branches: db.locations.filter((item) => item.companyId === companyId).length,
    users: db.memberships.filter((item) => item.companyId === companyId).length,
  };
}

export function createCompany(
  input: {
    name: string;
    code: string;
    priceUsd: number;
    expiresOn: string;
    preset: RolePreset;
    modules: ModuleKey[];
  },
  actor: ActorRef,
) {
  const db = loadDb();
  const code = input.code.trim().toLowerCase();
  if (db.companies.some((company) => company.code === code)) return fail('CODE_TAKEN');
  const id = createId('co');
  const status = isPastDate(input.expiresOn) ? 'SUSPENDED' : 'ACTIVE';
  const company: Company = {
    id,
    name: input.name.trim(),
    code,
    status,
    priceUsd: input.priceUsd,
    expiresOn: input.expiresOn,
  };
  db.companies.push(company);
  db.locations.push({ id: createId('loc'), companyId: id, name: company.name, status: 'ACTIVE' });
  db.roles.push(...roleTemplates(id, input.preset));
  for (const moduleKey of MODULE_KEYS) {
    db.modules.push({
      id: createId('mod'),
      companyId: id,
      moduleKey,
      enabled: input.modules.includes(moduleKey),
    });
  }
  audit(db, actor, id, 'CREATE', 'company', id);
  saveDb(db);
  return { ok: true as const, company };
}

export function updateCompany(
  id: string,
  input: { name: string; code: string; priceUsd: number; expiresOn: string },
  actor: ActorRef,
) {
  const db = loadDb();
  const company = db.companies.find((item) => item.id === id);
  if (!company) return fail('NOT_FOUND');
  const code = input.code.trim().toLowerCase();
  if (db.companies.some((item) => item.code === code && item.id !== id)) return fail('CODE_TAKEN');
  company.name = input.name.trim();
  company.code = code;
  company.priceUsd = input.priceUsd;
  company.expiresOn = input.expiresOn;
  if (isPastDate(input.expiresOn)) company.status = 'SUSPENDED';
  audit(db, actor, id, 'UPDATE', 'company', id);
  saveDb(db);
  return { ok: true as const, company };
}

export function suspendCompany(id: string, actor: ActorRef) {
  const db = loadDb();
  const company = db.companies.find((item) => item.id === id);
  if (!company) return fail('NOT_FOUND');
  company.status = 'SUSPENDED';
  audit(db, actor, id, 'UPDATE', 'company', id);
  saveDb(db);
  return { ok: true as const };
}

export function activateCompany(id: string, expiresOn: string, actor: ActorRef) {
  const db = loadDb();
  const company = db.companies.find((item) => item.id === id);
  if (!company) return fail('NOT_FOUND');
  if (isPastDate(expiresOn)) return fail('DATE_PAST');
  company.status = 'ACTIVE';
  company.expiresOn = expiresOn;
  audit(db, actor, id, 'UPDATE', 'company', id);
  saveDb(db);
  return { ok: true as const };
}

export function listLocations(companyId: string) {
  return loadDb()
    .locations.filter((item) => item.companyId === companyId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getLocation(id: string) {
  return loadDb().locations.find((item) => item.id === id) ?? null;
}

export function createLocation(companyId: string, name: string, actor: ActorRef) {
  const db = loadDb();
  const trimmed = name.trim();
  if (db.locations.some((item) => item.companyId === companyId && item.name === trimmed)) {
    return fail('NAME_TAKEN');
  }
  const location = { id: createId('loc'), companyId, name: trimmed, status: 'ACTIVE' as const };
  db.locations.push(location);
  audit(db, actor, companyId, 'CREATE', 'location', location.id);
  saveDb(db);
  return { ok: true as const, location };
}

export function updateLocation(
  id: string,
  input: { name: string; status: 'ACTIVE' | 'INACTIVE' },
  actor: ActorRef,
) {
  const db = loadDb();
  const location = db.locations.find((item) => item.id === id);
  if (!location) return fail('NOT_FOUND');
  const trimmed = input.name.trim();
  if (
    db.locations.some(
      (item) => item.companyId === location.companyId && item.name === trimmed && item.id !== id,
    )
  ) {
    return fail('NAME_TAKEN');
  }
  location.name = trimmed;
  location.status = input.status;
  audit(db, actor, location.companyId, 'UPDATE', 'location', id);
  saveDb(db);
  return { ok: true as const, location };
}

export function listRoles(companyId: string) {
  return loadDb()
    .roles.filter((item) => item.companyId === companyId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getRole(id: string) {
  return loadDb().roles.find((item) => item.id === id) ?? null;
}

export function createRole(
  companyId: string,
  input: Omit<Role, 'id' | 'companyId'>,
  actor: ActorRef,
) {
  const db = loadDb();
  const key = input.key.trim().toUpperCase();
  if (db.roles.some((item) => item.companyId === companyId && item.key === key)) return fail('KEY_TAKEN');
  const role: Role = { ...input, id: createId('role'), companyId, key, name: input.name.trim() };
  db.roles.push(role);
  audit(db, actor, companyId, 'CREATE', 'role', role.id);
  saveDb(db);
  return { ok: true as const, role };
}

export function updateRole(id: string, input: Omit<Role, 'id' | 'companyId'>, actor: ActorRef) {
  const db = loadDb();
  const role = db.roles.find((item) => item.id === id);
  if (!role) return fail('NOT_FOUND');
  const key = input.key.trim().toUpperCase();
  if (db.roles.some((item) => item.companyId === role.companyId && item.key === key && item.id !== id)) {
    return fail('KEY_TAKEN');
  }
  Object.assign(role, { ...input, key, name: input.name.trim() });
  audit(db, actor, role.companyId, 'UPDATE', 'role', id);
  saveDb(db);
  return { ok: true as const, role };
}

export type UserRow = {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE';
  roleId: string;
  roleName: string;
  roleKey: string;
  locationId: string | null;
  locationName: string;
};

export function listUsers(companyId: string): UserRow[] {
  const db = loadDb();
  return db.memberships
    .filter((item) => item.companyId === companyId)
    .map((membership) => {
      const user = db.users.find((item) => item.id === membership.userId);
      const role = db.roles.find((item) => item.id === membership.roleId);
      const location = db.locations.find((item) => item.id === membership.locationId);
      if (!user || !role) return null;
      return {
        userId: user.id,
        membershipId: membership.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        roleId: role.id,
        roleName: role.name,
        roleKey: role.key,
        locationId: membership.locationId,
        locationName: location?.name ?? '',
      };
    })
    .filter((item): item is UserRow => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getUserRow(companyId: string, userId: string) {
  return listUsers(companyId).find((item) => item.userId === userId) ?? null;
}

export function financeAccessFor(roleKey: string) {
  return (FINANCE_ROLE_KEYS as readonly string[]).includes(roleKey);
}

export function createUser(
  companyId: string,
  input: {
    name: string;
    password: string;
    email: string;
    phone: string;
    roleId: string;
    locationId: string | null;
  },
  actor: ActorRef | null,
) {
  const db = loadDb();
  const name = input.name.trim();
  const role = db.roles.find((item) => item.id === input.roleId && item.companyId === companyId);
  if (!role) return fail('NOT_FOUND');
  const taken = db.memberships.some((membership) => {
    if (membership.companyId !== companyId) return false;
    const user = db.users.find((item) => item.id === membership.userId);
    return user?.name.toLocaleLowerCase() === name.toLocaleLowerCase();
  });
  if (taken) return fail('NAME_TAKEN');
  if (role.visibilityScope !== 'ALL_BRANCHES' && !input.locationId) return fail('LOCATION_REQUIRED');
  const user = {
    id: createId('usr'),
    name,
    password: input.password,
    email: input.email.trim(),
    phone: input.phone.trim(),
    status: 'ACTIVE' as const,
  };
  db.users.push(user);
  db.memberships.push({
    id: createId('mem'),
    userId: user.id,
    companyId,
    roleId: role.id,
    locationId: role.visibilityScope === 'ALL_BRANCHES' ? null : input.locationId,
  });
  audit(db, actor, companyId, 'CREATE', 'user', user.id);
  saveDb(db);
  return { ok: true as const, userId: user.id, financeAccess: financeAccessFor(role.key) };
}

export function updateUser(
  companyId: string,
  userId: string,
  input: {
    name: string;
    email: string;
    phone: string;
    status: 'ACTIVE' | 'INACTIVE';
    roleId: string;
    locationId: string | null;
  },
  actor: ActorRef | null,
) {
  const db = loadDb();
  const membership = db.memberships.find((item) => item.companyId === companyId && item.userId === userId);
  const user = db.users.find((item) => item.id === userId);
  const role = db.roles.find((item) => item.id === input.roleId && item.companyId === companyId);
  if (!membership || !user || !role) return fail('NOT_FOUND');
  const name = input.name.trim();
  const taken = db.memberships.some((item) => {
    if (item.companyId !== companyId || item.userId === userId) return false;
    const other = db.users.find((row) => row.id === item.userId);
    return other?.name.toLocaleLowerCase() === name.toLocaleLowerCase();
  });
  if (taken) return fail('NAME_TAKEN');
  if (role.visibilityScope !== 'ALL_BRANCHES' && !input.locationId) return fail('LOCATION_REQUIRED');
  user.name = name;
  user.email = input.email.trim();
  user.phone = input.phone.trim();
  user.status = input.status;
  membership.roleId = role.id;
  membership.locationId = role.visibilityScope === 'ALL_BRANCHES' ? null : input.locationId;
  audit(db, actor, companyId, 'UPDATE', 'user', userId);
  saveDb(db);
  return { ok: true as const, financeAccess: financeAccessFor(role.key) };
}

export function readUserPassword(userId: string) {
  return loadDb().users.find((item) => item.id === userId)?.password ?? null;
}

export function resetUserPassword(companyId: string, userId: string, password: string, actor: ActorRef | null) {
  const db = loadDb();
  const membership = db.memberships.find((item) => item.companyId === companyId && item.userId === userId);
  const user = db.users.find((item) => item.id === userId);
  if (!membership || !user) return fail('NOT_FOUND');
  user.password = password;
  audit(db, actor, companyId, 'UPDATE', 'user', userId);
  saveDb(db);
  return { ok: true as const };
}

export function listModules(companyId: string): CompanyModule[] {
  const db = loadDb();
  const rows = db.modules.filter((item) => item.companyId === companyId);
  return MODULE_KEYS.map((moduleKey) => {
    return (
      rows.find((item) => item.moduleKey === moduleKey) ?? {
        id: `${companyId}_${moduleKey}`,
        companyId,
        moduleKey,
        enabled: false,
      }
    );
  });
}

export function setModules(companyId: string, enabled: ModuleKey[], actor: ActorRef) {
  const db = loadDb();
  if (!db.companies.some((item) => item.id === companyId)) return fail('NOT_FOUND');
  db.modules = db.modules.filter((item) => item.companyId !== companyId);
  for (const moduleKey of MODULE_KEYS) {
    db.modules.push({
      id: createId('mod'),
      companyId,
      moduleKey,
      enabled: enabled.includes(moduleKey),
    });
  }
  audit(db, actor, companyId, 'UPDATE', 'modules', companyId);
  saveDb(db);
  return { ok: true as const };
}

export function listAudit(companyId?: string) {
  const rows = loadDb().audit;
  const filtered = companyId ? rows.filter((item) => item.companyId === companyId) : rows;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function enterCompany(session: AppSession, companyId: string) {
  const db = loadDb();
  if (!db.companies.some((item) => item.id === companyId)) return fail('NOT_FOUND');
  audit(db, { id: session.userId, name: session.name }, companyId, 'ENTER', 'company', companyId);
  saveDb(db);
  return { ok: true as const };
}

export function passwordIssue(password: string) {
  if (password.length < 8) return 'short' as const;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'weak' as const;
  return null;
}

export function codeIssue(code: string) {
  return /^[a-z0-9-]{2,32}$/.test(code) ? null : 'invalid';
}

export function roleKeyIssue(key: string) {
  return /^[A-Z][A-Z0-9_]{1,40}$/.test(key) ? null : 'invalid';
}

export type { VisibilityScope };
