'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AuthUser,
  OpeningPreview,
  ProductRow,
  WarehouseRow,
  getOpeningEntry,
  getProductCatalog,
  listWarehouses,
  postOpeningEntry,
  previewOpeningEntry,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { Button } from './ui/button';
import { Input } from './ui/field';
import { Select } from './ui/select';
import { useToasts } from './ui/toasts';
import './enterprise.css';

type Party = 'CUSTOMER' | 'SUPPLIER';
type Kind = 'RECEIVABLE' | 'PAYABLE' | 'ADVANCE_IN';
type Settlement = 'CASH' | 'GOODS';
type Currency = 'USD' | 'SYP';

type Item = {
  key: string;
  party: Party;
  name: string;
  kind: Kind;
  documentDate: string;
  amount: string;
  settlementMode: Settlement;
  memo: string;
};

type StockLine = {
  key: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  unitCost: string;
};

type CustodyLine = {
  key: string;
  borrowerName: string;
  currency: Currency;
  amount: string;
};

type CashLine = {
  key: string;
  code: '1110' | '1120' | '1130';
  currency: Currency;
  amount: string;
  memo: string;
};

const KIND_OPTIONS: { value: Kind; label: string; party: Party }[] = [
  { value: 'RECEIVABLE', label: 'ذمة لنا', party: 'CUSTOMER' },
  { value: 'PAYABLE', label: 'ذمة علينا', party: 'SUPPLIER' },
  { value: 'ADVANCE_IN', label: 'دفعة للمورد', party: 'SUPPLIER' },
];

const CASH_ACCOUNTS = [
  { value: '1110', label: 'الخزنة' },
  { value: '1120', label: 'شام كاش' },
  { value: '1130', label: 'البنوك' },
];

type PartyTab = 'CUSTOMER' | 'SUPPLIER' | 'CUSTODY';
type GeneralLine = { key: string; code: string; currency: Currency; debit: string; credit: string; memo: string };

const PARTY_TABS: { id: PartyTab; label: string }[] = [
  { id: 'CUSTOMER', label: 'ذمم الزبائن' },
  { id: 'SUPPLIER', label: 'ذمم الموردين' },
  { id: 'CUSTODY', label: 'عهد المستلفين' },
];

function key() {
  return Math.random().toString(36).slice(2);
}

function iso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function today() {
  return iso(new Date());
}

function priorDay() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return iso(date);
}

function blankItem(documentDate: string): Item {
  return { key: key(), party: 'CUSTOMER', name: '', kind: 'RECEIVABLE', documentDate, amount: '', settlementMode: 'CASH', memo: '' };
}

function blankCash(): CashLine {
  return { key: key(), code: '1110', currency: 'USD', amount: '', memo: '' };
}

