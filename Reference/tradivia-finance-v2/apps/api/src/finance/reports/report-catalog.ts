import { Role } from '@prisma/client';
import { ReportId } from './dto/run-report.dto';

export type ReportFilterKey =
  | 'period'
  | 'employee'
  | 'currency'
  | 'fund'
  | 'project'
  | 'borrower'
  | 'status'
  | 'exchangeType'
  | 'advanceType';

export type ReportDef = {
  id: ReportId;
  group: 'ops' | 'treasury' | 'control';
  title: string;
  description: string;
  filters: ReportFilterKey[];
  landscape?: boolean;
  minRole?: Role;
};

export const REPORT_GROUPS: { id: ReportDef['group']; title: string }[] = [
  { id: 'ops', title: 'عمليات' },
  { id: 'treasury', title: 'خزائن' },
  { id: 'control', title: 'رقابة' },
];

const ALL: ReportDef[] = [
  {
    id: 'overview',
    group: 'ops',
    title: 'ملخص تشغيلي',
    description: 'حجم العمليات، المزيج، والصافي التشغيلي حسب العملة — ليس أرباحاً محاسبية.',
    filters: ['period', 'employee', 'currency', 'status'],
  },
  {
    id: 'income',
    group: 'ops',
    title: 'الوارد',
    description: 'تفاصيل الوارد حسب المشروع والصندوق والعملة.',
    filters: ['period', 'employee', 'project', 'fund', 'currency', 'status'],
    landscape: true,
  },
  {
    id: 'outcome',
    group: 'ops',
    title: 'الصادر',
    description: 'تفاصيل الصادر حسب المشروع والصندوق والعملة.',
    filters: ['period', 'employee', 'project', 'fund', 'currency', 'status'],
    landscape: true,
  },
  {
    id: 'exchange',
    group: 'ops',
    title: 'التصريف',
    description: 'شراء وبيع العملة مع الأحجام والأسعار.',
    filters: ['period', 'employee', 'fund', 'exchangeType', 'status'],
    landscape: true,
  },
  {
    id: 'transfer',
    group: 'ops',
    title: 'التحويل',
    description: 'تحويلات بين الصناديق والبنوك والسلف. التحويل الداخلي لا يُحتسب ربحاً.',
    filters: ['period', 'employee', 'fund', 'currency', 'borrower', 'status'],
    landscape: true,
  },
  {
    id: 'advances',
    group: 'ops',
    title: 'السلف',
    description: 'صادر المستلف وتصريف داخل رصيد السلفة.',
    filters: ['period', 'employee', 'borrower', 'advanceType', 'project', 'currency', 'status'],
    landscape: true,
  },
  {
    id: 'funds',
    group: 'treasury',
    title: 'حركة وأرصدة الصناديق',
    description: 'الأرصدة الحالية وحركة الفترة لكل صندوق وعملة.',
    filters: ['period', 'employee', 'fund', 'currency', 'status'],
  },
  {
    id: 'borrower',
    group: 'ops',
    title: 'كشف المستلف',
    description: 'حركة كل مستلف في السلف والتحويلات المرتبطة به.',
    filters: ['period', 'employee', 'borrower', 'currency', 'status'],
    landscape: true,
  },
  {
    id: 'staff',
    group: 'control',
    title: 'مقارنة الموظفين',
    description: 'عدد العمليات والأحجام حسب الموظف ضمن نطاق مكتبك.',
    filters: ['period', 'currency', 'status'],
    minRole: Role.SUPERVISOR,
  },
];

export function catalogForRole(role: Role): ReportDef[] {
  return ALL.filter((item) => {
    if (!item.minRole) return true;
    if (role === Role.MONITOR || role === Role.GENERAL_MANAGER) return true;
    if (item.minRole === Role.SUPERVISOR) return role === Role.SUPERVISOR;
    return false;
  }).map((item) => {
    if (role === Role.EMPLOYEE) {
      return { ...item, filters: item.filters.filter((key) => key !== 'employee') };
    }
    return item;
  });
}
