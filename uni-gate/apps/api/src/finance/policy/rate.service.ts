import { BadRequestException, Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCurrencyActive, canonicalRateCode, functionalCurrency } from '../ledger/fx-journal';

export type RateClient = Pick<
  Prisma.TransactionClient,
  'accountingPolicy' | 'companyCurrency' | 'dailyRate'
>;

export function calendarRateDate(value: Date | string) {
  if (typeof value === 'string') {
    const clean = value.slice(0, 10);
    return new Date(`${clean}T12:00:00.000Z`);
  }
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12, 0, 0));
}

export function missingDailyRateMessage(code: string, date: Date) {
  const iso = date.toISOString().slice(0, 10);
  return `لا يوجد سعر صرف مسجل لعملة ${code} حتى تاريخ ${iso}. يرجى تسجيل سعر الصرف اليومي أولاً من شاشة السياسة والعملات.`;
}

@Injectable()
export class RateService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(companyId: string, code: Currency | string, date: Date | string, tx?: RateClient) {
    return RateService.resolve(tx ?? this.prisma, companyId, code, date);
  }

  static async resolve(
    tx: RateClient,
    companyId: string,
    code: Currency | string,
    date: Date | string,
  ): Promise<Prisma.Decimal | null> {
    const currency = code as Currency;
    const functional = await functionalCurrency(tx as Prisma.TransactionClient, companyId);
    if (currency === functional) return null;
    await assertCurrencyActive(tx as Prisma.TransactionClient, companyId, currency);
    const rateDate = calendarRateDate(date);
    const storedCode = canonicalRateCode(currency, functional);
    const row = await tx.dailyRate.findFirst({
      where: {
        companyId,
        code: storedCode,
        rateDate: { lte: rateDate },
      },
      orderBy: { rateDate: 'desc' },
      select: { rate: true },
    });
    if (!row || row.rate.lte(0)) {
      throw new BadRequestException({
        code: 'FX_RATE_REQUIRED',
        message: missingDailyRateMessage(currency, rateDate),
      });
    }
    return row.rate;
  }

  static async findLatestOnOrBefore(
    tx: RateClient,
    companyId: string,
    code: Currency | string,
    date: Date | string,
  ) {
    const currency = code as Currency;
    const functional = await functionalCurrency(tx as Prisma.TransactionClient, companyId);
    if (currency === functional) return null;
    const rateDate = calendarRateDate(date);
    const storedCode = canonicalRateCode(currency, functional);
    return tx.dailyRate.findFirst({
      where: {
        companyId,
        code: storedCode,
        rateDate: { lte: rateDate },
      },
      orderBy: { rateDate: 'desc' },
      select: { rate: true, rateDate: true },
    });
  }
}
