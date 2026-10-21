'use client';

import { useEffect, useMemo, useState } from 'react';
import { FundsBar } from './funds-bar';
import { IncomePanel } from './income-panel';
import { OutcomePanel } from './outcome-panel';
import { JournalPeek } from './journal-peek';
import { ExchangePanel } from './exchange-panel';
import { TransferPanel } from './transfer-panel';
import { SlideOver } from './ui/slide-over';
import { Modal } from './ui/modal';
import { Badge, type BadgeTone } from './ui/badge';
import { Button } from './ui/button';
import { DocumentStepper } from './ui/document-stepper';
import { PrintButton } from './print/print-layout';
import { DataTable, type Column } from './ui/data-table';
import { FilterPills, PageToolbar } from './ui/page-toolbar';
import {
  AdvanceRow,
  AuthUser,
  CurrencyBalance,
  ExchangeRow,
  FundsSnapshot,
  IncomeRow,
  LocationRow,
  NamedRecord,
  OutcomeRow,
  ProjectRow,
  TransferRow,
} from '../lib/api';
import { PALETTE_EVENT, dropPaletteOpen, peekPaletteOpen } from '../lib/palette-open';
import './enterprise.css';

type Move = {
  id: string;
  date: string;
  type: string;
  number: number;
  fund: string;
  detail: string;
  currency: string;
  amount: number;
  employee: string;
  status: string;
  sourceType: 'INCOME' | 'OUTCOME' | null;
  sourceId: string;
};

type Props = {
  actor: AuthUser;
  locations: LocationRow[];
  projects: ProjectRow[];
  banks: NamedRecord[];
  onChanged: () => Promise<void>;
  funds: FundsSnapshot | null;
  incomes: IncomeRow[];
  outcomes: OutcomeRow[];
  exchanges: ExchangeRow[];
  transfers: TransferRow[];
  advances: AdvanceRow[];
};

type MoveFilter = 'ALL' | 'قبض' | 'صرف' | 'تحويل' | 'تصريف';

function dayOf(value: string) {
  return value.slice(0, 10);
}

function fundLabel(fund: string, bank?: string | null) {
  const name = fund === 'SHAM_CASH' ? 'شام كاش' : fund === 'BANK' ? 'البنوك' : fund === 'VAULT' ? 'الخزنة' : fund;
  return bank ? `${name} · ${bank}` : name;
}

