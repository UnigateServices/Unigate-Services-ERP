'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AttachmentsBox } from './attachments-box';
import { FileViewer } from './file-viewer';
import { OpsDialog } from './ops-dialog';
import { CurrencyMark } from './currency-mark';
import { OpsCard } from './ops-card';
import { OpsSelect } from './ops-select';
import {
  AuthUser,
  CURRENCIES,
  CurrencyCode,
  ExchangeInput,
  ExchangeRow,
  ExchangeSearch,
  ExchangeType,
  FundsSnapshot,
  LocationRow,
  NamedRecord,
  OPERATION_FUNDS,
  attachAfterSave,
  attachmentCount,
  createExchange,
  deleteExchange,
  listExchanges,
  requestAuditDelete,
  requestAuditUpdate,
  updateExchange,
} from '../lib/api';
import { clearEdit, peekEdit } from '../lib/edit-handoff';
import { Dictionary, fill, dictionary } from '../lib/i18n';
import { masterErrorMessage } from '../lib/master-errors';
import { useLang } from '../lib/use-lang';

type Props = {
  actor: AuthUser;
  locations: LocationRow[];
  banks: NamedRecord[];
  exchanges: ExchangeRow[];
  funds?: FundsSnapshot | null;
  onChanged: () => Promise<void>;
  part?: 'form' | 'log';
};

type Toast = { id: number; text: string; tone: 'ok' | 'err' };

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function signedAmount(amount: number, min: number, max: number) {
  const text = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
  return amount < 0 ? `(${text})` : text;
}

function money(value: string | number | null | undefined, currency?: string) {
  const amount = Number(value || 0);
  const digits = currency === 'SYP' ? 0 : 2;
  return signedAmount(amount, digits, digits);
}

function rateText(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  const text = Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 6 });
  return amount < 0 ? `(${text})` : text;
}

function direction(type: ExchangeType) {
  if (type === 'BUY') return { from: 'SYP' as const, to: 'USD' as const };
  return { from: 'USD' as const, to: 'SYP' as const };
}

function previewTotal(amount: number, rate: number, type: ExchangeType) {
  if (!(amount > 0 && rate > 0)) return 0;
  const { from, to } = direction(type);
  if (from === to) return amount;
  if (from === 'SYP' && to === 'USD') return Math.round((amount / rate) * 100) / 100;
  return Math.round(amount * rate);
}

function fundLabel(fund: string, t: Dictionary['exchange']) {
  if (fund === 'SHAM_CASH') return t.fundSham;
  if (fund === 'BANK') return t.fundBank;
  if (fund === 'VAULT') return t.fundVault;
  return fund;
}

function typeLabel(value: string, t: Dictionary['exchange']) {
  if (value === 'BUY') return t.buy;
  if (value === 'SELL') return t.sell;
  return value;
}

