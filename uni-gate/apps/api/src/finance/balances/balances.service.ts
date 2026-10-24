import { Injectable } from '@nestjs/common';
import {
  AdvanceType,
  Currency,
  FundType,
  OpenItemKind,
  OpenItemStatus,
  Prisma,
  TransactionStatus,
} from '@prisma/client';
import { operationListWhere, type FinanceActor } from '../finance-access';
import { PrismaService } from '../../prisma/prisma.service';

export type CurrencyBalance = {
  currency: Currency;
  amount: number;
};

export type NamedBalances = {
  id: string;
  name: string;
  balances: CurrencyBalance[];
};

export type FundsSnapshot = {
  vault: CurrencyBalance[];
  sham: CurrencyBalance[];
  banks: NamedBalances[];
  /** Borrower custody from the sub-ledger under account 1300. Not cash: it never counts toward a fund. */
  custody: NamedBalances[];
};

const LIVE: TransactionStatus[] = [TransactionStatus.COMPLETED, TransactionStatus.PENDING_APPROVAL];

@Injectable()
export class BalancesService {
  constructor(private readonly prisma: PrismaService) {}

  async getFunds(actor: FinanceActor): Promise<FundsSnapshot> {
    const companyId = actor.companyId;
    const where = {
      companyId,
      status: { in: LIVE },
      ...operationListWhere(actor),
    };

    const [incomes, outcomes, exchanges, transfers, vouchers, custodyItems, openings] = await Promise.all([
      this.prisma.income.findMany({
        where,
        select: { fund: true, currency: true, total: true, bank: { select: { id: true, name: true } } },
      }),
      this.prisma.outcome.findMany({
        where,
        select: { fund: true, currency: true, total: true, bank: { select: { id: true, name: true } } },
      }),
      this.prisma.exchange.findMany({
        where,
        select: {
          fund: true,
          paidCurrency: true,
          receivedCurrency: true,
          exchangeAmount: true,
          total: true,
          bank: { select: { id: true, name: true } },
        },
      }),
      this.prisma.transfer.findMany({
        where,
        select: {
          fromFund: true,
          toFund: true,
          currency: true,
          amount: true,
          fromBank: { select: { id: true, name: true } },
          toBank: { select: { id: true, name: true } },
        },
      }),
      // Custody vouchers: the only advance rows that move cash.
      this.prisma.advance.findMany({
        where: { ...where, advanceType: { in: [AdvanceType.ISSUE, AdvanceType.RETURN] } },
        select: {
          advanceType: true,
          fund: true,
          currency: true,
          total: true,
          bank: { select: { id: true, name: true } },
        },
      }),
      this.prisma.openItem.findMany({
        where: {
          companyId,
          kind: OpenItemKind.CUSTODY,
          status: OpenItemStatus.OPEN,
          ...operationListWhere(actor),
        },
        select: { currency: true, remaining: true, borrower: { select: { id: true, name: true } } },
      }),
      this.prisma.openingBalance.findMany({
        where,
        select: { fund: true, currency: true, amount: true, bank: { select: { id: true, name: true } } },
      }),
    ]);

    const vault = new Ledger();
    const sham = new Ledger();
    const banks = new Map<string, { id: string; name: string; ledger: Ledger }>();
    const borrowers = new Map<string, { id: string; name: string; ledger: Ledger }>();

    const cash = (fund: FundType, currency: Currency, delta: number, bank?: { id: string; name: string } | null) => {
      if (fund === FundType.BANK) {
        if (!bank) return;
        const row = banks.get(bank.id) || { id: bank.id, name: bank.name, ledger: new Ledger() };
        row.ledger.add(currency, delta);
        banks.set(bank.id, row);
        return;
      }
      if (fund === FundType.SHAM_CASH) {
        sham.add(currency, delta);
        return;
      }
      if (fund === FundType.VAULT) {
        vault.add(currency, delta);
      }
    };

    const custody = (party: { id: string; name: string } | null, currency: Currency, delta: number) => {
      if (!party) return;
      const row = borrowers.get(party.id) || { id: party.id, name: party.name, ledger: new Ledger() };
      row.ledger.add(currency, delta);
      borrowers.set(party.id, row);
    };

    for (const row of incomes) cash(row.fund, row.currency, money(row.total), row.bank);
    for (const row of outcomes) cash(row.fund, row.currency, -money(row.total), row.bank);
    for (const row of exchanges) {
      cash(row.fund, row.paidCurrency, -money(row.exchangeAmount), row.bank);
      cash(row.fund, row.receivedCurrency, money(row.total), row.bank);
    }
    for (const row of transfers) {
      const amount = money(row.amount);
      cash(row.fromFund, row.currency, -amount, row.fromBank);
      cash(row.toFund, row.currency, amount, row.toBank);
    }
    for (const row of vouchers) {
      if (!row.fund) continue;
      const sign = row.advanceType === AdvanceType.ISSUE ? -1 : 1;
      cash(row.fund, row.currency, sign * money(row.total), row.bank);
    }
    for (const row of custodyItems) custody(row.borrower, row.currency, money(row.remaining));
    for (const row of openings) cash(row.fund, row.currency, money(row.amount), row.bank);

    return {
      vault: vault.toList(),
      sham: sham.toList(),
      banks: [...banks.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
        .map((row) => ({ id: row.id, name: row.name, balances: row.ledger.toList() })),
      custody: [...borrowers.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
        .map((row) => ({ id: row.id, name: row.name, balances: row.ledger.toList() })),
    };
  }
}

class Ledger {
  private readonly amounts = new Map<Currency, number>();

  add(currency: Currency, delta: number) {
    this.amounts.set(currency, roundMoney((this.amounts.get(currency) || 0) + delta));
  }

  toList(): CurrencyBalance[] {
    return [Currency.USD, Currency.SYP]
      .filter((currency) => this.amounts.has(currency))
      .map((currency) => ({ currency, amount: this.amounts.get(currency) || 0 }));
  }
}

function money(value: Prisma.Decimal | number | string | null | undefined) {
  return Number(value ?? 0);
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}
