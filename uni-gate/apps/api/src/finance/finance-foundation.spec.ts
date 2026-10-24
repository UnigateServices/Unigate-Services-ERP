import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, UserKind, UserStatus } from '@prisma/client';
import { MODULE_KEYS } from '@unigate/shared';
import { existsSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PasswordService } from '../auth/password.service';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { csrfGuard } from '../common/csrf';
import { validationExceptionFactory } from '../common/validation';
import { ROLE_PRESETS, presetPermissionRows } from '../platform/companies/role-presets';
import { PrismaService } from '../prisma/prisma.service';
import { syncLiveOperation } from './ledger/post-source';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Member1234';

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
let app: INestApplication;
let prisma: PrismaService;
let passwords: PasswordService;
let uploadDir: string;

/**
 * Phase F3a: the finance foundation behind the foundation session. Two companies on the
 * `tradivia` preset prove isolation on every route, the levels replace the role names, the module
 * flag guards every route, and a platform operator in support only reads.
 */
describe('finance foundation (phase F3a)', () => {
  jest.setTimeout(120000);

  beforeAll(async () => {
    uploadDir = await mkdtemp(path.join(os.tmpdir(), 'ug-finance-'));
    process.env.UPLOAD_DIR = uploadDir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory }),
    );
    app.use(csrfGuard(ORIGIN));
    await app.init();
    prisma = app.get(PrismaService);
    passwords = app.get(PasswordService);
  });

  afterAll(async () => {
    if (app) await app.close();
    await rm(uploadDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "companies", "users" CASCADE');
  });

  it('needs a session and the finance module on every route', async () => {
    const alpha = await setupTenant('alpha');
    await request(app.getHttpServer()).get('/api/finance/balances').expect(401);
    await api('get', '/api/finance/balances', alpha.cookies.employee1).expect(200);

    await prisma.companyModule.update({
      where: { companyId_moduleKey: { companyId: alpha.companyId, moduleKey: 'finance' } },
      data: { enabled: false },
    });
    for (const route of ['/api/finance/balances', '/api/finance/ledger/accounts', '/api/finance/company-policy/currencies', '/api/finance/members']) {
      const refused = await api('get', route, alpha.cookies.manager).expect(403);
      expect(refused.body.code).toBe('FORBIDDEN');
    }
    await api('post', '/api/finance/projects', alpha.cookies.manager, { name: 'P' }).expect(403);
  });

  it('checks levels, not role names', async () => {
    const alpha = await setupTenant('alpha');
    const { manager, monitor, supervisor1, employee1 } = alpha.cookies;

    // Rates: approvers write, everyone reads a quote.
    await api('put', '/api/finance/company-policy/rates', employee1, rate('2026-09-01', 13000)).expect(403);
    await api('put', '/api/finance/company-policy/rates', monitor, rate('2026-09-01', 13000)).expect(403);
    await api('put', '/api/finance/company-policy/rates', supervisor1, rate('2026-09-01', 13000)).expect(200);
    const quote = await api('get', '/api/finance/company-policy/rates/quote?code=SYP&date=2026-09-02', employee1).expect(200);
    expect(quote.body.rate).toBe(13000);

    // Currencies are the general manager's (ADMIN).
    await api('patch', '/api/finance/company-policy/currencies/EUR', supervisor1, { active: true }).expect(403);
    await api('patch', '/api/finance/company-policy/currencies/EUR', manager, { active: true }).expect(200);

    // Master data: approvers write. A recorder sees only active rows.
    await api('post', '/api/finance/projects', employee1, { name: 'P' }).expect(403);
    const kept = await api('post', '/api/finance/banks', supervisor1, { name: 'Kept' }).expect(201);
    await api('post', '/api/finance/banks', manager, { name: 'Old', status: 'INACTIVE' }).expect(201);
    expect((await api('get', '/api/finance/banks', employee1).expect(200)).body.map((row: { id: string }) => row.id)).toEqual([kept.body.id]);
    expect((await api('get', '/api/finance/banks', monitor).expect(200)).body).toHaveLength(2);

    // Opening entry is ADMIN only. The monitor reads the ledger and writes nothing.
    const preview = await api('post', '/api/finance/opening-entry/preview', supervisor1, openingBody()).expect(403);
    expect(preview.body.code).toBe('FORBIDDEN');
    await api('post', '/api/finance/opening-entry/preview', manager, openingBody()).expect(201);
    await api('get', '/api/finance/ledger/accounts', monitor).expect(200);
    await api('post', '/api/finance/ledger/accounts', monitor, { code: '6100', name: 'X', type: 'EXPENSE' }).expect(403);

    // Finance error codes reach the client.
    const inactive = await api('put', '/api/finance/company-policy/rates', manager, { code: 'GBP', date: '2026-09-01', rate: 2 }).expect(400);
    expect(inactive.body.code).toBe('CURRENCY_INACTIVE');
  });

  it('keeps every company to its own finance data', async () => {
    const alpha = await setupTenant('alpha');
    const beta = await setupTenant('beta');
    const a = alpha.cookies.manager;
    const b = beta.cookies.manager;

    await api('put', '/api/finance/company-policy/rates', a, rate('2026-09-01', 13000)).expect(200);
    const project = (await api('post', '/api/finance/projects', a, { name: 'Shared name' }).expect(201)).body;
    const bank = (await api('post', '/api/finance/banks', a, { name: 'Shared name' }).expect(201)).body;
    const borrower = (await api('post', '/api/finance/borrowers', a, { name: 'Shared name' }).expect(201)).body;
    const opening = (
      await api('post', '/api/finance/opening-balances', a, {
        transactionDate: '2026-09-01', employeeId: alpha.members.employee1, fund: 'VAULT', currency: 'USD', amount: 500,
      }).expect(201)
    ).body;
    expect(opening.employee).toEqual({ id: alpha.members.employee1, name: 'alpha employee 1' });

    // The same names are free in the other company.
    await api('post', '/api/finance/projects', b, { name: 'Shared name' }).expect(201);

    // Lists never cross.
    expect((await api('get', '/api/finance/projects', b).expect(200)).body.map((row: { id: string }) => row.id)).not.toContain(project.id);
    expect((await api('get', '/api/finance/banks', b).expect(200)).body).toEqual([]);
    expect((await api('get', '/api/finance/borrowers', b).expect(200)).body).toEqual([]);
    expect((await api('get', '/api/finance/opening-balances', b).expect(200)).body).toEqual([]);
    expect((await api('get', '/api/finance/ledger/entries', b).expect(200)).body).toEqual([]);
    expect((await api('get', '/api/finance/company-policy/rates/history', b).expect(200)).body).toEqual([]);
    expect((await api('get', '/api/finance/balances', b).expect(200)).body.vault).toEqual([]);
    const members = (await api('get', '/api/finance/members', b).expect(200)).body.map((row: { id: string }) => row.id);
    expect(members).not.toContain(alpha.members.employee1);

    // Another company's ids are not found, and nothing changes.
    expect((await api('patch', `/api/finance/projects/${project.id}`, b, { name: 'Taken' }).expect(404)).body.code).toBe('PROJECT_NOT_FOUND');
    expect((await api('delete', `/api/finance/banks/${bank.id}`, b).expect(404)).body.code).toBe('BANK_NOT_FOUND');
    await api('delete', `/api/finance/borrowers/${borrower.id}`, b).expect(404);
    await api('delete', `/api/finance/opening-balances/${opening.id}`, b).expect(404);
    const stranger = await api('post', '/api/finance/opening-balances', b, {
      transactionDate: '2026-09-01', employeeId: alpha.members.employee1, fund: 'VAULT', currency: 'USD', amount: 1,
    }).expect(400);
    expect(stranger.body.code).toBe('EMPLOYEE_NOT_FOUND');
    const accounts = (await api('get', '/api/finance/ledger/accounts', a).expect(200)).body as { id: string; code: string }[];
    const foreignCash = accounts.find((row) => row.code === '1110')!.id;
    const foreignCapital = accounts.find((row) => row.code === '3100')!.id;
    await api('patch', `/api/finance/ledger/accounts/${foreignCash}`, b, { statementLine: 'CASH' }).expect(404);
    const journal = await api('post', '/api/finance/ledger/entries', b, {
      transactionDate: '2026-09-02', post: true,
      lines: [{ accountId: foreignCash, currency: 'USD', debit: 1, credit: 0 }, { accountId: foreignCapital, currency: 'USD', debit: 0, credit: 1 }],
    }).expect(400);
    expect(journal.body.code).toBe('ACCOUNT_INACTIVE');
    const entry = (await api('get', '/api/finance/ledger/entries', a).expect(200)).body[0];
    await api('post', `/api/finance/ledger/entries/${entry.id}/reverse`, b, { reason: 'x' }).expect(404);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).name).toBe('Shared name');
    expect(await prisma.bank.count({ where: { id: bank.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: beta.companyId } })).toBe(0);

    // Approvals, notifications, and attachments: another company's operation does not exist.
    const income = await recordIncome(alpha, 'INC-260902-001');
    await api('post', '/api/finance/audit/requests', beta.cookies.employee1, { reference: income.reference, actionType: 'DELETE' }).expect(404);
    await api('get', `/api/finance/attachments/${income.reference}`, b).expect(404);
    const request = (
      await api('post', '/api/finance/audit/requests', alpha.cookies.employee1, { reference: income.reference, actionType: 'DELETE', reason: 'x' }).expect(201)
    ).body;
    await api('post', `/api/finance/audit/requests/${request.id}/decide`, beta.cookies.supervisor1, { decision: 'APPROVE' }).expect(404);
    expect((await api('get', '/api/finance/audit/requests', b).expect(200)).body).toEqual([]);
    expect((await api('get', '/api/finance/notifications', beta.cookies.supervisor1).expect(200)).body).toEqual([]);
  });

  it('lets a platform operator in support read finance data and change nothing', async () => {
    const alpha = await setupTenant('alpha');
    await api('put', '/api/finance/company-policy/rates', alpha.cookies.manager, rate('2026-09-01', 13000)).expect(200);
    const project = (await api('post', '/api/finance/projects', alpha.cookies.manager, { name: 'P' }).expect(201)).body;
    const income = await recordIncome(alpha, 'INC-260902-001');
    const support = await supportSession(alpha.companyId);

    for (const route of ['/api/finance/balances', '/api/finance/ledger/entries', '/api/finance/projects', '/api/finance/audit/requests/history', '/api/finance/members', '/api/finance/opening-entry', '/api/finance/notifications']) {
      await api('get', route, support).expect(200);
    }
    const files = await api('get', `/api/finance/attachments/${income.reference}`, support).expect(200);
    expect(files.body).toMatchObject({ canUpload: false, canDelete: false });

    const writes: [string, string, object?][] = [
      ['put', '/api/finance/company-policy/rates', rate('2026-09-02', 13100)],
      ['post', '/api/finance/projects', { name: 'Q' }],
      ['patch', `/api/finance/projects/${project.id}`, { name: 'R' }],
      ['delete', `/api/finance/projects/${project.id}`],
      ['post', '/api/finance/opening-balances', { transactionDate: '2026-09-01', employeeId: alpha.members.employee1, fund: 'VAULT', currency: 'USD', amount: 1 }],
      ['post', '/api/finance/ledger/accounts', { code: '6100', name: 'X', type: 'EXPENSE' }],
      ['post', '/api/finance/opening-entry/preview', openingBody()],
      ['post', '/api/finance/audit/requests', { reference: income.reference, actionType: 'DELETE' }],
    ];
    for (const [method, route, body] of writes) {
      const refused = await api(method as 'post', route, support, body).expect(403);
      expect({ route, code: refused.body.code }).toEqual({ route, code: 'FORBIDDEN' });
    }
    // P plus the income helper's project; Q was refused.
    expect(await prisma.project.count({ where: { companyId: alpha.companyId } })).toBe(2);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).name).toBe('P');
    expect(await prisma.dailyRate.count({ where: { companyId: alpha.companyId } })).toBe(1);
  });

  it('runs approvals by level and scope (decision B)', async () => {
    const alpha = await setupTenant('alpha');
    const { manager, supervisor1, supervisor2, employee1 } = alpha.cookies;
    await api('put', '/api/finance/company-policy/rates', manager, rate('2026-09-01', 13000)).expect(200);
    const income = await recordIncome(alpha, 'INC-260903-001');

    // A role without the approval flag changes directly instead of asking.
    const direct = await api('post', '/api/finance/audit/requests', supervisor1, { reference: income.reference, actionType: 'DELETE' }).expect(403);
    expect(direct.body.code).toBe('USE_DIRECT_ACTION');

    const asked = await api('post', '/api/finance/audit/requests', employee1, {
      reference: income.reference, actionType: 'UPDATE', reason: 'fix', patch: { amount: 360 },
    }).expect(201);
    expect(asked.body.requester).toEqual({ id: alpha.members.employee1, name: 'alpha employee 1' });

    // The office supervisor is told, not the other office and not the general manager.
    const pending = await prisma.notification.findMany({ where: { companyId: alpha.companyId, section: 'pending' } });
    expect(pending.map((row) => row.employeeId).sort()).toEqual([alpha.members.employee1, alpha.members.supervisor1].sort());

    await api('post', `/api/finance/audit/requests/${asked.body.id}/decide`, employee1, { decision: 'APPROVE' }).expect(403);
    await api('post', `/api/finance/audit/requests/${asked.body.id}/decide`, supervisor2, { decision: 'APPROVE' }).expect(404);
    const decided = await api('post', `/api/finance/audit/requests/${asked.body.id}/decide`, supervisor1, { decision: 'APPROVE' }).expect(201);
    expect(decided.body).toMatchObject({ requestStatus: 'APPROVED', supervisor: { id: alpha.members.supervisor1, name: 'alpha supervisor 1' } });

    const updated = await prisma.income.findUniqueOrThrow({ where: { id: income.id } });
    expect(updated.total.toString()).toBe('360');
    expect(updated.status).toBe('COMPLETED');
    const entries = await prisma.journalEntry.findMany({ where: { companyId: alpha.companyId, sourceType: 'INCOME' }, orderBy: { number: 'asc' } });
    expect(entries).toHaveLength(3); // original, its reversal, and the corrected entry
    expect(entries[2].sourceKey).toBe(`INCOME:${income.id}`);

    const history = await api('get', '/api/finance/audit/requests/history', alpha.cookies.monitor).expect(200);
    expect(history.body).toHaveLength(1);
  });

  it('deactivates master data that the ledger already uses (F3 note 2)', async () => {
    const alpha = await setupTenant('alpha');
    const { manager } = alpha.cookies;
    await api('put', '/api/finance/company-policy/rates', manager, rate('2026-09-01', 13000)).expect(200);
    const unused = (await api('post', '/api/finance/projects', manager, { name: 'Unused' }).expect(201)).body;
    expect((await api('delete', `/api/finance/projects/${unused.id}`, manager).expect(200)).body.action).toBe('deleted');

    const used = await recordIncome(alpha, 'INC-260902-001');
    const removed = await api('delete', `/api/finance/projects/${used.projectId}`, manager).expect(200);
    expect(removed.body).toMatchObject({ action: 'deactivated', status: 'INACTIVE' });
    // Every branch has its office cost center once the ledger touches it (F3 note 1).
    await api('get', '/api/finance/ledger/cost-centers', manager).expect(200);
    const centers = await prisma.costCenter.findMany({ where: { companyId: alpha.companyId, kind: 'LOCATION' } });
    expect(centers.map((row) => row.locationId).sort()).toEqual([...alpha.offices].sort());
  });

  it('stores attachments per company and checks the company before every download (decision I)', async () => {
    const alpha = await setupTenant('alpha');
    await api('put', '/api/finance/company-policy/rates', alpha.cookies.manager, rate('2026-09-01', 13000)).expect(200);
    const income = await recordIncome(alpha, 'INC-260902-001');
    const uploaded = await request(app.getHttpServer())
      .post(`/api/finance/attachments/${income.reference}`)
      .set('Origin', ORIGIN)
      .set('Cookie', alpha.cookies.employee1)
      .attach('files', Buffer.from('receipt'), { filename: 'receipt.txt', contentType: 'text/plain' })
      .expect(201);
    const file = uploaded.body.files[0];
    expect(existsSync(path.join(uploadDir, alpha.companyId, income.reference, `${file.id}.txt`))).toBe(true);
    await api('get', `/api/finance/attachments/${income.reference}/${file.id}`, alpha.cookies.monitor).expect(200);
    await api('get', `/api/finance/attachments/${income.reference}/${file.id}`, alpha.cookies.employee2).expect(403);

    const beta = await setupTenant('beta');
    await api('get', `/api/finance/attachments/${income.reference}/${file.id}`, beta.cookies.manager).expect(404);
  });
});

