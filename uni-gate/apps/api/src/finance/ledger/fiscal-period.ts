import { BadRequestException } from '@nestjs/common';
import { PeriodStatus, Prisma, PrismaClient } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

/** Calendar date at noon UTC so @db.Date columns stay on the intended day. */
export function calendarNoon(value: Date | string) {
  if (typeof value === 'string') return new Date(`${value}T12:00:00.000Z`);
  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0));
}

export function yearMonth(value: Date) {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}

export async function assertPeriodOpen(db: Db, companyId: string, rawDate: Date | string) {
  const date = calendarNoon(rawDate);
  const { year, month } = yearMonth(date);
  const period = await db.fiscalPeriod.findUnique({
    where: { companyId_year_month: { companyId, year, month } },
    select: { status: true },
  });
  if (period?.status === PeriodStatus.CLOSED) throw new BadRequestException('PERIOD_CLOSED');
  return date;
}

export function monthBounds(year: number, month: number) {
  const startsOn = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const endsOn = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  return { startsOn, endsOn };
}
