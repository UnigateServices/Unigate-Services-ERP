import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CompanyStatus, UserKind, UserStatus } from '@prisma/client';
import { todayInDamascus } from '@unigate/shared';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PasswordService } from '../../auth/password.service';
import { SessionService } from '../../auth/session.service';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';
import { csrfGuard } from '../../common/csrf';
import { validationExceptionFactory } from '../../common/validation';
import { PrismaService } from '../../prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';

describe('platform support context', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let sessions: SessionService;

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
    sessions = app.get(SessionService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "audit_entries", "company_modules", "memberships", "roles", "locations", "companies", "users" CASCADE',
    );
  });

  it('lets a platform operator enter active, suspended, and expired companies', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const before = sessions.verify(tokenOf(cookie));
    const active = await company('Active', 'active', CompanyStatus.ACTIVE, '2027-04-01');
    const suspended = await company('Paused', 'paused', CompanyStatus.SUSPENDED, '2027-04-01');
    const expired = await company('Old', 'old', CompanyStatus.ACTIVE, shiftDate(todayInDamascus(), -1));

    const entered = await enter(active.id, cookie);
    expect(entered.status).toBe(200);
    const supportCookie = cookieOf(entered);
    const after = sessions.verify(tokenOf(supportCookie));
    expect(after?.expiresAt).toBe(before?.expiresAt);
    expect(after?.actingCompanyId).toBe(active.id);
    expect(after?.actor).toBe('platform');
    expect(after?.userId).toBe(operator.id);

    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', supportCookie).expect(200);
    expect(me.body.actingCompany).toEqual({ id: active.id, name: 'Active', code: 'active', status: 'ACTIVE' });
    expect(me.body.actor).toBe('platform');
    expect(JSON.stringify(me.body)).not.toMatch(/priceUsd|expiresOn|passwordHash/);
    expect(await prisma.auditEntry.count({ where: { companyId: active.id, action: 'ENTER' } })).toBe(1);
    expect(await prisma.membership.count({ where: { companyId: active.id } })).toBe(0);

    const switched = await enter(suspended.id, supportCookie);
    const switchedCookie = cookieOf(switched);
    const switchedMe = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', switchedCookie).expect(200);
    expect(switchedMe.body.actingCompany.id).toBe(suspended.id);
    expect(switchedMe.body.actingCompany.status).toBe('SUSPENDED');
    expect(sessions.verify(tokenOf(switchedCookie))?.expiresAt).toBe(before?.expiresAt);

    const expiredEntry = await enter(expired.id, switchedCookie);
    const expiredMe = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookieOf(expiredEntry)).expect(200);
    expect(expiredMe.body.actingCompany).toMatchObject({ id: expired.id, status: 'ACTIVE' });
    await request(app.getHttpServer()).get('/api/platform/companies/missing').set('Cookie', cookie).expect(404);
    const missing = await enter('missing-company', cookie);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('rejects members and anonymous callers, and ignores a forged acting company', async () => {
    await platformUser();
    const active = await company('Active', 'active', CompanyStatus.ACTIVE, '2027-04-01');
    await request(app.getHttpServer()).post(`/api/platform/companies/${active.id}/enter`).set('Origin', ORIGIN).expect(401);
    const operatorCookie = await loginPlatform();
    await enter(active.id, operatorCookie);
    const role = await prisma.role.create({
      data: {
        companyId: active.id,
        key: 'OWNER',
        name: 'Owner',
        canManageUsers: true,
        visibilityScope: 'ALL_BRANCHES',
      },
    });
    const member = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: 'Owner', passwordHash: await passwords.hash('Owner1234'), status: UserStatus.ACTIVE },
    });
    await prisma.membership.create({
      data: { userId: member.id, companyId: active.id, username: 'owner', roleId: role.id },
    });
    const memberCookie = cookieOf(
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ companyCode: 'active', username: 'owner', password: 'Owner1234' })
        .expect(200),
    );
    const forbidden = await request(app.getHttpServer())
      .post(`/api/platform/companies/${active.id}/enter`)
      .set('Origin', ORIGIN)
      .set('Cookie', memberCookie)
      .send({ actingCompanyId: 'co_other' })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    const memberMe = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', memberCookie).expect(200);
    expect(memberMe.body.company.id).toBe(active.id);
    expect(JSON.stringify(memberMe.body)).not.toContain('co_other');
  });

  it('clears support context on leave and keeps the operator signed in', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const first = await company('Alpha', 'alpha', CompanyStatus.ACTIVE, '2027-04-01');
    const second = await company('Beta', 'beta', CompanyStatus.ACTIVE, '2027-04-01');
    const none = await request(app.getHttpServer())
      .post(`/api/platform/companies/${first.id}/leave`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(409);
    expect(none.body.code).toBe('CONFLICT');

    const entered = cookieOf(await enter(first.id, cookie));
    const mismatch = await request(app.getHttpServer())
      .post(`/api/platform/companies/${second.id}/leave`)
      .set('Origin', ORIGIN)
      .set('Cookie', entered)
      .expect(409);
    expect(mismatch.body.code).toBe('CONFLICT');
    expect((await me(entered)).body.actingCompany.id).toBe(first.id);

    const left = await request(app.getHttpServer())
      .post(`/api/platform/companies/${first.id}/leave`)
      .set('Origin', ORIGIN)
      .set('Cookie', entered)
      .expect(200);
    const plain = cookieOf(left);
    expect(sessions.verify(tokenOf(plain))?.expiresAt).toBe(sessions.verify(tokenOf(entered))?.expiresAt);
    const after = await me(plain);
    expect(after.body.actor).toBe('platform');
    expect(after.body.actingCompany).toBeNull();
    expect(after.body.userId).toBeTruthy();
    await request(app.getHttpServer()).get('/api/platform/companies').set('Cookie', plain).expect(200);
  });

  it('keeps platform support when the customer is suspended or expired, and drops it when the operator is not', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const shop = await company('Shop', 'shop', CompanyStatus.ACTIVE, '2027-04-01');
    const support = cookieOf(await enter(shop.id, cookie));
    await prisma.company.update({ where: { id: shop.id }, data: { status: CompanyStatus.SUSPENDED } });
    const suspended = await me(support);
    expect(suspended.body.actingCompany.status).toBe('SUSPENDED');
    await prisma.company.update({
      where: { id: shop.id },
      data: { status: CompanyStatus.ACTIVE, expiresOn: new Date(`${shiftDate(todayInDamascus(), -1)}T00:00:00.000Z`) },
    });
    expect((await me(support)).status).toBe(200);

    await prisma.user.update({ where: { id: operator.id }, data: { status: UserStatus.INACTIVE } });
    await me(support).expect(401);
    await prisma.user.update({ where: { id: operator.id }, data: { status: UserStatus.ACTIVE, authVersion: 4 } });
    await me(support).expect(401);
    const tampered = support.slice(0, -4) + 'xxxx';
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', tampered).expect(401);
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

  function company(name: string, code: string, status: CompanyStatus, expiresOn: string) {
    return prisma.company.create({
      data: { name, code, status, priceUsd: '10.00', expiresOn: new Date(`${expiresOn}T00:00:00.000Z`) },
    });
  }

  function enter(companyId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/enter`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
  }

  function me(cookie: string) {
    return request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
  }
});

function cookieOf(response: { headers: Record<string, string | string[] | undefined> }) {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const header = list.find((item) => item.startsWith('ug_access='));
  if (!header) throw new Error('ug_access cookie was not set');
  return header.split(';')[0];
}

function tokenOf(cookie: string) {
  return cookie.slice('ug_access='.length);
}

function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
