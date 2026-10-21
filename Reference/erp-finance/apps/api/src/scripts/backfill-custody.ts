/**
 * One-off, idempotent backfill that completes the Phase 4 migration (run after `prisma migrate deploy`):
 *
 *   npm run db:backfill:custody
 *
 * For every live advance, oldest first:
 *   1. posts the journal entry if it is missing (early operations pre-date the ledger),
 *   2. rebuilds the borrower custody sub-ledger (OpenItem kind CUSTODY) with the same code the API uses.
 *
 * A legacy spend that was never covered by an issued custody is not hidden. The uncovered part is regularized as
 * money the borrower paid out of pocket: Dr 1300 / Cr 2100 plus a PAYABLE open item owed to the borrower.
 */
import { BadRequestException } from '@nestjs/common';
import { OpenItemKind, OpenItemParty, Prisma, PrismaClient, SettlementMode } from '@prisma/client';
import { applyCustody, custodyBalance, custodyLegs, CUSTODY_SOURCE } from '../finance/advances/custody-book';
import { CUSTODY_ACCOUNT, PAYABLES_ACCOUNT } from '../finance/ledger/chart';
import { postOperationJournal, syncLiveOperation, syncOperationJournal } from '../finance/ledger/post-source';
import { insertOpenItem } from '../finance/open-items/open-item-book';
import { openingJournal } from '../finance/opening-balances/opening-balances.service';

try {
  process.loadEnvFile('.env');
} catch {
  // The environment may already be loaded.
}

const prisma = new PrismaClient();
const companyId = process.env.DEFAULT_COMPANY_ID ?? 'tradivia';

async function main() {
  const advances = await prisma.advance.findMany({
    where: { companyId, status: { not: 'DELETED' } },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const report = { posted: 0, built: 0, skipped: 0, regularized: 0, cashJournals: 0 };

  // Operations recorded before the ledger existed have no journal entry, so the funds can never reconcile with
  // accounts 1110/1120/1130. Post them with the same builders the API uses.
  const live = { companyId, status: { in: ['COMPLETED', 'PENDING_APPROVAL'] as ('COMPLETED' | 'PENDING_APPROVAL')[] } };
  const cashKinds = [
    ['income', 'INCOME', await prisma.income.findMany({ where: live, select: { id: true, employeeId: true } })],
    ['outcome', 'OUTCOME', await prisma.outcome.findMany({ where: live, select: { id: true, employeeId: true } })],
    ['exchange', 'EXCHANGE', await prisma.exchange.findMany({ where: live, select: { id: true, employeeId: true } })],
    ['transfer', 'TRANSFER', await prisma.transfer.findMany({ where: live, select: { id: true, employeeId: true } })],
  ] as const;
  const openings = await prisma.openingBalance.findMany({ where: live });
  for (const row of openings) {
    const exists = await prisma.journalEntry.findUnique({
      where: { sourceKey: `OPENING:${row.id}` },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.$transaction((tx) => syncOperationJournal(tx, openingJournal(companyId, row, row.employeeId)));
    report.cashJournals += 1;
  }
  for (const [kind, sourceType, rows] of cashKinds) {
    for (const row of rows) {
      const exists = await prisma.journalEntry.findUnique({
        where: { sourceKey: `${sourceType}:${row.id}` },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.$transaction((tx) => syncLiveOperation(tx, companyId, row.employeeId, kind, row.id));
      report.cashJournals += 1;
    }
  }

  for (const advance of advances) {
    await prisma.$transaction(
      async (tx) => {
        const live = await tx.journalEntry.findUnique({
          where: { sourceKey: `${CUSTODY_SOURCE}:${advance.id}` },
          select: { id: true },
        });
        if (!live) {
          await syncLiveOperation(tx, companyId, advance.employeeId, 'advance', advance.id);
          report.posted += 1;
        }

        const done =
          (await tx.openItem.count({ where: { companyId, sourceType: CUSTODY_SOURCE, sourceId: advance.id } })) +
          (await tx.openItemAllocation.count({ where: { companyId, sourceType: CUSTODY_SOURCE, sourceId: advance.id } }));
        if (done > 0) {
          report.skipped += 1;
          return;
        }

        const use = custodyLegs(advance).use;
        if (use) {
          const balance = await custodyBalance(tx, companyId, advance.borrowerId, use.currency);
          const shortfall = use.amount.minus(balance);
          if (shortfall.gt(0)) {
            await regularize(tx, advance, use.currency, shortfall);
            report.regularized += 1;
          }
        }
        await applyCustody(tx, companyId, advance);
        report.built += 1;
      },
      { timeout: 60_000, maxWait: 20_000 },
    );
  }
  console.log('custody backfill finished', report);
}

async function regularize(
  tx: Prisma.TransactionClient,
  advance: Prisma.AdvanceGetPayload<object>,
  currency: Prisma.AdvanceGetPayload<object>['currency'],
  shortfall: Prisma.Decimal,
) {
  const borrower = await tx.borrower.findFirstOrThrow({
    where: { id: advance.borrowerId, companyId },
    select: { name: true },
  });
  const base = {
    companyId,
    party: OpenItemParty.BORROWER,
    borrowerId: advance.borrowerId,
    locationId: advance.locationId,
    employeeId: advance.employeeId,
    partyName: borrower.name,
    documentDate: advance.transactionDate,
    currency,
    fxRate: advance.exchangeRate,
    amount: shortfall,
    settlementMode: SettlementMode.CASH,
    sourceType: 'CUSTODY_RECLASS',
    sourceId: advance.id,
    reference: advance.reference,
    memo: 'تسوية تاريخية: صرف تجاوز العهدة المصروفة، سُدّد من مال المستلف',
  };
  await insertOpenItem(tx, { ...base, kind: OpenItemKind.CUSTODY });
  await insertOpenItem(tx, { ...base, kind: OpenItemKind.PAYABLE });
  await postOperationJournal(tx, {
    companyId,
    actorId: advance.employeeId,
    locationId: advance.locationId,
    transactionDate: advance.transactionDate,
    description: `تسوية عهدة تاريخية ${advance.reference}`,
    sourceType: 'CUSTODY_RECLASS',
    sourceId: `${advance.id}:${currency}`,
    lines: [
      { code: CUSTODY_ACCOUNT, currency, debit: shortfall, credit: 0, fxRate: advance.exchangeRate },
      { code: PAYABLES_ACCOUNT, currency, debit: 0, credit: shortfall, fxRate: advance.exchangeRate },
    ],
  });
}

main()
  .catch((error: unknown) => {
    if (error instanceof BadRequestException) {
      console.error(`backfill stopped: ${JSON.stringify(error.getResponse())}`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
