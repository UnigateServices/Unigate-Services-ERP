import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role, TransactionStatus } from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import { operationListWhere } from '../../auth/access';
import { PrismaService } from '../../prisma/prisma.service';
import { MonitorQueryDto, MonitorType } from './dto/monitor-query.dto';

const named = { select: { id: true, name: true } } as const;

const incomeInclude = {
  project: named,
  bank: named,
  employee: named,
  location: named,
} as const;

const outcomeInclude = incomeInclude;

const exchangeInclude = {
  bank: named,
  employee: named,
  location: named,
} as const;

const transferInclude = {
  fromBank: named,
  toBank: named,
  borrower: named,
  employee: named,
  location: named,
} as const;

const advanceInclude = {
  borrower: named,
  project: named,
  employee: named,
  location: named,
} as const;

const ORDER = [{ systemDate: 'desc' as const }, { createdAt: 'desc' as const }];

@Injectable()
export class MonitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(actor: AuthUser, query: MonitorQueryDto) {
    const type: MonitorType = query.type || 'INCOME';
    const range = resolveSystemRange(query.sysFrom, query.sysTo);
    const where: Prisma.IncomeWhereInput = {
      companyId: this.companyId,
      status: { not: TransactionStatus.DELETED },
      ...operationListWhere(actor),
      ...(actor.role === 'SUPERVISOR' ? { employee: { role: Role.EMPLOYEE } } : {}),
      ...employeeFilter(query.employeeId, query.employeeIds),
      systemDate: { gte: range.from, lte: range.to },
    };

    const rows = await this.fetchRows(type, where);

    return {
      type,
      sysFrom: range.sysFrom,
      sysTo: range.sysTo,
      rows,
    };
  }

  private fetchRows(type: MonitorType, where: object) {
    const common = { where: where as never, orderBy: ORDER, take: 500 };
    if (type === 'OUTCOME') {
      return this.prisma.outcome.findMany({ ...common, include: outcomeInclude });
    }
    if (type === 'EXCHANGE') {
      return this.prisma.exchange.findMany({ ...common, include: exchangeInclude });
    }
    if (type === 'TRANSFER') {
      return this.prisma.transfer.findMany({ ...common, include: transferInclude });
    }
    if (type === 'ADVANCE') {
      return this.prisma.advance.findMany({ ...common, include: advanceInclude });
    }
    return this.prisma.income.findMany({ ...common, include: incomeInclude });
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

function employeeFilter(employeeId?: string, employeeIds?: string) {
  const ids = (employeeIds || employeeId || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (ids.length === 1) return { employeeId: ids[0] };
  if (ids.length > 1) return { employeeId: { in: ids } };
  return {};
}

function resolveSystemRange(sysFrom?: string, sysTo?: string) {
  const today = isoDate(new Date());
  const weekAgo = isoDate(addDays(new Date(), -7));
  const fromKey = sysFrom || weekAgo;
  const toKey = sysTo || today;
  return {
    sysFrom: fromKey,
    sysTo: toKey,
    from: dayBound(fromKey, false),
    to: dayBound(toKey, true),
  };
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayBound(iso: string, end: boolean) {
  const [year, month, day] = iso.split('-').map(Number);
  return end
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
}
