import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CompanyStatus, UserKind, UserStatus, VisibilityScope } from '@prisma/client';
import { todayInDamascus } from '@unigate/shared';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PasswordService } from '../../auth/password.service';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';
import { csrfGuard } from '../../common/csrf';
import { validationExceptionFactory } from '../../common/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { CompaniesService } from './companies.service';

const ORIGIN = 'http://localhost:3000';

describe('platform companies', () => {
  jest.setTimeout(30000);
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

  it('lists companies for a platform operator and hides them from a member', async () => {
    const platform = await platformUser();
    const cookie = await loginPlatform(platform.username!);
    await createCompany(cookie, { name: 'Alpha', code: 'alpha' });
    await createCompany(cookie, { name: 'Beta', code: 'beta', statusDate: '2027-02-01' });
    const listed = await request(app.getHttpServer())
      .get('/api/platform/companies')
      .query({ page: 1, pageSize: 1 })
      .set('Cookie', cookie)
      .expect(200);
    expect(listed.body.total).toBe(2);
    expect(listed.body.pageSize).toBe(1);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].name).toBe('Alpha');
    expect(listed.body.items[0]).not.toHaveProperty('passwordHash');

    const pageTwo = await request(app.getHttpServer())
      .get('/api/platform/companies')
      .query({ page: 2, pageSize: 1 })
      .set('Cookie', cookie)
      .expect(200);
    expect(pageTwo.body.items[0].name).toBe('Beta');

    await request(app.getHttpServer()).get('/api/platform/companies').query({ pageSize: 101 }).set('Cookie', cookie).expect(400);
    const byName = await request(app.getHttpServer())
      .get('/api/platform/companies')
      .query({ q: 'alp' })
      .set('Cookie', cookie)
      .expect(200);
    expect(byName.body.items.map((item: { code: string }) => item.code)).toEqual(['alpha']);
    const byCode = await request(app.getHttpServer())
      .get('/api/platform/companies')
      .query({ q: 'BETA' })
      .set('Cookie', cookie)
      .expect(200);
    expect(byCode.body.items).toHaveLength(1);

    const member = await memberOf('alpha', 'staff');
    const memberCookie = await loginMember('alpha', 'staff');
    const forbidden = await request(app.getHttpServer()).get('/api/platform/companies').set('Cookie', memberCookie).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    const beta = await prisma.company.findFirstOrThrow({ where: { code: 'beta' } });
    const guessed = await request(app.getHttpServer())
      .get(`/api/platform/companies/${beta.id}`)
      .set('Cookie', memberCookie)
      .expect(403);
    expect(guessed.body.code).toBe('FORBIDDEN');
    const createdByMember = await request(app.getHttpServer())
      .post('/api/platform/companies')
      .set('Origin', ORIGIN)
      .set('Cookie', memberCookie)
      .send({ name: 'Nope', code: 'nope', priceUsd: '1.00', expiresOn: '2027-01-01', preset: 'simple', modules: [] })
      .expect(403);
    expect(createdByMember.body.code).toBe('FORBIDDEN');
    await request(app.getHttpServer()).get('/api/platform/companies').expect(401);
    expect(member.userId).toBeTruthy();
  });

  it('bootstraps a company in one transaction and rejects a bad or duplicate code', async () => {
    const platform = await platformUser();
    const cookie = await loginPlatform(platform.username!);
    const created = await createCompany(cookie, {
      name: 'North',
      code: 'North',
      preset: 'tradivia',
      modules: ['finance', 'hr'],
      expiresOn: '2027-04-01',
      priceUsd: '12.5',
    });
    expect(created.body.code).toBe('north');
    expect(created.body.status).toBe('ACTIVE');
    expect(created.body.priceUsd).toBe('12.50');
    const companyId = created.body.id as string;
    const locations = await prisma.location.findMany({ where: { companyId } });
    expect(locations.map((item) => item.name)).toEqual(['North']);
    const roles = await prisma.role.findMany({ where: { companyId }, orderBy: { key: 'asc' } });
    expect(roles.map((item) => item.key)).toEqual(['EMPLOYEE', 'GENERAL_MANAGER', 'MONITOR', 'SUPERVISOR']);
    const modules = await prisma.companyModule.findMany({ where: { companyId } });
    expect(modules).toHaveLength(6);
    expect(modules.find((item) => item.moduleKey === 'finance')?.enabled).toBe(true);
    expect(modules.find((item) => item.moduleKey === 'gold')?.enabled).toBe(false);
    const audit = await prisma.auditEntry.findMany({ where: { companyId } });
    expect(audit).toEqual([
      expect.objectContaining({ action: 'CREATE', targetType: 'company', targetId: companyId, actorUserId: platform.id }),
    ]);

    const duplicate = await createCompany(cookie, { name: 'Other', code: 'NORTH' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CODE_TAKEN');
    const invalid = await createCompany(cookie, { name: 'Bad', code: 'NO SPACE' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');

    await expect(
      app.get(CompaniesService).create(
        {
          name: 'Rolled',
          code: 'rolled',
          priceUsd: '1.00',
          expiresOn: '2027-01-01',
          preset: 'simple',
          modules: [],
        },
        'missing-actor',
      ),
    ).rejects.toThrow();
    expect(await prisma.company.findFirst({ where: { code: 'rolled' } })).toBeNull();
    expect(await prisma.location.count({ where: { name: 'Rolled' } })).toBe(0);
  });

  it('reads and updates a company without turning a past date into suspension', async () => {
    const platform = await platformUser();
    const cookie = await loginPlatform(platform.username!);
    const created = await createCompany(cookie, { name: 'Kept', code: 'kept', expiresOn: shiftDate(todayInDamascus(), -1) });
    expect(created.body.status).toBe('ACTIVE');
    const companyId = created.body.id as string;
    const detail = await request(app.getHttpServer()).get(`/api/platform/companies/${companyId}`).set('Cookie', cookie).expect(200);
    expect(detail.body.counts).toEqual({ branches: 1, users: 0 });
    expect(detail.body.modules).toHaveLength(6);
    expect(JSON.stringify(detail.body)).not.toMatch(/passwordHash/);

    await request(app.getHttpServer()).get('/api/platform/companies/missing-company').set('Cookie', cookie).expect(404);
    const renamed = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${companyId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Kept Two', code: 'kept-two', priceUsd: '8.00', expiresOn: '2027-08-01' })
      .expect(200);
    expect(renamed.body).toMatchObject({ name: 'Kept Two', code: 'kept-two', priceUsd: '8.00', status: 'ACTIVE' });

    await createCompany(cookie, { name: 'Taken', code: 'taken' });
    const clash = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${companyId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Kept Two', code: 'Taken', priceUsd: '8.00', expiresOn: '2027-08-01' })
      .expect(409);
    expect(clash.body.code).toBe('CODE_TAKEN');
    const updates = await prisma.auditEntry.count({ where: { companyId, action: 'UPDATE' } });
    expect(updates).toBe(1);
  });

  it('suspends and activates without mixing expiration into manual suspension', async () => {
    const platform = await platformUser();
    const cookie = await loginPlatform(platform.username!);
    const created = await createCompany(cookie, { name: 'Shop', code: 'shop', preset: 'simple' });
    const companyId = created.body.id as string;
    const role = await prisma.role.findFirstOrThrow({ where: { companyId, key: 'OWNER' } });
    const member = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: 'Owner', passwordHash: await passwords.hash('Owner1234'), status: UserStatus.ACTIVE },
    });
    await prisma.membership.create({
      data: { userId: member.id, companyId, username: 'owner', roleId: role.id },
    });
    const memberCookie = await loginMember('shop', 'owner');
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', memberCookie).expect(200);

    const suspended = await request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/suspend`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(201);
    expect(suspended.body.status).toBe('SUSPENDED');
    await request(app.getHttpServer()).get(`/api/platform/companies/${companyId}`).set('Cookie', cookie).expect(200);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', memberCookie).expect(401);
    const memberDetail = await request(app.getHttpServer())
      .get(`/api/platform/companies/${companyId}`)
      .set('Cookie', memberCookie)
      .expect(401);
    expect(memberDetail.body.code).toBe('UNAUTHORIZED');

    const past = await request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/activate`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ expiresOn: shiftDate(todayInDamascus(), -1) })
      .expect(400);
    expect(past.body.code).toBe('DATE_PAST');
    expect((await prisma.company.findUnique({ where: { id: companyId } }))?.status).toBe(CompanyStatus.SUSPENDED);

    const today = todayInDamascus();
    const activated = await request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/activate`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ expiresOn: today })
      .expect(201);
    expect(activated.body).toMatchObject({ status: 'ACTIVE', expiresOn: today });
    const renewed = await loginMember('shop', 'owner');
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', renewed).expect(200);

    const expired = await createCompany(cookie, { name: 'Old', code: 'old', expiresOn: shiftDate(today, -1) });
    expect(expired.body.status).toBe('ACTIVE');
    await addOwner(expired.body.id as string, 'old-owner');
    const expiredLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ companyCode: 'old', username: 'old-owner', password: 'Owner1234' })
      .expect(403);
    expect(expiredLogin.body.code).toBe('SUBSCRIPTION_EXPIRED');
    expect(role.visibilityScope).toBe(VisibilityScope.ALL_BRANCHES);
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

  async function loginPlatform(username: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/platform/login')
      .set('Origin', ORIGIN)
      .send({ username, password: 'Operator1' })
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

  async function memberOf(companyCode: string, username: string) {
    const company = await prisma.company.findFirstOrThrow({ where: { code: companyCode } });
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: company.id, canManageUsers: true } });
    const user = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: username, passwordHash: await passwords.hash('Owner1234'), status: UserStatus.ACTIVE },
    });
    await prisma.membership.create({
      data: { userId: user.id, companyId: company.id, username, roleId: role.id },
    });
    return { userId: user.id };
  }

  async function addOwner(companyId: string, username: string) {
    const role = await prisma.role.findFirstOrThrow({ where: { companyId, key: 'OWNER' } });
    const user = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: username, passwordHash: await passwords.hash('Owner1234'), status: UserStatus.ACTIVE },
    });
    await prisma.membership.create({ data: { userId: user.id, companyId, username, roleId: role.id } });
  }

  function createCompany(
    cookie: string,
    input: {
      name: string;
      code: string;
      preset?: 'tradivia' | 'simple';
      modules?: string[];
      expiresOn?: string;
      priceUsd?: string;
      statusDate?: string;
    },
  ) {
    return request(app.getHttpServer())
      .post('/api/platform/companies')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        name: input.name,
        code: input.code,
        priceUsd: input.priceUsd ?? '10.00',
        expiresOn: input.expiresOn ?? input.statusDate ?? '2027-04-01',
        preset: input.preset ?? 'simple',
        modules: input.modules ?? [],
      });
  }
});

function cookieOf(response: { headers: Record<string, string | string[] | undefined> }) {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const header = list.find((item) => item.startsWith('ug_access='));
  if (!header) throw new Error('ug_access cookie was not set');
  return header.split(';')[0];
}

function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