function amount(value: string) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function money(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function balances(preview: OpeningPreview | null) {
  const buckets = new Map<string, { debit: number; credit: number }>();
  for (const line of preview?.lines || []) {
    const bucket = buckets.get(line.currency) ?? { debit: 0, credit: 0 };
    bucket.debit += Number(line.debit);
    bucket.credit += Number(line.credit);
    buckets.set(line.currency, bucket);
  }
  const rows = [...buckets.entries()];
  const balanced = rows.length > 0 && rows.every(([, bucket]) => Math.abs(bucket.debit - bucket.credit) < 0.01);
  return { rows, balanced };
}

export function OpeningEntryPanel({ actor }: { actor: AuthUser }) {
  const canPost = actor.role === 'GENERAL_MANAGER';
  const { push, node: toasts } = useToasts();
  const [posted, setPosted] = useState(false);
  const [postedOn, setPostedOn] = useState('');
  const [step, setStep] = useState(0);
  const [partyTab, setPartyTab] = useState<PartyTab>('CUSTOMER');
  const [general, setGeneral] = useState<GeneralLine[]>([]);
  const [balanceDate, setBalanceDate] = useState(priorDay());
  const [entryDate, setEntryDate] = useState(today());
  const [allowance, setAllowance] = useState('');
  const [cashLines, setCashLines] = useState<CashLine[]>(() => [blankCash()]);
  const [items, setItems] = useState<Item[]>(() => [blankItem(priorDay())]);
  const [stock, setStock] = useState<StockLine[]>([]);
  const [custody, setCustody] = useState<CustodyLine[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [preview, setPreview] = useState<OpeningPreview | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOpeningEntry()
      .then((row) => {
        setPosted(row.posted);
        if (row.entryDate) setPostedOn(row.entryDate);
        if (row.balanceDate) setBalanceDate(row.balanceDate);
        if (row.entryDate) setEntryDate(row.entryDate);
      })
      .catch((error) => push(masterErrorMessage(error), 'err'));
    listWarehouses()
      .then(setWarehouses)
      .catch((error) => push(masterErrorMessage(error), 'err'));
  }, []);

  useEffect(() => {
    const warehouseId = warehouses.find((row) => row.isDefault)?.id || warehouses[0]?.id;
    if (!warehouseId) return;
    getProductCatalog({ warehouseId, filter: 'all' })
      .then((doc) => setProducts(doc.products))
      .catch((error) => push(masterErrorMessage(error), 'err'));
  }, [warehouses]);

  const totals = useMemo(
    () => ({
      receivables: items.filter((row) => row.kind === 'RECEIVABLE').reduce((sum, row) => sum + amount(row.amount), 0),
      payables: items.filter((row) => row.kind === 'PAYABLE').reduce((sum, row) => sum + amount(row.amount), 0),
      supplierAdvances: items.filter((row) => row.kind === 'ADVANCE_IN').reduce((sum, row) => sum + amount(row.amount), 0),
    }),
    [items],
  );

  const proof = balances(preview);

  function changed() {
    setPreview(null);
  }

  function body() {
    const defaultWarehouse = warehouses.find((row) => row.isDefault)?.id || warehouses[0]?.id || '';
    return {
      balanceDate,
      entryDate,
      allowance: amount(allowance) || Number(allowance || 0),
      items: items
        .filter((item) => item.name.trim() && amount(item.amount) > 0)
        .map((item) => ({
          party: item.party,
          name: item.name.trim(),
          kind: item.kind,
          documentDate: item.documentDate,
          currency: 'USD',
          amount: amount(item.amount),
          settlementMode: item.settlementMode,
          memo: item.memo.trim(),
        })),
      custody: custody
        .filter((line) => line.borrowerName.trim() && amount(line.amount) > 0)
        .map((line) => ({ borrowerName: line.borrowerName.trim(), currency: line.currency, amount: amount(line.amount), documentDate: balanceDate })),
      accounts: cashLines
        .filter((line) => amount(line.amount) > 0)
        .map((line) => ({
          code: line.code,
          currency: line.currency,
          debit: amount(line.amount),
          credit: 0,
          memo: line.memo.trim() || CASH_ACCOUNTS.find((account) => account.value === line.code)?.label || 'رصيد افتتاحي',
        }))
        .concat(
          general
            .filter((line) => line.code.trim() && (amount(line.debit) > 0 || amount(line.credit) > 0))
            .map((line) => ({
              code: line.code.trim() as CashLine['code'],
              currency: line.currency,
              debit: amount(line.debit),
              credit: amount(line.credit),
              memo: line.memo.trim() || 'رصيد افتتاحي',
            })),
        ),
      stock: stock
        .filter((line) => line.productId && amount(line.quantity) > 0)
        .map((line) => ({
          productId: line.productId,
          warehouseId: line.warehouseId || defaultWarehouse,
          quantity: amount(line.quantity),
          unitCost: Number(line.unitCost || 0),
        })),
      controls: {
        receivables: totals.receivables,
        payables: totals.payables,
        customerAdvances: 0,
        supplierAdvances: totals.supplierAdvances,
        allowance: Number(allowance || 0),
      },
    };
  }

  async function previewEntry() {
    setSaving(true);
    try {
      setPreview(await previewOpeningEntry(body()));
      push('المعاينة جاهزة.', 'ok');
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function postEntry() {
    setSaving(true);
    try {
      const doc = await postOpeningEntry(body());
      setPreview(doc);
      setPosted(true);
      setPostedOn(entryDate);
      push('رُحّل القيد الافتتاحي.', 'ok');
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }


  const STEPS = ['النقدية والبنوك', 'الذمم والعهد', 'المخزون والحسابات العامة', 'المراجعة والاعتماد'];
  const lastStep = STEPS.length - 1;

  function goTo(next: number) {
    setStep(next);
    if (next === lastStep && canPost && !preview) void previewEntry();
  }

  function upd<T extends { key: string }>(set: (fn: (rows: T[]) => T[]) => void, rowKey: string, patch: Partial<T>) {
    changed();
    set((rows) => rows.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)));
  }

  function del<T extends { key: string }>(set: (fn: (rows: T[]) => T[]) => void, rowKey: string) {
    changed();
    set((rows) => rows.filter((row) => row.key !== rowKey));
  }

  const CURRENCIES = [{ value: 'USD', label: 'USD' }, { value: 'SYP', label: 'SYP' }];
  const defaultWarehouse = warehouses.find((row) => row.isDefault)?.id || warehouses[0]?.id || '';

  if (posted) {
    return (
      <div className="ent-page">
        {toasts}
        <div className="ent-balance-card is-ok">
          <div>
            <span>القيد الافتتاحي</span>
            <strong>مرحّل{postedOn ? ` بتاريخ ${postedOn}` : ''}</strong>
          </div>
          <span className="ent-badge is-posted">مقفل</span>
        </div>
        <p className="ent-empty">العملة الأساسية والأرصدة مقفلة. التصحيح بقيد جديد.</p>
      </div>
    );
  }

  const partyRows = items.filter((row) => row.party === partyTab);

  return (
    <div className="ent-page">
      {toasts}
      <ol className="ent-wizard-steps">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? 'is-current' : index < step ? 'is-done' : ''}>
            <button type="button" onClick={() => goTo(index)}>
              <b>{index + 1}</b>
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="ent-ribbon">
        <label className="ent-tool">
          تاريخ الميزانية
          <Input type="date" value={balanceDate} onChange={(event) => { changed(); setBalanceDate(event.target.value); }} />
        </label>
        <label className="ent-tool">
          تاريخ القيد
          <Input type="date" value={entryDate} onChange={(event) => { changed(); setEntryDate(event.target.value); }} />
        </label>
        <label className="ent-tool">
          مخصص الديون
          <Input inputMode="decimal" value={allowance} placeholder="0" onChange={(event) => { changed(); setAllowance(event.target.value); }} />
        </label>
      </div>

      {step === 0 ? (
        <div className="ent-table-wrap">
          <table className="ent-table">
            <thead>
              <tr>
                <th>الحساب</th>
                <th>العملة</th>
                <th className="is-num">الرصيد</th>
                <th>البيان</th>
                <th><Button variant="mini" onClick={() => { changed(); setCashLines((rows) => [...rows, blankCash()]); }}>+ سطر</Button></th>
              </tr>
            </thead>
            <tbody>
              {cashLines.map((line) => (
                <tr key={line.key}>
                  <td><Select value={line.code} options={CASH_ACCOUNTS} onChange={(code) => upd(setCashLines, line.key, { code: code as CashLine['code'] })} /></td>
                  <td><Select value={line.currency} options={CURRENCIES} onChange={(currency) => upd(setCashLines, line.key, { currency: currency as Currency })} /></td>
                  <td><Input inputMode="decimal" value={line.amount} onChange={(event) => upd(setCashLines, line.key, { amount: event.target.value })} /></td>
                  <td><Input value={line.memo} onChange={(event) => upd(setCashLines, line.key, { memo: event.target.value })} /></td>
                  <td><Button variant="danger" onClick={() => del(setCashLines, line.key)}>حذف</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {step === 1 ? (
        <>
          <div className="ent-tabs" role="tablist">
            {PARTY_TABS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={partyTab === item.id} onClick={() => setPartyTab(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          {partyTab === 'CUSTODY' ? (
            <div className="ent-table-wrap">
              <table className="ent-table">
                <thead>
                  <tr>
                    <th>صاحب العهدة</th>
                    <th>العملة</th>
                    <th className="is-num">المبلغ</th>
                    <th><Button variant="mini" onClick={() => { changed(); setCustody((rows) => [...rows, { key: key(), borrowerName: '', currency: 'USD', amount: '' }]); }}>+ عهدة</Button></th>
                  </tr>
                </thead>
                <tbody>
                  {custody.length === 0 ? <tr><td className="ent-empty" colSpan={4}>لا عهد افتتاحية.</td></tr> : null}
                  {custody.map((line) => (
                    <tr key={line.key}>
                      <td><Input value={line.borrowerName} onChange={(event) => upd(setCustody, line.key, { borrowerName: event.target.value })} /></td>
                      <td><Select value={line.currency} options={CURRENCIES} onChange={(currency) => upd(setCustody, line.key, { currency: currency as Currency })} /></td>
                      <td><Input inputMode="decimal" value={line.amount} onChange={(event) => upd(setCustody, line.key, { amount: event.target.value })} /></td>
                      <td><Button variant="danger" onClick={() => del(setCustody, line.key)}>حذف</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ent-table-wrap">
              <table className="ent-table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>النوع</th>
                    <th>التاريخ</th>
                    <th className="is-num">المبلغ</th>
                    <th>التسوية</th>
                    <th>البيان</th>
                    <th>
                      <Button
                        variant="mini"
                        onClick={() => {
                          changed();
                          const next = blankItem(balanceDate);
                          setItems((rows) => [...rows, { ...next, party: partyTab as Party, kind: partyTab === 'CUSTOMER' ? 'RECEIVABLE' : 'PAYABLE' }]);
                        }}
                      >
                        + بند
                      </Button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {partyRows.length === 0 ? <tr><td className="ent-empty" colSpan={7}>لا بنود.</td></tr> : null}
                  {partyRows.map((item) => (
                    <tr key={item.key}>
                      <td><Input value={item.name} onChange={(event) => upd(setItems, item.key, { name: event.target.value })} /></td>
                      <td>
                        <Select
                          value={item.kind}
                          options={KIND_OPTIONS.filter((option) => option.party === item.party)}
                          onChange={(kind) => upd(setItems, item.key, { kind: kind as Kind })}
                        />
                      </td>
                      <td><Input type="date" value={item.documentDate} onChange={(event) => upd(setItems, item.key, { documentDate: event.target.value })} /></td>
                      <td><Input inputMode="decimal" value={item.amount} onChange={(event) => upd(setItems, item.key, { amount: event.target.value })} /></td>
                      <td>
                        <Select
                          value={item.settlementMode}
                          options={[{ value: 'CASH', label: 'نقد' }, { value: 'GOODS', label: 'بضاعة' }]}
                          onChange={(settlementMode) => upd(setItems, item.key, { settlementMode: settlementMode as Settlement })}
                        />
                      </td>
                      <td><Input value={item.memo} onChange={(event) => upd(setItems, item.key, { memo: event.target.value })} /></td>
                      <td><Button variant="danger" onClick={() => del(setItems, item.key)}>حذف</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className="ent-table-wrap">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>المستودع</th>
                  <th className="is-num">الكمية</th>
                  <th className="is-num">تكلفة الوحدة</th>
                  <th><Button variant="mini" onClick={() => { changed(); setStock((rows) => [...rows, { key: key(), productId: '', warehouseId: defaultWarehouse, quantity: '', unitCost: '' }]); }}>+ صنف</Button></th>
                </tr>
              </thead>
              <tbody>
                {stock.length === 0 ? <tr><td className="ent-empty" colSpan={5}>لا بضاعة افتتاحية.</td></tr> : null}
                {stock.map((line) => (
                  <tr key={line.key}>
                    <td>
                      <Select
                        value={line.productId}
                        placeholder="الصنف"
                        options={products.map((row) => ({ value: row.id, label: row.name }))}
                        onChange={(productId) => {
                          const product = products.find((row) => row.id === productId);
                          upd(setStock, line.key, { productId, unitCost: line.unitCost || product?.costPrice || '' });
                        }}
                      />
                    </td>
                    <td>
                      <Select
                        value={line.warehouseId}
                        placeholder="المستودع"
                        options={warehouses.filter((row) => row.status === 'ACTIVE').map((row) => ({ value: row.id, label: row.name }))}
                        onChange={(warehouseId) => upd(setStock, line.key, { warehouseId })}
                      />
                    </td>
                    <td><Input inputMode="decimal" value={line.quantity} onChange={(event) => upd(setStock, line.key, { quantity: event.target.value })} /></td>
                    <td><Input inputMode="decimal" value={line.unitCost} onChange={(event) => upd(setStock, line.key, { unitCost: event.target.value })} /></td>
                    <td><Button variant="danger" onClick={() => del(setStock, line.key)}>حذف</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ent-table-wrap">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>رمز الحساب</th>
                  <th>العملة</th>
                  <th className="is-num">مدين</th>
                  <th className="is-num">دائن</th>
                  <th>البيان</th>
                  <th><Button variant="mini" onClick={() => { changed(); setGeneral((rows) => [...rows, { key: key(), code: '', currency: 'USD', debit: '', credit: '', memo: '' }]); }}>+ حساب</Button></th>
                </tr>
              </thead>
              <tbody>
                {general.length === 0 ? <tr><td className="ent-empty" colSpan={6}>لا أرصدة حسابات أخرى.</td></tr> : null}
                {general.map((line) => (
                  <tr key={line.key}>
                    <td><Input value={line.code} onChange={(event) => upd(setGeneral, line.key, { code: event.target.value })} /></td>
                    <td><Select value={line.currency} options={CURRENCIES} onChange={(currency) => upd(setGeneral, line.key, { currency: currency as Currency })} /></td>
                    <td><Input inputMode="decimal" value={line.debit} onChange={(event) => upd(setGeneral, line.key, { debit: event.target.value })} /></td>
                    <td><Input inputMode="decimal" value={line.credit} onChange={(event) => upd(setGeneral, line.key, { credit: event.target.value })} /></td>
                    <td><Input value={line.memo} onChange={(event) => upd(setGeneral, line.key, { memo: event.target.value })} /></td>
                    <td><Button variant="danger" onClick={() => del(setGeneral, line.key)}>حذف</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {step === lastStep ? (
        <>
          <div className={`ent-balance-card${preview ? (proof.balanced ? ' is-ok' : ' is-bad') : ''}`}>
            <div>
              <span>ملخص القيد الافتتاحي · الموازنة 3300</span>
              <strong>
                {!canPost
                  ? 'ترحيل القيد الافتتاحي للمدير العام'
                  : saving && !preview
                    ? 'جارٍ الحساب…'
                    : preview
                      ? (proof.balanced ? 'القيد متوازن — المدين يساوي الدائن' : 'القيد غير متوازن')
                      : 'عاين القيد قبل الترحيل'}
              </strong>
            </div>
            {proof.rows.length ? (
              <ol>
                {proof.rows.map(([currency, bucket]) => (
                  <li key={currency}>
                    <span>{currency}</span>
                    <b>مدين {money(bucket.debit)} · دائن {money(bucket.credit)}</b>
                  </li>
                ))}
              </ol>
            ) : (
              <span className="ent-badge is-draft">بانتظار المعاينة</span>
            )}
          </div>
          {preview ? (
            <div className="ent-table-wrap">
              <table className="ent-table">
                <thead>
                  <tr>
                    <th>الحساب</th>
                    <th>العملة</th>
                    <th className="is-num">مدين</th>
                    <th className="is-num">دائن</th>
                    <th>البيان</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((line, index) => (
                    <tr key={`${line.code}-${index}`} className={line.code === '3300' ? 'is-balancing' : undefined}>
                      <td>{line.code}</td>
                      <td>{line.currency}</td>
                      <td className="is-num">{line.debit}</td>
                      <td className="is-num">{line.credit}</td>
                      <td>{line.memo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="ent-wizard-nav">
        <Button disabled={step === 0} onClick={() => goTo(step - 1)}>السابق</Button>
        {step < lastStep ? (
          <Button variant="primary" onClick={() => goTo(step + 1)}>التالي</Button>
        ) : canPost ? (
          <>
            <Button disabled={saving} onClick={() => void previewEntry()}>{saving ? 'جارٍ الحساب' : 'إعادة المعاينة'}</Button>
            <Button variant="primary" disabled={saving || !proof.balanced} onClick={() => void postEntry()}>اعتماد وترحيل القيد الافتتاحي</Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