function money(amount: number, currency: string) {
  const digits = currency === 'SYP' ? 0 : 2;
  return amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function statusLabel(status: string) {
  if (status === 'COMPLETED') return 'مكتملة';
  if (status === 'PENDING_APPROVAL') return 'معلّقة';
  return status;
}

function withBoth(rows: CurrencyBalance[]): CurrencyBalance[] {
  return (['USD', 'SYP'] as const).map((currency) => ({
    currency,
    amount: rows.find((row) => row.currency === currency)?.amount ?? 0,
  }));
}

function presentFunds(funds: FundsSnapshot | null): FundsSnapshot {
  const snapshot = funds || { vault: [], sham: [], banks: [], custody: [] };
  return {
    vault: withBoth(snapshot.vault),
    sham: withBoth(snapshot.sham),
    banks: snapshot.banks.map((row) => ({ ...row, balances: withBoth(row.balances) })),
    custody: snapshot.custody,
  };
}

function moveBadge(status: string): { tone: BadgeTone; label: string } {
  if (status === 'COMPLETED') return { tone: 'ok', label: 'مكتملة' };
  if (status === 'PENDING_APPROVAL') return { tone: 'warn', label: 'معلّقة' };
  if (status === 'CANCELLED' || status === 'VOID' || status === 'REJECTED') return { tone: 'danger', label: statusLabel(status) };
  return { tone: 'neutral', label: statusLabel(status) };
}

function movesOf(props: Props): Move[] {
  const rows: Move[] = [];
  for (const row of props.incomes) {
    rows.push({
      id: `income-${row.id}`,
      date: dayOf(row.transactionDate),
      type: 'قبض',
      number: row.operationNumber,
      fund: fundLabel(row.fund, row.bank?.name),
      detail: [row.sender, row.receiver].filter(Boolean).join(' → ') || row.description || '—',
      currency: row.currency,
      amount: Number(row.total || 0),
      employee: row.employee.name,
      status: row.status,
      sourceType: 'INCOME',
      sourceId: row.id,
    });
  }
  for (const row of props.outcomes) {
    rows.push({
      id: `outcome-${row.id}`,
      date: dayOf(row.transactionDate),
      type: 'صرف',
      number: row.operationNumber,
      fund: fundLabel(row.fund, row.bank?.name),
      detail: [row.deliverer, row.receiver].filter(Boolean).join(' → ') || row.description || '—',
      currency: row.currency,
      amount: Number(row.total || 0),
      employee: row.employee.name,
      status: row.status,
      sourceType: 'OUTCOME',
      sourceId: row.id,
    });
  }
  for (const row of props.exchanges) {
    rows.push({
      id: `exchange-${row.id}`,
      date: dayOf(row.transactionDate),
      type: 'تصريف',
      number: row.operationNumber,
      fund: fundLabel(row.fund, row.bank?.name),
      detail: `${row.exchangeType === 'BUY' ? 'شراء' : 'بيع'} · ${money(Number(row.exchangeAmount || 0), row.paidCurrency)} ${row.paidCurrency} → ${money(Number(row.total || 0), row.receivedCurrency)} ${row.receivedCurrency}`,
      currency: row.paidCurrency,
      amount: Number(row.exchangeAmount || 0),
      employee: row.employee.name,
      status: row.status,
      sourceType: null,
      sourceId: '',
    });
  }
  for (const row of props.transfers) {
    rows.push({
      id: `transfer-${row.id}`,
      date: dayOf(row.transactionDate),
      type: 'تحويل',
      number: row.operationNumber,
      fund: `${fundLabel(row.fromFund, row.fromBank?.name)} → ${fundLabel(row.toFund, row.toBank?.name)}`,
      detail: row.notes || '—',
      currency: row.currency,
      amount: Number(row.amount || 0),
      employee: row.employee.name,
      status: row.status,
      sourceType: null,
      sourceId: '',
    });
  }
  for (const row of props.advances) {
    rows.push({
      id: `advance-${row.id}`,
      date: dayOf(row.transactionDate),
      type: 'سلف',
      number: row.operationNumber,
      // Only custody vouchers touch a cash fund; spending and exchanges run on the borrower's custody.
      fund: row.fund ? fundLabel(row.fund, row.bank?.name) : 'عهدة',
      detail: `${row.borrower.name}${row.description ? ` · ${row.description}` : ''}`,
      currency: row.currency,
      amount: Number(row.total || 0),
      employee: row.employee.name,
      status: row.status,
      sourceType: null,
      sourceId: '',
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
}

export function TreasuryHome(props: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MoveFilter>('ALL');
  const [drawer, setDrawer] = useState<'receipt' | 'payment' | 'transfer' | 'exchange' | null>(null);
  const [voucher, setVoucher] = useState<Move | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  useEffect(() => {
    function consume() {
      const item = peekPaletteOpen();
      if (item?.kind === 'new-voucher') {
        dropPaletteOpen();
        setVoucher(null);
        setDrawer(item.form);
        return;
      }
      if (!item || item.kind !== 'voucher') return;
      const row = movesOf(props).find((move) => move.sourceType === item.sourceType && move.sourceId === item.sourceId);
      if (!row) return;
      dropPaletteOpen();
      setJournalOpen(false);
      setVoucher(row);
    }
    consume();
    window.addEventListener(PALETTE_EVENT, consume);
    return () => window.removeEventListener(PALETTE_EVENT, consume);
  }, [props]);

  const rows = useMemo(() => {
    const needle = query.trim();
    return movesOf(props).filter((row) => {
      if (filter !== 'ALL' && row.type !== filter) return false;
      if (!needle) return true;
      return `${row.type} ${row.fund} ${row.detail} ${row.number} ${row.currency}`.includes(needle);
    });
  }, [props, query, filter]);

  async function afterSave() {
    setDrawer(null);
    await props.onChanged();
  }

  const columns: Column<Move>[] = [
    { key: 'date', header: 'التاريخ', render: (row) => row.date },
    { key: 'type', header: 'نوع الحركة', render: (row) => row.type },
    { key: 'amount', header: 'المبلغ', numeric: true, render: (row) => money(row.amount, row.currency) },
    { key: 'currency', header: 'العملة', defaultHidden: true, render: (row) => row.currency },
    { key: 'number', header: 'رقم السند', numeric: true, defaultHidden: true, render: (row) => row.number },
    { key: 'employee', header: 'الموظف', defaultHidden: true, render: (row) => row.employee },
    { key: 'fund', header: 'الحساب / الصندوق', render: (row) => row.fund },
    { key: 'detail', header: 'البيان', render: (row) => row.detail },
    {
      key: 'status',
      header: 'الحالة',
      render: (row) => {
        const badge = moveBadge(row.status);
        return <Badge tone={badge.tone}>{badge.label}</Badge>;
      },
    },
  ];

  return (
    <div className="ent-page">
      <FundsBar funds={presentFunds(props.funds)} section="cash" layout="board" />
      <PageToolbar
        search={query}
        onSearch={setQuery}
        searchPlaceholder="بحث في الحركات"
        filters={
          <FilterPills
            value={filter}
            onChange={setFilter}
            options={[
              ['ALL', 'الكل'],
              ['قبض', 'قبض'],
              ['صرف', 'صرف'],
              ['تحويل', 'تحويل بين الصناديق'],
              ['تصريف', 'تصريف عملة'],
            ] as const}
          />
        }
        actions={
          <>
            <Button onClick={() => setDrawer('receipt')}>+ سند قبض</Button>
            <Button variant="primary" onClick={() => setDrawer('payment')}>+ سند صرف</Button>
            <Button onClick={() => setDrawer('transfer')}>+ تحويل بين الصناديق</Button>
            <Button onClick={() => setDrawer('exchange')}>+ تصريف عملة</Button>
          </>
        }
      />
      <DataTable
        tableId="treasury-moves"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        isRowClickable={(row) => row.sourceType != null && row.status === 'COMPLETED'}
        onRowClick={(row) => {
          setJournalOpen(false);
          setVoucher(row);
        }}
        empty="لا حركات في هذا العرض."
      />
      {drawer === 'receipt' ? (
        <Modal wide className="is-voucher" title="سند قبض" onClose={() => setDrawer(null)}>
          <IncomePanel
            actor={props.actor}
            locations={props.locations}
            projects={props.projects}
            banks={props.banks}
            incomes={props.incomes}
            funds={props.funds}
            part="form"
            embedded
            onChanged={afterSave}
          />
        </Modal>
      ) : null}
      {drawer === 'payment' ? (
        <Modal wide className="is-voucher" title="سند صرف" onClose={() => setDrawer(null)}>
          <OutcomePanel
            actor={props.actor}
            locations={props.locations}
            projects={props.projects}
            banks={props.banks}
            outcomes={props.outcomes}
            funds={props.funds}
            part="form"
            embedded
            onChanged={afterSave}
          />
        </Modal>
      ) : null}
      {drawer === 'transfer' ? (
        <Modal wide className="is-voucher" title="تحويل بين الصناديق" onClose={() => setDrawer(null)}>
          <TransferPanel
            actor={props.actor}
            locations={props.locations}
            banks={props.banks}
            transfers={props.transfers}
            funds={props.funds}
            part="form"
            embedded
            onChanged={afterSave}
          />
        </Modal>
      ) : null}
      {drawer === 'exchange' ? (
        <Modal wide className="is-voucher" title="تصريف عملة" onClose={() => setDrawer(null)}>
          <ExchangePanel
            actor={props.actor}
            locations={props.locations}
            banks={props.banks}
            exchanges={props.exchanges}
            funds={props.funds}
            part="form"
            embedded
            onChanged={afterSave}
          />
        </Modal>
      ) : null}
      {voucher?.sourceType ? (
        <SlideOver
          title={`${voucher.type} ${voucher.number}`}
          onClose={() => { setVoucher(null); setJournalOpen(false); }}
          footer={
            <div className="ent-doc-bar">
              <div className="ent-doc-actions">
                <Button variant="secondary" onClick={() => setJournalOpen(true)}>عرض القيد المحاسبي</Button>
                <PrintButton
                  label="طباعة الإيصال"
                  getDoc={() => ({
                    title: voucher.type,
                    number: String(voucher.number),
                    date: String(voucher.date),
                    currency: voucher.currency,
                    total: money(voucher.amount, voucher.currency),
                    partyLabel: 'الحساب',
                    partyName: voucher.fund,
                    meta: [['الموظف', voucher.employee]],
                    notes: voucher.detail,
                    journalRef: String(voucher.number),
                    lines: [{ name: voucher.detail || voucher.type, total: money(voucher.amount, voucher.currency) }],
                  })}
                />
              </div>
            </div>
          }
        >
          <DocumentStepper stage="POSTED" />
          <table className="ent-table">
            <tbody>
              <tr><th>التاريخ</th><td>{voucher.date}</td></tr>
              <tr><th>المبلغ</th><td className="is-num">{money(voucher.amount, voucher.currency)} {voucher.currency}</td></tr>
              <tr><th>الحساب</th><td>{voucher.fund}</td></tr>
              <tr><th>البيان</th><td>{voucher.detail}</td></tr>
              <tr><th>الموظف</th><td>{voucher.employee}</td></tr>
            </tbody>
          </table>
        </SlideOver>
      ) : null}
      {journalOpen && voucher?.sourceType ? (
        <JournalPeek sourceType={voucher.sourceType} sourceId={voucher.sourceId} onClose={() => setJournalOpen(false)} />
      ) : null}
    </div>
  );
}
