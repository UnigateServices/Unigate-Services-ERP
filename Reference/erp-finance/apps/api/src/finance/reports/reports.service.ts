import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdvanceType,
  Currency,
  ExchangeType,
  FundType,
  Prisma,
  Role,
  TransactionStatus,
} from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import { operationListWhere } from '../../auth/access';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { REPORT_GROUPS, catalogForRole } from './report-catalog';
import { ReportId, RunReportDto } from './dto/run-report.dto';

const named = { select: { id: true, name: true } } as const;
const TABLE_LIMIT = 200;

type ChartType =
  | 'bar'
  | 'groupedBar'
  | 'stackedBar'
  | 'horizontalBar'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut';

type Kpi = {
  id: string;
  label: string;
  value: number;
  format: 'int' | 'money';
  currency?: Currency;
  tone?: 'ok' | 'warn' | 'bad';
};

type Chart = {
  id: string;
  title: string;
  type: ChartType;
  labels: string[];
  series: { name: string; values: number[] }[];
  unit?: string;
};

type Column = { key: string; label: string; format?: 'text' | 'num' | 'int' | 'money' | 'date' };

type Section = {
  id: string;
  title: string;
  columns: Column[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string | number>;
};

type ReportDoc = {
  reportId: ReportId;
  title: string;
  description: string;
  periodLabel: string;
  from: string | null;
  to: string | null;
  generatedAt: string;
  note: string;
  kpis: Kpi[];
  charts: Chart[];
  sections: Section[];
  notes: string[];
  truncated: boolean;
};

const FUND_LABEL: Record<string, string> = {
  VAULT: 'الخزنة',
  SHAM_CASH: 'شام كاش',
  BANK: 'البنك',
};

const ADVANCE_LABEL: Record<AdvanceType, string> = {
  ISSUE: 'صرف عهدة',
  RETURN: 'استرداد عهدة',
  OUTCOME: 'صادر من العهدة',
  EXCHANGE: 'تصريف داخل العهدة',
};

const CUR_LABEL: Record<string, string> = { USD: 'دولار', SYP: 'ليرة سورية' };

@Injectable()
export class ReportsService {
  private currentReportId: ReportId = 'overview';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly balances: BalancesService,
  ) {}

  catalog(actor: AuthUser) {
    return {
      groups: REPORT_GROUPS,
      reports: catalogForRole(actor.role),
    };
  }

  async run(actor: AuthUser, dto: RunReportDto): Promise<ReportDoc> {
    const def = catalogForRole(actor.role).find((item) => item.id === dto.reportId);
    if (!def) {
      throw new NotFoundException('REPORT_NOT_FOUND');
    }
    if (dto.reportId === 'staff' && actor.role === Role.EMPLOYEE) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const range = resolveRange(dto.period || 'month', dto.from, dto.to);
    const bundle = await this.loadOps(actor, dto, range);
    this.currentReportId = dto.reportId;
    const note =
      'تقرير تشغيلي حسب تاريخ العملية. التحويل الداخلي بين الصناديق لا يُحتسب دخلاً أو صرفاً. ليس قائمة أرباح وخسائر محاسبية.';

    let doc: ReportDoc;
    switch (dto.reportId) {
      case 'overview':
        doc = this.buildOverview(def.title, def.description, range, bundle, note);
        break;
      case 'income':
        doc = this.buildTyped(def, range, bundle, note, 'INCOME');
        break;
      case 'outcome':
        doc = this.buildTyped(def, range, bundle, note, 'OUTCOME');
        break;
      case 'exchange':
        doc = this.buildExchange(def.title, def.description, range, bundle, note);
        break;
      case 'transfer':
        doc = this.buildTransfer(def.title, def.description, range, bundle, note);
        break;
      case 'advances':
        doc = this.buildAdvances(def.title, def.description, range, bundle, note);
        break;
      case 'borrower':
        doc = this.buildBorrower(def.title, def.description, range, bundle, note);
        break;
      case 'staff':
        doc = this.buildStaff(def.title, def.description, range, bundle, note);
        break;
      default:
        doc = await this.buildFunds(def.title, def.description, range, bundle, note, actor);
        break;
    }
    return { ...doc, reportId: dto.reportId };
  }

  private async loadOps(actor: AuthUser, dto: RunReportDto, range: DateRange) {
    const employees = splitCsv(dto.employeeId);
    const currencies = splitCsv(dto.currency) as Currency[];
    const funds = splitCsv(dto.fund);
    const projects = splitCsv(dto.projectId);
    const borrowers = splitCsv(dto.borrowerId);
    const exchangeTypes = splitCsv(dto.exchangeType) as ExchangeType[];
    const advanceTypes = splitCsv(dto.advanceType) as AdvanceType[];
    const scope = {
      companyId: this.companyId,
      ...operationListWhere(actor),
      ...(employees.length && actor.role !== Role.EMPLOYEE ? prismaIn('employeeId', employees) : {}),
      ...statusWhere(dto.status),
      ...dateWhere(range),
    };

    const [incomes, outcomes, exchanges, transfers, advances] = await Promise.all([
      this.prisma.income.findMany({
        where: {
          ...scope,
          ...prismaIn('currency', currencies),
          ...fundWhereSimple(funds),
          ...prismaIn('projectId', projects),
        },
        include: { project: named, bank: named, employee: named, location: named },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.outcome.findMany({
        where: {
          ...scope,
          ...prismaIn('currency', currencies),
          ...fundWhereSimple(funds),
          ...prismaIn('projectId', projects),
        },
        include: { project: named, bank: named, employee: named, location: named },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.exchange.findMany({
        where: {
          ...scope,
          ...fundWhereSimple(funds),
          ...prismaIn('exchangeType', exchangeTypes),
        },
        include: { bank: named, employee: named, location: named },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.transfer.findMany({
        where: {
          ...scope,
          ...prismaIn('currency', currencies),
          ...fundWhereTransfer(funds),
        },
        include: {
          fromBank: named,
          toBank: named,
          employee: named,
          location: named,
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.advance.findMany({
        where: {
          ...scope,
          ...prismaIn('currency', currencies),
          ...prismaIn('borrowerId', borrowers),
          ...prismaIn('projectId', projects),
          ...prismaIn('advanceType', advanceTypes),
        },
        include: { borrower: named, bank: named, project: named, employee: named, location: named },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    return { incomes, outcomes, exchanges, transfers, advances };
  }

  private buildOverview(
    title: string,
    description: string,
    range: DateRange,
    bundle: OpsBundle,
    note: string,
  ): ReportDoc {
    const rows = this.flatten(bundle);
    const incomeUsd = sumBy(bundle.incomes, (r) => (r.currency === Currency.USD ? num(r.total) : 0));
    const incomeSyp = sumBy(bundle.incomes, (r) => (r.currency === Currency.SYP ? num(r.total) : 0));
    const outcomeUsd = sumBy(bundle.outcomes, (r) => (r.currency === Currency.USD ? num(r.total) : 0));
    const outcomeSyp = sumBy(bundle.outcomes, (r) => (r.currency === Currency.SYP ? num(r.total) : 0));
    const counts = {
      وارد: bundle.incomes.length,
      صادر: bundle.outcomes.length,
      تصريف: bundle.exchanges.length,
      تحويل: bundle.transfers.length,
      سلف: bundle.advances.length,
    };

    const byDay = dailyKeys(rows.map((r) => r.date));
    const netUsdByDay = byDay.map((day) =>
      netUsdOnDay(bundle, day),
    );
    const incomeUsdByDay = byDay.map((day) =>
      sumBy(bundle.incomes, (r) => (isoDay(r.transactionDate) === day && r.currency === Currency.USD ? num(r.total) : 0)),
    );
    const outcomeUsdByDay = byDay.map((day) =>
      sumBy(bundle.outcomes, (r) => (isoDay(r.transactionDate) === day && r.currency === Currency.USD ? num(r.total) : 0)),
    );
    const cumulative = running(netUsdByDay);

    const { shown, truncated } = clip(rows);

    return this.doc(title, description, range, note, truncated, {
      kpis: [
        kpi('ops', 'العمليات', rows.length, 'int'),
        kpi('inUsd', 'وارد دولار', incomeUsd, 'money', Currency.USD, 'ok'),
        kpi('outUsd', 'صادر دولار', outcomeUsd, 'money', Currency.USD, 'bad'),
        kpi('netUsd', 'صافي تشغيلي دولار', round(incomeUsd - outcomeUsd), 'money', Currency.USD),
        kpi('inSyp', 'وارد ليرة', incomeSyp, 'money', Currency.SYP, 'ok'),
        kpi('outSyp', 'صادر ليرة', outcomeSyp, 'money', Currency.SYP, 'bad'),
      ],
      charts: [
        chart('mix', 'مزيج العمليات', 'doughnut', Object.keys(counts), [
          { name: 'عدد', values: Object.values(counts) },
        ]),
        chart('io', 'وارد مقابل صادر (دولار)', 'groupedBar', byDay, [
          { name: 'وارد', values: incomeUsdByDay },
          { name: 'صادر', values: outcomeUsdByDay },
        ], 'USD'),
        chart('stack', 'حجم وارد/صادر دولار', 'stackedBar', byDay, [
          { name: 'وارد', values: incomeUsdByDay },
          { name: 'صادر', values: outcomeUsdByDay },
        ], 'USD'),
        chart('net', 'صافي تشغيلي يومي دولار', 'area', byDay, [{ name: 'صافي', values: netUsdByDay }], 'USD'),
        chart('cum', 'صافي تراكمي دولار', 'line', byDay, [{ name: 'تراكمي', values: cumulative }], 'USD'),
        chart('hbar', 'عدد العمليات حسب النوع', 'horizontalBar', Object.keys(counts), [
          { name: 'عدد', values: Object.values(counts) },
        ]),
      ],
      sections: [
        {
          id: 'rows',
          title: 'سجل الفترة',
          columns: [
            col('date', 'التاريخ', 'date'),
            col('type', 'النوع'),
            col('reference', 'المرجع'),
            col('employee', 'الموظف'),
            col('route', 'المسار'),
            col('currency', 'العملة'),
            col('amount', 'المبلغ', 'num'),
            col('status', 'الحالة'),
          ],
          rows: shown.map((row) => ({
            date: row.date,
            type: row.type,
            reference: row.reference,
            employee: row.employee,
            route: row.route,
            currency: row.currency,
            amount: row.amount,
            status: row.status,
          })),
        },
      ],
    });
  }

  private buildTyped(
    def: { id: ReportId; title: string; description: string },
    range: DateRange,
    bundle: OpsBundle,
    note: string,
    kind: 'INCOME' | 'OUTCOME',
  ): ReportDoc {
    const source = kind === 'INCOME' ? bundle.incomes : bundle.outcomes;
    const byProject = groupSum(source, (r) => r.project?.name || 'بدون مشروع', (r) => num(r.total));
    const byFund = groupSum(source, (r) => fundName(r.fund, r.bank?.name), (r) => num(r.total));
    const byCur = groupSum(source, (r) => CUR_LABEL[r.currency] || r.currency, (r) => num(r.total));
    const byDay = dailyKeys(source.map((r) => isoDay(r.transactionDate)));
    const usdDay = byDay.map((day) =>
      sumBy(source, (r) => (isoDay(r.transactionDate) === day && r.currency === Currency.USD ? num(r.total) : 0)),
    );
    const sypDay = byDay.map((day) =>
      sumBy(source, (r) => (isoDay(r.transactionDate) === day && r.currency === Currency.SYP ? num(r.total) : 0)),
    );
    const { shown, truncated } = clip(source);

    return this.doc(def.title, def.description, range, note, truncated, {
      kpis: [
        kpi('ops', 'العمليات', source.length, 'int'),
        kpi('usd', 'إجمالي دولار', sumBy(source, (r) => (r.currency === Currency.USD ? num(r.total) : 0)), 'money', Currency.USD),
        kpi('syp', 'إجمالي ليرة', sumBy(source, (r) => (r.currency === Currency.SYP ? num(r.total) : 0)), 'money', Currency.SYP),
      ],
      charts: [
        chart('pie', 'حسب المشروع', 'pie', byProject.labels, [{ name: 'المبلغ', values: byProject.values }]),
        chart('fund', 'حسب الصندوق', 'bar', byFund.labels, [{ name: 'المبلغ', values: byFund.values }]),
        chart('cur', 'حسب العملة', 'doughnut', byCur.labels, [{ name: 'المبلغ', values: byCur.values }]),
        chart('daily', 'يومي حسب العملة', 'groupedBar', byDay, [
          { name: 'دولار', values: usdDay },
          { name: 'ليرة', values: sypDay },
        ]),
        chart('area', 'حجم دولار يومي', 'area', byDay, [{ name: 'دولار', values: usdDay }], 'USD'),
      ],
      sections: [
        {
          id: 'rows',
          title: def.title,
          columns: [
            col('date', 'التاريخ', 'date'),
            col('reference', 'المرجع'),
            col('employee', 'الموظف'),
            col('project', 'المشروع'),
            col('fund', 'الصندوق'),
            col('party', kind === 'INCOME' ? 'المرسل' : 'المسلّم'),
            col('currency', 'العملة'),
            col('total', 'الإجمالي', 'num'),
            col('status', 'الحالة'),
          ],
          rows: shown.map((row) => ({
            date: isoDay(row.transactionDate),
            reference: row.reference,
            employee: row.employee.name,
            project: row.project?.name || '—',
            fund: fundName(row.fund, row.bank?.name),
            party: row.sender || row.deliverer || '—',
            currency: CUR_LABEL[row.currency],
            total: num(row.total),
            status: statusLabel(row.status),
          })),
        },
      ],
    });
  }

  private buildExchange(
    title: string,
    description: string,
    range: DateRange,
    bundle: OpsBundle,
    note: string,
  ): ReportDoc {
    const rows = bundle.exchanges;
    const buy = rows.filter((r) => r.exchangeType === ExchangeType.BUY);
    const sell = rows.filter((r) => r.exchangeType === ExchangeType.SELL);
    const byType = groupSum(rows, (r) => (r.exchangeType === ExchangeType.BUY ? 'شراء' : 'بيع'), () => 1);
    const usdPaid = sumBy(rows, (r) => (r.paidCurrency === Currency.USD ? num(r.exchangeAmount) : 0));
    const usdRecv = sumBy(rows, (r) => (r.receivedCurrency === Currency.USD ? num(r.total) : 0));
    const byDay = dailyKeys(rows.map((r) => isoDay(r.transactionDate)));
    const buyDay = byDay.map((day) => buy.filter((r) => isoDay(r.transactionDate) === day).length);
    const sellDay = byDay.map((day) => sell.filter((r) => isoDay(r.transactionDate) === day).length);
    const rateDay = byDay.map((day) => {
      const ofDay = rows.filter((r) => isoDay(r.transactionDate) === day);
      if (!ofDay.length) return 0;
      return round(sumBy(ofDay, (r) => num(r.exchangeRate)) / ofDay.length);
    });
    const { shown, truncated } = clip(rows);

    return this.doc(title, description, range, note, truncated, {
      kpis: [
        kpi('ops', 'عمليات التصريف', rows.length, 'int'),
        kpi('buy', 'شراء', buy.length, 'int', undefined, 'ok'),
        kpi('sell', 'بيع', sell.length, 'int', undefined, 'warn'),
        kpi('usdPaid', 'دولار مدفوع', usdPaid, 'money', Currency.USD),
        kpi('usdRecv', 'دولار مستلم', usdRecv, 'money', Currency.USD),
      ],
      charts: [
        chart('type', 'شراء مقابل بيع', 'pie', byType.labels, [{ name: 'عدد', values: byType.values }]),
        chart('daily', 'عمليات يومية', 'groupedBar', byDay, [
          { name: 'شراء', values: buyDay },
          { name: 'بيع', values: sellDay },
        ]),
        chart('rate', 'متوسط السعر اليومي', 'line', byDay, [{ name: 'سعر', values: rateDay }]),
        chart('vol', 'حجم الدولار المدفوع/المستلم', 'stackedBar', ['مدفوع', 'مستلم'], [
          { name: 'دولار', values: [usdPaid, usdRecv] },
        ], 'USD'),
      ],
      sections: [
        {
          id: 'rows',
          title: 'سجل التصريف',
          columns: [
            col('date', 'التاريخ', 'date'),
            col('reference', 'المرجع'),
            col('employee', 'الموظف'),
            col('type', 'النوع'),
            col('fund', 'الصندوق'),
            col('paid', 'مدفوع'),
            col('recv', 'مستلم'),
            col('rate', 'السعر', 'num'),
            col('status', 'الحالة'),
          ],
          rows: shown.map((row) => ({
            date: isoDay(row.transactionDate),
            reference: row.reference,
            employee: row.employee.name,
            type: row.exchangeType === ExchangeType.BUY ? 'شراء' : 'بيع',
            fund: fundName(row.fund, row.bank?.name),
            paid: `${num(row.exchangeAmount)} ${CUR_LABEL[row.paidCurrency]}`,
            recv: `${num(row.total)} ${CUR_LABEL[row.receivedCurrency]}`,
            rate: num(row.exchangeRate),
            status: statusLabel(row.status),
          })),
        },
      ],
    });
  }

  private buildTransfer(
    title: string,
    description: string,
    range: DateRange,
    bundle: OpsBundle,
    note: string,
  ): ReportDoc {
    const rows = bundle.transfers;
    const byRoute = groupSum(
      rows,
      (r) => `${FUND_LABEL[r.fromFund]} → ${FUND_LABEL[r.toFund]}`,
      (r) => num(r.amount),
    );
    const byCur = groupSum(rows, (r) => CUR_LABEL[r.currency], (r) => num(r.amount));
    const byDay = dailyKeys(rows.map((r) => isoDay(r.transactionDate)));
    const amtDay = byDay.map((day) =>
      sumBy(rows, (r) => (isoDay(r.transactionDate) === day ? num(r.amount) : 0)),
    );
    const { shown, truncated } = clip(rows);

    return this.doc(title, description, range, note, truncated, {
      kpis: [
        kpi('ops', 'التحويلات', rows.length, 'int'),
        kpi('usd', 'حجم دولار', sumBy(rows, (r) => (r.currency === Currency.USD ? num(r.amount) : 0)), 'money', Currency.USD),
        kpi('syp', 'حجم ليرة', sumBy(rows, (r) => (r.currency === Currency.SYP ? num(r.amount) : 0)), 'money', Currency.SYP),
      ],
      charts: [
        chart('route', 'حسب المسار', 'horizontalBar', byRoute.labels, [{ name: 'المبلغ', values: byRoute.values }]),
        chart('cur', 'حسب العملة', 'doughnut', byCur.labels, [{ name: 'المبلغ', values: byCur.values }]),
        chart('daily', 'حجم يومي', 'area', byDay, [{ name: 'المبلغ', values: amtDay }]),
      ],
      sections: [
        {
          id: 'rows',
          title: 'سجل التحويل',
          columns: [
            col('date', 'التاريخ', 'date'),
            col('reference', 'المرجع'),
            col('employee', 'الموظف'),
            col('from', 'من'),
            col('to', 'إلى'),
            col('currency', 'العملة'),
            col('amount', 'المبلغ', 'num'),
            col('status', 'الحالة'),
          ],
          rows: shown.map((row) => ({
            date: isoDay(row.transactionDate),
            reference: row.reference,
            employee: row.employee.name,
            from: fundName(row.fromFund, row.fromBank?.name),
            to: fundName(row.toFund, row.toBank?.name),
            currency: CUR_LABEL[row.currency],
            amount: num(row.amount),
            status: statusLabel(row.status),
          })),
        },
      ],
      extraNotes: ['حجم التحويل يصف حركة الصناديق فقط؛ الصافي التشغيلي للصناديق = 0 بين صندوقين داخليين.'],
    });
  }

  private buildAdvances(
    title: string,
    description: string,
    range: DateRange,
    bundle: OpsBundle,
    note: string,
  ): ReportDoc {
    const rows = bundle.advances;
    const byBorrower = groupSum(rows, (r) => r.borrower.name, (r) => num(r.total));
    const byType = groupSum(rows, (r) => ADVANCE_LABEL[r.advanceType], (r) => 1);
    const byDay = dailyKeys(rows.map((r) => isoDay(r.transactionDate)));
    const usdDay = byDay.map((day) =>
      sumBy(rows, (r) => (isoDay(r.transactionDate) === day && r.currency === Currency.USD ? num(r.total) : 0)),
    );
    const { shown, truncated } = clip(rows);

    return this.doc(title, description, range, note, truncated, {
      kpis: [
        kpi('ops', 'عمليات السلف', rows.length, 'int'),
        kpi('usd', 'إجمالي دولار', sumBy(rows, (r) => (r.currency === Currency.USD ? num(r.total) : 0)), 'money', Currency.USD),
        kpi('syp', 'إجمالي ليرة', sumBy(rows, (r) => (r.currency === Currency.SYP ? num(r.total) : 0)), 'money', Currency.SYP),
      ],
      charts: [
        chart('who', 'حسب المستلف', 'horizontalBar', byBorrower.labels, [{ name: 'المبلغ', values: byBorrower.values }]),
        chart('type', 'حسب النوع', 'pie', byType.labels, [{ name: 'عدد', values: byType.values }]),
        chart('daily', 'حجم دولار يومي', 'bar', byDay, [{ name: 'دولار', values: usdDay }], 'USD'),
      ],
      sections: [
        {
          id: 'rows',
          title: 'سجل السلف',
          columns: [
            col('date', 'التاريخ', 'date'),
            col('reference', 'المرجع'),
            col('employee', 'الموظف'),
            col('borrower', 'المستلف'),
            col('type', 'النوع'),
            col('project', 'المشروع'),
            col('currency', 'العملة'),
            col('total', 'الإجمالي', 'num'),
            col('status', 'الحالة'),
          ],
          rows: shown.map((row) => ({
            date: isoDay(row.transactionDate),
            reference: row.reference,
            employee: row.employee.name,
            borrower: row.borrower.name,
            type: ADVANCE_LABEL[row.advanceType],
            project: row.project?.name || '—',
            currency: CUR_LABEL[row.currency],
            total: num(row.total),
            status: statusLabel(row.status),
          })),
        },
      ],
    });
  }

  private buildBorrower(
    title: string,
    description: string,
    range: DateRange,
    bundle: OpsBundle,
    note: string,
  ): ReportDoc {
    const adv = bundle.advances;
    const names = new Map<string, string>();
    for (const row of adv) names.set(row.borrower.id, row.borrower.name);
    const ids = [...names.keys()];
    const labels = ids.map((id) => names.get(id) || id);
    const usdOf = (id: string, types: AdvanceType[]) =>
      sumBy(adv, (r) =>
        r.borrower.id === id && r.currency === Currency.USD && types.includes(r.advanceType) ? num(r.total) : 0,
      );
    // Cash handed out versus cash that came back, and what the borrower actually spent.
    const issuedUsd = ids.map((id) => usdOf(id, [AdvanceType.ISSUE]));
    const returnedUsd = ids.map((id) => usdOf(id, [AdvanceType.RETURN]));
    const spentUsd = ids.map((id) => usdOf(id, [AdvanceType.OUTCOME]));
    const combined = this.flatten({
      incomes: [],
      outcomes: [],
      exchanges: [],
      transfers: [],
      advances: adv,
    });
    const { shown, truncated } = clip(combined);

    return this.doc(title, description, range, note, truncated, {
      kpis: [
        kpi('people', 'المستلفون', ids.length, 'int'),
        kpi('issue', 'سندات صرف عهدة', adv.filter((r) => r.advanceType === AdvanceType.ISSUE).length, 'int'),
        kpi('spend', 'مصروفات من العهدة', adv.filter((r) => r.advanceType === AdvanceType.OUTCOME).length, 'int'),
      ],
      charts: [
        chart('mix', 'عهدة مصروفة مقابل مستهلكة (دولار)', 'groupedBar', labels, [
          { name: 'صرف عهدة', values: issuedUsd },
          { name: 'مصروف', values: spentUsd },
        ], 'USD'),
        chart('stack', 'حركة العهدة بالدولار', 'stackedBar', labels, [
          { name: 'صرف عهدة', values: issuedUsd },
          { name: 'استرداد', values: returnedUsd },
          { name: 'مصروف', values: spentUsd },
        ], 'USD'),
      ],
      sections: [
        {
          id: 'rows',
          title: 'حركة المستلفين',
          columns: [
            col('date', 'التاريخ', 'date'),
            col('type', 'النوع'),
            col('reference', 'المرجع'),
            col('borrower', 'المستلف'),
            col('currency', 'العملة'),
            col('amount', 'المبلغ', 'num'),
            col('status', 'الحالة'),
          ],
          rows: shown.map((row) => ({
            date: row.date,
            type: row.type,
            reference: row.reference,
            borrower: row.party,
            currency: row.currency,
            amount: row.amount,
            status: row.status,
          })),
        },
      ],
    });
  }

  private buildStaff(
    title: string,
    description: string,
    range: DateRange,
    bundle: OpsBundle,
    note: string,
  ): ReportDoc {
    const all = this.flatten(bundle);
    const byEmp = groupSum(all, (r) => r.employee, () => 1);
    const usdByEmp = groupSum(
      all.filter((r) => r.currencyCode === Currency.USD),
      (r) => r.employee,
      (r) => r.amount,
    );
    const { shown, truncated } = clip(all);

    return this.doc(title, description, range, note, truncated, {
      kpis: [
        kpi('ops', 'العمليات', all.length, 'int'),
        kpi('staff', 'الموظفون', byEmp.labels.length, 'int'),
      ],
      charts: [
        chart('count', 'عدد العمليات حسب الموظف', 'horizontalBar', byEmp.labels, [
          { name: 'عدد', values: byEmp.values },
        ]),
        chart('usd', 'حجم دولار حسب الموظف', 'bar', usdByEmp.labels, [
          { name: 'دولار', values: usdByEmp.values },
        ], 'USD'),
        chart('share', 'حصة العمليات', 'doughnut', byEmp.labels, [{ name: 'عدد', values: byEmp.values }]),
      ],
      sections: [
        {
          id: 'rows',
          title: 'تفاصيل الموظفين',
          columns: [
            col('date', 'التاريخ', 'date'),
            col('employee', 'الموظف'),
            col('type', 'النوع'),
            col('reference', 'المرجع'),
            col('amount', 'المبلغ', 'num'),
            col('currency', 'العملة'),
          ],
          rows: shown.map((row) => ({
            date: row.date,
            employee: row.employee,
            type: row.type,
            reference: row.reference,
            amount: row.amount,
            currency: row.currency,
          })),
        },
      ],
    });
  }

  private async buildFunds(
    title: string,
    description: string,
    range: DateRange,
    bundle: OpsBundle,
    note: string,
    actor: AuthUser,
  ): Promise<ReportDoc> {
    const snapshot = await this.balances.getFunds(actor);
    const flow = this.periodFlow(bundle);
    const vaultUsd = snapshot.vault.find((r) => r.currency === Currency.USD)?.amount || 0;
    const vaultSyp = snapshot.vault.find((r) => r.currency === Currency.SYP)?.amount || 0;
    const flowLabels = flow.map((r) => r.box);
    const { shown, truncated } = clip(this.flatten(bundle));

    return this.doc(title, description, range, note, truncated, {
      kpis: [
        kpi('vaultUsd', 'الخزنة الآن دولار', vaultUsd, 'money', Currency.USD),
        kpi('vaultSyp', 'الخزنة الآن ليرة', vaultSyp, 'money', Currency.SYP),
        kpi('ops', 'عمليات الفترة', this.flatten(bundle).length, 'int'),
      ],
      charts: [
        chart('in', 'دخول الفترة', 'bar', flowLabels, [{ name: 'دخول', values: flow.map((r) => r.inAmt) }]),
        chart('out', 'خروج الفترة', 'bar', flowLabels, [{ name: 'خروج', values: flow.map((r) => r.outAmt) }]),
        chart('net', 'صافي الفترة', 'horizontalBar', flowLabels, [{ name: 'صافي', values: flow.map((r) => r.net) }]),
        chart('io', 'دخول مقابل خروج', 'groupedBar', flowLabels, [
          { name: 'دخول', values: flow.map((r) => r.inAmt) },
          { name: 'خروج', values: flow.map((r) => r.outAmt) },
        ]),
      ],
      sections: [
        {
          id: 'live',
          title: 'الأرصدة الحالية (لحظة التقرير)',
          columns: [
            col('box', 'الصندوق'),
            col('usd', 'دولار', 'num'),
            col('syp', 'ليرة', 'num'),
          ],
          rows: [
            {
              box: 'الخزنة',
              usd: vaultUsd,
              syp: vaultSyp,
            },
            {
              box: 'شام كاش',
              usd: snapshot.sham.find((r) => r.currency === Currency.USD)?.amount || 0,
              syp: snapshot.sham.find((r) => r.currency === Currency.SYP)?.amount || 0,
            },
            ...snapshot.banks.map((bank) => ({
              box: `بنك — ${bank.name}`,
              usd: bank.balances.find((r) => r.currency === Currency.USD)?.amount || 0,
              syp: bank.balances.find((r) => r.currency === Currency.SYP)?.amount || 0,
            })),
            ...snapshot.custody.map((row) => ({
              box: `عهدة — ${row.name}`,
              usd: row.balances.find((r) => r.currency === Currency.USD)?.amount || 0,
              syp: row.balances.find((r) => r.currency === Currency.SYP)?.amount || 0,
            })),
          ],
        },
        {
          id: 'flow',
          title: 'حركة الفترة',
          columns: [
            col('box', 'الصندوق / العملة'),
            col('inAmt', 'دخول', 'num'),
            col('outAmt', 'خروج', 'num'),
            col('net', 'صافي', 'num'),
          ],
          rows: flow,
        },
      ],
      extraNotes: ['الأرصدة الحالية محسوبة من كل العمليات المكتملة والمعلّقة، وليست مخزّنة يدوياً. حركة الفترة من تاريخ العملية.'],
    });
  }

  private periodFlow(bundle: OpsBundle) {
    const map = new Map<string, { box: string; inAmt: number; outAmt: number; net: number }>();
    const add = (box: string, delta: number) => {
      const row = map.get(box) || { box, inAmt: 0, outAmt: 0, net: 0 };
      if (delta >= 0) row.inAmt = round(row.inAmt + delta);
      else row.outAmt = round(row.outAmt + Math.abs(delta));
      row.net = round(row.inAmt - row.outAmt);
      map.set(box, row);
    };
    const boxName = (fund: FundType, currency: Currency, bank?: string) =>
      `${fund === FundType.BANK ? `بنك — ${bank || '—'}` : FUND_LABEL[fund]} · ${CUR_LABEL[currency]}`;

    for (const row of bundle.incomes) add(boxName(row.fund, row.currency, row.bank?.name), num(row.total));
    for (const row of bundle.outcomes) add(boxName(row.fund, row.currency, row.bank?.name), -num(row.total));
    for (const row of bundle.exchanges) {
      add(boxName(row.fund, row.paidCurrency, row.bank?.name), -num(row.exchangeAmount));
      add(boxName(row.fund, row.receivedCurrency, row.bank?.name), num(row.total));
    }
    for (const row of bundle.transfers) {
      add(boxName(row.fromFund, row.currency, row.fromBank?.name), -num(row.amount));
      add(boxName(row.toFund, row.currency, row.toBank?.name), num(row.amount));
    }
    // Custody vouchers are the only advance operations that move cash.
    for (const row of bundle.advances) {
      if (!row.fund) continue;
      const delta =
        row.advanceType === AdvanceType.ISSUE ? -num(row.total) : row.advanceType === AdvanceType.RETURN ? num(row.total) : 0;
      if (delta) add(boxName(row.fund, row.currency, row.bank?.name), delta);
    }
    return [...map.values()];
  }

  private flatten(bundle: OpsBundle): FlatRow[] {
    const rows: FlatRow[] = [];
    for (const row of bundle.incomes) {
      rows.push(flat('وارد', row, fundName(row.fund, row.bank?.name), row.sender || '—', row.currency, num(row.total)));
    }
    for (const row of bundle.outcomes) {
      rows.push(flat('صادر', row, fundName(row.fund, row.bank?.name), row.deliverer || '—', row.currency, num(row.total)));
    }
    for (const row of bundle.exchanges) {
      rows.push(
        flat(
          'تصريف',
          row,
          fundName(row.fund, row.bank?.name),
          row.exchangeType === ExchangeType.BUY ? 'شراء' : 'بيع',
          row.paidCurrency,
          num(row.exchangeAmount),
        ),
      );
    }
    for (const row of bundle.transfers) {
      rows.push(
        flat(
          'تحويل',
          row,
          `${FUND_LABEL[row.fromFund]} → ${FUND_LABEL[row.toFund]}`,
          '—',
          row.currency,
          num(row.amount),
        ),
      );
    }
    for (const row of bundle.advances) {
      rows.push(
        flat(
          'سلف',
          row,
          ADVANCE_LABEL[row.advanceType],
          row.borrower.name,
          row.currency,
          num(row.total),
        ),
      );
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.reference.localeCompare(a.reference));
  }

  private doc(
    title: string,
    description: string,
    range: DateRange,
    note: string,
    truncated: boolean,
    body: {
      kpis: Kpi[];
      charts: Chart[];
      sections: Section[];
      extraNotes?: string[];
    },
  ): ReportDoc {
    const notes = [note, ...(body.extraNotes || [])];
    if (truncated) notes.push(`يُعرض أحدث ${TABLE_LIMIT} صفاً في الجداول. الرسوم والمؤشرات من كامل الفترة.`);
    return {
      reportId: this.currentReportId,
      title,
      description,
      periodLabel: range.label,
      from: range.fromIso,
      to: range.toIso,
      generatedAt: new Date().toISOString(),
      note,
      kpis: body.kpis,
      charts: body.charts.filter((item) => item.labels.length > 0),
      sections: body.sections,
      notes,
      truncated,
    };
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

type DateRange = {
  fromIso: string | null;
  toIso: string | null;
  from?: Date;
  to?: Date;
  label: string;
};

type Named = { id: string; name: string };
type CashOp = {
  transactionDate: Date;
  reference: string;
  status: TransactionStatus;
  currency: Currency;
  total: Prisma.Decimal;
  fund: FundType;
  sender?: string;
  deliverer?: string;
  bank: Named | null;
  project: Named | null;
  employee: Named;
};

type OpsBundle = {
  incomes: CashOp[];
  outcomes: CashOp[];
  exchanges: Array<{
    transactionDate: Date;
    reference: string;
    status: TransactionStatus;
    fund: FundType;
    exchangeType: ExchangeType;
    paidCurrency: Currency;
    receivedCurrency: Currency;
    exchangeAmount: Prisma.Decimal;
    total: Prisma.Decimal;
    exchangeRate: Prisma.Decimal;
    bank: Named | null;
    employee: Named;
  }>;
  transfers: Array<{
    transactionDate: Date;
    reference: string;
    status: TransactionStatus;
    fromFund: FundType;
    toFund: FundType;
    currency: Currency;
    amount: Prisma.Decimal;
    fromBank: Named | null;
    toBank: Named | null;
    employee: Named;
  }>;
  advances: Array<{
    transactionDate: Date;
    reference: string;
    status: TransactionStatus;
    advanceType: AdvanceType;
    currency: Currency;
    total: Prisma.Decimal;
    fund: FundType | null;
    bank: Named | null;
    borrower: Named;
    project: Named | null;
    employee: Named;
  }>;
};

type FlatRow = {
  date: string;
  type: string;
  reference: string;
  employee: string;
  route: string;
  party: string;
  currency: string;
  currencyCode: Currency;
  amount: number;
  status: string;
};

function flat(
  type: string,
  row: { transactionDate: Date; reference: string; status: TransactionStatus; employee: Named },
  route: string,
  party: string,
  currency: Currency,
  amount: number,
): FlatRow {
  return {
    date: isoDay(row.transactionDate),
    type,
    reference: row.reference,
    employee: row.employee.name,
    route,
    party,
    currency: CUR_LABEL[currency],
    currencyCode: currency,
    amount,
    status: statusLabel(row.status),
  };
}

function resolveRange(period: string, from?: string, to?: string): DateRange {
  const today = isoDate(new Date());
  if (period === 'all') {
    return { fromIso: null, toIso: null, label: 'كل الفترات' };
  }
  if (period === 'custom' && from && to) {
    return { fromIso: from, toIso: to, from: dayBound(from, false), to: dayBound(to, true), label: `${from} — ${to}` };
  }
  if (period === 'today') {
    return { fromIso: today, toIso: today, from: dayBound(today, false), to: dayBound(today, true), label: 'اليوم' };
  }
  if (period === 'week') {
    const fromIso = isoDate(addDays(new Date(), -6));
    return { fromIso, toIso: today, from: dayBound(fromIso, false), to: dayBound(today, true), label: 'آخر 7 أيام' };
  }
  const start = new Date();
  const fromIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
  return { fromIso, toIso: today, from: dayBound(fromIso, false), to: dayBound(today, true), label: 'هذا الشهر' };
}

function dateWhere(range: DateRange) {
  if (!range.from || !range.to) return {};
  return { transactionDate: { gte: range.from, lte: range.to } };
}

function splitCsv(value?: string) {
  if (!value?.trim()) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function prismaIn(field: string, values: string[]) {
  if (!values.length) return {};
  if (values.length === 1) return { [field]: values[0] };
  return { [field]: { in: values } };
}

function validFunds(funds: string[]) {
  return funds.filter((item): item is FundType => item in FundType);
}

function fundWhereSimple(funds: string[]) {
  const valid = validFunds(funds);
  return prismaIn('fund', valid);
}

function fundWhereTransfer(funds: string[]) {
  const valid = validFunds(funds);
  if (!valid.length) return {};
  if (valid.length === 1) {
    const fund = valid[0] as FundType;
    return { OR: [{ fromFund: fund }, { toFund: fund }] };
  }
  return {
    OR: valid.flatMap((fund) => [{ fromFund: fund as FundType }, { toFund: fund as FundType }]),
  };
}

function statusWhere(status?: string) {
  const items = splitCsv(status);
  if (!items.length || items.includes('ALL')) {
    return { status: { not: TransactionStatus.DELETED } };
  }
  const mapped = new Set<TransactionStatus>();
  for (const item of items) {
    if (item === 'LIVE') {
      mapped.add(TransactionStatus.COMPLETED);
      mapped.add(TransactionStatus.PENDING_APPROVAL);
    } else if (item === 'COMPLETED') {
      mapped.add(TransactionStatus.COMPLETED);
    } else if (item === 'PENDING_APPROVAL') {
      mapped.add(TransactionStatus.PENDING_APPROVAL);
    }
  }
  if (!mapped.size) {
    return { status: { in: [TransactionStatus.COMPLETED, TransactionStatus.PENDING_APPROVAL] } };
  }
  const list = Array.from(mapped);
  if (list.length === 1) return { status: list[0] };
  return { status: { in: list } };
}

function dayBound(iso: string, end: boolean) {
  const [year, month, day] = iso.split('-').map(Number);
  return end ? new Date(year, month - 1, day, 23, 59, 59, 999) : new Date(year, month - 1, day, 0, 0, 0, 0);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function isoDay(value: Date) {
  return isoDate(new Date(value));
}

function num(value: Prisma.Decimal | number | string | null | undefined) {
  return Number(value ?? 0);
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

function sumBy<T>(rows: T[], fn: (row: T) => number) {
  return round(rows.reduce((sum, row) => sum + fn(row), 0));
}

function groupSum<T>(rows: T[], keyFn: (row: T) => string, valFn: (row: T) => number) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row) || '—';
    map.set(key, round((map.get(key) || 0) + valFn(row)));
  }
  const labels = [...map.keys()];
  return { labels, values: labels.map((key) => map.get(key) || 0) };
}

function dailyKeys(days: string[]) {
  return [...new Set(days.filter(Boolean))].sort();
}

function running(values: number[]) {
  let acc = 0;
  return values.map((value) => {
    acc = round(acc + value);
    return acc;
  });
}

function netUsdOnDay(bundle: OpsBundle, day: string) {
  const income = sumBy(bundle.incomes, (r) =>
    isoDay(r.transactionDate) === day && r.currency === Currency.USD ? num(r.total) : 0,
  );
  const outcome = sumBy(bundle.outcomes, (r) =>
    isoDay(r.transactionDate) === day && r.currency === Currency.USD ? num(r.total) : 0,
  );
  return round(income - outcome);
}

function clip<T>(rows: T[]) {
  if (rows.length <= TABLE_LIMIT) return { shown: rows, truncated: false };
  return { shown: rows.slice(0, TABLE_LIMIT), truncated: true };
}

function fundName(fund: FundType | string, bank?: string | null) {
  if (fund === 'BANK') return bank ? `بنك — ${bank}` : 'البنك';
  return FUND_LABEL[fund] || fund;
}

function statusLabel(status: TransactionStatus | string) {
  if (status === 'COMPLETED') return 'مكتملة';
  if (status === 'PENDING_APPROVAL') return 'بانتظار الموافقة';
  if (status === 'DELETED') return 'محذوفة';
  return String(status);
}

function kpi(
  id: string,
  label: string,
  value: number,
  format: Kpi['format'],
  currency?: Currency,
  tone?: Kpi['tone'],
): Kpi {
  return { id, label, value: round(value), format, currency, tone };
}

function chart(
  id: string,
  title: string,
  type: ChartType,
  labels: string[],
  series: { name: string; values: number[] }[],
  unit?: string,
): Chart {
  return { id, title, type, labels, series, unit };
}

function col(key: string, label: string, format?: Column['format']): Column {
  return { key, label, format };
}
