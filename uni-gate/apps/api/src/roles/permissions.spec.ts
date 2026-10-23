import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserKind, UserStatus } from '@prisma/client';
import { PERMISSION_AREAS } from '@unigate/shared';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PasswordService } from '../auth/password.service';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { csrfGuard } from '../common/csrf';
import { validationExceptionFactory } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';

describe('role permissions (phase F1)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.use(csrfGuard(ORIGIN));
    await app.init();
    prisma = app.get(PrismaService);
    passwords = app.get(PasswordService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "audit_entries", "company_modules", "role_permissions", "memberships", "roles", "locations", "companies", "users" CASCADE',
    );
  });

  it('fills the tradivia preset with the approved levels and returns every area', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const listed = await request(app.getHttpServer()).get(`/api/platform/companies/${alpha.id}/roles`).set('Cookie', cookie).expect(200);
    const byKey = Object.fromEntries(
      listed.body.items.map((item: { key: string; permissions: Record<string, string> }) => [item.key, item.permissions]),
    );
    for (const permissions of Object.values(byKey) as Record<string, string>[]) {
      expect(Object.keys(permissions).sort()).toEqual([...PERMISSION_AREAS].sort());
    }
    expect(byKey.GENERAL_MANAGER).toMatchObject({ users: 'WRITE', branches: 'WRITE', roles: 'WRITE', finance: 'ADMIN', gold: 'NONE' });
    expect(byKey.SUPERVISOR).toMatchObject({ users: 'WRITE', branches: 'READ', roles: 'NONE', finance: 'APPROVE' });
    expect(byKey.EMPLOYEE).toMatchObject({ users: 'NONE', branches: 'READ', roles: 'NONE', finance: 'WRITE' });
    expect(byKey.MONITOR).toMatchObject({ users: 'READ', branches: 'READ', roles: 'NONE', finance: 'READ' });
    // NONE is never stored.
    expect(await prisma.rolePermission.count({ where: { level: 'NONE' } })).toBe(0);
  });

  it('lets an operator change a level, and the member feels it on the next request', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const monitor = await role(alpha.id, 'MONITOR');
    const monitorCookie = await loginMember('alpha', await member(alpha.id, 'watcher', 'MONITOR', null));

    // users READ: can list, cannot create.
    await request(app.getHttpServer()).get('/api/users').set('Cookie', monitorCookie).expect(200);
    const blocked = await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', monitorCookie)
      .send({ name: 'New', username: 'new', password: 'Secret123', email: null, phone: null, roleId: monitor.id, locationId: null })
      .expect(403);
    expect(blocked.body.code).toBe('FORBIDDEN');

    const version = (await prisma.user.findFirstOrThrow({ where: { membership: { username: 'watcher' } } })).authVersion;
    const auditBefore = await prisma.auditEntry.count({ where: { targetType: 'role', targetId: monitor.id } });
    const changed = await patchRole(cookie, alpha.id, monitor.id, roleFrom(monitor, [{ area: 'users', level: 'NONE' }, { area: 'gold', level: 'APPROVE' }])).expect(200);
    expect(changed.body.permissions).toMatchObject({ users: 'NONE', branches: 'READ', finance: 'READ', gold: 'APPROVE' });
    expect(await prisma.rolePermission.findFirst({ where: { roleId: monitor.id, area: 'users' } })).toBeNull();
    expect(await prisma.auditEntry.count({ where: { targetType: 'role', targetId: monitor.id, actorUserId: operator.id } })).toBe(auditBefore + 1);

    // Same session, next request: the user list is now refused. No new login, no authVersion change.
    const denied = await request(app.getHttpServer()).get('/api/users').set('Cookie', monitorCookie).expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', monitorCookie).expect(200);
    expect(me.body.permissions).toMatchObject({ users: 'NONE', gold: 'APPROVE' });
    expect((await prisma.user.findFirstOrThrow({ where: { membership: { username: 'watcher' } } })).authVersion).toBe(version);
  });

  it('refuses edits and password resets for a member with users READ', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const home = (await prisma.location.findFirstOrThrow({ where: { companyId: alpha.id } })).id;
    const monitorCookie = await loginMember('alpha', await member(alpha.id, 'watcher', 'MONITOR', null));
    await member(alpha.id, 'clerk', 'EMPLOYEE', home);
    const clerk = await prisma.membership.findFirstOrThrow({ where: { username: 'clerk' }, include: { user: true } });
    await request(app.getHttpServer()).get(`/api/users/${clerk.userId}`).set('Cookie', monitorCookie).expect(200);
    const patched = await request(app.getHttpServer())
      .patch(`/api/users/${clerk.userId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', monitorCookie)
      .send({ name: 'Changed', username: 'clerk', email: null, phone: null, status: 'ACTIVE', roleId: clerk.roleId, locationId: home })
      .expect(403);
    expect(patched.body.code).toBe('FORBIDDEN');
    await request(app.getHttpServer())
      .post(`/api/users/${clerk.userId}/password`)
      .set('Origin', ORIGIN)
      .set('Cookie', monitorCookie)
      .send({ password: 'Secret123' })
      .expect(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clerk.userId } })).name).toBe('clerk');
  });

  it('does not let a member assign a role above their own levels', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const home = (await prisma.location.findFirstOrThrow({ where: { companyId: alpha.id } })).id;
    const supervisorCookie = await loginMember('alpha', await member(alpha.id, 'lead', 'SUPERVISOR', home));
    const employee = await role(alpha.id, 'EMPLOYEE');
    const strong = await request(app.getHttpServer())
      .post(`/api/platform/companies/${alpha.id}/roles`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        name: 'Strong clerk',
        key: 'STRONG_CLERK',
        visibilityScope: 'OWN',
        editRequiresApproval: false,
        deleteRequiresApproval: false,
        permissions: [{ area: 'branches', level: 'READ' }, { area: 'finance', level: 'ADMIN' }],
      })
      .expect(201);
    const body = (roleId: string, username: string) => ({
      name: username, username, password: 'Secret123', email: null, phone: null, roleId, locationId: home,
    });
    // The supervisor holds finance APPROVE, so a role with finance ADMIN is refused.
    const refused = await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', supervisorCookie)
      .send(body(strong.body.id, 'strong'))
      .expect(403);
    expect(refused.body.code).toBe('FORBIDDEN');
    expect(await prisma.membership.count({ where: { username: 'strong' } })).toBe(0);
    // A role at or below the supervisor's levels is fine.
    await request(app.getHttpServer()).post('/api/users').set('Origin', ORIGIN).set('Cookie', supervisorCookie).send(body(employee.id, 'plain')).expect(201);
  });

  it('lets a user manager without branch access list branches for the user form', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const manager = await role(alpha.id, 'GENERAL_MANAGER');
    await patchRole(cookie, alpha.id, manager.id, roleFrom(manager, [{ area: 'branches', level: 'NONE' }])).expect(200);
    const chiefCookie = await loginMember('alpha', await member(alpha.id, 'chief', 'GENERAL_MANAGER', null));
    await request(app.getHttpServer()).get('/api/locations').set('Cookie', chiefCookie).expect(200);
  });

  it('refuses invalid permission lists', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const target = await role(alpha.id, 'EMPLOYEE');
    const cases = [
      [{ area: 'users', level: 'ADMIN' }],
      [{ area: 'roles', level: 'APPROVE' }],
      [{ area: 'payroll', level: 'READ' }],
      [{ area: 'finance', level: 'OWNER' }],
      [{ area: 'finance', level: 'READ' }, { area: 'finance', level: 'WRITE' }],
    ];
    for (const permissions of cases) {
      const response = await patchRole(cookie, alpha.id, target.id, roleFrom(target, permissions));
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    const legacy = await patchRole(cookie, alpha.id, target.id, { ...roleFrom(target, []), canManageUsers: true });
    expect(legacy.status).toBe(400);
    expect((await role(alpha.id, 'EMPLOYEE')).permissions.map((row) => `${row.area}:${row.level}`).sort()).toEqual([
      'branches:READ',
      'finance:WRITE',
    ]);
  });

  it('creates a role with permissions in one step', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const created = await request(app.getHttpServer())
      .post(`/api/platform/companies/${alpha.id}/roles`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        name: 'Cashier',
        key: 'CASHIER',
        visibilityScope: 'BRANCH',
        editRequiresApproval: true,
        deleteRequiresApproval: true,
        permissions: [
          { area: 'branches', level: 'READ' },
          { area: 'finance', level: 'WRITE' },
          { area: 'exchange', level: 'NONE' },
        ],
      })
      .expect(201);
    expect(created.body.permissions).toMatchObject({ branches: 'READ', finance: 'WRITE', exchange: 'NONE', users: 'NONE' });
    expect(created.body.canManageUsers).toBe(false);
  });

  it('does not let a member change permissions, and keeps companies apart', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const beta = await createCompany(cookie, 'Beta', 'beta', 'tradivia');
    const chiefCookie = await loginMember('alpha', await member(alpha.id, 'chief', 'GENERAL_MANAGER', null));
    const alphaEmployee = await role(alpha.id, 'EMPLOYEE');
    const betaEmployee = await role(beta.id, 'EMPLOYEE');

    const memberPatch = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${alpha.id}/roles/${alphaEmployee.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', chiefCookie)
      .send(roleFrom(alphaEmployee, [{ area: 'users', level: 'WRITE' }]))
      .expect(403);
    expect(memberPatch.body.code).toBe('FORBIDDEN');

    // Beta's role through Alpha's path is not found, and Beta is untouched.
    const crossed = await patchRole(cookie, alpha.id, betaEmployee.id, roleFrom(betaEmployee, [{ area: 'users', level: 'WRITE' }]));
    expect(crossed.status).toBe(404);
    expect(await prisma.rolePermission.findFirst({ where: { roleId: betaEmployee.id, area: 'users' } })).toBeNull();

    // A member reads only the session company's roles and permissions.
    const roles = await request(app.getHttpServer()).get('/api/roles').query({ companyId: beta.id }).set('Cookie', chiefCookie).expect(200);
    expect(roles.body.items.map((item: { id: string }) => item.id)).toContain(alphaEmployee.id);
    expect(roles.body.items.map((item: { id: string }) => item.id)).not.toContain(betaEmployee.id);

    // The database refuses a permission row whose role belongs to another company.
    await expect(
      prisma.rolePermission.create({ data: { companyId: alpha.id, roleId: betaEmployee.id, area: 'finance', level: 'READ' } }),
    ).rejects.toThrow();
  });

  it('gates branches, roles, and users by level', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const home = (await prisma.location.findFirstOrThrow({ where: { companyId: alpha.id } })).id;
    const employee = await role(alpha.id, 'EMPLOYEE');
    const clerkCookie = await loginMember('alpha', await member(alpha.id, 'clerk', 'EMPLOYEE', home));

    await request(app.getHttpServer()).get('/api/locations').set('Cookie', clerkCookie).expect(200);
    expect((await request(app.getHttpServer()).get('/api/roles').set('Cookie', clerkCookie).expect(403)).body.code).toBe('FORBIDDEN');
    await request(app.getHttpServer()).get('/api/users').set('Cookie', clerkCookie).expect(403);

    await patchRole(cookie, alpha.id, employee.id, roleFrom(employee, [{ area: 'branches', level: 'NONE' }, { area: 'roles', level: 'READ' }])).expect(200);
    expect((await request(app.getHttpServer()).get('/api/locations').set('Cookie', clerkCookie).expect(403)).body.code).toBe('FORBIDDEN');
    await request(app.getHttpServer()).get('/api/roles').set('Cookie', clerkCookie).expect(200);
  });

  it('gives a platform operator in support full administration and read only in modules', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const outside = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(outside.body.permissions).toBeNull();
    const inside = await request(app.getHttpServer())
      .post(`/api/platform/companies/${alpha.id}/enter`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(200)
      .then(cookieOf);
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', inside).expect(200);
    expect(me.body.permissions).toMatchObject({ users: 'WRITE', branches: 'WRITE', roles: 'WRITE', finance: 'READ', hr: 'READ' });
  });

  it('keeps role scope and membership location in agreement in the database', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const home = (await prisma.location.findFirstOrThrow({ where: { companyId: alpha.id } })).id;
    const manager = await role(alpha.id, 'GENERAL_MANAGER');
    const employee = await role(alpha.id, 'EMPLOYEE');
    await member(alpha.id, 'chief', 'GENERAL_MANAGER', null);
    await member(alpha.id, 'clerk', 'EMPLOYEE', home);

    // Direct writes that skip the API are refused by the trigger.
    await expect(prisma.membership.updateMany({ where: { username: 'chief' }, data: { locationId: home } })).rejects.toThrow(/ROLE_SCOPE_MISMATCH/);
    await expect(prisma.membership.updateMany({ where: { username: 'clerk' }, data: { locationId: null } })).rejects.toThrow(/ROLE_SCOPE_MISMATCH/);
    await expect(prisma.role.update({ where: { id: employee.id }, data: { visibilityScope: 'ALL_BRANCHES' } })).rejects.toThrow(/ROLE_SCOPE_MISMATCH/);
    await expect(prisma.role.update({ where: { id: manager.id }, data: { visibilityScope: 'BRANCH' } })).rejects.toThrow(/ROLE_SCOPE_MISMATCH/);

    // Moving a member to another role and branch in one write is fine.
    await prisma.membership.updateMany({ where: { username: 'chief' }, data: { roleId: employee.id, locationId: home } });
    expect((await prisma.membership.findFirstOrThrow({ where: { username: 'chief' } })).locationId).toBe(home);
  });

  async function platformUser() {
    return prisma.user.create({
      data: {
        kind: UserKind.PLATFORM,
        username: 'operator',
        name: 'Operator',
        passwordHash: await passwords.hash('Operator1'),
        status: UserStatus.ACTIVE,
      },
    });
  }

  async function loginPlatform() {
    const response = await request(app.getHttpServer())
      .post('/api/auth/platform/login')
      .set('Origin', ORIGIN)
      .send({ username: 'operator', password: 'Operator1' })
      .expect(200);
    return cookieOf(response);
  }

  async function loginMember(companyCode: string, username: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ companyCode, username, password: 'Owner1234' })
      .expect(200);
    return cookieOf(response);
  }

  function role(companyId: string, key: string) {
    return prisma.role.findFirstOrThrow({ where: { companyId, key }, include: { permissions: true } });
  }

  async function member(companyId: string, username: string, roleKey: string, locationId: string | null) {
    const target = await role(companyId, roleKey);
    const user = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: username, passwordHash: await passwords.hash('Owner1234'), status: UserStatus.ACTIVE },
    });
    await prisma.membership.create({ data: { userId: user.id, companyId, username, roleId: target.id, locationId } });
    return username;
  }

  function createCompany(cookie: string, name: string, code: string, preset: 'tradivia' | 'simple') {
    return request(app.getHttpServer())
      .post('/api/platform/companies')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name, code, priceUsd: '10.00', expiresOn: '2027-04-01', preset, modules: [] })
      .expect(201)
      .then((response) => ({ id: response.body.id as string }));
  }

  function patchRole(cookie: string, companyId: string, roleId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/api/platform/companies/${companyId}/roles/${roleId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(body);
  }
});

function roleFrom(
  role: { key: string; name: string; visibilityScope: string; editRequiresApproval: boolean; deleteRequiresApproval: boolean },
  permissions: { area: string; level: string }[],
) {
  return {
    name: role.name,
    key: role.key,
    visibilityScope: role.visibilityScope,
    editRequiresApproval: role.editRequiresApproval,
    deleteRequiresApproval: role.deleteRequiresApproval,
    permissions,
  };
}

function cookieOf(response: { headers: Record<string, string | string[] | undefined> }) {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const header = list.find((item) => item.startsWith('ug_access='));
  if (!header) throw new Error('ug_access cookie was not set');
  return header.split(';')[0];
}
