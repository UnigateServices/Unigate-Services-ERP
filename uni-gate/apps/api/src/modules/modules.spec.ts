import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserKind, UserStatus, VisibilityScope } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PasswordService } from '../auth/password.service';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { csrfGuard } from '../common/csrf';
import { validationExceptionFactory } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { ModulesService } from './modules.service';

const ORIGIN = 'http://localhost:3000';
const KEYS = ['finance', 'exchange', 'gold', 'aviation', 'engineering', 'hr'];

describe('modules', () => {
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

  it('lists and toggles modules, repeats without change, and audits only real flag changes', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    expect(await prisma.companyModule.count({ where: { companyId: alpha.id } })).toBe(6);
    const version = (await prisma.user.findUniqueOrThrow({ where: { id: operator.id } })).authVersion;

    const listed = await request(app.getHttpServer())
      .get(`/api/platform/companies/${alpha.id}/modules`)
      .set('Cookie', cookie)
      .expect(200);
    expect(listed.body.items.map((item: { key: string }) => item.key)).toEqual(KEYS);
    expect(listed.body.items.every((item: { enabled: boolean; ready: boolean; companyId: string }) => item.enabled === false && item.ready === false && item.companyId === alpha.id)).toBe(true);

    const enabled = await putModules(cookie, alpha.id, [{ key: 'finance', enabled: true }]);
    expect(enabled.status).toBe(200);
    expect(enabled.body.items.find((item: { key: string }) => item.key === 'finance')).toMatchObject({
      enabled: true,
      ready: false,
      companyId: alpha.id,
    });
    expect(enabled.body.items.find((item: { key: string }) => item.key === 'gold').enabled).toBe(false);
    const financeAudit = await prisma.auditEntry.findMany({ where: { companyId: alpha.id, targetType: 'module' } });
    expect(financeAudit).toEqual([
      expect.objectContaining({ action: 'UPDATE', targetType: 'module', targetId: 'finance', actorUserId: operator.id }),
    ]);

    const beforeRepeat = await prisma.auditEntry.count({ where: { companyId: alpha.id, targetType: 'module' } });
    const repeated = await putModules(cookie, alpha.id, [{ key: 'finance', enabled: true }]);
    expect(repeated.status).toBe(200);
    expect(await prisma.auditEntry.count({ where: { companyId: alpha.id, targetType: 'module' } })).toBe(beforeRepeat);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: operator.id } })).authVersion).toBe(version);

    const both = await putModules(cookie, alpha.id, [
      { key: 'finance', enabled: false },
      { key: 'hr', enabled: true },
    ]);
    expect(both.status).toBe(200);
    expect(await prisma.companyModule.findUniqueOrThrow({ where: { companyId_moduleKey: { companyId: alpha.id, moduleKey: 'finance' } } })).toMatchObject({ enabled: false });
    expect(await prisma.companyModule.findUniqueOrThrow({ where: { companyId_moduleKey: { companyId: alpha.id, moduleKey: 'hr' } } })).toMatchObject({ enabled: true });
    const changes = await prisma.auditEntry.findMany({
      where: { companyId: alpha.id, targetType: 'module' },
      orderBy: { targetId: 'asc' },
    });
    expect(changes.map((item) => item.targetId).sort()).toEqual(['finance', 'finance', 'hr']);
    expect(await prisma.location.count({ where: { companyId: alpha.id } })).toBe(1);
  });

  it('rejects anonymous callers, members, unknown companies, unknown keys, and duplicate keys', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    await putModules(cookie, alpha.id, [{ key: 'finance', enabled: true }]).expect(200);
    const memberCookie = await loginMember('alpha', await member(alpha.id, 'owner', 'OWNER', null));

    await request(app.getHttpServer()).get(`/api/platform/companies/${alpha.id}/modules`).expect(401);
    await request(app.getHttpServer())
      .put(`/api/platform/companies/${alpha.id}/modules`)
      .set('Origin', ORIGIN)
      .send({ modules: [{ key: 'finance', enabled: false }] })
      .expect(401);

    const forbidden = await request(app.getHttpServer())
      .get(`/api/platform/companies/${alpha.id}/modules`)
      .set('Cookie', memberCookie)
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    const forbiddenWrite = await request(app.getHttpServer())
      .put(`/api/platform/companies/${alpha.id}/modules`)
      .set('Origin', ORIGIN)
      .set('Cookie', memberCookie)
      .send({ modules: [{ key: 'finance', enabled: false }] })
      .expect(403);
    expect(forbiddenWrite.body.code).toBe('FORBIDDEN');
    expect(await prisma.companyModule.findUniqueOrThrow({ where: { companyId_moduleKey: { companyId: alpha.id, moduleKey: 'finance' } } })).toMatchObject({ enabled: true });

    await request(app.getHttpServer()).get('/api/platform/companies/missing-company/modules').set('Cookie', cookie).expect(404);
    const missingWrite = await request(app.getHttpServer())
      .put('/api/platform/companies/missing-company/modules')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ modules: [{ key: 'finance', enabled: true }] })
      .expect(404);
    expect(missingWrite.body.code).toBe('NOT_FOUND');

    const unknown = await putModules(cookie, alpha.id, [{ key: 'payroll', enabled: true }]);
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('VALIDATION_ERROR');
    const duplicate = await putModules(cookie, alpha.id, [
      { key: 'finance', enabled: false },
      { key: 'finance', enabled: true },
    ]);
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.companyModule.findUniqueOrThrow({ where: { companyId_moduleKey: { companyId: alpha.id, moduleKey: 'finance' } } })).toMatchObject({ enabled: true });
    expect(operator.id).toBeTruthy();
  });

  it('returns ready false for an enabled module, forbids a disabled one, and ignores a client company id', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const beta = await createCompany(cookie, 'Beta', 'beta');
    await putModules(cookie, alpha.id, [{ key: 'finance', enabled: true }]).expect(200);
    const alphaUser = await prisma.user.findFirstOrThrow({
      where: { membership: { username: await member(alpha.id, 'owner', 'OWNER', null) } },
    });
    const version = alphaUser.authVersion;
    const memberCookie = await loginMember('alpha', 'owner');

    const list = await request(app.getHttpServer())
      .get('/api/modules')
      .query({ companyId: beta.id })
      .set('Cookie', memberCookie)
      .expect(200);
    expect(list.body.items).toEqual(
      KEYS.map((key) => ({ key, enabled: key === 'finance', ready: false })),
    );
    expect(JSON.stringify(list.body)).not.toMatch(/priceUsd|expiresOn|companyId|passwordHash/);

    const open = await request(app.getHttpServer())
      .get('/api/modules/finance')
      .query({ companyId: beta.id })
      .set('Cookie', memberCookie)
      .expect(200);
    expect(open.body).toEqual({ key: 'finance', ready: false });

    const closed = await request(app.getHttpServer()).get('/api/modules/gold').query({ companyId: beta.id }).set('Cookie', memberCookie).expect(403);
    expect(closed.body.code).toBe('FORBIDDEN');
    const unknown = await request(app.getHttpServer()).get('/api/modules/payroll').set('Cookie', memberCookie).expect(404);
    expect(unknown.body.code).toBe('NOT_FOUND');

    await putModules(cookie, alpha.id, [{ key: 'finance', enabled: false }]).expect(200);
    const refused = await request(app.getHttpServer()).get('/api/modules/finance').set('Cookie', memberCookie).expect(403);
    expect(refused.body.code).toBe('FORBIDDEN');
    const still = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', memberCookie).expect(200);
    expect(still.body.company.id).toBe(alpha.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alphaUser.id } })).authVersion).toBe(version);
    expect(await prisma.companyModule.count({ where: { companyId: beta.id, enabled: true } })).toBe(0);
  });

  it('follows support context and refuses an operator who has not entered a company', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const beta = await createCompany(cookie, 'Beta', 'beta');
    await putModules(cookie, alpha.id, [{ key: 'finance', enabled: true }]).expect(200);

    const bare = await request(app.getHttpServer()).get('/api/modules').query({ companyId: alpha.id }).set('Cookie', cookie).expect(409);
    expect(bare.body.code).toBe('CONFLICT');
    const bareKey = await request(app.getHttpServer()).get('/api/modules/finance').set('Cookie', cookie).expect(409);
    expect(bareKey.body.code).toBe('CONFLICT');

    const inAlpha = await enter(alpha.id, cookie);
    const alphaList = await request(app.getHttpServer()).get('/api/modules').query({ companyId: beta.id }).set('Cookie', inAlpha).expect(200);
    expect(alphaList.body.items.find((item: { key: string }) => item.key === 'finance').enabled).toBe(true);
    await request(app.getHttpServer()).get('/api/modules/finance').set('Cookie', inAlpha).expect(200);

    const inBeta = await enter(beta.id, inAlpha);
    const betaList = await request(app.getHttpServer()).get('/api/modules').set('Cookie', inBeta).expect(200);
    expect(betaList.body.items.every((item: { enabled: boolean }) => item.enabled === false)).toBe(true);
    const betaFinance = await request(app.getHttpServer()).get('/api/modules/finance').set('Cookie', inBeta).expect(403);
    expect(betaFinance.body.code).toBe('FORBIDDEN');

    const left = await leave(beta.id, inBeta);
    const after = await request(app.getHttpServer()).get('/api/modules').set('Cookie', left).expect(409);
    expect(after.body.code).toBe('CONFLICT');
  });

  it('handles simultaneous PUTs without a server error and audits each real change once', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    await prisma.companyModule.deleteMany({ where: { companyId: alpha.id } });

    const created = await Promise.all(Array.from({ length: 6 }, () => putModules(cookie, alpha.id, [{ key: 'gold', enabled: true }])));
    expect(created.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(await prisma.companyModule.count({ where: { companyId: alpha.id, moduleKey: 'gold' } })).toBe(1);
    expect(await prisma.auditEntry.count({ where: { companyId: alpha.id, targetType: 'module', targetId: 'gold' } })).toBe(1);

    const toggled = await Promise.all(Array.from({ length: 6 }, () => putModules(cookie, alpha.id, [{ key: 'gold', enabled: false }])));
    expect(toggled.every((response) => response.status === 200)).toBe(true);
    expect(await prisma.auditEntry.count({ where: { companyId: alpha.id, targetType: 'module', targetId: 'gold' } })).toBe(2);
  });

  it('treats a missing row as disabled, creates it on PUT, and rolls back a bad payload', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    await prisma.companyModule.deleteMany({ where: { companyId: alpha.id } });
    const username = await member(alpha.id, 'owner', 'OWNER', null);
    const memberCookie = await loginMember('alpha', username);

    const missing = await request(app.getHttpServer()).get('/api/modules').set('Cookie', memberCookie).expect(200);
    expect(missing.body.items.every((item: { enabled: boolean; ready: boolean }) => item.enabled === false && item.ready === false)).toBe(true);
    await request(app.getHttpServer()).get('/api/modules/finance').set('Cookie', memberCookie).expect(403);

    const created = await putModules(cookie, alpha.id, [{ key: 'finance', enabled: true }]);
    expect(created.status).toBe(200);
    expect(await prisma.companyModule.findMany({ where: { companyId: alpha.id } })).toEqual([
      expect.objectContaining({ moduleKey: 'finance', enabled: true }),
    ]);
    const audits = await prisma.auditEntry.count({ where: { companyId: alpha.id, targetType: 'module' } });
    expect(audits).toBe(1);

    const stillOff = await putModules(cookie, alpha.id, [{ key: 'exchange', enabled: false }]);
    expect(stillOff.status).toBe(200);
    expect(await prisma.companyModule.findUniqueOrThrow({ where: { companyId_moduleKey: { companyId: alpha.id, moduleKey: 'exchange' } } })).toMatchObject({ enabled: false });
    expect(await prisma.auditEntry.count({ where: { companyId: alpha.id, targetType: 'module' } })).toBe(1);
    expect(await prisma.companyModule.count({ where: { companyId: alpha.id } })).toBe(2);

    const before = await prisma.companyModule.findMany({ where: { companyId: alpha.id }, orderBy: { moduleKey: 'asc' } });
    const rejected = await putModules(cookie, alpha.id, [
      { key: 'finance', enabled: false },
      { key: 'not-a-module', enabled: true },
    ]);
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.companyModule.findMany({ where: { companyId: alpha.id }, orderBy: { moduleKey: 'asc' } })).toMatchObject(
      before.map((row) => ({ moduleKey: row.moduleKey, enabled: row.enabled })),
    );

    await expect(
      app.get(ModulesService).replace(
        alpha.id,
        [
          { key: 'finance', enabled: false },
          { key: 'gold', enabled: true },
          { key: 'gold', enabled: false },
        ],
        operator.id,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.companyModule.findUniqueOrThrow({ where: { companyId_moduleKey: { companyId: alpha.id, moduleKey: 'finance' } } })).toMatchObject({ enabled: true });
    expect(await prisma.companyModule.findUnique({ where: { companyId_moduleKey: { companyId: alpha.id, moduleKey: 'gold' } } })).toBeNull();
    expect(await prisma.auditEntry.count({ where: { companyId: alpha.id, targetType: 'module' } })).toBe(1);
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
    expect(role.visibilityScope).toBe(roleKey === 'OWNER' ? VisibilityScope.ALL_BRANCHES : VisibilityScope.OWN);
    const user = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: username, passwordHash: await passwords.hash('Owner1234'), status: UserStatus.ACTIVE },
    });
    await prisma.membership.create({
      data: { userId: user.id, companyId, username, roleId: role.id, locationId },
    });
    return username;
  }

  function createCompany(cookie: string, name: string, code: string) {
    return request(app.getHttpServer())
      .post('/api/platform/companies')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name, code, priceUsd: '10.00', expiresOn: '2027-04-01', preset: 'simple', modules: [] })
      .expect(201)
      .then((response) => ({ id: response.body.id as string }));
  }

  function putModules(cookie: string, companyId: string, modules: { key: string; enabled: boolean }[]) {
    return request(app.getHttpServer())
      .put(`/api/platform/companies/${companyId}/modules`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ modules });
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

function cookieOf(response: { headers: Record<string, string | string[] | undefined> }) {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const header = list.find((item) => item.startsWith('ug_access='));
  if (!header) throw new Error('ug_access cookie was not set');
  return header.split(';')[0];
}