function sectionError(error: unknown, t: Dictionary['exchange']) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code || '') : '';
  const map: Record<string, string> = {
    BANK_REQUIRED: t.errBank,
    AMOUNT_INVALID: t.errAmount,
    LOCATION_REQUIRED: t.errOffice,
    APPROVAL_REQUIRED: t.errApproval,
    NOT_EDITABLE: t.errEditable,
    REQUEST_PENDING: t.errPending,
    REASON_REQUIRED: t.errReason,
    REQUEST_FAILED: t.errFailed,
    FILE_TOO_LARGE: t.errFileSize,
    TOO_MANY_FILES: t.errFileCount,
    FILE_TYPE: t.errFileType,
    EXCHANGE_NOT_FOUND: t.errMissing,
    OP_NOT_FOUND: t.errMissing,
    FORBIDDEN: t.errForbidden,
  };
  return map[code] || masterErrorMessage(error);
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function clockTime(value: string | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function BalanceChips({ rows }: { rows: { currency: CurrencyCode; amount: number }[] }) {
  const t = dictionary(useLang()).exchange;
  if (rows.length === 0) return <span className="ops-bal-empty">{t.noCurrencies}</span>;
  return (
    <div className="ops-bal-chips">
      {rows.map((row) => (
        <div key={row.currency} className="ops-bal-chip">
          <span className={`ops-bal-amt${row.amount < 0 ? ' is-neg' : ' is-pos'}`}>{money(row.amount, row.currency)}</span>
          <CurrencyMark code={row.currency} />
        </div>
      ))}
    </div>
  );
}

function receiptLines(row: ExchangeRow, t: Dictionary['exchange']) {
  return [
    [t.opNo, String(row.operationNumber)],
    [t.colDate, dateOnly(String(row.transactionDate))],
    [t.type, typeLabel(row.exchangeType, t)],
    [t.fund, `${fundLabel(row.fund, t)}${row.bank ? ` · ${row.bank.name}` : ''}`],
    [t.paid, `${money(row.exchangeAmount, row.paidCurrency)} ${row.paidCurrency}`],
    [t.rate, rateText(row.exchangeRate)],
    [t.received, `${money(row.total, row.receivedCurrency)} ${row.receivedCurrency}`],
    [t.employee, row.employee.name],
  ];
}

function receiptText(row: ExchangeRow, t: Dictionary['exchange']) {
  return ['TRADIVIA', t.receiptLine, ...receiptLines(row, t).map(([label, value]) => `${label}: ${value}`)].join('\n');
}

function drawReceipt(row: ExchangeRow, t: Dictionary['exchange']) {
  const lines = receiptLines(row, t);
  const width = 640;
  const height = 148 + lines.length * 42;
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(2, 2);
  ctx.fillStyle = '#f6f1e4';
  ctx.fillRect(0, 0, width, height);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1d3b31';
  ctx.font = '800 26px Tahoma, "Segoe UI", sans-serif';
  ctx.fillText('TRADIVIA', width - 32, 48);
  ctx.font = '700 16px Tahoma, "Segoe UI", sans-serif';
  ctx.fillText(`${t.receiptLine} · ${t.opNo} ${row.operationNumber}`, width - 32, 78);
  ctx.strokeStyle = '#d7cbb3';
  ctx.beginPath();
  ctx.moveTo(32, 98);
  ctx.lineTo(width - 32, 98);
  ctx.stroke();
  lines.forEach(([label, value], index) => {
    const y = 136 + index * 42;
    ctx.font = '700 15px Tahoma, "Segoe UI", sans-serif';
    ctx.fillStyle = '#6d6456';
    ctx.textAlign = 'right';
    ctx.fillText(label, width - 32, y);
    ctx.font = '800 16px Tahoma, "Segoe UI", sans-serif';
    ctx.fillStyle = '#1d3b31';
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillText(value, 32, y);
    ctx.direction = 'rtl';
  });
  return canvas;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function jpegPdf(jpeg: Uint8Array, width: number, height: number) {
  const pageW = 420;
  const pageH = Math.max(200, Math.round((pageW * height) / width));
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n')];
  const offsets = [0];
  let cursor = chunks[0].length;

  function add(body: string | Uint8Array) {
    offsets.push(cursor);
    const bytes = typeof body === 'string' ? encoder.encode(body) : body;
    chunks.push(bytes);
    cursor += bytes.length;
  }

  add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  add('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');
  add(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  const imageHead = encoder.encode(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  const imageTail = encoder.encode('\nendstream\nendobj\n');
  offsets.push(cursor);
  chunks.push(imageHead, jpeg, imageTail);
  cursor += imageHead.length + jpeg.length + imageTail.length;
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im1 Do\nQ\n`;
  add(`5 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  const xrefStart = cursor;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let index = 1; index <= 5; index += 1) xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  chunks.push(encoder.encode(xref));
  return new Blob(chunks, { type: 'application/pdf' });
}

async function receiptImage(row: ExchangeRow, t: Dictionary['exchange']) {
  const canvas = drawReceipt(row, t);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((file) => (file ? resolve(file) : reject(new Error('image'))), 'image/png');
  });
  return { canvas, blob };
}

function ReceiptSheet({ row, onClose }: { row: ExchangeRow; onClose: () => void }) {
  const t = dictionary(useLang()).exchange;
  const [menu, setMenu] = useState<'wa' | null>(null);
  const fileBase = `tradivia-exchange-${row.operationNumber}`;

  async function savePdf() {
    const { canvas } = await receiptImage(row, t);
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((file) => (file ? resolve(file) : reject(new Error('jpeg'))), 'image/jpeg', 0.92);
    });
    downloadBlob(jpegPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height), `${fileBase}.pdf`);
    setMenu(null);
  }

  function sendText() {
    window.open(`https://wa.me/?text=${encodeURIComponent(receiptText(row, t))}`, '_blank', 'noopener,noreferrer');
    setMenu(null);
  }

  async function sendImage() {
    const text = receiptText(row, t);
    const { blob } = await receiptImage(row, t);
    const file = new File([blob], `${fileBase}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
    } else {
      downloadBlob(blob, `${fileBase}.png`);
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }
    setMenu(null);
  }

  return (
    <OpsDialog
      title="TRADIVIA"
      onClose={onClose}
      closeLabel={t.close}
      className="receipt-sheet"
      footer={
        <>
          <button type="button" className="receipt-choice is-save" onClick={() => void savePdf()}>{t.asPdf}</button>
          <div className="ops-wa-group">
            <button type="button" className="receipt-choice is-wa" onClick={() => setMenu(menu === 'wa' ? null : 'wa')}>{t.wa}</button>
            {menu === 'wa' ? (
              <div className="ops-wa-picks" role="menu">
                <button type="button" onClick={() => void sendImage()}>{t.asImage}</button>
                <button type="button" onClick={sendText}>{t.asText}</button>
              </div>
            ) : null}
          </div>
          <button type="button" className="receipt-choice is-print" onClick={() => window.print()}>{t.print}</button>
        </>
      }
    >
      <div className="receipt-brand">
        <span>{t.receiptLine} · {t.opNo} {row.operationNumber}</span>
      </div>
      <dl className="receipt-lines">
        <div><dt>{t.colDate}</dt><dd>{dateOnly(String(row.transactionDate))}</dd></div>
        <div><dt>{t.type}</dt><dd>{typeLabel(row.exchangeType, t)}</dd></div>
        <div><dt>{t.fund}</dt><dd>{fundLabel(row.fund, t)}{row.bank ? ` · ${row.bank.name}` : ''}</dd></div>
        <div>
          <dt>{t.paid}</dt>
          <dd className={Number(row.exchangeAmount) < 0 ? 'is-neg' : undefined}>
            {money(row.exchangeAmount, row.paidCurrency)} <CurrencyMark code={row.paidCurrency} />
          </dd>
        </div>
        <div><dt>{t.rate}</dt><dd>{rateText(row.exchangeRate)}</dd></div>
        <div>
          <dt>{t.received}</dt>
          <dd className={Number(row.total) < 0 ? 'is-neg' : undefined}>
            {money(row.total, row.receivedCurrency)} <CurrencyMark code={row.receivedCurrency} />
          </dd>
        </div>
        <div><dt>{t.employee}</dt><dd>{row.employee.name}</dd></div>
      </dl>
    </OpsDialog>
  );
}

export function ExchangePanel({ actor, locations, banks, exchanges, funds, onChanged, part = 'form' }: Props) {
  const t = dictionary(useLang()).exchange;
  const isManager = actor.role === 'GENERAL_MANAGER';
  const isEmployee = actor.role === 'EMPLOYEE';
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState<ExchangeRow | null>(null);

  const activeBanks = useMemo(() => {
    const list = banks.filter((row) => row.status === 'ACTIVE');
    if (editing?.bank && !list.some((row) => row.id === editing.bank?.id)) {
      return [{ id: editing.bank.id, name: editing.bank.name, status: 'ACTIVE' as const }, ...list];
    }
    return list;
  }, [banks, editing]);
  const activeLocations = useMemo(
    () => locations.filter((row) => row.status === 'ACTIVE'),
    [locations],
  );

  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [locationId, setLocationId] = useState(activeLocations[0]?.id || actor.locationId || '');
  const [fund, setFund] = useState<(typeof OPERATION_FUNDS)[number]['value']>('VAULT');
  const [bankId, setBankId] = useState(activeBanks[0]?.id || '');
  const [exchangeType, setExchangeType] = useState<ExchangeType>('BUY');
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  function pushToast(text: string, tone: 'ok' | 'err') {
    const id = toastSeq.current + 1;
    toastSeq.current = id;
    setToasts((list) => [...list, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id));
    }, 3200);
  }
  const [saving, setSaving] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<ExchangeRow | null>(null);
  const [loaded, setLoaded] = useState<ExchangeRow[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customSearch, setCustomSearch] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [deleteRow, setDeleteRow] = useState<ExchangeRow | null>(null);
  const [cancelChoice, setCancelChoice] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [filesRow, setFilesRow] = useState<ExchangeRow | null>(null);
  const [viewing, setViewing] = useState<ExchangeRow | null>(null);
  const searchRef = useRef<ExchangeSearch>({ from: todayIso(), to: todayIso() });
  const [dbFrom, setDbFrom] = useState(todayIso());
  const [dbTo, setDbTo] = useState(todayIso());
  const [dbFund, setDbFund] = useState('');
  const [dbType, setDbType] = useState('');
  const [dbPaid, setDbPaid] = useState('');
  const [dbReceived, setDbReceived] = useState('');
  const [dbStatus, setDbStatus] = useState('');
  const [dbBank, setDbBank] = useState('');
  const [dbNotes, setDbNotes] = useState('');
  const [dbOperation, setDbOperation] = useState('');
  const [dbMin, setDbMin] = useState('');
  const [dbMax, setDbMax] = useState('');
  const [fundFilter, setFundFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'new' | 'old'>('new');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!editing && !bankId && activeBanks[0]) setBankId(activeBanks[0].id);
  }, [activeBanks, bankId, editing]);

  useEffect(() => {
    if (!editing && isManager && !locationId && activeLocations[0]) setLocationId(activeLocations[0].id);
  }, [isManager, activeLocations, locationId, editing]);

  const nextOperationNumber = useMemo(() => {
    const mine = exchanges.filter((row) => row.employee.id === actor.id);
    return mine.reduce((max, row) => Math.max(max, row.operationNumber), 0) + 1;
  }, [exchanges, actor.id]);

  useEffect(() => {
    if (lastReceipt) {
      if (lastReceipt.employee.id !== actor.id) {
        setLastReceipt(null);
        return;
      }
      const fresh = exchanges.find((row) => row.id === lastReceipt.id);
      if (fresh && fresh !== lastReceipt) setLastReceipt(fresh);
      return;
    }
    const newest = exchanges.reduce<ExchangeRow | null>((best, row) => {
      if (row.employee.id !== actor.id) return best;
      if (!best || row.operationNumber > best.operationNumber) return row;
      return best;
    }, null);
    if (newest) setLastReceipt(newest);
  }, [exchanges, lastReceipt, actor.id]);

  const dir = direction(exchangeType);
  const amountNum = Number(exchangeAmount) || 0;
  const rateNum = Number(exchangeRate) || 0;
  const total = previewTotal(amountNum, rateNum, exchangeType);
  const snapshot: FundsSnapshot = funds || { vault: [], sham: [], banks: [], advances: [] };

  const visible = useMemo(() => {
    const text = query.trim();
    const rows = loaded.filter((row) => {
      if (fundFilter && row.fund !== fundFilter) return false;
      if (typeFilter && row.exchangeType !== typeFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      const files = attachmentCount(row.attachments);
      if (fileFilter === 'yes' && files === 0) return false;
      if (fileFilter === 'no' && files > 0) return false;
      if (!text) return true;
      const haystack = [
        row.reference,
        String(row.operationNumber),
        row.bank?.name,
        row.notes,
        row.employee.name,
        fundLabel(row.fund, t),
        typeLabel(row.exchangeType, t),
        String(row.exchangeAmount),
        String(row.exchangeRate),
        String(row.total),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(text.toLowerCase());
    });
    rows.sort((a, b) => {
      const byDate = dateOnly(String(a.transactionDate)).localeCompare(dateOnly(String(b.transactionDate)));
      const byNumber = a.operationNumber - b.operationNumber;
      const delta = byDate || byNumber;
      return sortOrder === 'new' ? -delta : delta;
    });
    return rows;
  }, [loaded, fundFilter, typeFilter, statusFilter, fileFilter, sortOrder, query, t]);

  const displayFiltersOn = Boolean(fundFilter || typeFilter || statusFilter || fileFilter || query || sortOrder !== 'new');

  function clearDisplayFilters() {
    setFundFilter('');
    setTypeFilter('');
    setStatusFilter('');
    setFileFilter('');
    setSortOrder('new');
    setQuery('');
  }

  async function loadLog(search: ExchangeSearch) {
    searchRef.current = search;
    setLoadingLog(true);
    try {
      setLoaded(await listExchanges(search));
    } catch (error) {
      pushToast(sectionError(error, t), 'err');
    } finally {
      setLoadingLog(false);
    }
  }

  function runSearch(event?: FormEvent) {
    event?.preventDefault();
    setAdvancedOpen(false);
    const day = todayIso();
    const untouched = dbFrom === day && dbTo === day && !dbFund && !dbType && !dbPaid && !dbReceived && !dbStatus && !dbBank && !dbNotes.trim() && !dbOperation.trim() && !dbMin.trim() && !dbMax.trim();
    setCustomSearch(!untouched);
    void loadLog({
      from: dbFrom, to: dbTo, fund: dbFund, exchangeType: dbType, paidCurrency: dbPaid, receivedCurrency: dbReceived,
      status: dbStatus, bankId: dbBank, notes: dbNotes, operationNumber: dbOperation, minTotal: dbMin, maxTotal: dbMax,
    });
  }

  function showToday() {
    const day = todayIso();
    setAdvancedOpen(false);
    setCustomSearch(false);
    setDbFrom(day); setDbTo(day); setDbFund(''); setDbType(''); setDbPaid(''); setDbReceived(''); setDbStatus(''); setDbBank(''); setDbNotes(''); setDbOperation(''); setDbMin(''); setDbMax('');
    clearDisplayFilters();
    void loadLog({ from: day, to: day });
  }

  useEffect(() => {
    if (part !== 'log') return;
    void loadLog(searchRef.current);
  }, [part, exchanges]);

  function payload(): ExchangeInput {
    return {
      transactionDate,
      fund,
      bankId: fund === 'BANK' ? bankId : undefined,
      exchangeType,
      exchangeAmount: amountNum,
      exchangeRate: rateNum,
      notes,
      locationId: isManager ? locationId : undefined,
    };
  }

  function resetForm() {
    setEditing(null);
    setTransactionDate(todayIso());
    setExchangeAmount('');
    setNotes('');
    setFund('VAULT');
    setExchangeType('BUY');
    setPendingFiles([]);
    if (activeBanks[0]) setBankId(activeBanks[0].id);
  }

  function startEdit(row: ExchangeRow) {
    setEditing(row);
    setTransactionDate(dateOnly(String(row.transactionDate)));
    setLocationId(row.location?.id || actor.locationId || locationId);
    setFund((row.fund === 'BANK' || row.fund === 'SHAM_CASH' ? row.fund : 'VAULT') as typeof fund);
    setBankId(row.bank?.id || activeBanks[0]?.id || '');
    setExchangeType(row.exchangeType);
    setExchangeAmount(String(Number(row.exchangeAmount)));
    setExchangeRate(String(Number(row.exchangeRate)));
    setNotes(row.notes || '');
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  useEffect(() => {
    if (part === 'log') return;
    const id = peekEdit('exchange');
    if (!id) return;
    const row = exchanges.find((item) => item.id === id);
    if (!row) return;
    clearEdit();
    startEdit(row);
  }, [exchanges, part]);

  function askReason(promptText: string, required: boolean) {
    const reason = window.prompt(promptText);
    if (reason === null) return null;
    const text = reason.trim();
    if (required && !text) {
      pushToast(t.reasonRequired, 'err');
      return null;
    }
    return text;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const body = payload();
      if (editing) {
        if (isEmployee) {
          const reason = window.prompt(fill(t.reasonEditOpt, { ref: editing.reference }));
          if (reason === null) return;
          await requestAuditUpdate(editing.reference, body, reason);
          await attachAfterSave(editing.reference, pendingFiles);
          pushToast(fill(t.editSent, { ref: editing.reference }), 'ok');
        } else {
          const reason = askReason(fill(t.reasonUpdate, { ref: editing.reference }), true);
          if (reason === null) return;
          if (!window.confirm(fill(t.confirmUpdate, { ref: editing.reference }))) return;
          const updated = await updateExchange(editing.id, body, reason);
          await attachAfterSave(editing.reference, pendingFiles);
          setLastReceipt(updated);
          pushToast(fill(t.updated, { ref: editing.reference }), 'ok');
        }
        resetForm();
      } else {
        const row = await createExchange(body);
        await attachAfterSave(row.reference, pendingFiles);
        resetForm();
        setLastReceipt(row);
        pushToast(fill(t.saved, { ref: row.reference, n: row.operationNumber }), 'ok');
      }
      await onChanged();
    } catch (error) {
      pushToast(sectionError(error, t), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const reason = editReason.trim();
    if (!reason) {
      pushToast(t.reasonRequired, 'err');
      return;
    }
    setSaving(true);
    try {
      const body = payload();
      if (actor.role === 'GENERAL_MANAGER') {
        const updated = await updateExchange(editing.id, body, reason);
        await attachAfterSave(editing.reference, pendingFiles);
        setLastReceipt(updated);
        pushToast(fill(t.updated, { ref: editing.operationNumber }), 'ok');
      } else {
        await requestAuditUpdate(editing.reference, body, reason);
        await attachAfterSave(editing.reference, pendingFiles);
        pushToast(fill(actor.role === 'SUPERVISOR' ? t.editSentManager : t.editSent, { ref: editing.operationNumber }), 'ok');
      }
      resetForm();
      setEditReason('');
      await onChanged();
    } catch (error) {
      pushToast(sectionError(error, t), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    const reason = (cancelChoice === 'other' ? deleteReason : cancelChoice).trim();
    if (!reason) {
      pushToast(t.reasonRequired, 'err');
      return;
    }
    try {
      if (actor.role === 'GENERAL_MANAGER') {
        await deleteExchange(deleteRow.id, reason);
        pushToast(t.deleted, 'ok');
      } else {
        await requestAuditDelete(deleteRow.reference, reason);
        pushToast(fill(actor.role === 'SUPERVISOR' ? t.deleteSentManager : t.deleteSent, { ref: deleteRow.operationNumber }), 'ok');
      }
      setDeleteRow(null);
      setDeleteReason('');
      await onChanged();
    } catch (error) {
      pushToast(sectionError(error, t), 'err');
    }
  }

  const emptyTotal = dir.to === 'SYP' ? '0' : '0.00';

  return (
    <div className="ops-page">
      {part === 'form' ? (
      <>
      <div className="ops-bal-grid">
        <OpsCard title={t.vault} chip={t.box} collapsible>
          <BalanceChips rows={snapshot.vault} />
        </OpsCard>
        <OpsCard title={t.sham} chip={t.app} collapsible>
          <BalanceChips rows={snapshot.sham} />
        </OpsCard>
        <OpsCard title={t.banks} chip={t.accounts} className="ops-span" collapsible>
          {snapshot.banks.length === 0 ? (
            <span className="ops-bal-empty">{t.noBankAccounts}</span>
          ) : (
            <div className="ops-named-bals">
              {snapshot.banks.map((row) => (
                <div key={row.id} className="ops-named-bal">
                  <div className="ops-named-bal-title">{row.name}</div>
                  <BalanceChips rows={row.balances} />
                </div>
              ))}
            </div>
          )}
        </OpsCard>
      </div>

      <OpsCard
        title={editing ? (isEmployee ? t.editRequest : t.edit) : t.newOp}
        badge={`${t.opNo} ${editing ? editing.operationNumber : nextOperationNumber}`}
        collapsible
        toolbar={
          <>
            <span className="ops-toolbar-group">
              <button
                type="button"
                className={`ops-tool-btn${pendingFiles.length || (editing && attachmentCount(editing.attachments)) ? ' is-on' : ''}`}
                onClick={() => setAttachOpen(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                {t.attach}
              </button>
              {pendingFiles.length || (editing && attachmentCount(editing.attachments)) ? (
                <span className="ops-attach-ok">{t.attached}</span>
              ) : null}
              <button type="button" className="ops-tool-btn ops-last-receipt-btn" onClick={() => (lastReceipt ? setReceiptOpen(true) : pushToast(t.noReceipt, 'err'))}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              {t.lastReceipt}
              {lastReceipt ? <span className="ops-last-receipt-num">#{lastReceipt.operationNumber}</span> : null}
            </button>
            </span>
            <span className="ops-date">{transactionDate}</span>
          </>
        }
      >
        <form ref={formRef} onSubmit={onSubmit}>
          <div className="ops-form-grid">
            {isManager ? (
              <div className="form-group">
                <label className="form-label">{t.office}</label>
                <OpsSelect
                  value={locationId}
                  disabled={Boolean(editing)}
                  onChange={setLocationId}
                  options={activeLocations.map((row) => ({ value: row.id, label: row.name }))}
                />
              </div>
            ) : null}
            <div className="form-group">
              <label className="form-label">{t.txDate}</label>
              <input
                className="form-control"
                required
                type="date"
                value={transactionDate}
                onChange={(event) => setTransactionDate(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t.fund}</label>
              <OpsSelect
                value={fund}
                onChange={(next) => setFund(next as (typeof OPERATION_FUNDS)[number]['value'])}
                options={[
                  { value: 'VAULT', label: t.fundVault },
                  { value: 'SHAM_CASH', label: t.fundSham },
                  { value: 'BANK', label: t.fundBank },
                ]}
              />
            </div>
            {fund === 'BANK' ? (
              <div className="form-group">
                <label className="form-label">{t.bank}</label>
                <OpsSelect
                  value={bankId}
                  placeholder={t.noBanks}
                  onChange={setBankId}
                  options={activeBanks.map((row) => ({ value: row.id, label: row.name }))}
                />
              </div>
            ) : null}
            <div className="form-group">
              <label className="form-label">{t.type}</label>
              <OpsSelect
                value={exchangeType}
                onChange={(next) => setExchangeType(next as ExchangeType)}
                options={[
                  { value: 'BUY', label: t.buy },
                  { value: 'SELL', label: t.sell },
                ]}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t.paid}</label>
              <div className="form-control ops-ccy-read">
                <CurrencyMark code={dir.from} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t.received}</label>
              <div className="form-control ops-ccy-read">
                <CurrencyMark code={dir.to} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t.amount}</label>
              <input
                className="form-control input-amount"
                required
                inputMode="decimal"
                placeholder="0.00"
                value={exchangeAmount}
                onChange={(event) => setExchangeAmount(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t.rate}</label>
              <input
                className="form-control input-amount"
                required
                inputMode="decimal"
                placeholder="0"
                value={exchangeRate}
                onChange={(event) => setExchangeRate(event.target.value)}
              />
              <span className="ops-field-hint">{t.rateHint}</span>
            </div>
            <div className="form-group">
              <label className="form-label">{t.notes}</label>
              <input className="form-control" placeholder="..." value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
          </div>
          <div className="ops-action-row">
            <div className="ops-total-box">
              <div className="ops-total-label">{t.total}</div>
              <div className={`ops-total-value${total < 0 ? ' is-neg' : ''}`}>
                <span>{total !== 0 ? money(total, dir.to) : emptyTotal}</span>
                <CurrencyMark code={dir.to} />
              </div>
            </div>
            <div className="ops-submit-stack">
              <button type="submit" className="btn-submit-action ops-submit-btn" disabled={saving || (fund === 'BANK' && !bankId)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {editing && isEmployee ? t.sendEdit : t.save}
              </button>
              {editing ? (
                <button type="button" className="btn-submit-action btn-soft ops-submit-btn" onClick={() => resetForm()}>
                  {t.cancel}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </OpsCard>

      {attachOpen ? (
        <div className="attach-modal-backdrop" onClick={() => setAttachOpen(false)}>
          <div className="attach-modal" role="dialog" aria-modal="true" aria-label={t.attachTitle} onClick={(event) => event.stopPropagation()}>
            <div className="attach-modal-head">
              <strong>{t.attachTitle}</strong>
              <button type="button" className="paper-x" onClick={() => setAttachOpen(false)} aria-label={t.close}>×</button>
            </div>
            <AttachmentsBox
              reference={editing?.reference}
              pendingFiles={pendingFiles}
              onPendingFiles={setPendingFiles}
              disabled={saving}
              hint={t.drop}
              pendingLabel={t.pendingSave}
              removeLabel={t.removeFile}
              uploadLabel={t.uploadNow}
              uploadingLabel={t.uploading}
            />
          </div>
        </div>
      ) : null}
      {receiptOpen && lastReceipt ? <ReceiptSheet row={lastReceipt} onClose={() => setReceiptOpen(false)} /> : null}
      </>
      ) : (
      <OpsCard title={t.log}>
        <div className="ops-log-tools">
          <button type="button" className="ops-log-advanced-toggle" onClick={() => setAdvancedOpen(true)}><span>{t.advancedSearch}</span></button>
          {customSearch ? <button type="button" className="ops-log-advanced-toggle" onClick={showToday}>{t.resetSearch}</button> : null}
          <button type="button" className="ops-log-advanced-toggle" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}><span>{t.filter}</span><span aria-hidden="true">{filtersOpen ? '▴' : '▾'}</span></button>
          {displayFiltersOn ? <button type="button" className="btn-ghost ops-log-clear" onClick={clearDisplayFilters}>{t.clearFilters}</button> : null}
        </div>
        {advancedOpen ? (
          <OpsDialog title={t.advancedSearch} onClose={() => setAdvancedOpen(false)} closeLabel={t.close} wide>
            <form className="ops-search-modal" onSubmit={runSearch}>
              <div className="form-group"><label className="form-label">{t.fromDate}</label><input className="form-control" type="date" value={dbFrom} onChange={(event) => setDbFrom(event.target.value)} /></div>
              <div className="form-group"><label className="form-label">{t.toDate}</label><input className="form-control" type="date" value={dbTo} onChange={(event) => setDbTo(event.target.value)} /></div>
              <div className="form-group"><label className="form-label">{t.fund}</label><OpsSelect value={dbFund} onChange={setDbFund} options={[{ value: '', label: t.all }, ...OPERATION_FUNDS.map((item) => ({ value: item.value, label: fundLabel(item.value, t) }))]} /></div>
              <div className="form-group"><label className="form-label">{t.bank}</label><OpsSelect value={dbBank} onChange={setDbBank} options={[{ value: '', label: t.all }, ...banks.map((row) => ({ value: row.id, label: row.name }))]} /></div>
              <div className="form-group"><label className="form-label">{t.type}</label><OpsSelect value={dbType} onChange={setDbType} options={[{ value: '', label: t.all }, { value: 'BUY', label: t.buy }, { value: 'SELL', label: t.sell }]} /></div>
              <div className="form-group"><label className="form-label">{t.paid}</label><OpsSelect value={dbPaid} onChange={setDbPaid} options={[{ value: '', label: t.all }, ...CURRENCIES.map((item) => ({ value: item.value, label: <CurrencyMark code={item.value} /> }))]} /></div>
              <div className="form-group"><label className="form-label">{t.received}</label><OpsSelect value={dbReceived} onChange={setDbReceived} options={[{ value: '', label: t.all }, ...CURRENCIES.map((item) => ({ value: item.value, label: <CurrencyMark code={item.value} /> }))]} /></div>
              <div className="form-group"><label className="form-label">{t.status}</label><OpsSelect value={dbStatus} onChange={setDbStatus} options={[{ value: '', label: t.all }, { value: 'COMPLETED', label: t.completed }, { value: 'PENDING_APPROVAL', label: t.pending }]} /></div>
              <div className="form-group"><label className="form-label">{t.notes}</label><input className="form-control" value={dbNotes} onChange={(event) => setDbNotes(event.target.value)} /></div>
              <div className="form-group"><label className="form-label">{t.opNo}</label><input className="form-control" inputMode="numeric" value={dbOperation} onChange={(event) => setDbOperation(event.target.value)} /></div>
              <div className="form-group"><label className="form-label">{t.rangeFrom}</label><input className="form-control" inputMode="decimal" value={dbMin} onChange={(event) => setDbMin(event.target.value)} /></div>
              <div className="form-group"><label className="form-label">{t.rangeTo}</label><input className="form-control" inputMode="decimal" value={dbMax} onChange={(event) => setDbMax(event.target.value)} /></div>
              <div className="ops-log-search-actions"><button type="submit" className="btn" disabled={loadingLog}>{loadingLog ? t.searching : t.runSearch}</button></div>
            </form>
          </OpsDialog>
        ) : null}
        <div className={`ops-log-collapse${filtersOpen ? ' is-open' : ''}`}><div className="ops-log-collapse-inner"><div className="ops-log-quick is-register">
          <div className="form-group"><label className="form-label">{t.order}</label><OpsSelect value={sortOrder} onChange={(next) => setSortOrder(next as 'new' | 'old')} options={[{ value: 'new', label: t.newest }, { value: 'old', label: t.oldest }]} /></div>
          <div className="form-group"><label className="form-label">{t.fund}</label><OpsSelect value={fundFilter} onChange={setFundFilter} options={[{ value: '', label: t.all }, ...OPERATION_FUNDS.map((item) => ({ value: item.value, label: fundLabel(item.value, t) }))]} /></div>
          <div className="form-group"><label className="form-label">{t.type}</label><OpsSelect value={typeFilter} onChange={setTypeFilter} options={[{ value: '', label: t.all }, { value: 'BUY', label: t.buy }, { value: 'SELL', label: t.sell }]} /></div>
          <div className="form-group"><label className="form-label">{t.status}</label><OpsSelect value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: t.all }, { value: 'COMPLETED', label: t.completed }, { value: 'PENDING_APPROVAL', label: t.pending }]} /></div>
          <div className="form-group"><label className="form-label">{t.colAttach}</label><OpsSelect value={fileFilter} onChange={setFileFilter} options={[{ value: '', label: t.all }, { value: 'yes', label: t.hasFiles }, { value: 'no', label: t.noFiles }]} /></div>
        </div></div></div>
        <div className="ops-log-live-search"><input className="form-control" value={query} placeholder={t.searchPh} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="ops-log-count-line">{loadingLog ? t.searching : fill(t.shownCount, { n: visible.length })}</div>
        {visible.length === 0 ? (
          <p className="ops-log-empty">{loaded.length === 0 ? t.emptyRange : t.noResults}</p>
        ) : (
          <div className="ops-table-wrap">
            <table className="premium-table ops-log-table">
              <thead>
                <tr>
                  <th>{t.opNo}</th>
                  <th>{t.colDate}</th>
                  <th>{t.colType}</th>
                  <th>{t.colFund}</th>
                  <th>{t.paid}</th>
                  <th>{t.rate}</th>
                  <th>{t.received}</th>
                  <th>{t.notes}</th>
                  <th>{t.status}</th>
                  <th>{t.colAttach}</th>
                  <th>{t.colAction}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const locked = row.status !== 'COMPLETED' || actor.role === 'MONITOR';
                  return (
                    <tr key={row.id}>
                      <td>{row.operationNumber}</td>
                      <td><span className="ops-log-date">{dateOnly(String(row.transactionDate))}</span>{clockTime(row.systemDate) ? <span className="ops-log-clock">{clockTime(row.systemDate)}</span> : null}</td>
                      <td>{typeLabel(row.exchangeType, t)}</td>
                      <td>
                        {fundLabel(row.fund, t)}
                        {row.bank ? ` · ${row.bank.name}` : ''}
                      </td>
                      <td>
                        <span className={`ops-log-num${Number(row.exchangeAmount) < 0 ? ' is-neg' : ''}`}>{money(row.exchangeAmount, row.paidCurrency)}</span>{' '}
                        <CurrencyMark code={row.paidCurrency} />
                      </td>
                      <td><span className="ops-log-num">{row.exchangeRate}</span></td>
                      <td>
                        <span className={`ops-log-num${Number(row.total) < 0 ? ' is-neg' : ''}`}>{money(row.total, row.receivedCurrency)}</span>{' '}
                        <CurrencyMark code={row.receivedCurrency} />
                      </td>
                      <td className="ops-log-note">{row.notes || '—'}</td>
                      <td><span className={`ops-status${row.status === 'COMPLETED' ? ' is-ok' : ' is-wait'}`}>{row.status === 'COMPLETED' ? t.completed : t.pending}</span></td>
                      <td>{attachmentCount(row.attachments) > 0 ? <button type="button" className="ops-mini-btn" onClick={() => setFilesRow(row)}>{t.viewFiles}</button> : '—'}</td>
                      <td>
                        <div className="ops-log-actions">
                          <button type="button" className="ops-mini-btn" onClick={() => setViewing(row)}>{t.print}</button>
                          <button type="button" className="ops-mini-btn" disabled={locked} onClick={() => { startEdit(row); setEditReason(''); }}>{t.edit}</button>
                          <button
                            type="button"
                            className="ops-mini-btn is-danger"
                            disabled={locked}
                            onClick={() => { setDeleteRow(row); setCancelChoice(''); setDeleteReason(''); }}
                          >
                            {t.cancelOp}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {viewing ? <ReceiptSheet row={viewing} onClose={() => setViewing(null)} /> : null}
        {editing ? (
          <OpsDialog title={`${t.editTitle} ${editing.operationNumber}`} onClose={() => { resetForm(); setEditReason(''); }} closeLabel={t.close} wide>
            <form onSubmit={saveEdit}>
              <div className="ops-form-grid">
                {isManager ? (
                  <div className="form-group">
                    <label className="form-label">{t.office}</label>
                    <OpsSelect value={locationId} onChange={setLocationId} options={activeLocations.map((row) => ({ value: row.id, label: row.name }))} />
                  </div>
                ) : null}
                <div className="form-group">
                  <label className="form-label">{t.txDate}</label>
                  <input className="form-control" required type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.fund}</label>
                  <OpsSelect value={fund} onChange={(next) => setFund(next as typeof fund)} options={OPERATION_FUNDS.map((item) => ({ value: item.value, label: fundLabel(item.value, t) }))} />
                </div>
                {fund === 'BANK' ? (
                  <div className="form-group">
                    <label className="form-label">{t.bank}</label>
                    <OpsSelect value={bankId} onChange={setBankId} options={activeBanks.map((row) => ({ value: row.id, label: row.name }))} />
                  </div>
                ) : null}
                <div className="form-group">
                  <label className="form-label">{t.type}</label>
                  <OpsSelect
                    value={exchangeType}
                    onChange={(next) => setExchangeType(next as ExchangeType)}
                    options={[
                      { value: 'BUY', label: t.buy },
                      { value: 'SELL', label: t.sell },
                    ]}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.paid}</label>
                  <div className="form-control ops-ccy-read">
                    <CurrencyMark code={dir.from} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t.received}</label>
                  <div className="form-control ops-ccy-read">
                    <CurrencyMark code={dir.to} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t.amount}</label>
                  <input className="form-control" required inputMode="decimal" value={exchangeAmount} onChange={(event) => setExchangeAmount(event.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.rate}</label>
                  <input className="form-control" required inputMode="decimal" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.notes}</label>
                  <input className="form-control" value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.reasonLabel}</label>
                  <input className="form-control" value={editReason} onChange={(event) => setEditReason(event.target.value)} />
                </div>
              </div>
              <AttachmentsBox
                reference={editing.reference}
                pendingFiles={pendingFiles}
                onPendingFiles={setPendingFiles}
                disabled={saving}
                hint={t.drop}
                pendingLabel={t.pendingSave}
                removeLabel={t.removeFile}
                uploadLabel={t.uploadNow}
                uploadingLabel={t.uploading}
              />
              <div className="ops-dialog-actions">
                <button type="button" className="btn-ghost" onClick={() => { resetForm(); setEditReason(''); }}>{t.cancel}</button>
                <button type="submit" className="btn" disabled={saving || (fund === 'BANK' && !bankId)}>
                  {actor.role === 'GENERAL_MANAGER' ? t.save : t.sendEdit}
                </button>
              </div>
            </form>
          </OpsDialog>
        ) : null}
        {deleteRow ? (
          <OpsDialog title={t.deleteTitle} onClose={() => setDeleteRow(null)} closeLabel={t.close} danger>
            <div className="form-group">
              <label className="form-label">{t.cancelQuick}</label>
              <OpsSelect
                value={cancelChoice}
                placeholder={t.pickReason}
                onChange={setCancelChoice}
                options={[
                  { value: '', label: t.pickReason },
                  { value: t.reasonAmount, label: t.reasonAmount },
                  { value: t.reasonCurrency, label: t.reasonCurrency },
                  { value: t.reasonCustomer, label: t.reasonCustomer },
                  { value: 'other', label: t.reasonOther },
                ]}
              />
            </div>
            {cancelChoice === 'other' ? (
              <div className="form-group">
                <label className="form-label">{t.reasonLabel}</label>
                <textarea className="form-control ops-reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} rows={3} />
              </div>
            ) : null}
            <div className="ops-cancel-actions">
              <button type="button" className="ops-cancel-dismiss" onClick={() => setDeleteRow(null)}>{t.cancelOp}</button>
              <button type="button" className="ops-cancel-send" onClick={() => void confirmDelete()}>
                {actor.role === 'GENERAL_MANAGER' ? t.confirmCancel : t.sendDelete}
              </button>
            </div>
          </OpsDialog>
        ) : null}
        {filesRow ? (
          <FileViewer
            reference={filesRow.reference}
            title={`${t.colAttach} · ${t.opNo} ${filesRow.operationNumber}`}
            closeLabel={t.close}
            onClose={() => setFilesRow(null)}
          />
        ) : null}
      </OpsCard>
      )}
      <div className="ops-toasts" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`ops-toast${item.tone === 'err' ? ' is-err' : ''}`} role="status">
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}
