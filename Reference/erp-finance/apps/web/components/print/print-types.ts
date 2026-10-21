export type PrintMode = 'A4' | 'THERMAL';

export type PrintLine = { name: string; quantity?: string; unitPrice?: string; total: string };

export type PrintDoc = {
  /** عنوان المستند: فاتورة مبيعات، سند قبض... */
  title: string;
  number: string;
  date: string;
  currency: string;
  total: string;
  status?: string;
  /** الطرف المقابل (زبون / مورد / موظف) */
  partyLabel?: string;
  partyName?: string;
  lines?: PrintLine[];
  /** حقول إضافية (وصف / قيمة) */
  meta?: [string, string][];
  /** ملخص إجماليات إضافية قبل الإجمالي: المجموع، الخصم... */
  totals?: [string, string][];
  notes?: string;
  /** رقم القيد المحاسبي المرجعي */
  journalRef?: string;
  signatures?: string[];
  officeName?: string;
};
