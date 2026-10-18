import type { WorkspaceGroup } from '../components/workspace-shell';
import type { Role } from './api';

export type ModuleId = 'treasury' | 'trade' | 'inventory' | 'accounting' | 'control' | 'settings';

type Screen = {
  id: string;
  label: string;
  roles?: Role[];
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

const MODULES: ModuleDef[] = [
  {
    id: 'treasury',
    title: 'الخزينة',
    description: 'حركة الصندوق اليومية وسجلاتها',
    icon: 'ops',
    roles: CASH,
    groups: [
      {
        title: 'عمليات',
        icon: 'ops',
        items: [
          { id: 'income', label: 'وارد' },
          { id: 'outcome', label: 'صادر' },
          { id: 'exchange', label: 'تصريف' },
          { id: 'transfer', label: 'تحويل' },
          { id: 'advances', label: 'سلف' },
          { id: 'opening', label: 'رصيد افتتاحي', roles: OPENING },
        ],
      },
      {
        title: 'السجلات',
        icon: 'records',
        items: [
          { id: 'log-income', label: 'وارد' },
          { id: 'log-outcome', label: 'صادر' },
          { id: 'log-exchange', label: 'تصريف' },
          { id: 'log-transfer', label: 'تحويل' },
          { id: 'log-advances', label: 'سلف' },
          { id: 'log-opening', label: 'رصيد افتتاحي', roles: OPENING },
        ],
      },
    ],
  },
  {
    id: 'trade',
    title: 'التجارة',
    description: 'فواتير البيع وفواتير الشراء',
    icon: 'sales',
    roles: EVERYONE,
    groups: [
      {
        title: 'التجارة',
        icon: 'sales',
        items: [
          { id: 'sales', label: 'فواتير البيع' },
          { id: 'purchases', label: 'فواتير الشراء' },
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
    description: 'دفتر القيود والقوائم والتقارير',
    icon: 'ledger',
    roles: BOOKS,
    groups: [
      {
        title: 'المحاسبة',
        icon: 'ledger',
        items: [
          { id: 'ledger', label: 'دفتر القيود' },
          { id: 'statements', label: 'القوائم المالية' },
          { id: 'reports', label: 'التقارير' },
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
        .map(({ id, label }) => ({ id, label })),
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

export function moduleFromHash(role: Role): ModuleId | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace('#', '');
  if (!raw || raw === 'home' || raw === 'notifications') return null;
  const [head, rest] = raw.split('/');
  const visible = modulesForRole(role);
  if (visible.some((module) => module.id === head)) return head as ModuleId;
  const section = rest || head;
  const owner = visible.find((module) =>
    module.groups.some((group) => group.items.some((item) => item.id === section)),
  );
  return owner?.id ?? null;
}
