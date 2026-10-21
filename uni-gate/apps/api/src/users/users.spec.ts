import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RecordStatus, UserKind, UserStatus, VisibilityScope } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PasswordService } from '../auth/password.service';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { csrfGuard } from '../common/csrf';
import { validationExceptionFactory } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';

describe('customer users', () => {
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

  it('lists and reads company users for a platform operator only', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const beta = await createCompany(cookie, 'Beta', 'beta', 'simple');
    const home = await locationId(alpha.id, 'Alpha');
    const depot = await createLocation(cookie, alpha.id, 'Depot');
    await createUser(cookie, alpha.id, userBody({ name: 'Zed', username: 'zed', roleKey: 'SUPERVISOR', locationId: home }));
    await createUser(cookie, alpha.id, userBody({ name: 'Ada', username: 'ada', roleKey: 'EMPLOYEE', locationId: depot }));
    await createUser(cookie, beta.id, userBody({ name: 'Bea', username: 'bea', roleKey: 'STAFF', locationId: await locationId(beta.id, 'Beta') }));

    const page = await request(app.getHttpServer())
      .get(`/api/platform/companies/${alpha.id}/users`)
      .query({ page: 1, pageSize: 1, companyId: beta.id })
      .set('Cookie', cookie)
      .expect(200);
    expect(page.body.total).toBe(2);
    expect(page.body.pageSize).toBe(1);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].name).toBe('Ada');
    expect(page.body.items.map((item: { id: string }) => item.id)).not.toContain(operator.id);
    expect(JSON.stringify(page.body)).not.toMatch(/passwordHash|authVersion|failedLoginCount|lockedUntil/);

    const byName = await request(app.getHttpServer())
      .get(`/api/platform/companies/${alpha.id}/users`)
      .query({ q: 'ze' })
      .set('Cookie', cookie)
      .expect(200);
    expect(byName.body.items.map((item: { username: string }) => item.username)).toEqual(['zed']);
    const byUsername = await request(app.getHttpServer())
      .get(`/api/platform/companies/${alpha.id}/users`)
      .query({ q: 'ADA' })
      .set('Cookie', cookie)
      .expect(200);
    expect(byUsername.body.items).toHaveLength(1);
    await request(app.getHttpServer()).get(`/api/platform/companies/${alpha.id}/users`).query({ pageSize: 101 }).set('Cookie', cookie).expect(400);
    await request(app.getHttpServer()).get(`/api/platform/companies/${alpha.id}/users`).query({ page: 10001 }).set('Cookie', cookie).expect(400);

    const detail = await request(app.getHttpServer())
      .get(`/api/platform/companies/${alpha.id}/users/${page.body.items[0].id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(detail.body.username).toBe('ada');
    expect(detail.body.role.key).toBe('EMPLOYEE');
    expect(detail.body.location.name).toBe('Depot');

    const hidden = await request(app.getHttpServer())
      .get(`/api/platform/companies/${beta.id}/users/${page.body.items[0].id}`)
      .set('Cookie', cookie)
      .expect(404);
    expect(hidden.body.code).toBe('NOT_FOUND');

    const memberCookie = await loginMember('alpha', 'zed');
    await request(app.getHttpServer()).get(`/api/platform/companies/${alpha.id}/users`).set('Cookie', memberCookie).expect(403);
    await request(app.getHttpServer()).get(`/api/platform/companies/${alpha.id}/users`).expect(401);
  });

  it('creates a member and membership together and rejects bad assignments', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const beta = await createCompany(cookie, 'Beta', 'beta', 'simple');
    const home = await locationId(alpha.id, 'Alpha');
    const foreignRole = await prisma.role.findFirstOrThrow({ where: { companyId: beta.id, key: 'STAFF' } });
    const foreignLocation = await locationId(beta.id, 'Beta');

    const created = await createUser(cookie, alpha.id, userBody({ name: 'Ada', username: 'Ada', roleKey: 'GENERAL_MANAGER', locationId: null, email: 'ada@example.com' }));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Ada', username: 'Ada', email: 'ada@example.com', status: 'ACTIVE', location: null });
    expect(created.body.role.key).toBe('GENERAL_MANAGER');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: created.body.id }, include: { membership: true } });
    expect(stored.kind).toBe(UserKind.MEMBER);
    expect(stored.username).toBeNull();
    expect(stored.membership?.username).toBe('Ada');
    expect(stored.membership?.companyId).toBe(alpha.id);
    expect(await passwords.verify('Secret123', stored.passwordHash)).toBe(true);
    const audit = await prisma.auditEntry.findFirstOrThrow({ where: { targetType: 'user', targetId: stored.id } });
    expect(audit).toMatchObject({ action: 'CREATE', actorUserId: operator.id, companyId: alpha.id });

    const duplicate = await createUser(cookie, alpha.id, userBody({ name: 'Other', username: 'ada', roleKey: 'EMPLOYEE', locationId: home }));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('NAME_TAKEN');
    expect(await prisma.user.count({ where: { kind: UserKind.MEMBER, membership: { companyId: alpha.id } } })).toBe(1);

    const otherCompany = await createUser(cookie, beta.id, userBody({ name: 'Ada Two', username: 'ADA', roleKey: 'OWNER', locationId: null }));
    expect(otherCompany.status).toBe(201);

    const before = await prisma.user.count();
    const badRole = await createUser(cookie, alpha.id, { ...userBody({ name: 'Nope', username: 'nope', locationId: home }), roleId: foreignRole.id });
    expect(badRole.status).toBe(404);
    const badLocation = await createUser(cookie, alpha.id, userBody({ name: 'Nope', username: 'nope', roleKey: 'EMPLOYEE', locationId: foreignLocation }));
    expect(badLocation.status).toBe(404);
    const withLocation = await createUser(cookie, alpha.id, userBody({ name: 'Nope', username: 'nope', roleKey: 'GENERAL_MANAGER', locationId: home }));
    expect(withLocation.status).toBe(400);
    expect(withLocation.body.code).toBe('VALIDATION_ERROR');
    const missingLocation = await createUser(cookie, alpha.id, userBody({ name: 'Nope', username: 'nope', roleKey: 'EMPLOYEE', locationId: null }));
    expect(missingLocation.status).toBe(400);
    expect(missingLocation.body.code).toBe('LOCATION_REQUIRED');
    await prisma.location.update({ where: { id: home }, data: { status: RecordStatus.INACTIVE } });
    const inactive = await createUser(cookie, alpha.id, userBody({ name: 'Nope', username: 'nope', roleKey: 'EMPLOYEE', locationId: home }));
    expect(inactive.status).toBe(400);
    expect(await prisma.user.count()).toBe(before);
    const weak = await createUser(cookie, alpha.id, userBody({ name: 'Nope', username: 'nope', roleKey: 'GENERAL_MANAGER', locationId: null, password: 'short' }));
    expect(weak.status).toBe(400);
  });

  it('updates a user, keeps an inactive branch only when the assignment stays the same, and audits platform edits', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const home = await locationId(alpha.id, 'Alpha');
    const depot = await createLocation(cookie, alpha.id, 'Depot');
    const created = await createUser(cookie, alpha.id, userBody({ name: 'Ada', username: 'ada', roleKey: 'EMPLOYEE', locationId: home }));
    const userId = created.body.id as string;
    const version = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).authVersion;
    await prisma.location.update({ where: { id: home }, data: { status: RecordStatus.INACTIVE } });

    const renamed = await patchUser(cookie, alpha.id, userId, {
      ...(await currentBody(alpha.id, userId)),
      name: 'Ada West',
      email: 'west@example.com',
      phone: '123',
      username: 'ada.west',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Ada West', username: 'ada.west', email: 'west@example.com', phone: '123' });
    expect(renamed.body.location.id).toBe(home);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).authVersion).toBe(version);
    expect((await prisma.membership.findFirstOrThrow({ where: { userId } })).companyId).toBe(alpha.id);

    await prisma.location.update({ where: { id: depot }, data: { status: RecordStatus.INACTIVE } });
    const blocked = await patchUser(cookie, alpha.id, userId, {
      ...(await currentBody(alpha.id, userId)),
      roleKey: 'SUPERVISOR',
      locationId: depot,
    });
    expect(blocked.status).toBe(400);
    expect((await prisma.membership.findFirstOrThrow({ where: { userId } })).locationId).toBe(home);

    const beta = await createCompany(cookie, 'Beta', 'beta');
    const foreign = await patchUser(cookie, beta.id, userId, { ...(await currentBody(alpha.id, userId)), roleKey: undefined });
    expect(foreign.status).toBe(404);
    const foreignRole = await prisma.role.findFirstOrThrow({ where: { companyId: beta.id, key: 'OWNER' } });
    const roleBlocked = await patchUser(cookie, alpha.id, userId, { ...(await currentBody(alpha.id, userId)), roleKey: undefined, roleId: foreignRole.id, locationId: null });
    expect(roleBlocked.status).toBe(404);

    const updates = await prisma.auditEntry.count({ where: { targetType: 'user', targetId: userId, action: 'UPDATE', actorUserId: operator.id } });
    expect(updates).toBeGreaterThan(0);
  });

  it('limits member managers to their branch and blocks self administration', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const home = await locationId(alpha.id, 'Alpha');
    const depot = await createLocation(cookie, alpha.id, 'Depot');
    const ownRole = await createRole(cookie, alpha.id, { key: 'LOCAL_LEAD', name: 'Local lead', visibilityScope: 'OWN', canManageUsers: true });
    await createUser(cookie, alpha.id, userBody({ name: 'Chief', username: 'chief', roleKey: 'GENERAL_MANAGER', locationId: null }));
    await createUser(cookie, alpha.id, userBody({ name: 'Home Lead', username: 'home', roleKey: 'SUPERVISOR', locationId: home }));
    await createUser(cookie, alpha.id, userBody({ name: 'Depot Lead', username: 'depot', roleKey: 'SUPERVISOR', locationId: depot }));
    const local = await createUser(cookie, alpha.id, userBody({ name: 'Local', username: 'local', roleId: ownRole.body.id, locationId: home }));

    const chiefCookie = await loginMember('alpha', 'chief');
    const all = await request(app.getHttpServer()).get('/api/users').query({ companyId: 'other-company' }).set('Cookie', chiefCookie).expect(200);
    expect(all.body.total).toBe(4);

    const homeCookie = await loginMember('alpha', 'home');
    const homeList = await request(app.getHttpServer()).get('/api/users').set('Cookie', homeCookie).expect(200);
    expect(homeList.body.items.map((item: { username: string }) => item.username).sort()).toEqual(['home']);
    const depotUser = await prisma.membership.findFirstOrThrow({ where: { username: 'depot' } });
    await request(app.getHttpServer()).get(`/api/users/${depotUser.userId}`).set('Cookie', homeCookie).expect(404);
    await request(app.getHttpServer())
      .patch(`/api/users/${depotUser.userId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', homeCookie)
      .send(apiBody(await currentBody(alpha.id, depotUser.userId)))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/users/${depotUser.userId}/password`)
      .set('Origin', ORIGIN)
      .set('Cookie', homeCookie)
      .send({ password: 'Secret123' })
      .expect(404);

    const chief = await prisma.membership.findFirstOrThrow({ where: { username: 'chief' } });
    await request(app.getHttpServer()).get(`/api/users/${chief.userId}`).set('Cookie', homeCookie).expect(404);
    const wideRole = await prisma.role.findFirstOrThrow({ where: { companyId: alpha.id, key: 'GENERAL_MANAGER' } });
    const assignWide = await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', homeCookie)
      .send({ name: 'Wide', username: 'wide', password: 'Secret123', email: null, phone: null, roleId: wideRole.id, locationId: null });
    expect(assignWide.status).toBe(403);
    const employeeRole = await prisma.role.findFirstOrThrow({ where: { companyId: alpha.id, key: 'EMPLOYEE' } });
    const assignOther = await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', homeCookie)
      .send({ name: 'Other', username: 'other', password: 'Secret123', email: null, phone: null, roleId: employeeRole.id, locationId: depot });
    expect(assignOther.status).toBe(403);

    const ownCookie = await loginMember('alpha', 'local');
    const ownList = await request(app.getHttpServer()).get('/api/users').set('Cookie', ownCookie).expect(200);
    expect(ownList.body.items.map((item: { username: string }) => item.username).sort()).toEqual(['local']);

    // A branch manager does not reach a peer who can manage users, and cannot grant that permission.
    const peer = local.body.id as string;
    await request(app.getHttpServer()).get(`/api/users/${peer}`).set('Cookie', homeCookie).expect(404);
    await request(app.getHttpServer())
      .post(`/api/users/${peer}/password`)
      .set('Origin', ORIGIN)
      .set('Cookie', homeCookie)
      .send({ password: 'Taken1234' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/users/${peer}`)
      .set('Origin', ORIGIN)
      .set('Cookie', homeCookie)
      .send({ ...apiBody(await currentBody(alpha.id, peer)), status: 'INACTIVE' })
      .expect(404);
    const supervisorRole = await prisma.role.findFirstOrThrow({ where: { companyId: alpha.id, key: 'SUPERVISOR' } });
    const grant = await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', homeCookie)
      .send({ name: 'Second', username: 'second', password: 'Secret123', email: null, phone: null, roleId: supervisorRole.id, locationId: home });
    expect(grant.status).toBe(403);
    const staff = await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Cookie', homeCookie)
      .send({ name: 'Staff', username: 'staff', password: 'Secret123', email: null, phone: null, roleId: employeeRole.id, locationId: home })
      .expect(201);
    const promote = await request(app.getHttpServer())
      .patch(`/api/users/${staff.body.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', homeCookie)
      .send({ ...apiBody(await currentBody(alpha.id, staff.body.id)), roleId: supervisorRole.id });
    expect(promote.status).toBe(403);
    const homeLead = await prisma.membership.findFirstOrThrow({ where: { username: 'home' } });
    expect(await prisma.auditEntry.count({ where: { targetId: staff.body.id, action: 'CREATE', actorUserId: homeLead.userId } })).toBe(1);
    const ownProfile = await request(app.getHttpServer())
      .patch(`/api/users/${homeLead.userId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', homeCookie)
      .send({ ...apiBody(await currentBody(alpha.id, homeLead.userId)), name: 'Home Lead West' });
    expect(ownProfile.status).toBe(200);

    await createUser(cookie, alpha.id, userBody({ name: 'Clerk', username: 'clerk', roleKey: 'EMPLOYEE', locationId: home }));
    const clerkCookie = await loginMember('alpha', 'clerk');
    const forbidden = await request(app.getHttpServer()).get('/api/users').set('Cookie', clerkCookie).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const self = await request(app.getHttpServer())
      .patch(`/api/users/${chief.userId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', chiefCookie)
      .send({ ...apiBody(await currentBody(alpha.id, chief.userId)), status: 'INACTIVE' })
      .expect(409);
    expect(self.body.code).toBe('CONFLICT');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: chief.userId } })).status).toBe(UserStatus.ACTIVE);
    const monitor = await prisma.role.findFirstOrThrow({ where: { companyId: alpha.id, key: 'MONITOR' } });
    await request(app.getHttpServer())
      .patch(`/api/users/${chief.userId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', chiefCookie)
      .send({ ...apiBody(await currentBody(alpha.id, chief.userId)), roleId: monitor.id, locationId: null })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/users/${chief.userId}/password`)
      .set('Origin', ORIGIN)
      .set('Cookie', chiefCookie)
      .send({ password: 'Secret123' })
      .expect(409);
    const ownPassword = await request(app.getHttpServer())
      .post('/api/auth/password')
      .set('Origin', ORIGIN)
      .set('Cookie', chiefCookie)
      .send({ currentPassword: 'Secret123', newPassword: 'Changed123' })
      .expect(204);
    expect(ownPassword.status).toBe(204);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', chiefCookie).expect(401);
    expect(local.body.id).toBeTruthy();
  });

  it('resets passwords, applies live role and status changes, and follows support context', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const beta = await createCompany(cookie, 'Beta', 'beta', 'simple');
    const home = await locationId(alpha.id, 'Alpha');
    const created = await createUser(cookie, alpha.id, userBody({ name: 'Ada', username: 'ada', roleKey: 'EMPLOYEE', locationId: home }));
    const userId = created.body.id as string;
    const adaCookie = await loginMember('alpha', 'ada');
    await prisma.user.update({ where: { id: userId }, data: { failedLoginCount: 4, lockedUntil: new Date(Date.now() + 60_000) } });
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).authVersion;

    const weak = await request(app.getHttpServer())
      .post(`/api/platform/companies/${alpha.id}/users/${userId}/password`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ password: 'password' })
      .expect(400);
    expect(weak.body.code).toBe('VALIDATION_ERROR');

    await request(app.getHttpServer())
      .post(`/api/platform/companies/${alpha.id}/users/${userId}/password`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ password: 'Reset1234' })
      .expect(204);
    const resetUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(resetUser.authVersion).toBe(before + 1);
    expect(resetUser.failedLoginCount).toBe(0);
    expect(resetUser.lockedUntil).toBeNull();
    expect(await passwords.verify('Reset1234', resetUser.passwordHash)).toBe(true);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', adaCookie).expect(401);
    expect(await prisma.auditEntry.count({ where: { targetType: 'user', targetId: userId, action: 'UPDATE' } })).toBe(1);

    const fresh = await loginMember('alpha', 'ada', 'Reset1234');
    const version = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).authVersion;
    const promoted = await patchUser(cookie, alpha.id, userId, { ...(await currentBody(alpha.id, userId)), roleId: undefined, roleKey: 'MONITOR', locationId: null });
    expect(promoted.status).toBe(200);
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', fresh).expect(200);
    expect(me.body.roleKey).toBe('MONITOR');
    expect(me.body.locationId).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).authVersion).toBe(version);

    const stationed = await patchUser(cookie, alpha.id, userId, { ...(await currentBody(alpha.id, userId)), roleId: undefined, roleKey: 'SUPERVISOR', locationId: home });
    expect(stationed.status).toBe(200);
    const moved = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', fresh).expect(200);
    expect(moved.body.locationId).toBe(home);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).authVersion).toBe(version);

    const deactivated = await patchUser(cookie, alpha.id, userId, { ...(await currentBody(alpha.id, userId)), status: 'INACTIVE' });
    expect(deactivated.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).authVersion).toBe(version + 1);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', fresh).expect(401);
    const reactivated = await patchUser(cookie, alpha.id, userId, { ...(await currentBody(alpha.id, userId)), status: 'ACTIVE' });
    expect(reactivated.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).authVersion).toBe(version + 1);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', fresh).expect(401);
    await patchUser(cookie, alpha.id, userId, { ...(await currentBody(alpha.id, userId)), status: 'INACTIVE' });
    const lockedOut = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ companyCode: 'alpha', username: 'ada', password: 'Reset1234' })
      .expect(403);
    expect(lockedOut.body.code).toBe('INACTIVE');

    await createUser(cookie, alpha.id, userBody({ name: 'Boss', username: 'boss', roleKey: 'GENERAL_MANAGER', locationId: null }));
    const bossCookie = await loginMember('alpha', 'boss');
    const clerk = await createUser(cookie, alpha.id, userBody({ name: 'Clerk', username: 'clerk', roleKey: 'EMPLOYEE', locationId: home }));
    const clerkVersion = (await prisma.user.findUniqueOrThrow({ where: { id: clerk.body.id } })).authVersion;
    await request(app.getHttpServer())
      .post(`/api/users/${clerk.body.id}/password`)
      .set('Origin', ORIGIN)
      .set('Cookie', bossCookie)
      .send({ password: 'Clerk1234' })
      .expect(204);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clerk.body.id } })).authVersion).toBe(clerkVersion + 1);
    const boss = await prisma.membership.findFirstOrThrow({ where: { username: 'boss' } });
    expect(await prisma.auditEntry.count({ where: { targetId: clerk.body.id, action: 'UPDATE', actorUserId: boss.userId } })).toBe(1);

    const inAlpha = await enter(alpha.id, cookie);
    const alphaUsers = await request(app.getHttpServer()).get('/api/users').set('Cookie', inAlpha).expect(200);
    expect(alphaUsers.body.items.map((item: { username: string }) => item.username)).toContain('boss');
    expect(alphaUsers.body.items.map((item: { username: string }) => item.username)).not.toContain('bea');
    await createUser(cookie, beta.id, userBody({ name: 'Bea', username: 'bea', roleKey: 'OWNER', locationId: null }));
    const inBeta = await enter(beta.id, inAlpha);
    const betaUsers = await request(app.getHttpServer()).get('/api/users').set('Cookie', inBeta).expect(200);
    expect(betaUsers.body.items.map((item: { username: string }) => item.username)).toEqual(['bea']);
    const left = await leave(beta.id, inBeta);
    const after = await request(app.getHttpServer()).get('/api/users').set('Cookie', left).expect(409);
    expect(after.body.code).toBe('CONFLICT');
    expect(after.body.items).toBeUndefined();
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

  async function loginMember(companyCode: string, username: string, password = 'Secret123') {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ companyCode, username, password })
      .expect(200);
    return cookieOf(response);
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

  function createLocation(cookie: string, companyId: string, name: string) {
    return request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/locations`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name })
      .expect(201)
      .then((response) => response.body.id as string);
  }

  function locationId(companyId: string, name: string) {
    return prisma.location.findFirstOrThrow({ where: { companyId, name } }).then((row) => row.id);
  }

  function createRole(
    cookie: string,
    companyId: string,
    input: { key: string; name: string; visibilityScope: string; canManageUsers: boolean },
  ) {
    return request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/roles`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        name: input.name,
        key: input.key,
        canManageUsers: input.canManageUsers,
        visibilityScope: input.visibilityScope,
        editRequiresApproval: false,
        deleteRequiresApproval: false,
      });
  }

  async function createUser(cookie: string, companyId: string, body: Record<string, unknown>) {
    const roleId =
      (body.roleId as string | undefined) ??
      (await prisma.role.findFirstOrThrow({ where: { companyId, key: body.roleKey as string } })).id;
    return request(app.getHttpServer())
      .post(`/api/platform/companies/${companyId}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        name: body.name,
        username: body.username,
        password: body.password ?? 'Secret123',
        email: body.email ?? null,
        phone: body.phone ?? null,
        roleId,
        locationId: body.locationId ?? null,
      });
  }

  async function currentBody(companyId: string, userId: string) {
    const membership = await prisma.membership.findFirstOrThrow({
      where: { companyId, userId },
      include: { user: true, role: true },
    });
    return {
      name: membership.user.name,
      username: membership.username,
      email: membership.user.email,
      phone: membership.user.phone,
      status: membership.user.status,
      roleId: membership.roleId,
      roleKey: membership.role.key,
      locationId: membership.locationId,
    };
  }

  async function patchUser(cookie: string, companyId: string, userId: string, body: Record<string, unknown>) {
    const roleId = body.roleId
      ? (body.roleId as string)
      : (await prisma.role.findFirstOrThrow({ where: { companyId, key: body.roleKey as string } })).id;
    return request(app.getHttpServer())
      .patch(`/api/platform/companies/${companyId}/users/${userId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        name: body.name,
        username: body.username,
        email: body.email ?? null,
        phone: body.phone ?? null,
        status: body.status ?? 'ACTIVE',
        roleId,
        locationId: body.locationId ?? null,
      });
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

function userBody(input: Record<string, unknown>) {
  return { password: 'Secret123', email: null, phone: null, ...input };
}

function apiBody(body: Record<string, unknown>) {
  return {
    name: body.name,
    username: body.username,
    email: body.email ?? null,
    phone: body.phone ?? null,
    status: body.status,
    roleId: body.roleId,
    locationId: body.locationId ?? null,
  };
}

function cookieOf(response: { headers: Record<string, string | string[] | undefined> }) {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const header = list.find((item) => item.startsWith('ug_access='));
  if (!header) throw new Error('ug_access cookie was not set');
  return header.split(';')[0];
}
