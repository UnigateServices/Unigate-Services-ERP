'use client';

import { useMemo, useState } from 'react';
import { AdvancePanel } from './advance-panel';
import { JournalPeek } from './journal-peek';
import { Badge, type BadgeTone } from './ui/badge';
import { Button } from './ui/button';
import { DocumentStepper, voucherStage } from './ui/document-stepper';
import { PrintButton } from './print/print-layout';
import { DataTable, type Column } from './ui/data-table';
import { FilterPills, PageToolbar } from './ui/page-toolbar';
import { SlideOver } from './ui/slide-over';
import { Modal } from './ui/modal';
import { StatCard, StatGrid } from './ui/stat-card';
import { AdvanceRow, AdvanceType, AuthUser, FundsSnapshot, LocationRow, NamedRecord, ProjectRow } from '../lib/api';
import './enterprise.css';

type Props = {
  actor: AuthUser;
  locations: LocationRow[];
  projects: ProjectRow[];
  borrowers: NamedRecord[];
  banks: NamedRecord[];
  funds: FundsSnapshot | null;
  advances: AdvanceRow[];
  onChanged: () => Promise<void>;
};

type TypeFilter = 'ALL' | AdvanceType;

const TYPE_LABEL: Record<AdvanceType, string> = {
  ISSUE: 'صرف عهدة',
  RETURN: 'استرداد عهدة',
  OUTCOME: 'تصفية عهدة',
  EXCHANGE: 'تصريف من العهدة',
};

const DRAWERS: { type: AdvanceType; title: string; button: string; primary?: boolean }[] = [
  { type: 'ISSUE', title: 'صرف عهدة', button: '+ صرف عهدة', primary: true },
  { type: 'OUTCOME', title: 'تصفية عهدة', button: '+ تصفية عهدة' },
  { type: 'RETURN', title: 'استرداد عهدة', button: '+ استرداد عهدة' },
];

