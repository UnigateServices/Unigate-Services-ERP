import type { WorkspaceGroup } from '../components/workspace-shell';
import type { Role } from './api';

export type ModuleId = 'dashboard' | 'treasury' | 'crm' | 'sales' | 'purchases' | 'inventory' | 'accounting' | 'control' | 'settings';

type Screen = {
  id: string;
  label: string;
  roles?: Role[];
  hidden?: boolean;
  menu?: { id: string; label: string; roles?: Role[] }[];
};

type ModuleDef = {
  id: ModuleId;
  title: string;
  description: string;
  icon: string;
  roles: Role[];
  groups: { title: string; icon?: string; items: Screen[] }[];
};

const CASH: Role[] = ['GENERAL_MANAGER', 'SUPERVISOR', 'EMPLOYEE'];
const OPENING: Role[] = ['GENERAL_MANAGER', 'SUPERVISOR'];
const BOOKS: Role[] = ['GENERAL_MANAGER', 'SUPERVISOR', 'MONITOR'];
const CONTROL: Role[] = ['GENERAL_MANAGER', 'MONITOR'];
const SETTINGS: Role[] = ['GENERAL_MANAGER', 'SUPERVISOR'];
const EVERYONE: Role[] = ['GENERAL_MANAGER', 'SUPERVISOR', 'EMPLOYEE', 'MONITOR'];
const VALUATION: Role[] = ['GENERAL_MANAGER', 'SUPERVISOR', 'MONITOR'];

const FUNDS_BAR_HIDDEN = new Set<ModuleId>(['dashboard', 'treasury', 'inventory', 'accounting', 'settings']);