function api(method: 'get' | 'post' | 'put' | 'patch' | 'delete', route: string, cookie: string, body?: object) {
  const call = request(app.getHttpServer())[method](route).set('Origin', ORIGIN).set('Cookie', cookie);
  return body === undefined ? call : call.send(body);
}

function rate(date: string, value: number) {
  return { code: 'SYP', date, rate: value };
}

function openingBody() {
  return {
    balanceDate: '2026-08-31',
    entryDate: '2026-09-01',
    allowance: 0,
    items: [],
    accounts: [],
    stock: [],
    controls: { receivables: 0, payables: 0, customerAdvances: 0, supplierAdvances: 0, allowance: 0 },
  };
}

/** One company on the tradivia preset: two offices, a manager, a monitor, and per office a supervisor and an employee. */
async function setupTenant(code: string) {
  const company = await prisma.company.create({
    data: { name: code, code, priceUsd: '10.00', expiresOn: new Date('2099-01-01T00:00:00.000Z') },
  });
  const roles: Record<string, string> = {};
  for (const template of ROLE_PRESETS.tradivia) {
    const { permissions: _permissions, ...fields } = template;
    const role = await prisma.role.create({ data: { companyId: company.id, ...fields } });
    await prisma.rolePermission.createMany({ data: presetPermissionRows(company.id, role.id, template) });
    roles[template.key] = role.id;
  }
  const offices = [];
  for (const name of ['office 1', 'office 2']) offices.push((await prisma.location.create({ data: { companyId: company.id, name } })).id);
  await prisma.companyModule.createMany({
    data: MODULE_KEYS.map((moduleKey) => ({ companyId: company.id, moduleKey, enabled: moduleKey === 'finance' })),
  });
  const people = {
    manager: ['GENERAL_MANAGER', null, `${code} manager`],
    monitor: ['MONITOR', null, `${code} monitor`],
    supervisor1: ['SUPERVISOR', offices[0], `${code} supervisor 1`],
    employee1: ['EMPLOYEE', offices[0], `${code} employee 1`],
    supervisor2: ['SUPERVISOR', offices[1], `${code} supervisor 2`],
    employee2: ['EMPLOYEE', offices[1], `${code} employee 2`],
  } as const;
  const hash = await passwords.hash(PASSWORD);
  const members = {} as Record<keyof typeof people, string>;
  const cookies = {} as Record<keyof typeof people, string>;
  for (const [username, [roleKey, locationId, name]] of Object.entries(people) as [keyof typeof people, (typeof people)[keyof typeof people]][]) {
    const user = await prisma.user.create({ data: { kind: UserKind.MEMBER, name, passwordHash: hash, status: UserStatus.ACTIVE } });
    const membership = await prisma.membership.create({
      data: { userId: user.id, companyId: company.id, username, roleId: roles[roleKey], locationId },
    });
    members[username] = membership.id;
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ companyCode: code, username, password: PASSWORD })
      .expect(200);
    cookies[username] = cookieOf(response);
  }
  return { companyId: company.id, offices, members, cookies };
}

