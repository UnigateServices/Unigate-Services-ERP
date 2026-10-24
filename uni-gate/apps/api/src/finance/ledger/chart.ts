import { AccountType } from '@prisma/client';

/** Control account of the borrower custody sub-ledger (OpenItem kind CUSTODY). */
export const CUSTODY_ACCOUNT = '1300';
/** Trade payables control account. A borrower who paid out of pocket is owed through it. */
export const PAYABLES_ACCOUNT = '2100';
/** Realized foreign-exchange differences on monetary settlement (separate from unrealized FxRevaluation). */
export const FX_GAIN_LOSS = '4220';
export const FX_REALIZED_GAIN = '4200';
export const FX_REALIZED_LOSS = '5300';
export const FX_UNREALIZED_GAIN = '4210';
export const FX_UNREALIZED_LOSS = '5310';

export const SYSTEM_CHART: { code: string; name: string; type: AccountType; statementLine: string }[] = [
  { code: '1110', name: 'الخزنة', type: AccountType.ASSET, statementLine: 'CASH' },
  { code: '1120', name: 'شام كاش', type: AccountType.ASSET, statementLine: 'CASH' },
  { code: '1130', name: 'البنوك', type: AccountType.ASSET, statementLine: 'CASH' },
  { code: '1150', name: 'مركز عملات أجنبية', type: AccountType.ASSET, statementLine: 'FX_POSITION' },
  { code: '1160', name: 'وسيط تقييم العملات', type: AccountType.LIABILITY, statementLine: 'FX_CLEARING' },
  { code: '1200', name: 'ذمم الزبائن', type: AccountType.ASSET, statementLine: 'RECEIVABLES' },
  { code: '1210', name: 'مخصص الديون', type: AccountType.ASSET, statementLine: 'ALLOWANCE' },
  { code: '1250', name: 'سلف الموردين', type: AccountType.ASSET, statementLine: 'SUPPLIER_ADVANCES' },
  { code: '1300', name: 'عهد وسلف المستلفين', type: AccountType.ASSET, statementLine: 'ADVANCES' },
  { code: '1400', name: 'المخزون', type: AccountType.ASSET, statementLine: 'INVENTORY' },
  { code: '1410', name: 'مخصص هبوط المخزون', type: AccountType.ASSET, statementLine: 'INVENTORY' },
  { code: '2100', name: 'ذمم الموردين', type: AccountType.LIABILITY, statementLine: 'PAYABLES' },
  { code: '2150', name: 'سلف الزبائن', type: AccountType.LIABILITY, statementLine: 'CUSTOMER_ADVANCES' },
  { code: '3100', name: 'رأس المال', type: AccountType.EQUITY, statementLine: 'CAPITAL' },
  { code: '3200', name: 'أرباح محتجزة', type: AccountType.EQUITY, statementLine: 'RETAINED' },
  { code: '3300', name: 'أرصدة افتتاحية', type: AccountType.EQUITY, statementLine: 'OPENING_EQUITY' },
  { code: '4100', name: 'المبيعات', type: AccountType.INCOME, statementLine: 'SALES' },
  { code: '4200', name: 'أرباح التصريف', type: AccountType.INCOME, statementLine: 'FX_GAIN' },
  { code: '4210', name: 'أرباح الترجمة', type: AccountType.INCOME, statementLine: 'FX_TRANSLATION_GAIN' },
  { code: '4220', name: 'فروقات الصرف المحققة', type: AccountType.INCOME, statementLine: 'FX_GAIN' },
  { code: '4900', name: 'إيرادات أخرى', type: AccountType.INCOME, statementLine: 'OTHER_INCOME' },
  { code: '4910', name: 'فائض المخزون', type: AccountType.INCOME, statementLine: 'OTHER_INCOME' },
  { code: '5000', name: 'المشتريات', type: AccountType.EXPENSE, statementLine: 'PURCHASES' },
  { code: '5100', name: 'تكلفة المبيعات', type: AccountType.EXPENSE, statementLine: 'COGS' },
  { code: '5400', name: 'هبوط قيمة المخزون', type: AccountType.EXPENSE, statementLine: 'COGS' },
  { code: '5410', name: 'عجز المخزون', type: AccountType.EXPENSE, statementLine: 'COGS' },
  { code: '5200', name: 'مصروفات تشغيل', type: AccountType.EXPENSE, statementLine: 'OPEX' },
  { code: '5300', name: 'خسائر التصريف', type: AccountType.EXPENSE, statementLine: 'FX_LOSS' },
  { code: '5310', name: 'خسائر الترجمة', type: AccountType.EXPENSE, statementLine: 'FX_TRANSLATION_LOSS' },
];

export function defaultStatementLine(type: AccountType) {
  if (type === AccountType.ASSET) return 'OTHER_ASSETS';
  if (type === AccountType.LIABILITY) return 'OTHER_LIABILITIES';
  if (type === AccountType.EQUITY) return 'OTHER_EQUITY';
  if (type === AccountType.INCOME) return 'OTHER_INCOME';
  return 'OTHER_EXPENSE';
}
