'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AttachmentsBox } from './attachments-box';
import { FileViewer } from './file-viewer';
import { OpsDialog } from './ops-dialog';
import { CurrencyMark, CurrencySelect } from './currency-mark';
import { OpsCard } from './ops-card';
import { OpsSelect } from './ops-select';
import {
  AuthUser,
  CURRENCIES,
  CurrencyCode,
  FundsSnapshot,
  INCOME_FUNDS,
  LocationRow,
  NamedRecord,
  OutcomeInput,
  OutcomeRow,
  OutcomeSearch,
  ProjectRow,
  attachAfterSave,
  attachmentCount,
  createOutcome,
  deleteOutcome,
  listOutcomes,
  requestAuditDelete,
  requestAuditUpdate,
  updateOutcome,
} from '../lib/api';
import { clearEdit, peekEdit } from '../lib/edit-handoff';
import { Dictionary, fill, dictionary } from '../lib/i18n';
import { masterErrorMessage } from '../lib/master-errors';
import { useLang } from '../lib/use-lang';

type Props = {
  actor: AuthUser;
  locations: LocationRow[];
  projects: ProjectRow[];
  banks: NamedRecord[];
  outcomes: OutcomeRow[];
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

function operationMoney(value: string | number | null | undefined) {
  return signedAmount(Number(value || 0), 2, 4);
}

function quantityText(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  const text = Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 4 });
  return amount < 0 ? `(${text})` : text;
}

function fundLabel(fund: string, t: Dictionary['outcome']) {
  if (fund === 'SHAM_CASH') return t.fundSham;
  if (fund === 'BANK') return t.fundBank;
  if (fund === 'VAULT') return t.fundVault;
  return fund;
}

function sectionError(error: unknown, t: Dictionary['outcome']) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code || '') : '';
  const map: Record<string, string> = {
    PROJECT_REQUIRED: t.errProject,
    PROJECT_NOT_FOR_OUTCOME: t.errProjectOutcome,
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
    OUTCOME_NOT_FOUND: t.errMissing,
    OP_NOT_FOUND: t.errMissing,
    FORBIDDEN: t.errForbidden,
  };
  return map[code] || masterErrorMessage(error);
}

function currencyLabel(code: string) {
  return CURRENCIES.find((item) => item.value === code)?.label || code;
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

function namesIn(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'ar'));
}

function BalanceChips({ rows }: { rows: { currency: CurrencyCode; amount: number }[] }) {
  const t = dictionary(useLang()).outcome;
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

function receiptLines(row: OutcomeRow, t: Dictionary['outcome']) {
  return [
    [t.opNo, String(row.operationNumber)],
    [t.colDate, dateOnly(String(row.transactionDate))],
    [t.project, row.project?.name || '—'],
    [t.fund, `${fundLabel(row.fund, t)}${row.bank ? ` · ${row.bank.name}` : ''}`],
    [t.deliverer, row.deliverer || '—'],
    [t.receiver, row.receiver || '—'],
    [t.currency, row.currency === 'SYP' ? t.syp : t.usd],
    [t.quantity, quantityText(row.quantity)],
    [t.amount, money(row.amount, row.currency)],
    [t.total, money(row.total, row.currency)],
    [t.employee, row.employee.name],
  ];
}

function receiptText(row: OutcomeRow, t: Dictionary['outcome']) {
  return ['TRADIVIA', t.receiptLine, ...receiptLines(row, t).map(([label, value]) => `${label}: ${value}`)].join('\n');
}

function drawReceipt(row: OutcomeRow, t: Dictionary['outcome']) {
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

async function receiptImage(row: OutcomeRow, t: Dictionary['outcome']) {
  const canvas = drawReceipt(row, t);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((file) => (file ? resolve(file) : reject(new Error('image'))), 'image/png');
  });
  return { canvas, blob };
}

