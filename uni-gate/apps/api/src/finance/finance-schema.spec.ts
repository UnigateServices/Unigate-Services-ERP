import { Prisma, PrismaClient, UserKind, UserStatus } from '@prisma/client';

/**
 * Phase F2: the finance tables in the foundation database. These tests talk to PostgreSQL
 * directly, so they prove the rules hold even when the API is bypassed.
 */
describe('finance schema (phase F2)', () => {
  jest.setTimeout(60000);
  const prisma = new PrismaClient();
  const FOUNDATION_TABLES = [
    '_prisma_migrations',
    'users',
    'companies',
    'locations',
    'roles',
    'role_permissions',
    'memberships',
    'company_modules',
    'audit_entries',
  ];

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "companies", "users" CASCADE');
  });

  async function tenant(code: string) {
    const company = await prisma.company.create({
      data: { name: code, code, priceUsd: '10.00', expiresOn: new Date('2027-04-01T00:00:00.000Z') },
    });
    const location = await prisma.location.create({ data: { companyId: company.id, name: `${code} office` } });
    const role = await prisma.role.create({
      data: { companyId: company.id, key: 'CLERK', name: 'Clerk', visibilityScope: 'BRANCH' },
    });
    const user = await prisma.user.create({
      data: { kind: UserKind.MEMBER, name: `${code} clerk`, passwordHash: 'x', status: UserStatus.ACTIVE },
    });
    const membership = await prisma.membership.create({
      data: { userId: user.id, companyId: company.id, username: 'clerk', roleId: role.id, locationId: location.id },
    });
    const project = await prisma.project.create({ data: { companyId: company.id, name: 'General' } });
    return { companyId: company.id, locationId: location.id, membershipId: membership.id, projectId: project.id };
  }

  function income(t: { companyId: string; locationId: string; membershipId: string; projectId: string }, reference: string) {
    return {
      companyId: t.companyId,
      operationNumber: 1,
      transactionDate: new Date('2026-09-02T00:00:00.000Z'),
      projectId: t.projectId,
      fund: 'VAULT' as const,
      currency: 'USD' as const,
      amount: new Prisma.Decimal(100),
      total: new Prisma.Decimal(100),
      employeeId: t.membershipId,
      locationId: t.locationId,
      reference,
    };
  }

  it('gives every finance table company_id, a key to companies, and a unique (company_id, id)', async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    const finance = tables.map((row) => row.table_name).filter((name) => !FOUNDATION_TABLES.includes(name));
    expect(finance).toHaveLength(46);
    for (const table of finance) {
      const column = await prisma.$queryRaw<{ is_nullable: string; column_default: string | null }[]>`
        SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'company_id'`;
      expect({ table, column: column[0] }).toEqual({ table, column: { is_nullable: 'NO', column_default: null } });
      const companyKey = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class r ON r.oid = c.confrelid
        WHERE t.relname = ${table} AND r.relname = 'companies' AND c.contype = 'f'`;
      expect({ table, keys: Number(companyKey[0].n) }).toEqual({ table, keys: 1 });
      const identity = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM pg_indexes
        WHERE tablename = ${table} AND indexname = ${`${table}_company_id_id_key`}`;
      expect({ table, identity: Number(identity[0].n) }).toEqual({ table, identity: 1 });
    }
  });

  it('makes every finance link composite with the company, cascading only from parents to their lines', async () => {
    const keys = await prisma.$queryRaw<{ table: string; target: string; columns: string[]; on_delete: string }[]>`
      SELECT t.relname AS table, r.relname AS target, c.confdeltype::text AS on_delete,
             array(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
                   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS columns
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class r ON r.oid = c.confrelid
      WHERE c.contype = 'f' AND t.relnamespace = 'public'::regnamespace`;
    const finance = keys.filter((key) => !FOUNDATION_TABLES.includes(key.table));
    const links = finance.filter((key) => key.target !== 'companies');
    expect(links.length).toBeGreaterThan(90);
    for (const key of links) {
      expect({ key: `${key.table} -> ${key.target}`, columns: key.columns.length, first: key.columns[0] }).toEqual({
        key: `${key.table} -> ${key.target}`,
        columns: 2,
        first: 'company_id',
      });
    }
    const cascading = links
      .filter((key) => key.on_delete === 'c')
      .map((key) => `${key.table} -> ${key.target}`)
      .sort();
    expect(cascading).toEqual([
      'budget_lines -> budgets',
      'inventory_assessment_lines -> inventory_assessments',
      'journal_lines -> journal_entries',
      'open_item_allocations -> open_items',
      'opening_account_lines -> opening_entries',
      'opening_stock_lines -> opening_entries',
      'purchase_invoice_lines -> purchase_invoices',
      'quote_lines -> quotes',
      'sales_invoice_lines -> sales_invoices',
    ]);
    // Everything else refuses deletes that would orphan a row (no SET NULL, which would clear company_id).
    expect(links.filter((key) => key.on_delete !== 'c' && key.on_delete !== 'r')).toEqual([]);
  });

  it('keeps journal source keys unique per company, so each company can close the same year', async () => {
    const a = await tenant('alpha');
    const b = await tenant('beta');
    const entry = (t: typeof a, number: number) => ({
      companyId: t.companyId,
      number,
      transactionDate: new Date('2026-12-31T00:00:00.000Z'),
      employeeId: t.membershipId,
      sourceKey: 'YEAR_CLOSE:2026',
    });
    await prisma.journalEntry.create({ data: entry(a, 1) });
    await prisma.journalEntry.create({ data: entry(b, 1) });
    await expect(prisma.journalEntry.create({ data: entry(a, 2) })).rejects.toThrow(/Unique constraint/);
  });

  it('accepts an operation that stays inside one company', async () => {
    const a = await tenant('alpha');
    const row = await prisma.income.create({ data: income(a, 'INC-1') });
    expect(row.companyId).toBe(a.companyId);
  });

  it('refuses an operation that points at another company branch, member, or project', async () => {
    const a = await tenant('alpha');
    const b = await tenant('beta');
    await expect(prisma.income.create({ data: { ...income(a, 'INC-1'), locationId: b.locationId } })).rejects.toThrow(
      /Foreign key constraint/,
    );
    await expect(prisma.income.create({ data: { ...income(a, 'INC-2'), employeeId: b.membershipId } })).rejects.toThrow(
      /Foreign key constraint/,
    );
    await expect(prisma.income.create({ data: { ...income(a, 'INC-3'), projectId: b.projectId } })).rejects.toThrow(
      /Foreign key constraint/,
    );
    expect(await prisma.income.count()).toBe(0);
  });

  it('fills the company on invoice lines and refuses a product from another company', async () => {
    const a = await tenant('alpha');
    const b = await tenant('beta');
    const warehouse = await prisma.warehouse.create({ data: { companyId: a.companyId, name: 'Main' } });
    const customer = await prisma.customer.create({ data: { companyId: a.companyId, name: 'Buyer' } });
    const own = await prisma.product.create({ data: { companyId: a.companyId, name: 'Own', sku: 'A1' } });
    const foreign = await prisma.product.create({ data: { companyId: b.companyId, name: 'Foreign', sku: 'B1' } });
    const invoice = (productId: string, reference: string, number: number) => ({
      companyId: a.companyId,
      number,
      reference,
      transactionDate: new Date('2026-09-21T00:00:00.000Z'),
      customerId: customer.id,
      customerName: 'Buyer',
      warehouseId: warehouse.id,
      warehouseName: 'Main',
      currency: 'USD' as const,
      employeeId: a.membershipId,
      lines: {
        create: [
          { productId, productName: 'x', unit: 'PIECE' as const, quantity: 1, unitPrice: 10, lineTotal: 10, sortOrder: 1 },
        ],
      },
    });
    // Nested create with a scalar product id, the shape the finance code uses.
    const created = await prisma.salesInvoice.create({ data: invoice(own.id, 'SI-1', 1), include: { lines: true } });
    expect(created.lines[0].companyId).toBe(a.companyId);
    await expect(prisma.salesInvoice.create({ data: invoice(foreign.id, 'SI-2', 2) })).rejects.toThrow(
      /Foreign key constraint/,
    );
  });

  it('keeps the office cost center rule on income and expense journal lines', async () => {
    const a = await tenant('alpha');
    const account = await prisma.account.create({
      data: { companyId: a.companyId, code: '4900', name: 'Other income', type: 'INCOME' },
    });
    const entry = await prisma.journalEntry.create({
      data: {
        companyId: a.companyId,
        number: 1,
        transactionDate: new Date('2026-09-02T00:00:00.000Z'),
        employeeId: a.membershipId,
      },
    });
    await expect(
      prisma.journalLine.create({
        data: { companyId: a.companyId, entryId: entry.id, accountId: account.id, currency: 'USD', credit: 100, sortOrder: 1 },
      }),
    ).rejects.toThrow(/COST_CENTER_REQUIRED/);
    const center = await prisma.costCenter.create({
      data: { companyId: a.companyId, code: 'L1', name: 'Office', kind: 'LOCATION', locationId: a.locationId },
    });
    await prisma.journalLine.create({
      data: {
        companyId: a.companyId,
        entryId: entry.id,
        accountId: account.id,
        costCenterId: center.id,
        currency: 'USD',
        credit: 100,
        sortOrder: 1,
      },
    });
    // One office cost center per branch.
    await expect(
      prisma.costCenter.create({
        data: { companyId: a.companyId, code: 'L2', name: 'Office again', kind: 'LOCATION', locationId: a.locationId },
      }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it('keeps product barcodes unique per company only when set', async () => {
    const a = await tenant('alpha');
    const b = await tenant('beta');
    await prisma.product.create({ data: { companyId: a.companyId, name: 'One', sku: 'S1', barcode: '123' } });
    await expect(
      prisma.product.create({ data: { companyId: a.companyId, name: 'Two', sku: 'S2', barcode: '123' } }),
    ).rejects.toThrow(/Unique constraint failed on the fields: \(`company_id`,`barcode`\)/);
    await prisma.product.create({ data: { companyId: b.companyId, name: 'One', sku: 'S1', barcode: '123' } });
    await prisma.product.create({ data: { companyId: a.companyId, name: 'Three', sku: 'S3' } });
    await prisma.product.create({ data: { companyId: a.companyId, name: 'Four', sku: 'S4' } });
  });

  it('refuses removing a member or branch that finance rows still use', async () => {
    const a = await tenant('alpha');
    await prisma.income.create({ data: income(a, 'INC-1') });
    await expect(prisma.membership.delete({ where: { id: a.membershipId } })).rejects.toThrow();
    await expect(prisma.location.delete({ where: { id: a.locationId } })).rejects.toThrow();
  });

  it('needs a company: a finance row without company_id is refused by the database', async () => {
    await expect(
      prisma.$executeRawUnsafe(`INSERT INTO "banks" ("id", "name", "updated_at") VALUES ('b1', 'Bank', now())`),
    ).rejects.toThrow(/23502/); // not_null_violation on company_id
  });
});
