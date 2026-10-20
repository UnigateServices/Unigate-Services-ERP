import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditAction, UserKind, UserStatus, VisibilityScope } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PasswordService } from '../../auth/password.service';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';
import { csrfGuard } from '../../common/csrf';
import { validationExceptionFactory } from '../../common/validation';
import { PrismaService } from '../../prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';
const ITEM_KEYS = [
  'action',
  'actorName',
  'actorUserId',
  'companyCode',
  'companyId',
  'companyName',
  'createdAt',
  'id',
  'targetId',
  'targetType',
];

describe('access log', () => {
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

  it('lists create, enter, and module changes newest first with actor and company names only', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const entered = await enter(alpha.id, cookie);
    await request(app.getHttpServer())
      .put(`/api/platform/companies/${alpha.id}/modules`)
      .set('Origin', ORIGIN)
      .set('Cookie', entered)
      .send({ modules: [{ key: 'finance', enabled: true }] })
      .expect(200);

    const listed = await request(app.getHttpServer()).get('/api/platform/access-log').set('Cookie', cookie).expect(200);
    const stored = await prisma.auditEntry.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    expect(listed.body.page).toBe(1);
    expect(listed.body.pageSize).toBe(20);
    expect(listed.body.total).toBe(3);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toEqual(stored.map((item) => item.id));
    expect(listed.body.items.map((item: { action: string; targetType: string }) => `${item.action}:${item.targetType}`).sort()).toEqual([
      'CREATE:company',
      'ENTER:company',
      'UPDATE:module',
    ]);
    for (const item of listed.body.items) {
      expect(Object.keys(item).sort()).toEqual([...ITEM_KEYS].sort());
      expect(item.actorUserId).toBe(operator.id);
      expect(item.actorName).toBe('Operator');
      expect(item.companyId).toBe(alpha.id);
      expect(item.companyName).toBe('Alpha');
      expect(item.companyCode).toBe('alpha');
      expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(JSON.stringify(listed.body)).not.toMatch(/passwordHash|email|phone|lockedUntil|failedLoginCount|authVersion/);
  });

  it('rejects anonymous callers and members and does not accept writes', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const memberCookie = await loginMember('alpha', await member(alpha.id, 'owner', 'OWNER', null));

    const missing = await request(app.getHttpServer()).get('/api/platform/access-log').expect(401);
    expect(missing.body.code).toBe('UNAUTHORIZED');
    const forbidden = await request(app.getHttpServer()).get('/api/platform/access-log').set('Cookie', memberCookie).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    expect(forbidden.body.items).toBeUndefined();

    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const response = await request(app.getHttpServer())[method]('/api/platform/access-log').set('Origin', ORIGIN).set('Cookie', cookie).send({});
      expect(response.status).toBe(404);
    }
    expect(await prisma.auditEntry.count()).toBe(1);
  });

  it('paginates with a default of 20 and a maximum of 100', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    for (let index = 0; index < 24; index += 1) {
      await prisma.auditEntry.create({
        data: {
          actorUserId: operator.id,
          companyId: alpha.id,
          action: AuditAction.UPDATE,
          targetType: 'company',
          targetId: alpha.id,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        },
      });
    }

    const first = await request(app.getHttpServer()).get('/api/platform/access-log').set('Cookie', cookie).expect(200);
    expect(first.body).toMatchObject({ page: 1, pageSize: 20, total: 25 });
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0].action).toBe('CREATE');

    const second = await request(app.getHttpServer()).get('/api/platform/access-log').query({ page: 2 }).set('Cookie', cookie).expect(200);
    expect(second.body).toMatchObject({ page: 2, pageSize: 20, total: 25 });
    expect(second.body.items).toHaveLength(5);

    const wide = await request(app.getHttpServer()).get('/api/platform/access-log').query({ pageSize: 100 }).set('Cookie', cookie).expect(200);
    expect(wide.body.pageSize).toBe(100);
    expect(wide.body.items).toHaveLength(25);

    const badPage = await request(app.getHttpServer()).get('/api/platform/access-log').query({ page: 0 }).set('Cookie', cookie).expect(400);
    expect(badPage.body.code).toBe('VALIDATION_ERROR');
    const badSize = await request(app.getHttpServer()).get('/api/platform/access-log').query({ pageSize: 101 }).set('Cookie', cookie).expect(400);
    expect(badSize.body.code).toBe('VALIDATION_ERROR');
    const zeroSize = await request(app.getHttpServer()).get('/api/platform/access-log').query({ pageSize: 0 }).set('Cookie', cookie).expect(400);
    expect(zeroSize.body.code).toBe('VALIDATION_ERROR');
  });

  it('orders equal timestamps by id descending and filters by company', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const beta = await createCompany(cookie, 'Beta', 'beta');
    const stamp = new Date('2020-01-01T00:00:00.000Z');
    const older = await prisma.auditEntry.create({
      data: {
        actorUserId: operator.id,
        companyId: alpha.id,
        action: AuditAction.UPDATE,
        targetType: 'company',
        targetId: alpha.id,
        createdAt: stamp,
      },
    });
    const newerId = await prisma.auditEntry.create({
      data: {
        actorUserId: operator.id,
        companyId: alpha.id,
        action: AuditAction.UPDATE,
        targetType: 'location',
        targetId: alpha.id,
        createdAt: stamp,
      },
    });
    const expected = [older.id, newerId.id].sort((left, right) => (left < right ? 1 : left > right ? -1 : 0));

    const listed = await request(app.getHttpServer()).get('/api/platform/access-log').set('Cookie', cookie).expect(200);
    const tied = listed.body.items
      .filter((item: { createdAt: string }) => item.createdAt === stamp.toISOString())
      .map((item: { id: string }) => item.id);
    expect(tied).toEqual(expected);
    expect(listed.body.items[0].createdAt > stamp.toISOString()).toBe(true);

    const filtered = await request(app.getHttpServer())
      .get('/api/platform/access-log')
      .query({ companyId: beta.id })
      .set('Cookie', cookie)
      .expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items).toEqual([
      expect.objectContaining({ action: 'CREATE', targetType: 'company', companyId: beta.id, companyCode: 'beta' }),
    ]);
    const unknown = await request(app.getHttpServer())
      .get('/api/platform/access-log')
      .query({ companyId: 'missing-company' })
      .set('Cookie', cookie)
      .expect(404);
    expect(unknown.body.code).toBe('NOT_FOUND');
    expect(unknown.body.items).toBeUndefined();
  });

  it('returns an empty page and the same global list while support is open', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const empty = await request(app.getHttpServer()).get('/api/platform/access-log').set('Cookie', cookie).expect(200);
    expect(empty.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });

    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const beta = await createCompany(cookie, 'Beta', 'beta');
    const before = await request(app.getHttpServer()).get('/api/platform/access-log').set('Cookie', cookie).expect(200);
    const inAlpha = await enter(alpha.id, cookie);
    const during = await request(app.getHttpServer())
      .get('/api/platform/access-log')
      .query({ companyId: beta.id })
      .set('Cookie', inAlpha)
      .expect(200);
    expect(during.body.total).toBe(1);
    const globalDuring = await request(app.getHttpServer()).get('/api/platform/access-log').set('Cookie', inAlpha).expect(200);
    expect(globalDuring.body.total).toBe(before.body.total + 1);
    expect(globalDuring.body.items.map((item: { companyId: string }) => item.companyId)).toEqual(
      expect.arrayContaining([alpha.id, beta.id]),
    );
    expect(operator.id).toBeTruthy();
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

  function enter(companyId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/enter`)
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
