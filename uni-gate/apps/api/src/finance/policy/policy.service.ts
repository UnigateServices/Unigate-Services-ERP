import { BadRequestException, Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { FinanceActor } from '../finance-access';
import { canonicalRateCode, functionalCurrency } from '../ledger/fx-journal';
import { CURRENCY_CATALOG } from './catalog';

@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async currencies(actor: FinanceActor) {
    const companyId = actor.companyId;
    await this.ensureCatalog(companyId);
    const rows = await this.prisma.companyCurrency.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    });
    const functional = await functionalCurrency(this.prisma, companyId);
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      active: row.active,
      base: row.code === functional,
    }));
  }

  async setActive(actor: FinanceActor, code: string, active: boolean) {
    const companyId = actor.companyId;
    await this.ensureCatalog(companyId);
    const functional = await functionalCurrency(this.prisma, companyId);
    if (code === functional && !active) throw new BadRequestException('BASE_CURRENCY');
    const known = CURRENCY_CATALOG.some((row) => row.code === code);
    if (!known) throw new BadRequestException('CURRENCY_UNKNOWN');
    const row = await this.prisma.companyCurrency.update({
      where: { companyId_code: { companyId, code } },
      data: { active },
    });
    return { code: row.code, name: row.name, active: row.active, base: row.code === functional };
  }

  async rates(actor: FinanceActor, date: string) {
    const companyId = actor.companyId;
    await this.ensureCatalog(companyId);
    const rateDate = parseDate(date || today());
    const functional = await functionalCurrency(this.prisma, companyId);
    const active = await this.prisma.companyCurrency.findMany({
      where: { companyId, active: true, code: { not: functional } },
      orderBy: { code: 'asc' },
    });
    const stored = await this.prisma.dailyRate.findMany({
      where: { companyId, rateDate: { lte: rateDate } },
      orderBy: { rateDate: 'desc' },
    });
    const exactByCode = new Map<string, Prisma.Decimal>();
    const latestByCode = new Map<string, { rate: Prisma.Decimal; date: Date }>();
    for (const row of stored) {
      if (!latestByCode.has(row.code)) {
        latestByCode.set(row.code, { rate: row.rate, date: row.rateDate });
      }
      if (iso(row.rateDate) === iso(rateDate)) {
        exactByCode.set(row.code, row.rate);
      }
    }
    return {
      date: iso(rateDate),
      functional,
      rows: active.map((row) => {
        const code = canonicalRateCode(row.code as Currency, functional);
        const exact = exactByCode.get(code);
        const latest = latestByCode.get(code);
        const resolved = exact ?? latest?.rate;
        return {
          code: row.code,
          name: row.name,
          storedCode: code,
          rate: resolved ? Number(resolved) : null,
          effectiveDate: latest ? iso(latest.date) : null,
          isExactDate: Boolean(exact),
          label: code === Currency.SYP ? 'ليرة لكل دولار' : 'وحدات مقابل وحدة العملة الأساسية',
        };
      }),
    };
  }

  async rateHistory(actor: FinanceActor, code?: string) {
    const companyId = actor.companyId;
    await this.ensureCatalog(companyId);
    const functional = await functionalCurrency(this.prisma, companyId);
    const storedCode = code ? canonicalRateCode(code as Currency, functional) : undefined;
    const rows = await this.prisma.dailyRate.findMany({
      where: {
        companyId,
        ...(storedCode ? { code: storedCode } : {}),
      },
      orderBy: [{ rateDate: 'desc' }, { code: 'asc' }],
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      date: iso(row.rateDate),
      rate: Number(row.rate),
      label: row.code === Currency.SYP ? 'ليرة لكل دولار' : 'وحدات مقابل وحدة العملة الأساسية',
    }));
  }

  async saveRate(actor: FinanceActor, code: string, date: string, rate: number) {
    const companyId = actor.companyId;
    await this.ensureCatalog(companyId);
    const functional = await functionalCurrency(this.prisma, companyId);
    if (code === functional) throw new BadRequestException('BASE_RATE');
    const currency = await this.prisma.companyCurrency.findUnique({
      where: { companyId_code: { companyId, code } },
    });
    if (!currency?.active) throw new BadRequestException('CURRENCY_INACTIVE');
    const storedCode = canonicalRateCode(code as Currency, functional);
    const rateDate = parseDate(date);
    const row = await this.prisma.dailyRate.upsert({
      where: { companyId_code_rateDate: { companyId, code: storedCode, rateDate } },
      update: { rate: new Prisma.Decimal(rate) },
      create: { companyId, code: storedCode, rateDate, rate: new Prisma.Decimal(rate) },
    });
    return { code, storedCode, date: iso(row.rateDate), rate: Number(row.rate) };
  }

  async quote(actor: FinanceActor, code: string, date: string) {
    const companyId = actor.companyId;
    const functional = await functionalCurrency(this.prisma, companyId);
    if (code === functional) return { code, functional, foreign: false, rate: null, date: date || today() };
    const currency = await this.prisma.companyCurrency.findUnique({
      where: { companyId_code: { companyId, code } },
    });
    if (currency && !currency.active) throw new BadRequestException('CURRENCY_INACTIVE');
    const storedCode = canonicalRateCode(code as Currency, functional);
    const rateDate = parseDate(date || today());
    const row = await this.prisma.dailyRate.findFirst({
      where: { companyId, code: storedCode, rateDate: { lte: rateDate } },
      orderBy: { rateDate: 'desc' },
    });
    return {
      code,
      functional,
      foreign: true,
      rate: row ? Number(row.rate) : null,
      effectiveDate: row ? iso(row.rateDate) : null,
      date: iso(rateDate),
      label: storedCode === Currency.SYP ? 'ليرة لكل دولار' : 'وحدات مقابل وحدة العملة الأساسية',
    };
  }

  private async ensureCatalog(companyId: string) {
    const count = await this.prisma.companyCurrency.count({ where: { companyId } });
    if (count > 0) return;
    await this.prisma.companyCurrency.createMany({
      data: CURRENCY_CATALOG.map((row) => ({
        companyId,
        code: row.code,
        name: row.name,
        active: row.code === 'USD' || row.code === 'SYP',
      })),
      skipDuplicates: true,
    });
  }

}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function iso(value: Date) {
  return value.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