function ReceiptSheet({ row, onClose }: { row: OutcomeRow; onClose: () => void }) {
  const t = dictionary(useLang()).outcome;
  const [menu, setMenu] = useState<'wa' | null>(null);
  const fileBase = `tradivia-outcome-${row.operationNumber}`;

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
        <div><dt>{t.project}</dt><dd>{row.project?.name || '—'}</dd></div>
        <div><dt>{t.fund}</dt><dd>{fundLabel(row.fund, t)}{row.bank ? ` · ${row.bank.name}` : ''}</dd></div>
        <div><dt>{t.deliverer}</dt><dd>{row.deliverer || '—'}</dd></div>
        <div><dt>{t.receiver}</dt><dd>{row.receiver || '—'}</dd></div>
        <div><dt>{t.currency}</dt><dd><CurrencyMark code={row.currency} /></dd></div>
        <div><dt>{t.quantity}</dt><dd className={Number(row.quantity) < 0 ? 'is-neg' : undefined}>{quantityText(row.quantity)}</dd></div>
        <div><dt>{t.amount}</dt><dd className={Number(row.amount) < 0 ? 'is-neg' : undefined}>{money(row.amount, row.currency)}</dd></div>
        <div><dt>{t.total}</dt><dd className={Number(row.total) < 0 ? 'is-neg' : undefined}>{money(row.total, row.currency)}</dd></div>
        <div><dt>{t.employee}</dt><dd>{row.employee.name}</dd></div>
      </dl>
    </OpsDialog>
  );
}

