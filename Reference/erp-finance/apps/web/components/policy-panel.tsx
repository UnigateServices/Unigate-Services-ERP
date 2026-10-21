'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AccountingPolicy,
  CompanyCurrencyRow,
  DailyRateHistoryRow,
  DailyRateRow,
  getAccountingPolicy,
  listCurrencies,
  listDailyRateHistory,
  listDailyRates,
  saveDailyRate,
  setCurrencyActive,
  setFunctionalCurrency,
  setInventoryMethod,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Column, DataTable } from './ui/data-table';
import { Field, Input } from './ui/field';
import { FilterPills, PageToolbar } from './ui/page-toolbar';
import { Select } from './ui/select';
import { Modal } from './ui/modal';
import { useToasts } from './ui/toasts';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatRate(value: number | null | undefined) {
  if (value == null) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

type Tab = 'rates' | 'currencies' | 'policy';

export function PolicyPanel({ canEdit, canRates }: { canEdit: boolean; canRates: boolean }) {
  const { push, node: toasts } = useToasts();
  const [tab, setTab] = useState<Tab>('rates');
  const [policy, setPolicy] = useState<AccountingPolicy | null>(null);
  const [currencies, setCurrencies] = useState<CompanyCurrencyRow[]>([]);
  const [date, setDate] = useState(today());
  const [rates, setRates] = useState<DailyRateRow[]>([]);
  const [history, setHistory] = useState<DailyRateHistoryRow[]>([]);
  const [query, setQuery] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [rateDrawer, setRateDrawer] = useState(false);
  const [modalCode, setModalCode] = useState('');
  const [modalDate, setModalDate] = useState(today());
  const [modalRate, setModalRate] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const [nextPolicy, nextCurrencies, nextRates, nextHistory] = await Promise.all([
      getAccountingPolicy(),
      listCurrencies(),
      listDailyRates(date),
      listDailyRateHistory(),
    ]);
    setPolicy(nextPolicy);
    setCurrencies(nextCurrencies);
    setRates(nextRates.rows);
    setHistory(nextHistory);
  }

  useEffect(() => {
    load().catch((error) => push(masterErrorMessage(error), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      await load();
      push(ok, 'ok');
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

  function openRateModal(row?: DailyRateRow) {
    const fallbackCode = row?.code || rates[0]?.code || currencies.find((c) => c.active && !c.base)?.code || 'SYP';
    setModalCode(fallbackCode);
    setModalDate(date);
    setModalRate(row?.rate != null ? String(row.rate) : '');
    setRateDrawer(true);
  }

  async function submitRate(event: FormEvent) {
    event.preventDefault();
    const numeric = Number(modalRate);
    if (!modalCode || !(numeric > 0)) {
      push('أدخل سعر صرف أكبر من صفر.', 'err');
      return;
    }
    setSaving(true);
    try {
      await saveDailyRate(modalCode, modalDate, numeric);
      setRateDrawer(false);
      await load();
      push(`تم حفظ سعر الصرف لعملة ${modalCode} بتاريخ ${modalDate}.`, 'ok');
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  const locked = Boolean(policy?.functionalLocked || policy?.openingLocked);
  const inventoryLocked = Boolean(policy?.inventoryLocked);

  const activeForeignOptions = useMemo(
    () =>
      currencies
        .filter((row) => row.active && !row.base)
        .map((row) => ({ value: row.code, label: `${row.name} (${row.code})` })),
    [currencies],
  );

  const visibleRates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rates;
    return rates.filter((row) => `${row.code} ${row.name} ${row.label}`.toLowerCase().includes(needle));
  }, [rates, query]);

  const visibleHistory = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return history;
    return history.filter((row) => `${row.code} ${row.date} ${row.rate}`.toLowerCase().includes(needle));
  }, [history, query]);

  const visibleCurrencies = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return currencies.filter((row) => {
      if (currencyFilter === 'ACTIVE' && !row.active) return false;
      if (currencyFilter === 'INACTIVE' && row.active) return false;
      if (!needle) return true;
      return `${row.code} ${row.name}`.toLowerCase().includes(needle);
    });
  }, [currencies, query, currencyFilter]);

  const rateColumns: Column<DailyRateRow>[] = [
    { key: 'code', header: 'الرمز', render: (row) => <strong>{row.code}</strong> },
    { key: 'name', header: 'العملة', render: (row) => row.name },
    { key: 'label', header: 'أساس التسعير', render: (row) => row.label },
    {
      key: 'rate',
      header: 'السعر المعتمد (≤ التاريخ)',
      numeric: true,
      render: (row) => (row.rate != null ? <strong>{formatRate(row.rate)}</strong> : <Badge tone="warn">غير مسجل</Badge>),
    },
    {
      key: 'effectiveDate',
      header: 'تاريخ السعر الساري',
      render: (row) =>
        row.effectiveDate ? (
          <span>
            {row.effectiveDate}{' '}
            {row.isExactDate ? <Badge tone="ok">سعر اليوم</Badge> : <Badge tone="info">آخر سعر مسجل</Badge>}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        canRates ? (
          <Button variant="mini" onClick={() => openRateModal(row)}>
            تحديث السعر
          </Button>
        ) : null,
    },
  ];

  const historyColumns: Column<DailyRateHistoryRow>[] = [
    { key: 'date', header: 'التاريخ', render: (row) => row.date },
    { key: 'code', header: 'العملة', render: (row) => <strong>{row.code}</strong> },
    { key: 'rate', header: 'السعر المسجل', numeric: true, render: (row) => formatRate(row.rate) },
    { key: 'label', header: 'الوصف', render: (row) => row.label },
    {
      key: 'edit',
      header: '',
      render: (row) =>
        canRates ? (
          <Button
            variant="mini"
            onClick={() => {
              setModalCode(row.code);
              setModalDate(row.date);
              setModalRate(String(row.rate));
              setRateDrawer(true);
            }}
          >
            تعديل
          </Button>
        ) : null,
    },
  ];

  const currencyColumns: Column<CompanyCurrencyRow>[] = [
    { key: 'code', header: 'الرمز', render: (row) => <strong>{row.code}</strong> },
    {
      key: 'name',
      header: 'الاسم',
      render: (row) => (
        <span>
          {row.name} {row.base ? <Badge tone="info">أساسية</Badge> : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (row) => <Badge tone={row.active ? 'ok' : 'neutral'}>{row.active ? 'مفعّلة' : 'موقوفة'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button
          variant="mini"
          disabled={!canEdit || row.base}
          onClick={() =>
            void run(() => setCurrencyActive(row.code, !row.active), row.active ? 'أُوقفت العملة.' : 'فُعّلت العملة.')
          }
        >
          {row.active ? 'إيقاف' : 'تفعيل'}
        </Button>
      ),
    },
  ];

  return (
    <div className="ui-page">
      {toasts}
      <PageToolbar
        search={query}
        onSearch={setQuery}
        searchPlaceholder="بحث بالعملة أو التاريخ..."
        filters={
          <FilterPills
            value={tab}
            onChange={setTab}
            options={[
              ['rates', 'أسعار الصرف اليومية'],
              ['currencies', 'كتالوج العملات'],
              ['policy', 'السياسة المحاسبية'],
            ]}
          />
        }
        actions={
          tab === 'rates' ? (
            <>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="تاريخ التسعير" />
              {canRates ? (
                <Button variant="primary" onClick={() => openRateModal()}>
                  + تسجيل سعر يومي
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      {tab === 'rates' ? (
        <>
          <Card
            title="أسعار الصرف السارية"
            chip={`التاريخ المرجعي: ${date} · العملة الأساسية: ${policy?.functionalCurrency || 'USD'}`}
          >
            <p className="ui-note">
              يعتمد النظام جدول أسعار الصرف اليومية كمصدر وحيد لسعر الصرف في جميع المستندات والعمليات، حيث يُجلب آخر سعر مسجل في أو قبل تاريخ المستند تلقائياً.
            </p>
            <DataTable
              columns={rateColumns}
              rows={visibleRates}
              rowKey={(row) => row.code}
              empty="لا توجد عملات أجنبية مفعّلة. فعّل عملة من تبويب كتالوج العملات."
            />
          </Card>

          <Card title="سجل أسعار الصرف اليومية" chip="أحدث الأسعار المسجلة">
            <DataTable
              columns={historyColumns}
              rows={visibleHistory}
              rowKey={(row) => row.id}
              empty="لم يُسجّل أي سعر صرف يومي بعد."
            />
          </Card>
        </>
      ) : null}

      {tab === 'currencies' ? (
        <Card
          title="كتالوج العملات"
          chip="التفعيل لما يُستخدم"
          toolbar={
            <FilterPills
              value={currencyFilter}
              onChange={setCurrencyFilter}
              options={[
                ['ALL', 'الكل'],
                ['ACTIVE', 'المفعّلة'],
                ['INACTIVE', 'الموقوفة'],
              ]}
            />
          }
        >
          <DataTable
            columns={currencyColumns}
            rows={visibleCurrencies}
            rowKey={(row) => row.code}
            empty="لا توجد عملات مطابقة للبحث."
          />
        </Card>
      ) : null}

      {tab === 'policy' ? (
        <Card title="العملة الأساسية والجرد" chip="يُقفل مع الافتتاح وأول حركة مخزنية">
          <div className="ui-toolbar">
            <Button
              variant="choice"
              className={policy?.functionalCurrency === 'USD' ? 'is-on' : ''}
              disabled={!canEdit || !policy || locked}
              onClick={() => void run(() => setFunctionalCurrency('USD'), 'العملة الأساسية: الدولار.')}
            >
              دولار — أساسية
            </Button>
            <Button
              variant="choice"
              className={policy?.functionalCurrency === 'SYP' ? 'is-on' : ''}
              disabled={!canEdit || !policy || locked}
              onClick={() => void run(() => setFunctionalCurrency('SYP'), 'العملة الأساسية: الليرة.')}
            >
              ليرة — أساسية
            </Button>
            <Button
              variant="choice"
              className={policy?.inventoryMethod === 'PERPETUAL' || policy?.inventoryMethod === 'WAC' ? 'is-on' : ''}
              disabled={!canEdit || !policy || inventoryLocked}
              onClick={() => void run(() => setInventoryMethod('PERPETUAL'), 'الجرد المستمر بمتوسط التكلفة المرجح.')}
            >
              جرد مستمر
            </Button>
            <Button
              variant="choice"
              className={policy?.inventoryMethod === 'PERIODIC' ? 'is-on' : ''}
              disabled={!canEdit || !policy || inventoryLocked}
              onClick={() => void run(() => setInventoryMethod('PERIODIC'), 'الجرد الدوري: المشتريات لا تحرّك حساب المخزون.')}
            >
              جرد دوري
            </Button>
          </div>
          <p className="ui-note">
            {locked ? 'العملة الأساسية مقفلة بعد اعتماد الافتتاح.' : 'يمكن تغيير العملة الأساسية قبل اعتماد القيد الافتتاحي.'}
            {inventoryLocked ? ' أسلوب الجرد مقفل بعد أول عملية مخزنية.' : ' أسلوب الجرد يُقفل عند أول عملية مخزنية.'}
          </p>
        </Card>
      ) : null}

      {rateDrawer ? (
        <Modal
          title="تسجيل / تحديث سعر الصرف اليومي"
          onClose={() => setRateDrawer(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRateDrawer(false)}>
                إلغاء
              </Button>
              <Button variant="primary" type="submit" form="daily-rate-form" disabled={saving || !modalCode || !(Number(modalRate) > 0)}>
                {saving ? 'جارٍ الحفظ...' : 'حفظ السعر'}
              </Button>
            </>
          }
        >
          <form id="daily-rate-form" className="ui-form-grid" style={{ gridTemplateColumns: '1fr' }} onSubmit={submitRate}>
            <Field label="العملة">
              <Select
                value={modalCode}
                onChange={setModalCode}
                options={activeForeignOptions}
                placeholder="اختر العملة"
              />
            </Field>
            <Field label="التاريخ">
              <Input type="date" required value={modalDate} onChange={(event) => setModalDate(event.target.value)} />
            </Field>
            <Field
              label="سعر الصرف"
              hint={modalCode === 'SYP' || policy?.functionalCurrency === 'SYP' ? 'عدد الليرات السورية مقابل دولار واحد' : 'عدد الوحدات مقابل وحدة العملة الأساسية'}
            >
              <Input
                required
                inputMode="decimal"
                placeholder="مثال: 14500"
                value={modalRate}
                onChange={(event) => setModalRate(event.target.value)}
              />
            </Field>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
