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

describe('locations', () => {
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
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const beta = await createCompany(cookie, 'Beta', 'beta');
    await createLocation(cookie, beta.id, 'Depot');

    const listed = await request(app.getHttpServer())
      .get(`/api/platform/companies/${alpha.id}/locations`)
      .set('Cookie', cookie)
      .expect(200);
    expect(listed.body.items).toEqual([
      expect.objectContaining({ name: 'Alpha', status: 'ACTIVE', companyId: alpha.id }),
    ]);
    expect(listed.body.items.map((item: { name: string }) => item.name)).not.toContain('Depot');
    expect(JSON.stringify(listed.body)).not.toMatch(/passwordHash|priceUsd|expiresOn/);

    const before = await prisma.auditEntry.count();
    await request(app.getHttpServer()).get(`/api/platform/companies/${alpha.id}/locations`).set('Cookie', cookie).expect(200);
    expect(await prisma.auditEntry.count()).toBe(before);

    const memberCookie = await loginMember('alpha', await member(alpha.id, 'all', 'OWNER', null));
    const forbidden = await request(app.getHttpServer())
      .get(`/api/platform/companies/${alpha.id}/locations`)
      .set('Cookie', memberCookie)
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    await request(app.getHttpServer())
      .post(`/api/platform/companies/${alpha.id}/locations`)
      .set('Origin', ORIGIN)
      .set('Cookie', memberCookie)
      .send({ name: 'Nope' })
      .expect(403);
    await request(app.getHttpServer()).get(`/api/platform/companies/${alpha.id}/locations`).expect(401);
    await request(app.getHttpServer()).get('/api/platform/companies/missing-company/locations').set('Cookie', cookie).expect(404);
    expect(operator.id).toBeTruthy();
  });

  it('creates an active branch in the route company and rejects a duplicate name', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const beta = await createCompany(cookie, 'Beta', 'beta');

    const created = await createLocation(cookie, alpha.id, '  Depot  ');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Depot', status: 'ACTIVE', companyId: alpha.id });
    expect(created.body).not.toHaveProperty('priceUsd');
    const stored = await prisma.location.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.companyId).toBe(alpha.id);
    expect(stored.status).toBe('ACTIVE');

    const duplicate = await createLocation(cookie, alpha.id, 'Depot');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('NAME_TAKEN');
    expect(await prisma.location.count({ where: { companyId: alpha.id, name: 'Depot' } })).toBe(1);

    const otherCompany = await createLocation(cookie, beta.id, 'Depot');
    expect(otherCompany.status).toBe(201);
    expect(otherCompany.body.companyId).toBe(beta.id);

    const differentCase = await createLocation(cookie, alpha.id, 'depot');
    expect(differentCase.status).toBe(201);

    const rejected = await request(app.getHttpServer())
      .post(`/api/platform/companies/${alpha.id}/locations`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Moved', status: 'INACTIVE', companyId: beta.id })
      .expect(400);
    expect(rejected.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.location.findFirst({ where: { name: 'Moved' } })).toBeNull();

    const audit = await prisma.auditEntry.findFirstOrThrow({
      where: { targetType: 'location', targetId: created.body.id },
    });
    expect(audit.action).toBe('CREATE');
    expect(audit.actorUserId).toBe(operator.id);
    expect(audit.companyId).toBe(alpha.id);
    expect(audit.createdAt).toBeInstanceOf(Date);
    await request(app.getHttpServer()).post(`/api/platform/companies/missing-company/locations`).set('Origin', ORIGIN).set('Cookie', cookie).send({ name: 'Orphan' }).expect(404);
  });

  it('renames and deactivates without deleting or moving the branch', async () => {
    const operator = await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const beta = await createCompany(cookie, 'Beta', 'beta');
    const created = await createLocation(cookie, alpha.id, 'Depot');
    const locationId = created.body.id as string;
    const user = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: 'Staff', passwordHash: await passwords.hash('Owner1234'), status: UserStatus.ACTIVE },
    });
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: alpha.id, key: 'STAFF' } });
    const membership = await prisma.membership.create({
      data: { userId: user.id, companyId: alpha.id, username: 'staff', roleId: role.id, locationId },
    });

    const renamed = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${alpha.id}/locations/${locationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Depot West', status: 'ACTIVE' })
      .expect(200);
    expect(renamed.body).toMatchObject({ id: locationId, name: 'Depot West', status: 'ACTIVE', companyId: alpha.id });

    const inactive = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${alpha.id}/locations/${locationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Depot West', status: 'INACTIVE' })
      .expect(200);
    expect(inactive.body.status).toBe('INACTIVE');
    const still = await prisma.location.findUniqueOrThrow({ where: { id: locationId } });
    expect(still.companyId).toBe(alpha.id);
    expect(still.status).toBe('INACTIVE');
    expect(await prisma.membership.findUnique({ where: { id: membership.id } })).toMatchObject({ locationId });

    const moved = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${alpha.id}/locations/${locationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Depot West', status: 'INACTIVE', companyId: beta.id })
      .expect(400);
    expect(moved.body.code).toBe('VALIDATION_ERROR');
    expect((await prisma.location.findUniqueOrThrow({ where: { id: locationId } })).companyId).toBe(alpha.id);

    const foreign = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${beta.id}/locations/${locationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Hijack', status: 'ACTIVE' })
      .expect(404);
    expect(foreign.body.code).toBe('NOT_FOUND');
    expect((await prisma.location.findUniqueOrThrow({ where: { id: locationId } })).name).toBe('Depot West');

    await request(app.getHttpServer())
      .patch(`/api/platform/companies/${alpha.id}/locations/missing-location`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Missing', status: 'ACTIVE' })
      .expect(404);

    const clash = await request(app.getHttpServer())
      .patch(`/api/platform/companies/${alpha.id}/locations/${locationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Alpha', status: 'INACTIVE' })
      .expect(409);
    expect(clash.body.code).toBe('NAME_TAKEN');

    const updates = await prisma.auditEntry.findMany({
      where: { targetType: 'location', targetId: locationId, action: 'UPDATE' },
    });
    expect(updates).toHaveLength(2);
    expect(updates.every((entry) => entry.actorUserId === operator.id && entry.companyId === alpha.id)).toBe(true);
    expect(await prisma.auditEntry.count({ where: { targetId: locationId, action: 'DELETE' } })).toBe(0);
    await request(app.getHttpServer()).delete(`/api/platform/companies/${alpha.id}/locations/${locationId}`).set('Origin', ORIGIN).set('Cookie', cookie).expect(404);
  });

  it('limits customer branch lists to the session company and role scope', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha', 'tradivia');
    const beta = await createCompany(cookie, 'Beta', 'beta', 'tradivia');
    const depot = await createLocation(cookie, alpha.id, 'Depot');
    const home = await prisma.location.findFirstOrThrow({ where: { companyId: alpha.id, name: 'Alpha' } });
    await request(app.getHttpServer())
      .patch(`/api/platform/companies/${alpha.id}/locations/${depot.body.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Depot', status: 'INACTIVE' })
      .expect(200);

    const allCookie = await loginMember('alpha', await member(alpha.id, 'chief', 'GENERAL_MANAGER', null));
    const all = await request(app.getHttpServer())
      .get('/api/locations')
      .query({ companyId: beta.id })
      .set('Cookie', allCookie)
      .expect(200);
    expect(all.body.items.map((item: { name: string }) => item.name).sort()).toEqual(['Alpha', 'Depot']);
    expect(all.body.items.every((item: { companyId?: string }) => item.companyId === undefined)).toBe(true);
    expect(JSON.stringify(all.body)).not.toMatch(/priceUsd|expiresOn|passwordHash|code/);

    const branchCookie = await loginMember('alpha', await member(alpha.id, 'supervisor', 'SUPERVISOR', home.id));
    const branch = await request(app.getHttpServer()).get('/api/locations').set('Cookie', branchCookie).expect(200);
    expect(branch.body.items.map((item: { id: string }) => item.id)).toEqual([home.id]);

    const ownCookie = await loginMember('alpha', await member(alpha.id, 'employee', 'EMPLOYEE', home.id));
    const own = await request(app.getHttpServer()).get('/api/locations').query({ companyId: beta.id }).set('Cookie', ownCookie).expect(200);
    expect(own.body.items.map((item: { id: string }) => item.id)).toEqual([home.id]);

    const unassigned = await loginMember('alpha', await member(alpha.id, 'loose', 'EMPLOYEE', null));
    const none = await request(app.getHttpServer()).get('/api/locations').set('Cookie', unassigned).expect(200);
    expect(none.body.items).toEqual([]);

    const betaNames = (
      await request(app.getHttpServer()).get(`/api/platform/companies/${beta.id}/locations`).set('Cookie', cookie).expect(200)
    ).body.items.map((item: { name: string }) => item.name);
    expect(JSON.stringify(all.body)).not.toContain(betaNames[0]);
  });

  it('follows support context into and out of a company', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const beta = await createCompany(cookie, 'Beta', 'beta');
    await createLocation(cookie, alpha.id, 'Depot');

    const bare = await request(app.getHttpServer()).get('/api/locations').query({ companyId: alpha.id }).set('Cookie', cookie).expect(409);
    expect(bare.body.code).toBe('CONFLICT');
    expect(bare.body.items).toBeUndefined();

    const inAlpha = await enter(alpha.id, cookie);
    const alphaList = await request(app.getHttpServer()).get('/api/locations').set('Cookie', inAlpha).expect(200);
    expect(alphaList.body.items.map((item: { name: string }) => item.name).sort()).toEqual(['Alpha', 'Depot']);

    const inBeta = await enter(beta.id, inAlpha);
    const betaList = await request(app.getHttpServer()).get('/api/locations').set('Cookie', inBeta).expect(200);
    expect(betaList.body.items.map((item: { name: string }) => item.name)).toEqual(['Beta']);

    const left = await leave(beta.id, inBeta);
    const after = await request(app.getHttpServer()).get('/api/locations').set('Cookie', left).expect(409);
    expect(after.body.code).toBe('CONFLICT');
    expect(JSON.stringify(after.body)).not.toMatch(/Alpha|Beta|Depot/);
  });

  it('still lets a member sign in when their location is inactive', async () => {
    await platformUser();
    const cookie = await loginPlatform();
    const alpha = await createCompany(cookie, 'Alpha', 'alpha');
    const home = await prisma.location.findFirstOrThrow({ where: { companyId: alpha.id, name: 'Alpha' } });
    await prisma.location.update({ where: { id: home.id }, data: { status: 'INACTIVE' } });
    const username = await member(alpha.id, 'owner', 'OWNER', home.id);
    const memberCookie = await loginMember('alpha', username);
    const listed = await request(app.getHttpServer()).get('/api/locations').set('Cookie', memberCookie).expect(200);
    expect(listed.body.items).toEqual([expect.objectContaining({ id: home.id, status: 'INACTIVE' })]);
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
    expect(role.visibilityScope).toBe(
      roleKey === 'GENERAL_MANAGER' || roleKey === 'OWNER'
        ? VisibilityScope.ALL_BRANCHES
        : roleKey === 'SUPERVISOR'
          ? VisibilityScope.BRANCH
          : VisibilityScope.OWN,
    );
    const user = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: username, passwordHash: await passwords.hash('Owner1234'), status: UserStatus.ACTIVE },
    });
    await prisma.membership.create({
      data: { userId: user.id, companyId, username, roleId: role.id, locationId },
    });
    return username;
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
      .send({ name });
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
