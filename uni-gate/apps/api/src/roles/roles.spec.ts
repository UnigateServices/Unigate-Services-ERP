import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserKind, UserStatus, VisibilityScope } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PasswordService } from '../auth/password.service';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { csrfGuard } from '../common/csrf';
import { validationExceptionFactory } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';

describe('roles', () => {
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
      'TRUNCATE TABLE "audit_entries", "company_modules", "memberships", "roles", "locations", "companies", "users" CASCADE',
    );
  });

  it('lists one company for a platform operator and rejects members and anonymous callers', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const beta = await createCompany(cookie, 'Beta', 'beta', 'simple');
    const listed = await request(app.getHttpServer())
      .get(`/api/platform/companies/${alpha.id}/roles`)
      .set('Cookie', cookie)
      .expect(200);
    expect(listed.body.items.map((item: { key: string }) => item.key).sort()).toEqual([
      'EMPLOYEE',
      'GENERAL_MANAGER',
      'MONITOR',
      'SUPERVISOR',
    ]);
    expect(listed.body.items.every((item: { companyId: string }) => item.companyId === alpha.id)).toBe(true);
    expect(listed.body.items.map((item: { key: string }) => item.key)).not.toContain('STAFF');
    expect(JSON.stringify(listed.body)).not.toMatch(/passwordHash|priceUsd/);

    const before = await prisma.auditEntry.count();
    await request(app.getHttpServer()).get(`/api/platform/companies/${alpha.id}/roles`).set('Cookie', cookie).expect(200);
    expect(await prisma.auditEntry.count()).toBe(before);

    const memberCookie = await loginMember('alpha', await member(alpha.id, 'chief', 'GENERAL_MANAGER', null));
    const forbidden = await request(app.getHttpServer())
      .get(`/api/platform/companies/${alpha.id}/roles`)
      .set('Cookie', memberCookie)
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    await request(app.getHttpServer())
      .post(`/api/platform/companies/${alpha.id}/roles`)
      .set('Origin', ORIGIN)
      .set('Cookie', memberCookie)
      .send(roleBody())
      .expect(403);
    await request(app.getHttpServer()).get(`/api/platform/companies/${alpha.id}/roles`).expect(401);
    await request(app.getHttpServer()).get('/api/platform/companies/missing-company/roles').set('Cookie', cookie).expect(404);
    expect(beta.id).toBeTruthy();
  });

  it('creates a role, rejects a duplicate key, and allows the same key in another company', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const beta = await createCompany(cookie, 'Beta', 'beta');

    const created = await createRole(cookie, alpha.id, roleBody({ key: 'CASHIER', name: '  Cashier  ' }));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      key: 'CASHIER',
      name: 'Cashier',
      canManageUsers: false,
      visibilityScope: 'BRANCH',
      editRequiresApproval: true,
      deleteRequiresApproval: false,
      companyId: alpha.id,
    });

    const duplicate = await createRole(cookie, alpha.id, roleBody({ key: 'CASHIER' }));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('KEY_TAKEN');

    const other = await createRole(cookie, beta.id, roleBody({ key: 'CASHIER' }));
    expect(other.status).toBe(201);
    expect(other.body.companyId).toBe(beta.id);

    const badKey = await createRole(cookie, alpha.id, roleBody({ key: 'cashier' }));
    expect(badKey.status).toBe(400);
    expect(badKey.body.code).toBe('VALIDATION_ERROR');
    const badScope = await createRole(cookie, alpha.id, roleBody({ key: 'AUDITOR', visibilityScope: 'PLATFORM' }));
    expect(badScope.status).toBe(400);
    const moved = await createRole(cookie, alpha.id, { ...roleBody({ key: 'MOVED' }), companyId: beta.id });
    expect(moved.status).toBe(400);
    expect(await prisma.role.findFirst({ where: { key: 'MOVED' } })).toBeNull();

    const audit = await prisma.auditEntry.findFirstOrThrow({ where: { targetType: 'role', targetId: created.body.id } });
    expect(audit.action).toBe('CREATE');
    expect(audit.actorUserId).toBe(operator.id);
    expect(audit.companyId).toBe(alpha.id);
    expect(audit.createdAt).toBeInstanceOf(Date);
  });

  it('updates role fields and rejects another company role id', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const beta = await createCompany(cookie, 'Beta', 'beta');
    const created = await createRole(cookie, alpha.id, roleBody({ key: 'CASHIER', name: 'Cashier' }));
    const roleId = created.body.id as string;

    const renamed = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${alpha.id}/roles/${roleId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(roleBody({ key: 'TELLER', name: 'Teller', canManageUsers: true, editRequiresApproval: false, deleteRequiresApproval: true }))
      .expect(200);
    expect(renamed.body).toMatchObject({
      id: roleId,
      key: 'TELLER',
      name: 'Teller',
      canManageUsers: true,
      editRequiresApproval: false,
      deleteRequiresApproval: true,
      companyId: alpha.id,
    });

    await createRole(cookie, alpha.id, roleBody({ key: 'CASHIER' }));
    const clash = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${alpha.id}/roles/${roleId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(roleBody({ key: 'CASHIER', name: 'Teller', canManageUsers: true }))
      .expect(409);
    expect(clash.body.code).toBe('KEY_TAKEN');
    expect((await prisma.role.findUniqueOrThrow({ where: { id: roleId } })).key).toBe('TELLER');

    const foreign = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${beta.id}/roles/${roleId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(roleBody({ key: 'HIJACK', name: 'Hijack' }))
      .expect(404);
    expect(foreign.body.code).toBe('NOT_FOUND');
    expect((await prisma.role.findUniqueOrThrow({ where: { id: roleId } })).companyId).toBe(alpha.id);

    await request(app.getHttpServer())
      .patch(`/api/platform/companies/${alpha.id}/roles/missing-role`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(roleBody())
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/platform/companies/${alpha.id}/roles/${roleId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(404);

    const updates = await prisma.auditEntry.findMany({ where: { targetType: 'role', targetId: roleId, action: 'UPDATE' } });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ actorUserId: operator.id, companyId: alpha.id });
  });

  it('rejects a scope change that would invalidate memberships and does not rewrite them', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const home = await prisma.location.findFirstOrThrow({ where: { companyId: alpha.id, name: 'Alpha' } });
    const allRole = await prisma.role.findFirstOrThrow({ where: { companyId: alpha.id, key: 'GENERAL_MANAGER' } });
    const ownRole = await prisma.role.findFirstOrThrow({ where: { companyId: alpha.id, key: 'EMPLOYEE' } });
    const allMembership = await membershipOn(alpha.id, 'chief', allRole.id, null);
    const ownMembership = await membershipOn(alpha.id, 'clerk', ownRole.id, home.id);

    const blockedNarrow = await patchRole(cookie, alpha.id, allRole.id, roleFrom(allRole, { visibilityScope: 'BRANCH' }));
    expect(blockedNarrow.status).toBe(409);
    expect(blockedNarrow.body.code).toBe('CONFLICT');
    expect((await prisma.role.findUniqueOrThrow({ where: { id: allRole.id } })).visibilityScope).toBe(VisibilityScope.ALL_BRANCHES);
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: allMembership } })).locationId).toBeNull();

    const blockedWiden = await patchRole(cookie, alpha.id, ownRole.id, roleFrom(ownRole, { visibilityScope: 'ALL_BRANCHES' }));
    expect(blockedWiden.status).toBe(409);
    expect((await prisma.role.findUniqueOrThrow({ where: { id: ownRole.id } })).visibilityScope).toBe(VisibilityScope.OWN);
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: ownMembership } })).locationId).toBe(home.id);

    const compatible = await patchRole(cookie, alpha.id, ownRole.id, roleFrom(ownRole, { visibilityScope: 'BRANCH' }));
    expect(compatible.status).toBe(200);
    expect(compatible.body.visibilityScope).toBe('BRANCH');
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: ownMembership } })).locationId).toBe(home.id);

    const unused = await createRole(cookie, alpha.id, roleBody({ key: 'CASHIER', visibilityScope: 'BRANCH' }));
    const widened = await patchRole(cookie, alpha.id, unused.body.id, roleBody({ key: 'CASHIER', visibilityScope: 'ALL_BRANCHES' }));
    expect(widened.status).toBe(200);
    expect(await prisma.membership.count({ where: { roleId: unused.body.id } })).toBe(0);
  });

  it('applies canManageUsers on the next request without changing authVersion', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const owner = await prisma.role.findFirstOrThrow({ where: { companyId: alpha.id, key: 'OWNER' } });
    const username = await member(alpha.id, 'owner', 'OWNER', null);
    const user = await prisma.user.findFirstOrThrow({ where: { membership: { username } } });
    const version = user.authVersion;
    const memberCookie = await loginMember('alpha', username);

    const allowed = await request(app.getHttpServer()).get('/api/roles').query({ companyId: 'other' }).set('Cookie', memberCookie).expect(200);
    expect(allowed.body.items.map((item: { key: string }) => item.key).sort()).toEqual(['OWNER', 'STAFF']);
    expect(allowed.body.items.every((item: { companyId?: string }) => item.companyId === undefined)).toBe(true);

    const staff = await prisma.role.findFirstOrThrow({ where: { companyId: alpha.id, key: 'STAFF' } });
    const staffCookie = await loginMember('alpha', await member(alpha.id, 'staff', 'STAFF', (await prisma.location.findFirstOrThrow({ where: { companyId: alpha.id } })).id));
    const deniedStaff = await request(app.getHttpServer()).get('/api/roles').set('Cookie', staffCookie).expect(403);
    expect(deniedStaff.body.code).toBe('FORBIDDEN');

    await patchRole(cookie, alpha.id, owner.id, roleFrom(owner, { canManageUsers: false })).expect(200);
    const denied = await request(app.getHttpServer()).get('/api/roles').set('Cookie', memberCookie).expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', memberCookie).expect(200);
    expect(me.body.canManageUsers).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).authVersion).toBe(version);
    expect(staff.canManageUsers).toBe(false);
  });

  it('follows support context into and out of a company', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const beta = await createCompany(cookie, 'Beta', 'beta', 'simple');

    const bare = await request(app.getHttpServer()).get('/api/roles').query({ companyId: alpha.id }).set('Cookie', cookie).expect(409);
    expect(bare.body.code).toBe('CONFLICT');
    expect(bare.body.items).toBeUndefined();

    const inAlpha = await enter(alpha.id, cookie);
    const alphaList = await request(app.getHttpServer()).get('/api/roles').set('Cookie', inAlpha).expect(200);
    expect(alphaList.body.items.map((item: { key: string }) => item.key)).toContain('GENERAL_MANAGER');
    expect(alphaList.body.items.map((item: { key: string }) => item.key)).not.toContain('STAFF');

    const inBeta = await enter(beta.id, inAlpha);
    const betaList = await request(app.getHttpServer()).get('/api/roles').set('Cookie', inBeta).expect(200);
    expect(betaList.body.items.map((item: { key: string }) => item.key).sort()).toEqual(['OWNER', 'STAFF']);

    const left = await leave(beta.id, inBeta);
    const after = await request(app.getHttpServer()).get('/api/roles').set('Cookie', left).expect(409);
    expect(after.body.code).toBe('CONFLICT');
    expect(JSON.stringify(after.body)).not.toMatch(/GENERAL_MANAGER|STAFF/);
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

  async function member(companyId: string, username: string, roleKey: string, locationId: string | null) {
    const role = await prisma.role.findFirstOrThrow({ where: { companyId, key: roleKey } });
    return membershipOn(companyId, username, role.id, locationId).then(() => username);
  }

  async function membershipOn(companyId: string, username: string, roleId: string, locationId: string | null) {
    const user = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: username, passwordHash: await passwords.hash('Owner1234'), status: UserStatus.ACTIVE },
    });
    const membership = await prisma.membership.create({
      data: { userId: user.id, companyId, username, roleId, locationId },
    });
    return membership.id;
  }

  function createCompany(cookie: string, name: string, code: string, preset: 'tradivia' | 'simple' = 'simple') {
    return request(app.getHttpServer())
      .post('/api/platform/companies')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name, code, priceUsd: '10.00', expiresOn: '2027-04-01', preset, modules: [] })
      .expect(201)
      .then((response) => ({ id: response.body.id as string }));
  }

  function createRole(cookie: string, companyId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/roles`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(body);
  }

  function patchRole(cookie: string, companyId: string, roleId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/api/platform/companies/${companyId}/roles/${roleId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(body);
  }

  function enter(companyId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/enter`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(200)
      .then(cookieOf);
  }

  function leave(companyId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/leave`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(200)
      .then(cookieOf);
  }
});

function roleBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Cashier',
    key: 'CASHIER',
    canManageUsers: false,
    visibilityScope: 'BRANCH',
    editRequiresApproval: true,
    deleteRequiresApproval: false,
    ...overrides,
  };
}

function roleFrom(
  role: {
    key: string;
    name: string;
    canManageUsers: boolean;
    visibilityScope: string;
    editRequiresApproval: boolean;
    deleteRequiresApproval: boolean;
  },
  overrides: Record<string, unknown>,
) {
  return {
    name: role.name,
    key: role.key,
    canManageUsers: role.canManageUsers,
    visibilityScope: role.visibilityScope,
    editRequiresApproval: role.editRequiresApproval,
    deleteRequiresApproval: role.deleteRequiresApproval,
    ...overrides,
  };
}

function cookieOf(response: { headers: Record<string, string | string[] | undefined> }) {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const header = list.find((item) => item.startsWith('ug_access='));
  if (!header) throw new Error('ug_access cookie was not set');
  return header.split(';')[0];
}