export function OutcomePanel({ actor, locations, projects, banks, outcomes, funds, onChanged, part = 'form' }: Props) {
  const t = dictionary(useLang()).outcome;
  const isManager = actor.role === 'GENERAL_MANAGER';
  const isEmployee = actor.role === 'EMPLOYEE';
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState<OutcomeRow | null>(null);

  const outcomeProjects = useMemo(() => {
    const list = projects.filter((row) => row.status === 'ACTIVE' && row.showIn.includes('OUTCOME'));
    if (editing?.project && !list.some((row) => row.id === editing.project?.id)) {
      return [
        { id: editing.project.id, name: editing.project.name, status: 'ACTIVE' as const, showIn: ['OUTCOME'] },
        ...list,
      ];
    }
    return list;
  }, [projects, editing]);
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
  const [projectId, setProjectId] = useState(outcomeProjects[0]?.id || '');
  const [description, setDescription] = useState('');
  const [fund, setFund] = useState<(typeof INCOME_FUNDS)[number]['value']>('VAULT');
  const [bankId, setBankId] = useState(activeBanks[0]?.id || '');
  const [deliverer, setDeliverer] = useState('');
  const [receiver, setReceiver] = useState('');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]['value']>('USD');
  const [fxRate, setFxRate] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('');
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
  const [lastReceipt, setLastReceipt] = useState<OutcomeRow | null>(null);
  const [loaded, setLoaded] = useState<OutcomeRow[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customSearch, setCustomSearch] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [deleteRow, setDeleteRow] = useState<OutcomeRow | null>(null);
  const [cancelChoice, setCancelChoice] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [filesRow, setFilesRow] = useState<OutcomeRow | null>(null);
  const [viewing, setViewing] = useState<OutcomeRow | null>(null);
  const searchRef = useRef<OutcomeSearch>({ from: todayIso(), to: todayIso() });
  const [dbFrom, setDbFrom] = useState(todayIso());
  const [dbTo, setDbTo] = useState(todayIso());
  const [dbFund, setDbFund] = useState('');
  const [dbCurrency, setDbCurrency] = useState('');
  const [dbStatus, setDbStatus] = useState('');
  const [dbProject, setDbProject] = useState('');
  const [dbBank, setDbBank] = useState('');
  const [dbDeliverer, setDbDeliverer] = useState('');
  const [dbReceiver, setDbReceiver] = useState('');
  const [dbDescription, setDbDescription] = useState('');
  const [dbNotes, setDbNotes] = useState('');
  const [dbOperation, setDbOperation] = useState('');
  const [dbMin, setDbMin] = useState('');
  const [dbMax, setDbMax] = useState('');
  const [fundFilter, setFundFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [delivererFilter, setDelivererFilter] = useState('');
  const [receiverFilter, setReceiverFilter] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'new' | 'old'>('new');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!editing && !projectId && outcomeProjects[0]) setProjectId(outcomeProjects[0].id);
  }, [outcomeProjects, projectId, editing]);

  useEffect(() => {
    if (!editing && !bankId && activeBanks[0]) setBankId(activeBanks[0].id);
  }, [activeBanks, bankId, editing]);

  useEffect(() => {
    if (!editing && isManager && !locationId && activeLocations[0]) setLocationId(activeLocations[0].id);
  }, [isManager, activeLocations, locationId, editing]);

  const nextOperationNumber = useMemo(() => {
    const mine = outcomes.filter((row) => row.employee.id === actor.id);
    return mine.reduce((max, row) => Math.max(max, row.operationNumber), 0) + 1;
  }, [outcomes, actor.id]);

  useEffect(() => {
    if (lastReceipt) {
      if (lastReceipt.employee.id !== actor.id) {
        setLastReceipt(null);
        return;
      }
      const fresh = outcomes.find((row) => row.id === lastReceipt.id);
      if (fresh && fresh !== lastReceipt) setLastReceipt(fresh);
      return;
    }
    const newest = outcomes.reduce<OutcomeRow | null>((best, row) => {
      if (row.employee.id !== actor.id) return best;
      if (!best || row.operationNumber > best.operationNumber) return row;
      return best;
    }, null);
    if (newest) setLastReceipt(newest);
  }, [outcomes, lastReceipt, actor.id]);

  const qtyNum = Number(quantity) || 0;
  const amountNum = Number(amount) || 0;
  const total = qtyNum > 0 ? qtyNum * amountNum : amountNum;
  const snapshot: FundsSnapshot = funds || { vault: [], sham: [], banks: [], advances: [] };

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    const rows = loaded.filter((row) => {
      if (fundFilter && row.fund !== fundFilter) return false;
      if (currencyFilter && row.currency !== currencyFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (projectFilter && row.project?.id !== projectFilter) return false;
      if (bankFilter && (row.bank?.name || '') !== bankFilter) return false;
      if (delivererFilter && (row.deliverer || '') !== delivererFilter) return false;
      if (receiverFilter && (row.receiver || '') !== receiverFilter) return false;
      const files = attachmentCount(row.attachments);
      if (fileFilter === 'yes' && files === 0) return false;
      if (fileFilter === 'no' && files > 0) return false;
      if (!text) return true;
      const haystack = [
        String(row.operationNumber),
        row.project?.name,
        row.bank?.name,
        row.description,
        row.deliverer,
        row.receiver,
        row.notes,
        row.employee.name,
        fundLabel(row.fund, t),
        currencyLabel(row.currency),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(text);
    });
    rows.sort((a, b) => {
      const byDate = dateOnly(String(a.transactionDate)).localeCompare(dateOnly(String(b.transactionDate)));
      const byNumber = a.operationNumber - b.operationNumber;
      const delta = byDate || byNumber;
      return sortOrder === 'new' ? -delta : delta;
    });
    return rows;
  }, [loaded, fundFilter, currencyFilter, statusFilter, projectFilter, bankFilter, delivererFilter, receiverFilter, fileFilter, sortOrder, query, t]);

  const logBanks = useMemo(() => namesIn(loaded.map((row) => row.bank?.name)), [loaded]);
  const logDeliverers = useMemo(() => namesIn(loaded.map((row) => row.deliverer)), [loaded]);
  const logReceivers = useMemo(() => namesIn(loaded.map((row) => row.receiver)), [loaded]);
  const displayFiltersOn = Boolean(
    fundFilter || currencyFilter || statusFilter || projectFilter || bankFilter || delivererFilter.trim() || receiverFilter.trim() || fileFilter || query || sortOrder !== 'new',
  );

  function clearDisplayFilters() {
    setFundFilter('');
    setCurrencyFilter('');
    setStatusFilter('');
    setProjectFilter('');
    setBankFilter('');
    setDelivererFilter('');
    setReceiverFilter('');
    setFileFilter('');
    setSortOrder('new');
    setQuery('');
  }

  async function loadLog(search: OutcomeSearch) {
    searchRef.current = search;
    setLoadingLog(true);
    try {
      setLoaded(await listOutcomes(search));
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
    const untouched =
      dbFrom === day && dbTo === day && !dbFund && !dbCurrency && !dbStatus && !dbProject && !dbBank &&
      !dbDeliverer.trim() && !dbReceiver.trim() && !dbDescription.trim() && !dbNotes.trim() && !dbOperation.trim() && !dbMin.trim() && !dbMax.trim();
    setCustomSearch(!untouched);
    void loadLog({
      from: dbFrom, to: dbTo, fund: dbFund, currency: dbCurrency, status: dbStatus, projectId: dbProject, bankId: dbBank,
      deliverer: dbDeliverer, receiver: dbReceiver, description: dbDescription, notes: dbNotes, operationNumber: dbOperation, minTotal: dbMin, maxTotal: dbMax,
    });
  }

  function showToday() {
    const day = todayIso();
    setAdvancedOpen(false);
    setCustomSearch(false);
    setDbFrom(day); setDbTo(day); setDbFund(''); setDbCurrency(''); setDbStatus(''); setDbProject(''); setDbBank('');
    setDbDeliverer(''); setDbReceiver(''); setDbDescription(''); setDbNotes(''); setDbOperation(''); setDbMin(''); setDbMax('');
    clearDisplayFilters();
    void loadLog({ from: day, to: day });
  }

  useEffect(() => {
    if (part !== 'log') return;
    void loadLog(searchRef.current);
  }, [part, outcomes]);

  function payload(): OutcomeInput {
    return {
      transactionDate,
      projectId,
      description,
      fund,
      bankId: fund === 'BANK' ? bankId : undefined,
      deliverer,
      receiver,
      currency,
      ...(fxRate ? { fxRate: Number(fxRate) } : {}),
      quantity: qtyNum > 0 ? qtyNum : 1,
      amount: amountNum,
      notes,
      locationId: isManager ? locationId : undefined,
    };
  }

  function resetForm() {
    setEditing(null);
    setTransactionDate(todayIso());
    setDescription('');
    setDeliverer('');
    setReceiver('');
    setAmount('');
    setNotes('');
    setQuantity('1');
    setFund('VAULT');
    setCurrency('USD');
    setFxRate('');
    setPendingFiles([]);
    if (outcomeProjects[0]) setProjectId(outcomeProjects[0].id);
    if (activeBanks[0]) setBankId(activeBanks[0].id);
  }

  function startEdit(row: OutcomeRow) {
    setEditing(row);
    setTransactionDate(dateOnly(String(row.transactionDate)));
    setLocationId(row.location?.id || actor.locationId || locationId);
    setProjectId(row.project?.id || '');
    setDescription(row.description || '');
    setFund((row.fund === 'BANK' || row.fund === 'SHAM_CASH' ? row.fund : 'VAULT') as typeof fund);
    setBankId(row.bank?.id || activeBanks[0]?.id || '');
    setDeliverer(row.deliverer || '');
    setReceiver(row.receiver || '');
    setCurrency(row.currency);
    setFxRate(row.fxRate ? String(Number(row.fxRate)) : '');
    setQuantity(String(Number(row.quantity || 1)));
    setAmount(String(Number(row.amount)));
    setNotes(row.notes || '');
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  useEffect(() => {
    if (part === 'log') return;
    const id = peekEdit('outcome');
    if (!id) return;
    const row = outcomes.find((item) => item.id === id);
    if (!row) return;
    clearEdit();
    startEdit(row);
  }, [outcomes, part]);

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
          const updated = await updateOutcome(editing.id, body, reason);
          await attachAfterSave(editing.reference, pendingFiles);
          setLastReceipt(updated);
          pushToast(fill(t.updated, { ref: editing.reference }), 'ok');
        }
        resetForm();
      } else {
        const row = await createOutcome(body);
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
        const updated = await updateOutcome(editing.id, body, reason);
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
        await deleteOutcome(deleteRow.id, reason);
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
        {outcomeProjects.length === 0 ? (
          <p className="ops-log-empty">{t.noProject}</p>
        ) : (
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
                  onChange={(next) => setFund(next as (typeof INCOME_FUNDS)[number]['value'])}
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
                <label className="form-label">{t.project}</label>
                <OpsSelect
                  value={projectId}
                  onChange={setProjectId}
                  options={outcomeProjects.map((row) => ({ value: row.id, label: row.name }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.description}</label>
                <input className="form-control" value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t.deliverer}</label>
                <input className="form-control" value={deliverer} onChange={(event) => setDeliverer(event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t.receiver}</label>
                <input className="form-control" value={receiver} onChange={(event) => setReceiver(event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t.currency}</label>
                <CurrencySelect value={currency} onChange={setCurrency} />
              </div>
              {currency === 'SYP' ? (
                <div className="form-group">
                  <label className="form-label">سعر الصرف</label>
                  <input className="form-control" inputMode="decimal" value={fxRate} placeholder="ل.س / دولار" onChange={(event) => setFxRate(event.target.value)} />
                </div>
              ) : null}
              <div className="form-group">
                <label className="form-label">{t.quantity}</label>
                <input
                  className="form-control input-amount"
                  required
                  inputMode="decimal"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.amount}</label>
                <input
                  className="form-control input-amount"
                  required
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
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
                  <span>{total !== 0 ? operationMoney(total) : '0.00'}</span>
                  <CurrencyMark code={currency} />
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
        )}
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
          <button type="button" className="ops-log-advanced-toggle" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
            <span>{t.filter}</span><span aria-hidden="true">{filtersOpen ? '▴' : '▾'}</span>
          </button>
          {displayFiltersOn ? <button type="button" className="btn-ghost ops-log-clear" onClick={clearDisplayFilters}>{t.clearFilters}</button> : null}
        </div>
        {advancedOpen ? (
          <OpsDialog title={t.advancedSearch} onClose={() => setAdvancedOpen(false)} closeLabel={t.close} wide>
            <form className="ops-search-modal" onSubmit={runSearch}>
              <div className="form-group"><label className="form-label">{t.fromDate}</label><input className="form-control" type="date" value={dbFrom} onChange={(event) => setDbFrom(event.target.value)} /></div>
              <div className="form-group"><label className="form-label">{t.toDate}</label><input className="form-control" type="date" value={dbTo} onChange={(event) => setDbTo(event.target.value)} /></div>
              <div className="form-group"><label className="form-label">{t.fund}</label><OpsSelect value={dbFund} onChange={setDbFund} options={[{ value: '', label: t.all }, ...INCOME_FUNDS.map((item) => ({ value: item.value, label: fundLabel(item.value, t) }))]} /></div>
              <div className="form-group"><label className="form-label">{t.bank}</label><OpsSelect value={dbBank} onChange={setDbBank} options={[{ value: '', label: t.all }, ...banks.map((row) => ({ value: row.id, label: row.name }))]} /></div>
              <div className="form-group"><label className="form-label">{t.project}</label><OpsSelect value={dbProject} onChange={setDbProject} options={[{ value: '', label: t.all }, ...projects.map((row) => ({ value: row.id, label: row.name }))]} /></div>
              <div className="form-group"><label className="form-label">{t.currency}</label><OpsSelect value={dbCurrency} onChange={setDbCurrency} options={[{ value: '', label: t.all }, ...CURRENCIES.map((item) => ({ value: item.value, label: <CurrencyMark code={item.value} /> }))]} /></div>
              <div className="form-group"><label className="form-label">{t.status}</label><OpsSelect value={dbStatus} onChange={setDbStatus} options={[{ value: '', label: t.all }, { value: 'COMPLETED', label: t.completed }, { value: 'PENDING_APPROVAL', label: t.pending }]} /></div>
              <div className="form-group"><label className="form-label">{t.deliverer}</label><input className="form-control" value={dbDeliverer} onChange={(event) => setDbDeliverer(event.target.value)} /></div>
              <div className="form-group"><label className="form-label">{t.receiver}</label><input className="form-control" value={dbReceiver} onChange={(event) => setDbReceiver(event.target.value)} /></div>
              <div className="form-group"><label className="form-label">{t.description}</label><input className="form-control" value={dbDescription} onChange={(event) => setDbDescription(event.target.value)} /></div>
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
          <div className="form-group"><label className="form-label">{t.fund}</label><OpsSelect value={fundFilter} onChange={setFundFilter} options={[{ value: '', label: t.all }, ...INCOME_FUNDS.map((item) => ({ value: item.value, label: fundLabel(item.value, t) }))]} /></div>
          <div className="form-group"><label className="form-label">{t.currency}</label><OpsSelect value={currencyFilter} onChange={setCurrencyFilter} options={[{ value: '', label: t.all }, ...CURRENCIES.map((item) => ({ value: item.value, label: <CurrencyMark code={item.value} /> }))]} /></div>
          <div className="form-group"><label className="form-label">{t.project}</label><OpsSelect value={projectFilter} onChange={setProjectFilter} options={[{ value: '', label: t.all }, ...projects.map((row) => ({ value: row.id, label: row.name }))]} /></div>
          <div className="form-group"><label className="form-label">{t.status}</label><OpsSelect value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: t.all }, { value: 'COMPLETED', label: t.completed }, { value: 'PENDING_APPROVAL', label: t.pending }]} /></div>
          {logBanks.length > 0 ? <div className="form-group"><label className="form-label">{t.bank}</label><OpsSelect value={bankFilter} onChange={setBankFilter} options={[{ value: '', label: t.all }, ...logBanks.map((name) => ({ value: name, label: name }))]} /></div> : null}
          <div className="form-group"><label className="form-label">{t.deliverer}</label><OpsSelect value={delivererFilter} onChange={setDelivererFilter} options={[{ value: '', label: t.all }, ...logDeliverers.map((name) => ({ value: name, label: name }))]} /></div>
          <div className="form-group"><label className="form-label">{t.receiver}</label><OpsSelect value={receiverFilter} onChange={setReceiverFilter} options={[{ value: '', label: t.all }, ...logReceivers.map((name) => ({ value: name, label: name }))]} /></div>
          <div className="form-group"><label className="form-label">{t.colAttach}</label><OpsSelect value={fileFilter} onChange={setFileFilter} options={[{ value: '', label: t.all }, { value: 'yes', label: t.hasFiles }, { value: 'no', label: t.noFiles }]} /></div>
        </div></div></div>
        <div className="ops-log-live-search"><input className="form-control" value={query} placeholder={t.searchPh} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="ops-log-count-line">{loadingLog ? t.searching : fill(t.shownCount, { n: visible.length })}</div>
        {visible.length === 0 ? <p className="ops-log-empty">{loaded.length === 0 ? t.emptyRange : t.noResults}</p> : (
          <div className="ops-table-wrap"><table className="premium-table ops-log-table"><thead><tr>
            <th>{t.opNo}</th><th>{t.colDate}</th><th>{t.colProject}</th><th>{t.colFund}</th><th>{t.currency}</th><th>{t.quantity}</th><th>{t.amount}</th><th>{t.total}</th><th>{t.deliverer}</th><th>{t.receiver}</th><th>{t.description}</th><th>{t.notes}</th><th>{t.status}</th><th>{t.colAttach}</th><th>{t.colAction}</th>
          </tr></thead><tbody>
            {visible.map((row) => {
              const locked = row.status !== 'COMPLETED' || actor.role === 'MONITOR';
              return (
                <tr key={row.id}>
                  <td>{row.operationNumber}</td>
                  <td><span className="ops-log-date">{dateOnly(String(row.transactionDate))}</span>{clockTime(row.systemDate) ? <span className="ops-log-clock">{clockTime(row.systemDate)}</span> : null}</td>
                  <td>{row.project?.name || '—'}</td>
                  <td>{fundLabel(row.fund, t)}{row.bank ? ` · ${row.bank.name}` : ''}</td>
                  <td><CurrencyMark code={row.currency} /></td>
                  <td><span className="ops-log-num">{quantityText(row.quantity)}</span></td>
                  <td><span className="ops-log-num">{money(row.amount, row.currency)}</span></td>
                  <td><span className="ops-log-num">{money(row.total, row.currency)}</span></td>
                  <td>{row.deliverer || '—'}</td>
                  <td>{row.receiver || '—'}</td>
                  <td className="ops-log-note">{row.description || '—'}</td>
                  <td className="ops-log-note">{row.notes || '—'}</td>
                  <td><span className={`ops-status${row.status === 'COMPLETED' ? ' is-ok' : ' is-wait'}`}>{row.status === 'COMPLETED' ? t.completed : t.pending}</span></td>
                  <td>{attachmentCount(row.attachments) > 0 ? <button type="button" className="ops-mini-btn" onClick={() => setFilesRow(row)}>{t.viewFiles}</button> : '—'}</td>
                  <td><div className="ops-log-actions">
                    <button type="button" className="ops-mini-btn" onClick={() => setViewing(row)}>{t.print}</button>
                    <button type="button" className="ops-mini-btn" disabled={locked} onClick={() => { startEdit(row); setEditReason(''); }}>{t.edit}</button>
                    <button type="button" className="ops-mini-btn is-danger" disabled={locked} onClick={() => { setDeleteRow(row); setCancelChoice(''); setDeleteReason(''); }}>{t.cancelOp}</button>
                  </div></td>
                </tr>
              );
            })}
          </tbody></table></div>
        )}
        {viewing ? <ReceiptSheet row={viewing} onClose={() => setViewing(null)} /> : null}
        {editing ? (
          <OpsDialog title={`${t.editTitle} ${editing.operationNumber}`} onClose={() => { resetForm(); setEditReason(''); }} closeLabel={t.close} wide>
            <form onSubmit={saveEdit}>
              <div className="ops-form-grid">
                {isManager ? <div className="form-group"><label className="form-label">{t.office}</label><OpsSelect value={locationId} onChange={setLocationId} options={activeLocations.map((row) => ({ value: row.id, label: row.name }))} /></div> : null}
                <div className="form-group"><label className="form-label">{t.txDate}</label><input className="form-control" required type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.fund}</label><OpsSelect value={fund} onChange={(next) => setFund(next as typeof fund)} options={INCOME_FUNDS.map((item) => ({ value: item.value, label: fundLabel(item.value, t) }))} /></div>
                {fund === 'BANK' ? <div className="form-group"><label className="form-label">{t.bank}</label><OpsSelect value={bankId} onChange={setBankId} options={activeBanks.map((row) => ({ value: row.id, label: row.name }))} /></div> : null}
                <div className="form-group"><label className="form-label">{t.project}</label><OpsSelect value={projectId} onChange={setProjectId} options={outcomeProjects.map((row) => ({ value: row.id, label: row.name }))} /></div>
                <div className="form-group"><label className="form-label">{t.description}</label><input className="form-control" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.deliverer}</label><input className="form-control" value={deliverer} onChange={(event) => setDeliverer(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.receiver}</label><input className="form-control" value={receiver} onChange={(event) => setReceiver(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.currency}</label><CurrencySelect value={currency} onChange={setCurrency} /></div>
                {currency === 'SYP' ? <div className="form-group"><label className="form-label">سعر الصرف</label><input className="form-control" inputMode="decimal" value={fxRate} placeholder="ل.س / دولار" onChange={(event) => setFxRate(event.target.value)} /></div> : null}
                <div className="form-group"><label className="form-label">{t.quantity}</label><input className="form-control" required inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.amount}</label><input className="form-control" required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.notes}</label><input className="form-control" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.reasonLabel}</label><input className="form-control" value={editReason} onChange={(event) => setEditReason(event.target.value)} /></div>
              </div>
              <AttachmentsBox reference={editing.reference} pendingFiles={pendingFiles} onPendingFiles={setPendingFiles} disabled={saving} hint={t.drop} pendingLabel={t.pendingSave} removeLabel={t.removeFile} uploadLabel={t.uploadNow} uploadingLabel={t.uploading} />
              <div className="ops-dialog-actions">
                <button type="button" className="btn-ghost" onClick={() => { resetForm(); setEditReason(''); }}>{t.cancel}</button>
                <button type="submit" className="btn" disabled={saving || (fund === 'BANK' && !bankId)}>{actor.role === 'GENERAL_MANAGER' ? t.save : t.sendEdit}</button>
              </div>
            </form>
          </OpsDialog>
        ) : null}
        {deleteRow ? (
          <OpsDialog title={t.deleteTitle} onClose={() => setDeleteRow(null)} closeLabel={t.close} danger>
            <div className="form-group"><label className="form-label">{t.cancelQuick}</label>
              <OpsSelect value={cancelChoice} placeholder={t.pickReason} onChange={setCancelChoice} options={[{ value: '', label: t.pickReason }, { value: t.reasonAmount, label: t.reasonAmount }, { value: t.reasonCurrency, label: t.reasonCurrency }, { value: t.reasonCustomer, label: t.reasonCustomer }, { value: 'other', label: t.reasonOther }]} />
            </div>
            {cancelChoice === 'other' ? <div className="form-group"><label className="form-label">{t.reasonLabel}</label><textarea className="form-control ops-reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} rows={3} /></div> : null}
            <div className="ops-cancel-actions">
              <button type="button" className="ops-cancel-dismiss" onClick={() => setDeleteRow(null)}>{t.cancelOp}</button>
              <button type="button" className="ops-cancel-send" onClick={() => void confirmDelete()}>{actor.role === 'GENERAL_MANAGER' ? t.confirmCancel : t.sendDelete}</button>
            </div>
          </OpsDialog>
        ) : null}
        {filesRow ? <FileViewer reference={filesRow.reference} title={`${t.colAttach} · ${t.opNo} ${filesRow.operationNumber}`} closeLabel={t.close} onClose={() => setFilesRow(null)} /> : null}
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