/** An office 1 income recorded by employee 1, posted to the ledger the way the incomes routes (F3b) will. */
async function recordIncome(tenant: Tenant, reference: string) {
  const project = await prisma.project.upsert({
    where: { companyId_name: { companyId: tenant.companyId, name: 'Income project' } },
    create: { companyId: tenant.companyId, name: 'Income project', showIn: ['INCOME', 'OUTCOME', 'LOANS', 'REPORTS'] },
    update: {},
  });
  return prisma.$transaction(async (tx) => {
    const row = await tx.income.create({
      data: {
        companyId: tenant.companyId,
        operationNumber: 1,
        transactionDate: new Date('2026-09-02T12:00:00.000Z'),
        projectId: project.id,
        fund: 'VAULT',
        currency: 'USD',
        quantity: new Prisma.Decimal(1),
        amount: new Prisma.Decimal(300),
        total: new Prisma.Decimal(300),
        employeeId: tenant.members.employee1,
        locationId: tenant.offices[0],
        reference,
      },
    });
    await syncLiveOperation(tx, tenant.companyId, tenant.members.employee1, 'income', row.id);
    return row;
  });
}

async function supportSession(companyId: string) {
  await prisma.user.create({
    data: { kind: UserKind.PLATFORM, username: 'operator', name: 'Operator', passwordHash: await passwords.hash('Operator1'), status: UserStatus.ACTIVE },
  });
  const login = await request(app.getHttpServer())
    .post('/api/auth/platform/login')
    .set('Origin', ORIGIN)
    .send({ username: 'operator', password: 'Operator1' })
    .expect(200);
  const entered = await request(app.getHttpServer())
    .post(`/api/platform/companies/${companyId}/enter`)
    .set('Origin', ORIGIN)
    .set('Cookie', cookieOf(login))
    .expect(200);
  return cookieOf(entered);
}

function cookieOf(response: { headers: Record<string, string | string[] | undefined> }) {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const header = list.find((item) => item.startsWith('ug_access='));
  if (!header) throw new Error('ug_access cookie was not set');
  return header.split(';')[0];
}
