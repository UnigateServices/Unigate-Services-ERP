import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CompanyStatus, UserKind, UserStatus, VisibilityScope } from '@prisma/client';
import { isSubscriptionExpired, todayInDamascus } from '@unigate/shared';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { accessCookieOptions } from './cookies';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { csrfGuard } from '../common/csrf';
import { validationExceptionFactory } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';

describe('authentication', () => {
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
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "audit_entries", "company_modules", "memberships", "roles", "locations", "companies", "users" CASCADE',
    );
  });

  it('sets an httpOnly SameSite cookie and does not put the password in the response', async () => {
    await platformUser('operator', 'Operator1');
    const response = await post('/api/auth/platform/login', { username: 'operator', password: 'Operator1' }).expect(200);
    const header = setCookie(response);
    expect(header).toMatch(/ug_access=/);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\//);
    expect(header).not.toMatch(/Secure/i);
    expect(JSON.stringify(response.body)).not.toContain('Operator1');
    expect(accessCookieOptions(true).secure).toBe(true);
    expect(accessCookieOptions(false).httpOnly).toBe(true);
  });

  it('logs in a platform operator and reads the current identity', async () => {
    const user = await platformUser('operator', 'Operator1', 'Operator');
    const cookie = await loginPlatform('operator', 'Operator1');
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body).toEqual({
      actor: 'platform',
      userId: user.id,
      name: 'Operator',
      actingCompanyId: null,
    });
    expect(JSON.stringify(me.body)).not.toMatch(/priceUsd|passwordHash|expiresOn/);
  });

  it('rejects a wrong platform password, an inactive operator, and a locked operator', async () => {
    await platformUser('operator', 'Operator1');
    const wrong = await post('/api/auth/platform/login', { username: 'operator', password: 'Wrong123' }).expect(401);
    expect(wrong.body.code).toBe('WRONG_CREDENTIALS');
    const operator = await prisma.user.findFirst({ where: { username: 'operator', kind: UserKind.PLATFORM } });
    if (!operator) throw new Error('operator missing');
    await prisma.user.update({ where: { id: operator.id }, data: { failedLoginCount: 0, lockedUntil: null } });

    await platformUser('inactive', 'Operator1', 'Inactive', UserStatus.INACTIVE);
    const inactive = await post('/api/auth/platform/login', { username: 'inactive', password: 'Operator1' }).expect(403);
    expect(inactive.body.code).toBe('INACTIVE');
    expect(inactive.headers['set-cookie']).toBeUndefined();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await post('/api/auth/platform/login', { username: 'operator', password: 'Wrong123' }).expect(401);
      expect(failed.body.code).toBe('WRONG_CREDENTIALS');
    }
    const locked = await post('/api/auth/platform/login', { username: 'operator', password: 'Operator1' }).expect(401);
    expect(locked.body.code).toBe('LOCKED');
    const row = await prisma.user.findFirst({ where: { username: 'operator' } });
    expect(row?.lockedUntil && row.lockedUntil.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
  });

  it('logs in a member from the company code and ignores a client company id', async () => {
    const member = await memberUser({ code: 'tradivia', username: 'manager', password: 'Manager1', priceUsd: '1234.56' });
    const extra = await post('/api/auth/login', {
      companyCode: 'tradivia',
      username: 'manager',
      password: 'Manager1',
      companyId: 'co_other',
    }).expect(400);
    expect(extra.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(extra.body)).not.toContain('co_other');

    const cookie = await loginMember('TRADiVIA', 'Manager', 'Manager1');
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .query({ companyId: 'co_other' })
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body.company).toEqual({ id: member.companyId, name: 'TRADIVIA', code: 'tradivia' });
    expect(me.body.roleKey).toBe('GENERAL_MANAGER');
    expect(me.body.canManageUsers).toBe(true);
    expect(me.body.locationId).toBeNull();
    expect(JSON.stringify(me.body)).not.toMatch(/priceUsd|1234\.56|passwordHash|expiresOn/);
  });

  it('resolves the same customer username in two companies by company code', async () => {
    const alpha = await memberUser({ code: 'alpha', username: 'owner', password: 'AlphaPass1', name: 'Alpha' });
    const beta = await memberUser({ code: 'beta', username: 'owner', password: 'BetaPass1', name: 'Beta' });
    const alphaCookie = await loginMember('alpha', 'owner', 'AlphaPass1');
    const betaCookie = await loginMember('beta', 'owner', 'BetaPass1');
    const alphaMe = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', alphaCookie).expect(200);
    const betaMe = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', betaCookie).expect(200);
    expect(alphaMe.body.company.id).toBe(alpha.companyId);
    expect(betaMe.body.company.id).toBe(beta.companyId);
    expect(alphaMe.body.userId).not.toBe(betaMe.body.userId);
  });

  it('rejects bad member credentials, inactive users, suspension, and expiry', async () => {
    await memberUser({ code: 'tradivia', username: 'manager', password: 'Manager1' });
    expect((await post('/api/auth/login', { companyCode: 'missing', username: 'manager', password: 'Manager1' })).body.code).toBe(
      'WRONG_CREDENTIALS',
    );
    expect((await post('/api/auth/login', { companyCode: 'tradivia', username: 'nobody', password: 'Manager1' })).body.code).toBe(
      'WRONG_CREDENTIALS',
    );
    expect((await post('/api/auth/login', { companyCode: 'tradivia', username: 'manager', password: 'Wrong123' })).body.code).toBe(
      'WRONG_CREDENTIALS',
    );

    await memberUser({ code: 'quiet', username: 'staff', password: 'Manager1', userStatus: UserStatus.INACTIVE });
    expect((await post('/api/auth/login', { companyCode: 'quiet', username: 'staff', password: 'Manager1' })).body.code).toBe('INACTIVE');

    await memberUser({ code: 'ofoq', username: 'owner', password: 'Owner1234', companyStatus: CompanyStatus.SUSPENDED });
    expect((await post('/api/auth/login', { companyCode: 'ofoq', username: 'owner', password: 'Owner1234' })).body.code).toBe(
      'COMPANY_SUSPENDED',
    );

    const today = todayInDamascus();
    await memberUser({ code: 'lastday', username: 'owner', password: 'Owner1234', expiresOn: today });
    await post('/api/auth/login', { companyCode: 'lastday', username: 'owner', password: 'Owner1234' }).expect(200);
    expect(isSubscriptionExpired(today, today)).toBe(false);

    await memberUser({ code: 'expired', username: 'owner', password: 'Owner1234', expiresOn: shiftDate(today, -1) });
    expect((await post('/api/auth/login', { companyCode: 'expired', username: 'owner', password: 'Owner1234' })).body.code).toBe(
      'SUBSCRIPTION_EXPIRED',
    );
  });

  it('locks a member after five failed attempts', async () => {
    await memberUser({ code: 'tradivia', username: 'manager', password: 'Manager1' });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await post('/api/auth/login', { companyCode: 'tradivia', username: 'manager', password: 'Wrong123' })).body.code).toBe(
        'WRONG_CREDENTIALS',
      );
    }
    expect((await post('/api/auth/login', { companyCode: 'tradivia', username: 'manager', password: 'Manager1' })).body.code).toBe('LOCKED');
  });

  it('rejects a missing, tampered, expired, or stale session', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    const member = await memberUser({ code: 'tradivia', username: 'manager', password: 'Manager1' });
    const cookie = await loginMember('tradivia', 'manager', 'Manager1');
    const tampered = cookie.slice(0, -4) + 'xxxx';
    expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', tampered)).status).toBe(401);

    const expired = sessions.sign(
      { userId: member.userId, actor: 'member', authVersion: 1, actingCompanyId: null },
      -30,
    );
    expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', `ug_access=${expired}`)).status).toBe(401);

    await prisma.user.update({ where: { id: member.userId }, data: { authVersion: 9 } });
    const stale = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    expect(stale.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects an existing session after the company is suspended, the member is inactive, or the subscription expires', async () => {
    const suspended = await memberUser({ code: 'tradivia', username: 'manager', password: 'Manager1' });
    const suspendedCookie = await loginMember('tradivia', 'manager', 'Manager1');
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', suspendedCookie).expect(200);
    await prisma.company.update({ where: { id: suspended.companyId }, data: { status: CompanyStatus.SUSPENDED } });
    await expectRejectedSession(suspendedCookie);

    const inactive = await memberUser({ code: 'quiet', username: 'staff', password: 'Manager1' });
    const inactiveCookie = await loginMember('quiet', 'staff', 'Manager1');
    await prisma.user.update({ where: { id: inactive.userId }, data: { status: UserStatus.INACTIVE } });
    await expectRejectedSession(inactiveCookie);

    const today = todayInDamascus();
    const expired = await memberUser({ code: 'ending', username: 'owner', password: 'Owner1234', expiresOn: today });
    const expiredCookie = await loginMember('ending', 'owner', 'Owner1234');
    await prisma.company.update({
      where: { id: expired.companyId },
      data: { expiresOn: new Date(`${shiftDate(today, -1)}T00:00:00.000Z`) },
    });
    await expectRejectedSession(expiredCookie);
  });

  it('resets the failure count after a successful login and after an expired lock', async () => {
    const member = await memberUser({ code: 'tradivia', username: 'manager', password: 'Manager1' });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await post('/api/auth/login', { companyCode: 'tradivia', username: 'manager', password: 'Wrong123' }).expect(401);
    }
    expect(await failureState(member.userId)).toEqual({ failedLoginCount: 3, lockedUntil: null });

    await loginMember('tradivia', 'manager', 'Manager1');
    expect(await failureState(member.userId)).toEqual({ failedLoginCount: 0, lockedUntil: null });

    await post('/api/auth/login', { companyCode: 'tradivia', username: 'manager', password: 'Wrong123' }).expect(401);
    expect(await failureState(member.userId)).toEqual({ failedLoginCount: 1, lockedUntil: null });

    await prisma.user.update({
      where: { id: member.userId },
      data: { failedLoginCount: 4, lockedUntil: new Date(Date.now() - 60_000) },
    });
    await loginMember('tradivia', 'manager', 'Manager1');
    expect(await failureState(member.userId)).toEqual({ failedLoginCount: 0, lockedUntil: null });
  });

  it('reads role changes from the database without changing authVersion', async () => {
    const member = await memberUser({ code: 'tradivia', username: 'manager', password: 'Manager1' });
    const cookie = await loginMember('tradivia', 'manager', 'Manager1');
    await prisma.role.update({
      where: { id: member.roleId },
      data: { key: 'MONITOR', name: 'Monitor', canManageUsers: false, visibilityScope: VisibilityScope.BRANCH },
    });
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.roleKey).toBe('MONITOR');
    expect(me.body.roleName).toBe('Monitor');
    expect(me.body.canManageUsers).toBe(false);
    expect(me.body.visibility).toBe('BRANCH');
    const user = await prisma.user.findUnique({ where: { id: member.userId } });
    expect(user?.authVersion).toBe(1);
  });

  it('ignores a member token that names another company', async () => {
    const member = await memberUser({ code: 'tradivia', username: 'manager', password: 'Manager1' });
    const token = sessions.sign({
      userId: member.userId,
      actor: 'member',
      authVersion: 1,
      actingCompanyId: 'co_other',
    });
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', `ug_access=${token}`).expect(200);
    expect(me.body.company.id).toBe(member.companyId);
    expect(JSON.stringify(me.body)).not.toContain('co_other');
  });

  it('changes the current password, increments authVersion, and rejects the old session', async () => {
    const member = await memberUser({ code: 'tradivia', username: 'manager', password: 'Manager1' });
    const cookie = await loginMember('tradivia', 'manager', 'Manager1');
    const wrong = await request(app.getHttpServer())
      .post('/api/auth/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ currentPassword: 'Wrong123', newPassword: 'Manager2' })
      .expect(401);
    expect(wrong.body.code).toBe('WRONG_CREDENTIALS');
    const weak = await request(app.getHttpServer())
      .post('/api/auth/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ currentPassword: 'Manager1', newPassword: 'longpassword' })
      .expect(400);
    expect(weak.body.code).toBe('VALIDATION_ERROR');

    const changed = await request(app.getHttpServer())
      .post('/api/auth/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ currentPassword: 'Manager1', newPassword: 'Manager2' })
      .expect(204);
    expect(setCookie(changed)).toMatch(/ug_access=/);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    const user = await prisma.user.findUnique({ where: { id: member.userId } });
    expect(user?.authVersion).toBe(2);
    await loginMember('tradivia', 'manager', 'Manager2');
    expect((await post('/api/auth/login', { companyCode: 'tradivia', username: 'manager', password: 'Manager1' })).status).toBe(401);
  });

  it('resets a password through the service without exposing a user password route', async () => {
    const member = await memberUser({ code: 'tradivia', username: 'manager', password: 'Manager1' });
    const cookie = await loginMember('tradivia', 'manager', 'Manager1');
    await passwords.resetPassword(member.userId, 'Reset1234');
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await loginMember('tradivia', 'manager', 'Reset1234');
    const user = await prisma.user.findUnique({ where: { id: member.userId } });
    expect(user?.authVersion).toBe(2);
    await request(app.getHttpServer())
      .post(`/api/users/${member.userId}/password`)
      .set('Origin', ORIGIN)
      .send({ password: 'Reset1234' })
      .expect(404);
  });

  it('clears the cookie on logout and rejects a state-changing request without an allowed origin', async () => {
    await platformUser('operator', 'Operator1');
    const cookie = await loginPlatform('operator', 'Operator1');
    const logout = await request(app.getHttpServer()).post('/api/auth/logout').set('Origin', ORIGIN).set('Cookie', cookie).expect(204);
    expect(setCookie(logout)).toMatch(/ug_access=/);
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);

    const blocked = await request(app.getHttpServer())
      .post('/api/auth/platform/login')
      .send({ username: 'operator', password: 'Operator1' })
      .expect(403);
    expect(blocked.body.code).toBe('FORBIDDEN');
  });

  async function platformUser(username: string, password: string, name = username, status: UserStatus = UserStatus.ACTIVE) {
    return prisma.user.create({
      data: {
        kind: UserKind.PLATFORM,
        username,
        name,
        passwordHash: await passwords.hash(password),
        status,
      },
    });
  }

  async function memberUser(input: {
    code: string;
    username: string;
    password: string;
    name?: string;
    priceUsd?: string;
    expiresOn?: string;
    companyStatus?: CompanyStatus;
    userStatus?: UserStatus;
  }) {
    const company = await prisma.company.create({
      data: {
        name: input.code.toUpperCase(),
        code: input.code,
        status: input.companyStatus ?? CompanyStatus.ACTIVE,
        priceUsd: input.priceUsd ?? '10.00',
        expiresOn: new Date(`${input.expiresOn ?? '2027-04-01'}T00:00:00.000Z`),
      },
    });
    const role = await prisma.role.create({
      data: {
        companyId: company.id,
        key: 'GENERAL_MANAGER',
        name: 'General manager',
        canManageUsers: true,
        visibilityScope: VisibilityScope.ALL_BRANCHES,
      },
    });
    const user = await prisma.user.create({
      data: {
        kind: UserKind.MEMBER,
        name: input.name ?? input.username,
        passwordHash: await passwords.hash(input.password),
        status: input.userStatus ?? UserStatus.ACTIVE,
      },
    });
    await prisma.membership.create({
      data: {
        userId: user.id,
        companyId: company.id,
        username: input.username,
        roleId: role.id,
      },
    });
    return { userId: user.id, companyId: company.id, roleId: role.id };
  }

  function post(path: string, body: object) {
    return request(app.getHttpServer()).post(path).set('Origin', ORIGIN).send(body);
  }

  async function failureState(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return { failedLoginCount: user?.failedLoginCount ?? null, lockedUntil: user?.lockedUntil ?? null };
  }

  async function expectRejectedSession(cookie: string) {
    const response = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    expect(response.body).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
    });
    const header = setCookie(response);
    expect(header.startsWith('ug_access=;') || header.includes('Max-Age=0') || /Expires=/i.test(header)).toBe(true);
  }

  async function loginPlatform(username: string, password: string) {
    const response = await post('/api/auth/platform/login', { username, password }).expect(200);
    return setCookie(response).split(';')[0];
  }

  async function loginMember(companyCode: string, username: string, password: string) {
    const response = await post('/api/auth/login', { companyCode, username, password }).expect(200);
    return setCookie(response).split(';')[0];
  }
});

function setCookie(response: { headers: Record<string, string | string[] | undefined> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const header = list.find((item) => item.startsWith('ug_access='));
  if (!header) throw new Error('ug_access cookie was not set');
  return header;
}

function shiftDate(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