const MODULES: ModuleDef[] = [
  {
    id: 'dashboard',
    title: 'لوحة القيادة',
    description: 'السيولة والذمم والمؤشرات التشغيلية',
    icon: 'dashboard',
    roles: ['GENERAL_MANAGER'],
    groups: [{ title: 'لوحة القيادة', icon: 'dashboard', items: [{ id: 'dashboard', label: 'لوحة القيادة التنفيذية' }] }],
  },
  {
    id: 'treasury',
    title: 'إدارة النقدية والبنوك',
    description: 'أرصدة الصناديق والبنوك وحركة النقدية',
    icon: 'wallet',
    roles: CASH,
    groups: [
      {
        title: 'النقدية والبنوك',
        icon: 'wallet',
        items: [
          { id: 'cash', label: 'لوحة النقدية' },
          { id: 'custody', label: 'العهد والسلف' },
          { id: 'cash-report', label: 'كشف حركة النقدية' },
          { id: 'income', label: 'تسجيل وارد', hidden: true },
          { id: 'outcome', label: 'تسجيل صادر', hidden: true },
          { id: 'exchange', label: 'تسجيل تصريف', hidden: true },
          { id: 'transfer', label: 'تسجيل تحويل', hidden: true },
          { id: 'advances', label: 'تسجيل سلفة', hidden: true },
        ],
      },
    ],
  },
  {
    id: 'crm',
    title: 'إدارة علاقات العملاء',
    description: 'المحتملون ومسار الصفقات وعروض الأسعار',
    icon: 'crm',
    roles: EVERYONE,
    groups: [
      {
        title: 'علاقات العملاء',
        icon: 'crm',
        items: [
          { id: 'leads', label: 'المحتملون' },
          { id: 'pipeline', label: 'مسار الصفقات' },
          { id: 'quotes', label: 'عروض الأسعار' },
        ],
      },
    ],
  },
  {
    id: 'sales',
    title: 'المبيعات',
    description: 'الزبائن والفواتير',
    icon: 'sales',
    roles: EVERYONE,
    groups: [
      {
        title: 'المبيعات',
        icon: 'sales',
        items: [
          { id: 'sales', label: 'الفواتير' },
          { id: 'customers', label: 'الزبائن' },
        ],
      },
    ],
  },
  {
    id: 'purchases',
    title: 'المشتريات',
    description: 'الموردون وفواتير الشراء',
    icon: 'purchases',
    roles: EVERYONE,
    groups: [
      {
        title: 'المشتريات',
        icon: 'purchases',
        items: [
          { id: 'purchases', label: 'الفواتير' },
          {
            id: 'suppliers',
            label: 'الموردون',
            menu: [
              { id: 'suppliers', label: 'عرض الموردون' },
              { id: 'supplier-new', label: 'إضافة مورد', roles: OPENING },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'inventory',
    title: 'المخزون',
    description: 'المستودع وتقييم صافي القيمة',
    icon: 'stock',
    roles: EVERYONE,
    groups: [
      {
        title: 'المخزون',
        icon: 'stock',
        items: [
          { id: 'warehouse', label: 'المستودع' },
          { id: 'nrv', label: 'صافي القيمة', roles: VALUATION },
        ],
      },
    ],
  },
  {
    id: 'accounting',
    title: 'المحاسبة',
    description: 'دفتر القيود والذمم والقوائم',
    icon: 'ledger',
    roles: BOOKS,
    groups: [
      {
        title: 'المحاسبة',
        icon: 'ledger',
        items: [
          { id: 'ledger', label: 'دفتر القيود اليومية' },
          { id: 'journal-new', label: 'قيد جديد', hidden: true, roles: OPENING },
          { id: 'chart', label: 'دليل الحسابات' },
          { id: 'open-items', label: 'الذمم والتحصيل' },
          { id: 'opening-entry', label: 'بداية الفترة' },
          { id: 'statements', label: 'مركز التقارير المالية' },
          { id: 'statement-balance', label: 'الميزانية', hidden: true },
          { id: 'statement-trial', label: 'ميزان المراجعة', hidden: true },
          { id: 'statement-cash', label: 'التدفقات', hidden: true },
          { id: 'statement-equity', label: 'حقوق الملكية', hidden: true },
          { id: 'statement-budget', label: 'ميزانية مقابل الفعلي', hidden: true },
          { id: 'statement-periods', label: 'الفترات', hidden: true },
          { id: 'statement-policy', label: 'السياسة', hidden: true },
        ],
      },
    ],
  },
  {
    id: 'control',
    title: 'الرقابة',
    description: 'متابعة الموظفين وسجل الإلغاء والتعديل',
    icon: 'follow',
    roles: CONTROL,
    groups: [
      {
        title: 'الرقابة',
        icon: 'follow',
        items: [
          { id: 'monitor', label: 'سجل عمليات الموظفين' },
          { id: 'audit-log', label: 'سجل الإلغاء والتعديل' },
        ],
      },
    ],
  },
  {
    id: 'settings',
    title: 'الإعدادات',
    description: 'المستخدمون والبيانات الأساسية',
    icon: 'admin',
    roles: SETTINGS,
    groups: [
      {
        title: 'الإعدادات',
        icon: 'admin',
        items: [
          { id: 'locations', label: 'المكاتب', roles: ['GENERAL_MANAGER'] },
          { id: 'people', label: 'المستخدمون' },
          { id: 'borrowers', label: 'المستلفون' },
          { id: 'projects', label: 'المشاريع' },
          { id: 'banks', label: 'البنوك' },
          { id: 'policy', label: 'السياسة والعملات', roles: ['GENERAL_MANAGER', 'SUPERVISOR'] },
        ],
      },
    ],
  },
];

function groupsOf(module: ModuleDef, role: Role): WorkspaceGroup[] {
  return module.groups
    .map((group) => ({
      title: group.title,
      icon: group.icon,
      items: group.items
        .filter((item) => !item.roles || item.roles.includes(role))
        .map(({ id, label, menu, hidden }) => ({
          id,
          label,
          hidden,
          menu: menu
            ?.filter((entry) => !entry.roles || entry.roles.includes(role))
            .map(({ id: entryId, label: entryLabel }) => ({ id: entryId, label: entryLabel })),
        })),
    }))
    .filter((group) => group.items.length > 0);
}

export type ModuleCard = {
  id: ModuleId;
  title: string;
  description: string;
  icon: string;
  groups: WorkspaceGroup[];
};

export function modulesForRole(role: Role): ModuleCard[] {
  return MODULES.filter((module) => module.roles.includes(role))
    .map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      icon: module.icon,
      groups: groupsOf(module, role),
    }))
    .filter((module) => module.groups.some((group) => group.items.length > 0));
}

export function groupsForModule(id: ModuleId, role: Role): WorkspaceGroup[] {
  return modulesForRole(role).find((module) => module.id === id)?.groups ?? [];
}

export function defaultSection(id: ModuleId, role: Role) {
  return groupsForModule(id, role)[0]?.items[0]?.id ?? '';
}

export function hidesFundsBar(moduleId: string) {
  return FUNDS_BAR_HIDDEN.has(moduleId as ModuleId);
}

const OPEN_ITEM_ALIASES = new Set([
  'accounting/open-item-new',
  'accounting/open-item-statement',
  'accounting/open-item-aging',
  'accounting/open-item-revalue',
]);

export function canonicalHash(raw: string) {
  if (raw === 'sales/relations' || raw === 'relations') return 'crm/quotes';
  if (raw === 'sales/sales-new') return 'sales/sales';
  if (raw === 'purchases/purchase-new') return 'purchases/purchases';
  if (OPEN_ITEM_ALIASES.has(raw)) return 'accounting/open-items';
  return raw;
}

export function moduleFromHash(role: Role): ModuleId | null {
  if (typeof window === 'undefined') return null;
  const raw = canonicalHash(window.location.hash.replace('#', ''));
  if (!raw || raw === 'home' || raw === 'notifications') return null;
  const [head, rest] = raw.split('/');
  const visible = modulesForRole(role);
  if (head === 'trade') return rest === 'purchases' ? 'purchases' : 'sales';
  if (visible.some((module) => module.id === head)) return head as ModuleId;
  const section = rest || head;
  const owner = visible.find((module) =>
    module.groups.some((group) => group.items.some((item) => item.id === section)),
  );
  return owner?.id ?? null;
}
