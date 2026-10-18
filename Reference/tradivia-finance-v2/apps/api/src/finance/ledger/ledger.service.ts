import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountType, JournalStatus, Prisma, RecordStatus } from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { STATEMENT_LINES, statementLineForType } from '../statements/statement-lines';
import { defaultStatementLine, SYSTEM_CHART } from './chart';
import { syncCostCenters, resolveCostCenter } from './cost-centers';
import { CreateAccountDto, JournalEntryDto, UpdateAccountDto } from './dto/journal.dto';
import { assertPeriodOpen } from './fiscal-period';
import { unbalancedCurrencies } from './journal-math';

const entrySelect = {
  id: true,
  number: true,
  transactionDate: true,
  description: true,
  status: true,
  postedAt: true,
  reversalOfId: true,
  reversalOf: { select: { number: true } },
  reversedBy: { select: { id: true, number: true } },
  employee: { select: { name: true } },
  lines: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      currency: true,
      debit: true,
      credit: true,
      memo: true,
      accountId: true,
      costCenterId: true,
      costCenter: { select: { id: true, name: true, kind: true } },
      account: { select: { code: true, name: true, type: true } },
    },
  },
} satisfies Prisma.JournalEntrySelect;

const accountSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  status: true,
  system: true,
  parentId: true,
  statementLine: true,
  _count: { select: { children: true } },
} satisfies Prisma.AccountSelect;

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  listStatementLines() {
    return STATEMENT_LINES;
  }

  async listAccounts() {
    await this.ensureChart();
    const rows = await this.prisma.account.findMany({
      where: { companyId: this.companyId },
      orderBy: { code: 'asc' },
      select: accountSelect,
    });
    return rows.map(presentAccount);
  }

  async createAccount(dto: CreateAccountDto) {
    await this.ensureChart();
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (!code || !name) throw new BadRequestException('ACCOUNT_REQUIRED');
    const taken = await this.prisma.account.findFirst({
      where: { companyId: this.companyId, OR: [{ code }, { name }] },
    });
    if (taken) throw new BadRequestException('ACCOUNT_EXISTS');
    const statementLine = dto.statementLine?.trim() || defaultStatementLine(dto.type);
    if (!statementLineForType(statementLine, dto.type)) throw new BadRequestException('STATEMENT_LINE');
    const parentId = dto.parentId ? await this.parentFor(dto.parentId, dto.type, null) : null;
    const row = await this.prisma.account.create({
      data: {
        companyId: this.companyId,
        code,
        name,
        type: dto.type,
        system: false,
        statementLine,
        parentId,
      },
      select: accountSelect,
    });
    return presentAccount(row);
  }

  async updateAccount(id: string, dto: UpdateAccountDto) {
    const account = await this.prisma.account.findFirst({ where: { id, companyId: this.companyId } });
    if (!account) throw new NotFoundException('ACCOUNT_NOT_FOUND');
    const data: Prisma.AccountUpdateInput = {};
    if (dto.status) {
      if (account.system) throw new BadRequestException('SYSTEM_ACCOUNT');
      if (dto.status !== RecordStatus.ACTIVE && dto.status !== RecordStatus.INACTIVE) {
        throw new BadRequestException('BAD_PAYLOAD');
      }
      data.status = dto.status;
    }
    if (dto.statementLine !== undefined) {
      if (!statementLineForType(dto.statementLine, account.type)) throw new BadRequestException('STATEMENT_LINE');
      data.statementLine = dto.statementLine;
    }
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId
        ? { connect: { id: await this.parentFor(dto.parentId, account.type, id) } }
        : { disconnect: true };
    }
    if (!Object.keys(data).length) throw new BadRequestException('BAD_PAYLOAD');
    const row = await this.prisma.account.update({ where: { id }, data, select: accountSelect });
    return presentAccount(row);
  }

  private async parentFor(parentId: string, type: AccountType, childId: string | null) {
    const parent = await this.prisma.account.findFirst({ where: { id: parentId, companyId: this.companyId } });
    if (!parent) throw new NotFoundException('ACCOUNT_NOT_FOUND');
    if (parent.type !== type) throw new BadRequestException('PARENT_TYPE');
    if (childId && (await this.createsCycle(childId, parent.id))) throw new BadRequestException('PARENT_CYCLE');
    const activity = await this.prisma.journalLine.count({ where: { accountId: parent.id } });
    if (activity) throw new BadRequestException('HEADER_HAS_ACTIVITY');
    return parent.id;
  }

  private async createsCycle(childId: string, parentId: string) {
    let current: string | null = parentId;
    const seen = new Set<string>();
    while (current) {
      if (current === childId || seen.has(current)) return true;
      seen.add(current);
      const row: { parentId: string | null } | null = await this.prisma.account.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = row?.parentId ?? null;
    }
    return false;
  }

  async listEntries() {
    await this.ensureChart();
    const rows = await this.prisma.journalEntry.findMany({
      where: { companyId: this.companyId },
      orderBy: [{ transactionDate: 'desc' }, { number: 'desc' }],
      select: entrySelect,
    });
    return rows.map(presentEntry);
  }

  async createEntry(actor: AuthUser, dto: JournalEntryDto) {
    await this.ensureChart();
    const lines = await this.checkedLines(dto);
    return this.prisma.$transaction(async (tx) => {
      const transactionDate = dto.post
        ? await assertPeriodOpen(tx, this.companyId, dto.transactionDate)
        : new Date(`${dto.transactionDate}T12:00:00.000Z`);
      const number = await this.nextNumber(tx);
      const entry = await tx.journalEntry.create({
        data: {
          companyId: this.companyId,
          number,
          transactionDate,
          description: dto.description?.trim() ?? '',
          status: dto.post ? JournalStatus.POSTED : JournalStatus.DRAFT,
          postedAt: dto.post ? new Date() : null,
          employeeId: actor.id,
          locationId: actor.locationId,
          lines: { create: lines },
        },
        select: entrySelect,
      });
      return presentEntry(entry);
    });
  }

  async updateEntry(id: string, dto: JournalEntryDto) {
    const current = await this.owned(id);
    if (current.status !== JournalStatus.DRAFT) throw new BadRequestException('POSTED_LOCKED');
    const lines = await this.checkedLines(dto);
    const entry = await this.prisma.$transaction(async (tx) => {
      const transactionDate = dto.post
        ? await assertPeriodOpen(tx, this.companyId, dto.transactionDate)
        : new Date(`${dto.transactionDate}T12:00:00.000Z`);
      await tx.journalLine.deleteMany({ where: { entryId: id } });
      return tx.journalEntry.update({
        where: { id },
        data: {
          transactionDate,
          description: dto.description?.trim() ?? '',
          status: dto.post ? JournalStatus.POSTED : JournalStatus.DRAFT,
          postedAt: dto.post ? new Date() : null,
          lines: { create: lines },
        },
        select: entrySelect,
      });
    });
    return presentEntry(entry);
  }

  async postEntry(id: string) {
    const current = await this.owned(id);
    if (current.status !== JournalStatus.DRAFT) throw new BadRequestException('POSTED_LOCKED');
    this.assertBalanced(current.lines.map((line) => ({
      currency: line.currency,
      debit: Number(line.debit),
      credit: Number(line.credit),
    })));
    await assertPeriodOpen(this.prisma, this.companyId, current.transactionDate);
    const entry = await this.prisma.journalEntry.update({
      where: { id },
      data: { status: JournalStatus.POSTED, postedAt: new Date() },
      select: entrySelect,
    });
    return presentEntry(entry);
  }

  async removeDraft(id: string) {
    const current = await this.owned(id);
    if (current.status !== JournalStatus.DRAFT) throw new BadRequestException('POSTED_LOCKED');
    await this.prisma.journalEntry.delete({ where: { id } });
    return { id };
  }

  async reverseEntry(actor: AuthUser, id: string) {
    const current = await this.prisma.journalEntry.findFirst({
      where: { id, companyId: this.companyId },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, reversedBy: { select: { id: true } } },
    });
    if (!current) throw new NotFoundException('ENTRY_NOT_FOUND');
    if (current.status !== JournalStatus.POSTED) throw new BadRequestException('DRAFT_NOT_REVERSED');
    if (current.reversedBy) throw new BadRequestException('ALREADY_REVERSED');
    if (current.sourceType === 'FX_REVAL') throw new BadRequestException('REVALUE_FROM_STATEMENTS');
    return this.prisma.$transaction(async (tx) => {
      const transactionDate = await assertPeriodOpen(tx, this.companyId, new Date());
      const number = await this.nextNumber(tx);
      const reversal = await tx.journalEntry.create({
        data: {
          companyId: this.companyId,
          number,
          transactionDate,
          description: `عكس القيد ${current.number}`,
          status: JournalStatus.POSTED,
          postedAt: new Date(),
          employeeId: actor.id,
          locationId: actor.locationId,
          reversalOfId: current.id,
          lines: {
            create: current.lines.map((line, index) => ({
              accountId: line.accountId,
              currency: line.currency,
              debit: line.credit,
              credit: line.debit,
              memo: line.memo,
              sortOrder: index,
              costCenterId: line.costCenterId,
              fxRate: line.fxRate,
            })),
          },
        },
        select: entrySelect,
      });
      return presentEntry(reversal);
    });
  }

  private async checkedLines(dto: JournalEntryDto) {
    this.assertBalanced(dto.lines);
    const ids = [...new Set(dto.lines.map((line) => line.accountId))];
    const accounts = await this.prisma.account.findMany({
      where: { companyId: this.companyId, id: { in: ids }, status: RecordStatus.ACTIVE },
      select: { id: true },
    });
    if (accounts.length !== ids.length) throw new BadRequestException('ACCOUNT_INACTIVE');
    const headers = await this.prisma.account.count({
      where: { id: { in: ids }, children: { some: {} } },
    });
    if (headers) throw new BadRequestException('HEADER_ACCOUNT');
    const centers = await Promise.all(
      dto.lines.map((line) =>
        line.costCenterId
          ? resolveCostCenter(this.prisma, { companyId: this.companyId, costCenterId: line.costCenterId })
          : Promise.resolve(null),
      ),
    );
    return dto.lines.map((line, index) => ({
      accountId: line.accountId,
      currency: line.currency,
      debit: line.debit,
      credit: line.credit,
      memo: line.memo?.trim() ?? '',
      sortOrder: index,
      costCenterId: centers[index],
      fxRate: line.fxRate != null && line.fxRate > 0 ? line.fxRate : null,
    }));
  }

  async listCostCenters() {
    await this.prisma.$transaction((tx) => syncCostCenters(tx, this.companyId));
    return this.prisma.costCenter.findMany({
      where: { companyId: this.companyId, status: RecordStatus.ACTIVE },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, kind: true, projectId: true, locationId: true },
    });
  }

  private assertBalanced(lines: { currency: 'USD' | 'SYP'; debit: number; credit: number }[]) {
    const bad = unbalancedCurrencies(lines);
    if (bad.length) throw new BadRequestException('UNBALANCED');
  }

  private async owned(id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, companyId: this.companyId },
      include: { lines: true },
    });
    if (!entry) throw new NotFoundException('ENTRY_NOT_FOUND');
    return entry;
  }

  private async nextNumber(tx: Prisma.TransactionClient) {
    const last = await tx.journalEntry.findFirst({
      where: { companyId: this.companyId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  private async ensureChart() {
    await this.prisma.account.createMany({
      data: SYSTEM_CHART.map((row) => ({ ...row, companyId: this.companyId, system: true })),
      skipDuplicates: true,
    });
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

function presentAccount(row: Prisma.AccountGetPayload<{ select: typeof accountSelect }>) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    system: row.system,
    parentId: row.parentId,
    statementLine: row.statementLine,
    hasChildren: row._count.children > 0,
  };
}

function presentEntry(entry: Prisma.JournalEntryGetPayload<{ select: typeof entrySelect }>) {
  return {
    ...entry,
    transactionDate: entry.transactionDate.toISOString().slice(0, 10),
    lines: entry.lines.map((line) => ({
      ...line,
      debit: line.debit.toString(),
      credit: line.credit.toString(),
    })),
  };
}
