'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CurrencyMark, CurrencySelect } from './currency-mark';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input } from './ui/field';
import { EmptyState, Table } from './ui/table';
import { ApiError, CurrencyCode, NrvPreviewRow, assessInventoryNrv, previewInventoryNrv } from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function num(value: string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function qty(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

function measure(row: NrvPreviewRow, raw: string) {
  const cost = num(row.costPrice);
  const onHand = num(row.onHand);
  const next = num(raw);
  const unitGap = Math.max(0, cost - next);
  const target = onHand > 0 ? onHand * unitGap : 0;
  const before = num(row.allowance);
  const delta = target - before;
  return {
    cost,
    onHand,
    next,
    sale: row.salePrice == null ? null : num(row.salePrice),
    unitGap,
    before,
    writeDown: Math.max(0, delta),
    reversal: Math.max(0, -delta),
  };
}

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <article className={`wh-kpi${warn ? ' is-warn' : ''}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{hint}</em>
      </div>
    </article>
  );
}

export function InventoryNrvPanel() {
  const [rows, setRows] = useState<NrvPreviewRow[]>([]);
  const [nrv, setNrv] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [fxRate, setFxRate] = useState('');
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await previewInventoryNrv();
      setRows(list);
      setNrv(Object.fromEntries(list.map((row) => [row.id, row.unitNrv ?? row.suggestedNrv ?? ''])));
    } catch (err) {
      setError(masterErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const lines = useMemo(() => rows.map((row) => ({ row, ...measure(row, nrv[row.id] ?? '') })), [rows, nrv]);
  const writeDown = lines.reduce((sum, line) => sum + line.writeDown, 0);
  const reversal = lines.reduce((sum, line) => sum + line.reversal, 0);
  const stockValue = lines.reduce((sum, line) => sum + line.onHand * line.cost, 0);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    const payload = rows.map((row) => ({ productId: row.id, unitNrv: Number(nrv[row.id]) }));
    if (!payload.length || payload.some((line) => !Number.isFinite(line.unitNrv) || line.unitNrv < 0)) {
      setError('أدخل ما يمكن بيع كل وحدة به. الصفر مسموح إذا لم يعد للصنف قيمة بيع.');
      return;
    }
    setSaving(true);
    try {
      const saved = await assessInventoryNrv({
        transactionDate,
        currency,
        notes,
        lines: payload,
      });
      const down = Number(saved.writeDown);
      const back = Number(saved.reversal);
      setMessage(
        down > 0 || back > 0
          ? `رُحّل ${saved.reference}. هبوط ${money(down)}، وعكس خسارة سابقة ${money(back)}.`
          : `حُفظ ${saved.reference}. كل الأصناف تُباع بتكلفتها أو أعلى، فلم يُسجَّل فرق.`,
      );
      await load();
    } catch (err) {
      setError(masterErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ui-page wh">
      <Card title="صافي القيمة" chip="المخزون">
        <p className="ui-note">
          تقارن تكلفة كل صنف بما يمكن بيعه به اليوم. إذا كان البيع أقل من التكلفة يُسجَّل الفرق، حتى لا تُحسب البضاعة بأكثر من قيمتها.
        </p>
        <div className="wh-kpis">
          <Kpi label="الأصناف" value={loading ? '—' : String(rows.length)} hint="لها كمية للقياس" />
          <Kpi label="قيمة بالتكلفة" value={loading ? '—' : money(stockValue)} hint="الكمية × التكلفة" />
          <Kpi
            label="هبوط هذا القياس"
            value={loading ? '—' : money(writeDown)}
            hint={writeDown > 0 ? 'يُرحَّل عند الحفظ' : 'لا هبوط الآن'}
            warn={writeDown > 0}
          />
          <Kpi label="عكس خسارة سابقة" value={loading ? '—' : money(reversal)} hint="في حدود التكلفة" />
        </div>
      </Card>

      <Card title="الأصناف" count={loading ? undefined : rows.length}>
        {loading ? <EmptyState title="جارٍ تحميل الأصناف..." /> : null}
        {!loading && error && rows.length === 0 ? <EmptyState title="تعذر تحميل القياس" detail={error} /> : null}
        {!loading && rows.length === 0 && !error ? (
          <EmptyState title="لا يوجد مخزون لقياسه" detail="أضف كمية لصنف من المستودع، ثم ارجع إلى هنا." />
        ) : null}
        {rows.length > 0 ? (
          <form onSubmit={onSubmit}>
            <div className="ui-form-grid">
              <Field label="تاريخ القياس">
                <Input required type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} />
              </Field>
              <Field label="عملة القياس">
                <CurrencySelect value={currency} onChange={setCurrency} />
              </Field>
              <Field label="ملاحظة">
                <Input value={notes} placeholder="سبب القياس، مثل جرد نهاية الشهر" onChange={(event) => setNotes(event.target.value)} />
              </Field>
            </div>
            <Table>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th className="num">الكمية</th>
                  <th className="num">التكلفة</th>
                  <th className="num">سعر البيع</th>
                  <th className="num">يُباع الآن</th>
                  <th>النتيجة</th>
                  <th className="num">خسارة سابقة</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.row.id}>
                    <td>
                      <span className="wh-identity">
                        <span>
                          <strong>{line.row.name}</strong>
                          {line.row.sku ? <small>{line.row.sku}</small> : null}
                        </span>
                      </span>
                    </td>
                    <td className="num">{qty(line.onHand)}</td>
                    <td className="num">{money(line.cost)}</td>
                    <td className="num">{line.sale == null ? '—' : money(line.sale)}</td>
                    <td className="num">
                      <Input
                        className="input-amount"
                        inputMode="decimal"
                        aria-label={`ما يمكن بيع ${line.row.name} به`}
                        value={nrv[line.row.id] ?? ''}
                        onChange={(event) => setNrv((current) => ({ ...current, [line.row.id]: event.target.value }))}
                      />
                    </td>
                    <td>
                      {line.unitGap > 0 ? (
                        <span className="wh-pill is-out">هبوط {money(line.onHand * line.unitGap)}</span>
                      ) : (
                        <span className="wh-pill is-ok">يغطي التكلفة</span>
                      )}
                    </td>
                    <td className="num">{money(line.before)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {error ? <p className="ui-banner is-err">{error}</p> : null}
            {message ? <p className="ui-banner">{message}</p> : null}
            <div className="ui-action-row">
              <div className="ui-total-box">
                <div className="ui-total-label">هبوط هذا القياس</div>
                <div className={`ui-total-value${writeDown > 0 ? ' is-neg' : ''}`}>
                  <span>{money(writeDown)}</span>
                  <CurrencyMark code={currency} />
                </div>
              </div>
              <div className="ui-submit-stack">
                <Button variant="submit" type="submit" disabled={saving}>
                  {saving ? 'جارٍ الترحيل…' : 'ترحيل القياس'}
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </Card>
    </section>
  );
}