function money(amount: number, currency: string) {
  const digits = currency === 'SYP' ? 0 : 2;
  return amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function badge(status: string): { tone: BadgeTone; label: string } {
  if (status === 'COMPLETED') return { tone: 'ok', label: 'مكتملة' };
  if (status === 'PENDING_APPROVAL') return { tone: 'warn', label: 'معلّقة' };
  if (status === 'CANCELLED' || status === 'VOID' || status === 'REJECTED') return { tone: 'danger', label: status };
  return { tone: 'neutral', label: status };
}

export function CustodyHome(props: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TypeFilter>('ALL');
  const [drawer, setDrawer] = useState<AdvanceType | null>(null);
  const [peek, setPeek] = useState<AdvanceRow | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim();
    return props.advances
      .filter((row) => {
        if (filter !== 'ALL' && row.advanceType !== filter) return false;
        if (!needle) return true;
        return `${row.borrower.name} ${row.description} ${row.operationNumber} ${row.currency}`.includes(needle);
      })
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.operationNumber - a.operationNumber);
  }, [props.advances, query, filter]);

  const cards = (props.funds?.custody ?? []).flatMap((borrower) =>
    borrower.balances
      .filter((balance) => balance.amount !== 0)
      .map((balance) => ({ key: `${borrower.id}-${balance.currency}`, name: borrower.name, ...balance })),
  );

  const columns: Column<AdvanceRow>[] = [
    { key: 'date', header: 'التاريخ', render: (row) => row.transactionDate.slice(0, 10) },
    { key: 'no', header: 'رقم', numeric: true, defaultHidden: true, render: (row) => row.operationNumber },
    { key: 'type', header: 'نوع الحركة', render: (row) => TYPE_LABEL[row.advanceType] },
    { key: 'borrower', header: 'صاحب العهدة', render: (row) => row.borrower.name },
    { key: 'amount', header: 'المبلغ', numeric: true, render: (row) => money(Number(row.total || 0), row.currency) },
    { key: 'currency', header: 'العملة', defaultHidden: true, render: (row) => row.currency },
    { key: 'employee', header: 'الموظف', defaultHidden: true, render: (row) => row.employee.name },
    { key: 'detail', header: 'البيان', render: (row) => row.description || '—' },
    {
      key: 'status',
      header: 'الحالة',
      render: (row) => {
        const state = badge(row.status);
        return <Badge tone={state.tone}>{state.label}</Badge>;
      },
    },
  ];

  async function afterSave() {
    setDrawer(null);
    await props.onChanged();
  }

  const active = DRAWERS.find((item) => item.type === drawer);

  return (
    <div className="ent-page">
      {cards.length === 0 ? (
        <p className="ui-datatable-empty">لا توجد عهد قائمة</p>
      ) : (
        <StatGrid>
          {cards.map((card) => (
            <StatCard key={card.key} label={card.name} value={`${money(card.amount, card.currency)} ${card.currency}`} negative={card.amount < 0} hint="رصيد العهدة" />
          ))}
        </StatGrid>
      )}
      <PageToolbar
        search={query}
        onSearch={setQuery}
        searchPlaceholder="بحث في حركات العهد"
        filters={
          <FilterPills
            value={filter}
            onChange={setFilter}
            options={[
              ['ALL', 'الكل'],
              ['ISSUE', 'صرف'],
              ['OUTCOME', 'تصفية'],
              ['RETURN', 'استرداد'],
              ['EXCHANGE', 'تصريف'],
            ] as const}
          />
        }
        actions={DRAWERS.map((item) => (
          <Button key={item.type} variant={item.primary ? 'primary' : 'secondary'} onClick={() => setDrawer(item.type)}>
            {item.button}
          </Button>
        ))}
      />
      <DataTable
        tableId="custody-moves"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        isRowClickable={(row) => row.status === 'COMPLETED'}
        onRowClick={setPeek}
        empty="لا حركات عهد في هذا العرض."
      />
      {active ? (
        <Modal wide className="is-voucher" title={active.title} onClose={() => setDrawer(null)}>
          <AdvancePanel
            actor={props.actor}
            locations={props.locations}
            projects={props.projects}
            borrowers={props.borrowers}
            banks={props.banks}
            advances={props.advances}
            funds={props.funds}
            part="form"
            embedded
            initialType={active.type}
            onChanged={afterSave}
          />
        </Modal>
      ) : null}
      {peek ? (
        <SlideOver
          title={`${TYPE_LABEL[peek.advanceType]} ${peek.operationNumber}`}
          onClose={() => { setPeek(null); setJournalOpen(false); }}
          footer={
            <div className="ent-doc-bar">
              <div className="ent-doc-actions">
                <Button variant="secondary" onClick={() => setJournalOpen(true)}>عرض القيد المحاسبي</Button>
                <PrintButton
                  label="طباعة الإيصال"
                  getDoc={() => ({
                    title: `سند عهدة — ${TYPE_LABEL[peek.advanceType]}`,
                    number: String(peek.operationNumber),
                    date: peek.transactionDate.slice(0, 10),
                    currency: peek.currency,
                    total: money(Number(peek.total || 0), peek.currency),
                    partyLabel: 'صاحب العهدة',
                    partyName: peek.borrower.name,
                    officeName: peek.location?.name,
                    meta: [['الموظف', peek.employee.name]],
                    notes: peek.description || peek.notes,
                    journalRef: peek.reference || String(peek.operationNumber),
                    lines: [{ name: peek.description || TYPE_LABEL[peek.advanceType], total: money(Number(peek.total || 0), peek.currency) }],
                  })}
                />
              </div>
            </div>
          }
        >
          <DocumentStepper stage={voucherStage(peek.status)} />
          <table className="ent-table">
            <tbody>
              <tr><th>التاريخ</th><td>{peek.transactionDate.slice(0, 10)}</td></tr>
              <tr><th>المبلغ</th><td className="is-num">{money(Number(peek.total || 0), peek.currency)} {peek.currency}</td></tr>
              <tr><th>الحساب</th><td>{peek.borrower.name}</td></tr>
              <tr><th>البيان</th><td>{peek.description || '—'}</td></tr>
              <tr><th>الموظف</th><td>{peek.employee.name}</td></tr>
            </tbody>
          </table>
        </SlideOver>
      ) : null}
      {journalOpen && peek ? <JournalPeek sourceType="ADVANCE" sourceId={peek.id} onClose={() => setJournalOpen(false)} /> : null}
    </div>
  );
}
