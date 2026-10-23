import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserKind, UserStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PasswordService } from '../auth/password.service';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { csrfGuard } from '../common/csrf';
import { validationExceptionFactory } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';

describe('company administration by managers (phase 11)', () => {
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

  async function setup() {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const beta = await createCompany(cookie, 'Beta', 'beta', 'tradivia');
    const home = (await prisma.location.findFirstOrThrow({ where: { companyId: alpha.id } })).id;
    const chief = await loginMember('alpha', await member(alpha.id, 'chief', 'GENERAL_MANAGER', null));
    return { cookie, alpha, beta, home, chief };
  }

  function send(method: 'post' | 'patch', path: string, cookie: string, body: object) {
    return request(app.getHttpServer())[method](path).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  }

  function roleBody(key: string, permissions: { area: string; level: string }[], scope = 'BRANCH') {
    return { name: key, key, visibilityScope: scope, editRequiresApproval: false, deleteRequiresApproval: false, permissions };
  }

  it('lets the general manager create and edit branches in the session company only', async () => {
    const { alpha, beta, chief } = await setup();
    const chiefUser = await prisma.membership.findFirstOrThrow({ where: { username: 'chief' } });
    const created = await send('post', '/api/locations', chief, { name: '  Depot  ', companyId: beta.id }).expect(400);
    expect(created.body.code).toBe('VALIDATION_ERROR');
    const depot = await send('post', '/api/locations', chief, { name: '  Depot  ' }).expect(201);
    expect(depot.body).toEqual({ id: expect.any(String), name: 'Depot', status: 'ACTIVE' });
    expect((await prisma.location.findUniqueOrThrow({ where: { id: depot.body.id } })).companyId).toBe(alpha.id);
    expect(await prisma.auditEntry.count({ where: { targetType: 'location', targetId: depot.body.id, actorUserId: chiefUser.userId, action: 'CREATE' } })).toBe(1);

    expect((await send('post', '/api/locations', chief, { name: 'Depot' }).expect(409)).body.code).toBe('NAME_TAKEN');
    const renamed = await send('patch', `/api/locations/${depot.body.id}`, chief, { name: 'Store', status: 'INACTIVE' }).expect(200);
    expect(renamed.body).toMatchObject({ name: 'Store', status: 'INACTIVE' });

    const betaBranch = (await prisma.location.findFirstOrThrow({ where: { companyId: beta.id } })).id;
    expect((await send('patch', `/api/locations/${betaBranch}`, chief, { name: 'Hijack', status: 'ACTIVE' }).expect(404)).body.code).toBe('NOT_FOUND');
    expect((await prisma.location.findUniqueOrThrow({ where: { id: betaBranch } })).name).toBe('Beta');
  });

  it('refuses branch changes without branches WRITE or without all-branch scope', async () => {
    const { cookie, alpha, home } = await setup();
    const lead = await loginMember('alpha', await member(alpha.id, 'lead', 'SUPERVISOR', home));
    const clerk = await loginMember('alpha', await member(alpha.id, 'clerk', 'EMPLOYEE', home));
    for (const who of [lead, clerk]) {
      expect((await send('post', '/api/locations', who, { name: 'Nope' }).expect(403)).body.code).toBe('FORBIDDEN');
      await send('patch', `/api/locations/${home}`, who, { name: 'Nope', status: 'ACTIVE' }).expect(403);
    }
    // branches WRITE on a branch-scoped role is still refused.
    const local = await send('post', `/api/platform/companies/${alpha.id}/roles`, cookie, roleBody('LOCAL_ADMIN', [{ area: 'branches', level: 'WRITE' }])).expect(201);
    const localCookie = await loginMember('alpha', await memberWithRole(alpha.id, 'local', local.body.id, home));
    expect((await send('post', '/api/locations', localCookie, { name: 'Nope' }).expect(403)).body.code).toBe('FORBIDDEN');
    expect(await prisma.location.count({ where: { companyId: alpha.id, name: 'Nope' } })).toBe(0);
  });

  it('lets the general manager create and edit roles within their own levels', async () => {
    const { alpha, chief, home } = await setup();
    const created = await send('post', '/api/roles', chief, roleBody('CASHIER', [{ area: 'branches', level: 'READ' }, { area: 'finance', level: 'WRITE' }])).expect(201);
    expect(created.body).toMatchObject({ key: 'CASHIER', permissions: { finance: 'WRITE', branches: 'READ', users: 'NONE' } });
    expect(created.body.companyId).toBeUndefined();
    expect((await prisma.role.findUniqueOrThrow({ where: { id: created.body.id } })).companyId).toBe(alpha.id);

    // The change reaches a member of that role on the next request.
    const teller = await loginMember('alpha', await memberWithRole(alpha.id, 'teller', created.body.id, home));
    await request(app.getHttpServer()).get('/api/users').set('Cookie', teller).expect(403);
    await send('patch', `/api/roles/${created.body.id}`, chief, roleBody('CASHIER', [{ area: 'users', level: 'READ' }])).expect(200);
    await request(app.getHttpServer()).get('/api/users').set('Cookie', teller).expect(200);

    // finance ADMIN is the chief's own level, so it may be granted.
    await send('patch', `/api/roles/${created.body.id}`, chief, roleBody('CASHIER', [{ area: 'finance', level: 'ADMIN' }])).expect(200);
  });

  it('refuses a role above the manager, and changes to the manager own role', async () => {
    const { cookie, alpha, chief } = await setup();
    // gold is NONE for the general manager.
    const above = await send('post', '/api/roles', chief, roleBody('GOLD_LEAD', [{ area: 'gold', level: 'READ' }])).expect(403);
    expect(above.body.code).toBe('FORBIDDEN');
    expect(await prisma.role.count({ where: { companyId: alpha.id, key: 'GOLD_LEAD' } })).toBe(0);

    const employee = await role(alpha.id, 'EMPLOYEE');
    await send('patch', `/api/roles/${employee.id}`, chief, roleBody('EMPLOYEE', [{ area: 'hr', level: 'WRITE' }], 'OWN')).expect(403);
    expect(await prisma.rolePermission.count({ where: { roleId: employee.id, area: 'hr' } })).toBe(0);

    // A role the operator made stronger than the chief cannot be touched, even just renamed.
    const strong = await send('post', `/api/platform/companies/${alpha.id}/roles`, cookie, roleBody('STRONG', [{ area: 'gold', level: 'ADMIN' }])).expect(201);
    await send('patch', `/api/roles/${strong.body.id}`, chief, roleBody('STRONG', [])).expect(403);

    const own = await role(alpha.id, 'GENERAL_MANAGER');
    const self = await send('patch', `/api/roles/${own.id}`, chief, roleBody('GENERAL_MANAGER', [{ area: 'finance', level: 'READ' }], 'ALL_BRANCHES')).expect(409);
    expect(self.body.code).toBe('OWN_ROLE');
    expect((await prisma.rolePermission.findFirstOrThrow({ where: { roleId: own.id, area: 'finance' } })).level).toBe('ADMIN');
    expect(await prisma.auditEntry.count({ where: { targetType: 'role', targetId: own.id } })).toBe(0);
  });

  it('refuses role changes from members without roles WRITE or all-branch scope, and across companies', async () => {
    const { cookie, alpha, beta, chief, home } = await setup();
    const lead = await loginMember('alpha', await member(alpha.id, 'lead', 'SUPERVISOR', home));
    const watcher = await loginMember('alpha', await member(alpha.id, 'watcher', 'MONITOR', null));
    for (const who of [lead, watcher]) {
      expect((await send('post', '/api/roles', who, roleBody('NOPE', [])).expect(403)).body.code).toBe('FORBIDDEN');
    }
    const local = await send('post', `/api/platform/companies/${alpha.id}/roles`, cookie, roleBody('LOCAL_ADMIN', [{ area: 'roles', level: 'WRITE' }])).expect(201);
    const localCookie = await loginMember('alpha', await memberWithRole(alpha.id, 'local', local.body.id, home));
    await send('post', '/api/roles', localCookie, roleBody('NOPE', [])).expect(403);

    const betaEmployee = await role(beta.id, 'EMPLOYEE');
    expect((await send('patch', `/api/roles/${betaEmployee.id}`, chief, roleBody('EMPLOYEE', [], 'OWN')).expect(404)).body.code).toBe('NOT_FOUND');
    expect(await prisma.role.count({ where: { key: 'NOPE' } })).toBe(0);
  });

  it('keeps the scope rule for member role edits', async () => {
    const { alpha, chief, home } = await setup();
    await member(alpha.id, 'clerk', 'EMPLOYEE', home);
    const employee = await role(alpha.id, 'EMPLOYEE');
    const widened = await send('patch', `/api/roles/${employee.id}`, chief, roleBody('EMPLOYEE', [], 'ALL_BRANCHES')).expect(409);
    expect(widened.body.code).toBe('CONFLICT');
    expect((await role(alpha.id, 'EMPLOYEE')).visibilityScope).toBe('OWN');
  });

  it('does not let a user manager act on a user whose role is above theirs (review finding 1)', async () => {
    const { alpha, chief } = await setup();
    const chiefUser = await prisma.membership.findFirstOrThrow({ where: { username: 'chief' } });
    const hrRole = await send('post', '/api/roles', chief, roleBody('HR', [{ area: 'users', level: 'WRITE' }], 'ALL_BRANCHES')).expect(201);
    const hr = await loginMember('alpha', await memberWithRole(alpha.id, 'hr', hrRole.body.id, null));

    const reset = await send('post', `/api/users/${chiefUser.userId}/password`, hr, { password: 'Taken123' }).expect(403);
    expect(reset.body.code).toBe('FORBIDDEN');
    const chiefNow = await request(app.getHttpServer()).get(`/api/users/${chiefUser.userId}`).set('Cookie', hr).expect(200);
    const patch = {
      name: chiefNow.body.name,
      username: chiefNow.body.username,
      email: null,
      phone: null,
      status: 'INACTIVE',
      roleId: chiefNow.body.role.id,
      locationId: null,
    };
    await send('patch', `/api/users/${chiefUser.userId}`, hr, patch).expect(403);
    const monitor = await role(alpha.id, 'MONITOR');
    await send('patch', `/api/users/${chiefUser.userId}`, hr, { ...patch, status: 'ACTIVE', roleId: monitor.id }).expect(403);
    const after = await prisma.membership.findFirstOrThrow({ where: { username: 'chief' }, include: { user: true } });
    expect(after.user.status).toBe('ACTIVE');
    expect(after.roleId).toBe(chiefNow.body.role.id);
  });

  it('never leaves the company without a role editor, even when two managers race (review findings 2 and 3)', async () => {
    const { alpha, chief } = await setup();
    const gm = await role(alpha.id, 'GENERAL_MANAGER');
    const monitor = await role(alpha.id, 'MONITOR');
    const boss2 = await loginMember('alpha', await member(alpha.id, 'boss2', 'GENERAL_MANAGER', null));
    const chiefUser = await prisma.membership.findFirstOrThrow({ where: { username: 'chief' }, include: { user: true } });
    const boss2User = await prisma.membership.findFirstOrThrow({ where: { username: 'boss2' }, include: { user: true } });
    const demote = (who: string, target: typeof chiefUser) =>
      send('patch', `/api/users/${target.userId}`, who, {
        name: target.user.name,
        username: target.username,
        email: null,
        phone: null,
        status: 'ACTIVE',
        roleId: monitor.id,
        locationId: null,
      });
    const [first, second] = await Promise.all([demote(chief, boss2User), demote(boss2, chiefUser)]);
    expect([first.status, second.status].sort()).toEqual([200, 403]);
    const editors = await prisma.membership.count({
      where: { companyId: alpha.id, user: { status: 'ACTIVE' }, role: { visibilityScope: 'ALL_BRANCHES', permissions: { some: { area: 'roles', level: 'WRITE' } } } },
    });
    expect(editors).toBe(1);
    expect(gm.id).toBeTruthy();
  });

  it('caps approval settings at the manager own (review finding 4)', async () => {
    const { cookie, alpha } = await setup();
    const ctrl = await send(
      'post',
      `/api/platform/companies/${alpha.id}/roles`,
      cookie,
      {
        ...roleBody('CTRL', [{ area: 'roles', level: 'WRITE' }, { area: 'users', level: 'WRITE' }, { area: 'branches', level: 'WRITE' }, { area: 'finance', level: 'WRITE' }], 'ALL_BRANCHES'),
        editRequiresApproval: true,
        deleteRequiresApproval: true,
      },
    ).expect(201);
    const ctrlCookie = await loginMember('alpha', await memberWithRole(alpha.id, 'ctrl', ctrl.body.id, null));
    const free = await send('post', '/api/roles', ctrlCookie, roleBody('FREE', [{ area: 'finance', level: 'WRITE' }])).expect(403);
    expect(free.body.code).toBe('FORBIDDEN');
    await send('post', '/api/roles', ctrlCookie, { ...roleBody('BOUND', [{ area: 'finance', level: 'WRITE' }]), editRequiresApproval: true, deleteRequiresApproval: true }).expect(201);
    // The manager role (no approvals needed) is looser than ctrl, so ctrl cannot assign it.
    const gm = await role(alpha.id, 'GENERAL_MANAGER');
    await send('post', '/api/users', ctrlCookie, { name: 'X', username: 'x', password: 'Secret123', email: null, phone: null, roleId: gm.id, locationId: null }).expect(403);
  });

  it('lets a platform operator in support use the same company routes', async () => {
    const { cookie, alpha } = await setup();
    const inside = await request(app.getHttpServer())
      .post(`/api/platform/companies/${alpha.id}/enter`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(200)
      .then(cookieOf);
    await send('post', '/api/locations', inside, { name: 'Support branch' }).expect(201);
    await send('post', '/api/roles', inside, roleBody('SUPPORTED', [{ area: 'gold', level: 'ADMIN' }])).expect(201);
  });

  async function memberWithRole(companyId: string, username: string, roleId: string, locationId: string | null) {
    const user = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: username, passwordHash: await passwords.hash('Owner1234'), status: UserStatus.ACTIVE },
    });
    await prisma.membership.create({ data: { userId: user.id, companyId, username, roleId, locationId } });
    return username;
  }

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
});

function cookieOf(response: { headers: Record<string, string | string[] | undefined> }) {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const header = list.find((item) => item.startsWith('ug_access='));
  if (!header) throw new Error('ug_access cookie was not set');
  return header.split(';')[0];
}
