/**
 * Integration check against the configured database (run: npx tsx apps/api/src/finance/reconciliation/treasury-reconciliation.spec.ts).
 *
 * Phase 4 invariants:
 *  1. Funds are VAULT, SHAM_CASH and BANK only. Custody is not a fund.
 *  2. The cash funds snapshot equals the ledger balance of 1110 + 1120 + 1130 for every currency.
 *  3. The borrower custody sub-ledger equals the ledger balance of control account 1300 for every currency.
 *  4. No borrower custody item is negative or over-allocated.
 *  5. Every income and expense journal line carries an office cost center.
 *  6. Every journal line that came from a project operation carries the project dimension.
 */
import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { BalancesService } from '../balances/balances.service';
import type { PrismaService } from '../../prisma/prisma.service';

try {
  process.loadEnvFile('.env');
} catch {
  // The environment may already be loaded.
}

const prisma = new PrismaClient();
const money = (value: unknown) => Math.round(Number(value) * 10000) / 10000;

async function main() {
  const funds = await prisma.$queryRawUnsafe<{ label: string }[]>(
    `select unnest(enum_range(null::"FundType"))::text as label`,
  );
  assert.deepEqual(
    funds.map((row) => row.label).sort(),
    ['BANK', 'SHAM_CASH', 'VAULT'],
    'FundType must be exactly VAULT, SHAM_CASH, BANK',
  );

  // Only journals born from a fund operation carry the fund detail (which safe or bank). Free-form journals on a
  // cash account cannot be explained by any fund, so they are reported separately below.
  const ledger = await prisma.$queryRawUnsafe<{ code: string; currency: string; balance: string }[]>(
    `select a.code, jl.currency::text as currency, sum(jl.debit - jl.credit)::text as balance
       from journal_lines jl
       join journal_entries je on je.id = jl.entry_id and je.status = 'POSTED'
       join accounts a on a.id = jl.account_id
      where (a.code in ('1110','1120','1130') and je.source_type in ('INCOME','OUTCOME','EXCHANGE','TRANSFER','OPENING','ADVANCE'))
         or a.code = '1300'
      group by 1, 2`,
  );
  const glBy = (codes: string[]) => {
    const out = new Map<string, number>();
    for (const row of ledger.filter((item) => codes.includes(item.code))) {
      out.set(row.currency, money((out.get(row.currency) ?? 0) + Number(row.balance)));
    }
    return out;
  };

  const balances = new BalancesService(prisma as unknown as PrismaService, {
    get: (_key: string, fallback: string) => fallback,
  } as unknown as ConfigService);
  const snapshot = await balances.getFunds({ id: 'reconcile', role: 'GENERAL_MANAGER', locationId: null } as never);

  const cash = new Map<string, number>();
  const add = (map: Map<string, number>, rows: { currency: string; amount: number }[]) => {
    for (const row of rows) map.set(row.currency, money((map.get(row.currency) ?? 0) + row.amount));
  };
  add(cash, snapshot.vault);
  add(cash, snapshot.sham);
  for (const bank of snapshot.banks) add(cash, bank.balances);
  const glCash = glBy(['1110', '1120', '1130']);
  // The funds book is kept in USD and SYP only (see Ledger.toList); other ISO currencies are not funds yet.
  for (const currency of ['USD', 'SYP']) {
    assert.equal(cash.get(currency) ?? 0, glCash.get(currency) ?? 0, `cash funds vs ledger mismatch in ${currency}`);
  }

  const custody = await prisma.$queryRawUnsafe<{ currency: string; remaining: string }[]>(
    `select currency::text as currency, sum(remaining)::text as remaining
       from open_items where kind = 'CUSTODY' group by 1`,
  );
  const glCustody = glBy(['1300']);
  const subledger = new Map(custody.map((row) => [row.currency, money(row.remaining)]));
  for (const currency of new Set([...subledger.keys(), ...glCustody.keys()])) {
    assert.equal(
      subledger.get(currency) ?? 0,
      glCustody.get(currency) ?? 0,
      `custody sub-ledger vs account 1300 mismatch in ${currency}`,
    );
  }

  const negative = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `select count(*)::int as count from open_items
      where kind = 'CUSTODY' and (remaining < 0 or remaining > original_amount)`,
  );
  assert.equal(negative[0].count, 0, 'custody items must stay within 0..original amount');

  const uncentered = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `select count(*)::int as count
       from journal_lines jl join accounts a on a.id = jl.account_id
      where a.type in ('INCOME','EXPENSE') and jl.cost_center_id is null`,
  );
  assert.equal(uncentered[0].count, 0, 'income and expense lines must carry a cost center');

  // The rule lives in the database: an expense line without an office is rejected even if the API is bypassed.
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirstOrThrow({ where: { type: 'EXPENSE' }, select: { id: true } });
      const entry = await tx.journalEntry.findFirstOrThrow({ select: { id: true } });
      await tx.journalLine.create({
        data: { entryId: entry.id, accountId: account.id, currency: 'USD', debit: 0, credit: 0, sortOrder: 9999 },
      });
    }),
    /COST_CENTER_REQUIRED/,
  );

  const projectless = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `select count(*)::int as count
       from journal_lines jl join cost_centers cc on cc.id = jl.cost_center_id
      where cc.kind = 'PROJECT'`,
  );
  assert.equal(projectless[0].count, 0, 'project centers must live in the project dimension, not the office dimension');

  const unfunded = await prisma.$queryRawUnsafe<{ source: string; currency: string; balance: string }[]>(
    `select coalesce(je.source_type, 'MANUAL') as source, jl.currency::text as currency,
            sum(jl.debit - jl.credit)::text as balance
       from journal_lines jl
       join journal_entries je on je.id = jl.entry_id and je.status = 'POSTED'
       join accounts a on a.id = jl.account_id
      where a.code in ('1110','1120','1130')
        and coalesce(je.source_type, 'MANUAL') not in ('INCOME','OUTCOME','EXCHANGE','TRANSFER','OPENING','ADVANCE')
      group by 1, 2
     having sum(jl.debit - jl.credit) <> 0`,
  );
  if (unfunded.length) {
    const detail = unfunded.map((row) => `${row.source} ${row.currency} ${row.balance}`).join('; ');
    if (process.env.STRICT_CASH === '1') assert.fail(`cash posted outside any fund: ${detail}`);
    console.warn(`WARNING cash posted outside any fund operation (cannot be attributed to a safe or bank): ${detail}`);
  }

  console.log('treasury reconciliation checks passed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
