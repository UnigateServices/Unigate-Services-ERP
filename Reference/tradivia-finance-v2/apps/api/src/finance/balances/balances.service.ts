import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdvanceType,
  Currency,
  FundType,
  Prisma,
  TransactionStatus,
} from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import { operationListWhere } from '../../auth/access';
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
  advances: NamedBalances[];
};

const LIVE: TransactionStatus[] = [TransactionStatus.COMPLETED, TransactionStatus.PENDING_APPROVAL];

@Injectable()
export class BalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getFunds(actor: AuthUser): Promise<FundsSnapshot> {
    const where = {
      companyId: this.companyId,
      status: { in: LIVE },
      ...operationListWhere(actor),
    };

    const [incomes, outcomes, exchanges, transfers, advances, openings] = await Promise.all([
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
          borrower: { select: { id: true, name: true } },
        },
      }),
      this.prisma.advance.findMany({
        where,
        select: {
          advanceType: true,
          currency: true,
          amount: true,
          total: true,
          fromCurrency: true,
          toCurrency: true,
          borrower: { select: { id: true, name: true } },
        },
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

    const advance = (party: { id: string; name: string } | null, currency: Currency | null, delta: number) => {
      if (!party || !currency) return;
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
      if (row.fromFund === FundType.ADVANCES) advance(row.borrower, row.currency, -amount);
      else cash(row.fromFund, row.currency, -amount, row.fromBank);
      if (row.toFund === FundType.ADVANCES) advance(row.borrower, row.currency, amount);
      else cash(row.toFund, row.currency, amount, row.toBank);
    }
    for (const row of advances) {
      if (row.advanceType === AdvanceType.EXCHANGE) {
        advance(row.borrower, row.fromCurrency, -money(row.amount));
        advance(row.borrower, row.toCurrency, money(row.total));
      } else {
        advance(row.borrower, row.currency, -money(row.total));
      }
    }
    for (const row of openings) cash(row.fund, row.currency, money(row.amount), row.bank);

    return {
      vault: vault.toList(),
      sham: sham.toList(),
      banks: [...banks.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
        .map((row) => ({ id: row.id, name: row.name, balances: row.ledger.toList() })),
      advances: [...borrowers.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
        .map((row) => ({ id: row.id, name: row.name, balances: row.ledger.toList() })),
    };
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
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
