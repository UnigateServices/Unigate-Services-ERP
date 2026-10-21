import { AccountType } from '@prisma/client';

export type StatementKind = 'PROFIT_LOSS' | 'BALANCE_SHEET';

export type StatementLineDef = {
  code: string;
  name: string;
  statement: StatementKind;
  section: 'INCOME' | 'EXPENSE' | 'ASSET' | 'LIABILITY' | 'EQUITY';
  sort: number;
};

/** IFRS-style presentation. Industry modules post to accounts; this map is the report. */
export const STATEMENT_LINES: StatementLineDef[] = [
  { code: 'SALES', name: 'المبيعات', statement: 'PROFIT_LOSS', section: 'INCOME', sort: 10 },
  { code: 'FX_GAIN', name: 'أرباح التصريف', statement: 'PROFIT_LOSS', section: 'INCOME', sort: 20 },
  { code: 'FX_TRANSLATION_GAIN', name: 'أرباح الترجمة', statement: 'PROFIT_LOSS', section: 'INCOME', sort: 25 },
  { code: 'OTHER_INCOME', name: 'إيرادات أخرى', statement: 'PROFIT_LOSS', section: 'INCOME', sort: 30 },
  { code: 'PURCHASES', name: 'المشتريات', statement: 'PROFIT_LOSS', section: 'EXPENSE', sort: 35 },
  { code: 'COGS', name: 'تكلفة المبيعات', statement: 'PROFIT_LOSS', section: 'EXPENSE', sort: 40 },
  { code: 'OPEX', name: 'مصروفات تشغيل', statement: 'PROFIT_LOSS', section: 'EXPENSE', sort: 50 },
  { code: 'FX_LOSS', name: 'خسائر التصريف', statement: 'PROFIT_LOSS', section: 'EXPENSE', sort: 60 },
  { code: 'FX_TRANSLATION_LOSS', name: 'خسائر الترجمة', statement: 'PROFIT_LOSS', section: 'EXPENSE', sort: 65 },
  { code: 'OTHER_EXPENSE', name: 'مصروفات أخرى', statement: 'PROFIT_LOSS', section: 'EXPENSE', sort: 70 },
  { code: 'CASH', name: 'النقد وما في حكمه', statement: 'BALANCE_SHEET', section: 'ASSET', sort: 10 },
  { code: 'FX_POSITION', name: 'مركز عملات أجنبية', statement: 'BALANCE_SHEET', section: 'ASSET', sort: 15 },
  { code: 'RECEIVABLES', name: 'ذمم الزبائن', statement: 'BALANCE_SHEET', section: 'ASSET', sort: 20 },
  { code: 'ALLOWANCE', name: 'مخصص الديون', statement: 'BALANCE_SHEET', section: 'ASSET', sort: 21 },
  { code: 'SUPPLIER_ADVANCES', name: 'سلف الموردين', statement: 'BALANCE_SHEET', section: 'ASSET', sort: 22 },
  { code: 'ADVANCES', name: 'عهد وسلف المستلفين', statement: 'BALANCE_SHEET', section: 'ASSET', sort: 30 },
  { code: 'INVENTORY', name: 'المخزون', statement: 'BALANCE_SHEET', section: 'ASSET', sort: 40 },
  { code: 'OTHER_ASSETS', name: 'أصول أخرى', statement: 'BALANCE_SHEET', section: 'ASSET', sort: 50 },
  { code: 'FX_CLEARING', name: 'وسيط تقييم العملات', statement: 'BALANCE_SHEET', section: 'LIABILITY', sort: 55 },
  { code: 'PAYABLES', name: 'ذمم الموردين', statement: 'BALANCE_SHEET', section: 'LIABILITY', sort: 60 },
  { code: 'CUSTOMER_ADVANCES', name: 'سلف الزبائن', statement: 'BALANCE_SHEET', section: 'LIABILITY', sort: 62 },
  { code: 'OTHER_LIABILITIES', name: 'التزامات أخرى', statement: 'BALANCE_SHEET', section: 'LIABILITY', sort: 70 },
  { code: 'CAPITAL', name: 'رأس المال', statement: 'BALANCE_SHEET', section: 'EQUITY', sort: 80 },
  { code: 'OPENING_EQUITY', name: 'أرصدة افتتاحية', statement: 'BALANCE_SHEET', section: 'EQUITY', sort: 85 },
  { code: 'RETAINED', name: 'أرباح محتجزة', statement: 'BALANCE_SHEET', section: 'EQUITY', sort: 90 },
  { code: 'OTHER_EQUITY', name: 'حقوق ملكية أخرى', statement: 'BALANCE_SHEET', section: 'EQUITY', sort: 100 },
];

const BY_CODE = new Map(STATEMENT_LINES.map((line) => [line.code, line]));

export function statementLineForType(code: string, type: AccountType) {
  const line = BY_CODE.get(code);
  if (!line) return null;
  const expected =
    line.section === 'INCOME'
      ? AccountType.INCOME
      : line.section === 'EXPENSE'
        ? AccountType.EXPENSE
        : line.section === 'ASSET'
          ? AccountType.ASSET
          : line.section === 'LIABILITY'
            ? AccountType.LIABILITY
            : AccountType.EQUITY;
  return expected === type ? line : null;
}

export function statementLineOf(code: string, type: AccountType): StatementLineDef {
  const known = BY_CODE.get(code);
  if (known) return known;
  const fallback =
    type === AccountType.ASSET
      ? 'OTHER_ASSETS'
      : type === AccountType.LIABILITY
        ? 'OTHER_LIABILITIES'
        : type === AccountType.EQUITY
          ? 'OTHER_EQUITY'
          : type === AccountType.INCOME
            ? 'OTHER_INCOME'
            : 'OTHER_EXPENSE';
  return BY_CODE.get(fallback)!;
}
