// ====== إعدادات النظام ======

// أسماء الجداول لتسهيل الوصول إليها
const SHEETS = {
  INCOMES: 'Incomes',
  OUTCOMES: 'Outcomes',
  EXCHANGES: 'Exchanges',
  TRANSFERS: 'Transfers',
  ADVANCES: 'Advances',
  OPENING: 'Opening_Balances',
  AUDIT: 'Audit_Trail',
  EMPLOYEES: 'Employees',
  BORROWERS: 'Borrowers',
  PROJECTS: 'Projects',
  BANKS: 'Banks',
  NOTIFICATIONS: 'Notifications'
};

/** قيم الصناديق النظامية */
const FUND = {
  VAULT: 'الخزنة',
  SHAM: 'شام كاش',
  ADVANCES: 'السلف',
  BANK: 'البنك'
};

/** أماكن ظهور المشروع */
const PROJECT_SHOW = {
  INCOME: 'وارد',
  OUTCOME: 'صادر',
  ADVANCES: 'سلف',
  REPORTS: 'تقارير'
};

const HEADERS_OPENING = [
  'رقم العملية', 'تاريخ العملية', 'تاريخ الإدخال', 'الصندوق', 'العملة', 'المبلغ',
  'ملاحظات', 'الموظف', 'الحالة', 'المرجع'
];

/** أدوار النظام — المرحلة 1: موظف + مشرف فقط */
const ROLES = {
  EMPLOYEE: 'موظف',
  SUPERVISOR: 'مشرف'
};

/** عناوين الأعمدة المشتركة */
const COL = {
  SEQ: 'رقم العملية',
  SYS_DATE: 'تاريخ الإدخال',
  TRX_DATE: 'تاريخ العملية',
  PROJECT: 'المشروع',
  DESC: 'الوصف',
  FUND: 'الصندوق',
  SENDER: 'مصدر النقد',
  DELIVERER: 'اسم المسلّم',
  RECEIVER: 'اسم المستلم',
  CURRENCY: 'العملة',
  QTY: 'الكمية',
  AMOUNT: 'المبلغ',
  TOTAL: 'الإجمالي',
  ATTACH: 'رابط المرفق',
  NOTES: 'ملاحظات',
  EMPLOYEE: 'الموظف المسؤول',
  STATUS: 'الحالة',
  REF: 'المرجع',
  EX_TYPE: 'نوع التصريف',
  PAID_CUR: 'العملة المدفوعة',
  REC_CUR: 'العملة المستلمة',
  EX_AMT: 'المبلغ المراد تصريفه',
  EX_RATE: 'سعر الصرف',
  FROM_FUND: 'الصندوق المرسل',
  TO_FUND: 'الصندوق المستلم',
  BORROWER: 'المستلف',
  BANK: 'اسم البنك',
  FROM_BANK: 'البنك المرسل',
  TO_BANK: 'البنك المستلم',
  ADV_TYPE: 'نوع عملية السلفة',
  FROM_CUR: 'من عملة',
  TO_CUR: 'إلى عملة',
  AMT_CUR: 'عملة المبلغ'
};

const HEADERS_INCOMES = [
  COL.SEQ, COL.TRX_DATE, COL.SYS_DATE, COL.PROJECT, COL.DESC, COL.FUND, COL.BANK,
  COL.SENDER, COL.RECEIVER, COL.CURRENCY, COL.QTY, COL.AMOUNT, COL.TOTAL,
  COL.ATTACH, COL.NOTES, COL.EMPLOYEE, COL.STATUS, COL.REF
];

const HEADERS_OUTCOMES = [
  COL.SEQ, COL.TRX_DATE, COL.SYS_DATE, COL.PROJECT, COL.DESC, COL.FUND, COL.BANK,
  COL.DELIVERER, COL.RECEIVER, COL.CURRENCY, COL.QTY, COL.AMOUNT, COL.TOTAL,
  COL.ATTACH, COL.NOTES, COL.EMPLOYEE, COL.STATUS, COL.REF
];

const HEADERS_EXCHANGES = [
  COL.SEQ, COL.TRX_DATE, COL.SYS_DATE, COL.FUND, COL.BANK, COL.EX_TYPE, COL.PAID_CUR, COL.REC_CUR,
  COL.EX_AMT, COL.AMT_CUR, COL.EX_RATE, COL.TOTAL, COL.ATTACH, COL.NOTES, COL.EMPLOYEE, COL.STATUS, COL.REF
];

const HEADERS_TRANSFERS = [
  COL.SEQ, COL.TRX_DATE, COL.SYS_DATE, COL.FROM_FUND, COL.TO_FUND, COL.FROM_BANK, COL.TO_BANK,
  COL.CURRENCY, COL.AMOUNT, COL.BORROWER,
  COL.ATTACH, COL.NOTES, COL.EMPLOYEE, COL.STATUS, COL.REF
];

const HEADERS_ADVANCES = [
  COL.SEQ, COL.TRX_DATE, COL.SYS_DATE, COL.BORROWER, COL.ADV_TYPE, COL.PROJECT, COL.DESC,
  COL.RECEIVER, COL.CURRENCY, COL.QTY, COL.AMOUNT, COL.EX_RATE, COL.TOTAL,
  COL.FROM_CUR, COL.TO_CUR, COL.ATTACH, COL.NOTES, COL.EMPLOYEE, COL.STATUS, COL.REF
];

/**
 * ضمان وجود الورقة بالعناوين المطلوبة (يضيف الأعمدة الناقصة دون حذف البيانات)
 */
function ensureSheet_(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f3f3');
    sheet.setFrozenRows(1);
    return sheet;
  }

  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || ''); });

  // ترحيل اسم عمود الرصيد الافتتاحي: الموظف المسؤول → الموظف
  if (sheetName === SHEETS.OPENING) {
    const oldIdx = existing.indexOf('الموظف المسؤول');
    const newIdx = existing.indexOf('الموظف');
    if (oldIdx !== -1 && newIdx === -1) {
      sheet.getRange(1, oldIdx + 1).setValue('الموظف');
      existing[oldIdx] = 'الموظف';
    }
  }

  headers.forEach(function(h) {
    if (existing.indexOf(h) === -1) {
      const col = sheet.getLastColumn() + 1;
      sheet.getRange(1, col).setValue(h).setFontWeight('bold').setBackground('#f3f3f3');
      existing.push(h);
    }
  });
  return sheet;
}

/** قيمة عمود الموظف من صف (مع توافق العنوان القديم للرصيد الافتتاحي) */
function rowEmployee_(row) {
  if (!row) return '';
  const v = row[COL.EMPLOYEE] || row['الموظف'] || row['الموظف المسؤول'];
  return String(v == null ? '' : v).trim();
}

/* ====== محرك التصريف الموحّد ======
 * قاعدة واحدة تحكم كل عمليات تحويل العملات في النظام (تصريف الصندوق وتصريف السلف):
 *   • سعر الصرف = عدد الليرات مقابل دولار واحد، مهما كان اتجاه العملية
 *   • المبلغ يُدخل دائماً بعملة المصدر (المدفوعة)
 *   • الإجمالي يُحسب دائماً بعملة الوجهة (المستلمة) ولا يُكتب يدوياً
 */
const CUR = { USD: 'دولار', SYP: 'ليرة سورية' };

function normalizeCurrency_(value) {
  const v = String(value == null ? '' : value).trim();
  if (v === CUR.USD || v.toUpperCase() === 'USD') return CUR.USD;
  if (v === CUR.SYP || v.toUpperCase() === 'SYP') return CUR.SYP;
  return v;
}

/** تقريب المبلغ حسب عملته: الدولار منزلتان عشريتان والليرة رقم صحيح */
function roundMoney_(value, currency) {
  const n = Number(value) || 0;
  if (normalizeCurrency_(currency) === CUR.SYP) return Math.round(n);
  return Math.round(n * 100) / 100;
}

/** تحويل مبلغ من عملة إلى أخرى: دولار→ليرة ضرب، ليرة→دولار قسمة */
function convertByRate_(amount, rate, fromCur, toCur) {
  const amt = Number(amount) || 0;
  const rt = Number(rate) || 0;
  const from = normalizeCurrency_(fromCur);
  const to = normalizeCurrency_(toCur);
  if (!amt || !from || !to) return 0;
  if (from === to) return roundMoney_(amt, to);
  if (rt <= 0) return 0;
  if (from === CUR.SYP && to === CUR.USD) return roundMoney_(amt / rt, to);
  return roundMoney_(amt * rt, to);
}

/** اتجاه عملية تصريف الصندوق: شراء = شراء دولار مقابل ليرة، بيع = العكس */
function exchangeDirection_(exType) {
  if (String(exType == null ? '' : exType).trim() === 'شراء') {
    return { from: CUR.SYP, to: CUR.USD };
  }
  return { from: CUR.USD, to: CUR.SYP };
}

/**
 * قراءة موحّدة لصف تصريف: ما الذي خرج من الصندوق وما الذي دخل إليه
 * الصفوف الجديدة تحمل عمود «عملة المبلغ» صراحةً، أما الصفوف السابقة له فتُقرأ
 * بقاعدتها الأصلية (المبلغ بالدولار دائماً والإجمالي بالليرة) دون تعديل البيانات
 */
function exchangeLegs_(row) {
  const raw = row.__raw || [];
  const exType = row[COL.EX_TYPE] || raw[2] || '';
  const exAmtCell = (row[COL.EX_AMT] !== undefined && row[COL.EX_AMT] !== '') ? row[COL.EX_AMT] : raw[5];
  const totalCell = (row[COL.TOTAL] !== undefined && row[COL.TOTAL] !== '') ? row[COL.TOTAL] : raw[7];
  const exAmt = Number(exAmtCell) || 0;
  const total = Number(totalCell) || 0;
  const rate = Number(row[COL.EX_RATE]) || 0;
  const amtCur = normalizeCurrency_(row[COL.AMT_CUR]);

  if (amtCur) {
    const recCur = normalizeCurrency_(row[COL.REC_CUR]) ||
      (amtCur === CUR.USD ? CUR.SYP : CUR.USD);
    return { exType: exType, rate: rate, paidCur: amtCur, recCur: recCur, paidAmount: exAmt, recAmount: total };
  }
  if (String(exType).trim() === 'شراء') {
    return { exType: exType, rate: rate, paidCur: CUR.SYP, recCur: CUR.USD, paidAmount: total, recAmount: exAmt };
  }
  if (String(exType).trim() === 'بيع') {
    return { exType: exType, rate: rate, paidCur: CUR.USD, recCur: CUR.SYP, paidAmount: exAmt, recAmount: total };
  }
  // نوع غير معروف: تُقرأ العملتان كما هما في الصف (وإن غابتا فلا أثر على الأرصدة)
  return {
    exType: exType,
    rate: rate,
    paidCur: normalizeCurrency_(row[COL.PAID_CUR]),
    recCur: normalizeCurrency_(row[COL.REC_CUR]),
    paidAmount: exAmt,
    recAmount: total
  };
}

/** الطرف الدولاري من عملية تصريف مُطبّعة (للمؤشرات التي تقيس حجم الدولار) */
function exchangeUsdLeg_(mapped) {
  if (!mapped) return 0;
  if (normalizeCurrency_(mapped.paidCur) === CUR.USD) return toNumber_(mapped.exAmt);
  if (normalizeCurrency_(mapped.recCur) === CUR.USD) return toNumber_(mapped.total);
  return 0;
}

/** الطرف بالليرة من عملية تصريف مُطبّعة */
function exchangeSypLeg_(mapped) {
  if (!mapped) return 0;
  if (normalizeCurrency_(mapped.paidCur) === CUR.SYP) return toNumber_(mapped.exAmt);
  if (normalizeCurrency_(mapped.recCur) === CUR.SYP) return toNumber_(mapped.total);
  return 0;
}

/** حد مسح الصفوف من أسفل الورقة لشاشات العرض/البحث (حماية من مئات الآلاف) */
var SHEET_TAIL_SCAN_CAP = 8000;

/** حد أوسع للتقارير ضمن سنة تشغيل واحدة قبل الأرشفة السنوية (تصدير Excel ثم تصفير الشيتات) */
var REPORT_SHEET_SCAN_CAP = 50000;

function cacheGetJson_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function cachePutJson_(key, obj, seconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(obj), seconds || 120);
  } catch (e) { /* ignore size/quota */ }
}

function cacheRemove_(key) {
  try { CacheService.getScriptCache().remove(key); } catch (e) {}
}

function invalidateUserListsCache_() {
  cacheRemove_('ug_login_employee');
  cacheRemove_('ug_login_supervisor');
  cacheRemove_('ug_login_all');
  cacheRemove_('ug_borrowers_active');
  cacheRemove_('ug_projects_active');
  cacheRemove_('ug_banks_active');
}

function invalidateBalanceCache_(empName) {
  if (!empName) return;
  cacheRemove_('ug_bal_' + String(empName));
}

/** قراءة صفوف الورقة ككائنات حسب عناوين الأعمدة (الورقة كاملة — للأرصدة فقط) */
function sheetRowsAsObjects_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h || ''); });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const raw = values[i];
    if (!raw[0] || String(raw[0]).trim() === '') continue;
    const obj = { __raw: raw, __headers: headers, __rowIndex: i + 1 };
    headers.forEach(function(h, idx) { obj[h] = raw[idx]; });
    // توافق خلفي مع المخطط القديم (بدون عناوين جديدة)
    if (!obj[COL.STATUS] && raw[12] !== undefined) obj[COL.STATUS] = raw[12];
    if (!obj[COL.CURRENCY] && raw[6] !== undefined && headers.length <= 14) obj[COL.CURRENCY] = raw[6];
    if (!obj[COL.TOTAL] && raw[9] !== undefined && headers.length <= 14) obj[COL.TOTAL] = raw[9];
    if (!obj[COL.FUND]) obj[COL.FUND] = 'الخزنة';
    rows.push(obj);
  }
  return rows;
}

/**
 * قراءة آخر N صفوف فقط من الورقة (من الأسفل) — لشاشات السجل/المراقبة
 * عند امتلاء القاعدة لا نقرأ مئات الآلاف دفعة واحدة
 */
function sheetTailRowsAsObjects_(sheet, maxRows) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || '');
  });
  const dataCount = lastRow - 1;
  const take = Math.min(dataCount, maxRows || SHEET_TAIL_SCAN_CAP);
  const start = lastRow - take + 1;
  const values = sheet.getRange(start, 1, lastRow, lastCol).getValues();
  const rows = [];
  for (let i = 0; i < values.length; i++) {
    const raw = values[i];
    if (!raw[0] || String(raw[0]).trim() === '') continue;
    const obj = { __raw: raw, __headers: headers, __rowIndex: start + i };
    headers.forEach(function(h, idx) { obj[h] = raw[idx]; });
    if (!obj[COL.STATUS] && raw[12] !== undefined) obj[COL.STATUS] = raw[12];
    if (!obj[COL.CURRENCY] && raw[6] !== undefined && headers.length <= 14) obj[COL.CURRENCY] = raw[6];
    if (!obj[COL.TOTAL] && raw[9] !== undefined && headers.length <= 14) obj[COL.TOTAL] = raw[9];
    if (!obj[COL.FUND]) obj[COL.FUND] = 'الخزنة';
    rows.push(obj);
  }
  return rows;
}

function appendRowByHeaders_(sheet, dict) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const row = headers.map(function(h) {
    const key = String(h || '');
    return dict.hasOwnProperty(key) ? dict[key] : '';
  });
  sheet.appendRow(row);
}

/** تحديث خلايا صف موجود حسب أسماء الأعمدة (يترك الأعمدة غير المذكورة كما هي) */
function updateRowByHeaders_(sheet, rowIndex, dict) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const range = sheet.getRange(rowIndex, 1, 1, lastCol);
  const values = range.getValues()[0];
  headers.forEach(function(h, idx) {
    const key = String(h || '');
    if (dict.hasOwnProperty(key)) values[idx] = dict[key];
  });
  range.setValues([values]);
}

/**
 * تحديد ورقة العملية من بادئة المرجع
 * @returns {{sheetName:string, typeName:string}|null}
 */
function resolveTargetByRef_(ref) {
  const refType = String(ref || '').split('-')[0];
  if (refType === 'IN') return { sheetName: SHEETS.INCOMES, typeName: 'وارد' };
  if (refType === 'OUT') return { sheetName: SHEETS.OUTCOMES, typeName: 'صادر' };
  if (refType === 'EX') return { sheetName: SHEETS.EXCHANGES, typeName: 'تصريف' };
  if (refType === 'TR') return { sheetName: SHEETS.TRANSFERS, typeName: 'تحويل' };
  if (refType === 'AD') return { sheetName: SHEETS.ADVANCES, typeName: 'سلفة' };
  return null;
}

function normalizeRef_(ref) {
  return String(ref == null ? '' : ref).trim();
}

function isDeletedTxStatus_(status) {
  const s = String(status || '').trim();
  return s === 'محذوفة' || s === 'محذوف';
}

/** العملية ما زالت تؤثر على الصندوق حتى تُعلَّم محذوفة */
function statusAffectsBalance_(status) {
  const s = String(status || '').trim();
  return s === 'مكتملة' || s === 'بانتظار الموافقة';
}

function findTransactionByRef_(ref) {
  ref = normalizeRef_(ref);
  if (!ref) return null;
  const meta = resolveTargetByRef_(ref);
  if (!meta) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(meta.sheetName);
  if (!sheet) return null;
  const rows = sheetRowsAsObjects_(sheet);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.REF] || '').trim() === ref) {
      return { sheet: sheet, row: rows[i], typeName: meta.typeName };
    }
  }
  return null;
}

/** إلغاء أثر العملية مع الإبقاء على الصف للمراجعة — لا يُحذف الصف أبداً */
function markTransactionDeleted_(found) {
  if (!found || !found.sheet || !found.row) return false;
  const dict = {};
  dict[COL.STATUS] = 'محذوفة';
  updateRowByHeaders_(found.sheet, found.row.__rowIndex, dict);
  found.row[COL.STATUS] = 'محذوفة';
  return true;
}

/**
 * مفتاح عداد دائم لكل مستخدم + نوع عملية — لا يتجدد يومياً
 * (يُصفَّر يدوياً عند تفريغ الـ Sheet سنوياً إن لزم)
 */
function opSeqUserKey_(username) {
  return String(username || 'unknown')
    .replace(/[^\w\u0600-\u06FF]+/g, '_')
    .slice(0, 80) || 'unknown';
}

function opSeqPropertyKey_(username, sectionKey) {
  return 'OP_SEQ_' + opSeqUserKey_(username) + '_' + String(sectionKey || 'X');
}

function opSeqSheetName_(sectionKey) {
  if (sectionKey === 'IN') return SHEETS.INCOMES;
  if (sectionKey === 'OUT') return SHEETS.OUTCOMES;
  if (sectionKey === 'EX') return SHEETS.EXCHANGES;
  if (sectionKey === 'TR') return SHEETS.TRANSFERS;
  if (sectionKey === 'AD') return SHEETS.ADVANCES;
  if (sectionKey === 'OB') return SHEETS.OPENING;
  return null;
}

/** أعلى رقم عملية موجود للمستخدم/القسم (ترحيل من العداد اليومي القديم + الورقة) */
function bootstrapOpSeqCount_(props, seqKey, username, sectionKey) {
  const existing = props.getProperty(seqKey);
  if (existing != null && String(existing).trim() !== '') {
    return Number(existing) || 0;
  }

  let max = 0;
  const prefixLegacy = seqKey + '_';
  const all = props.getProperties() || {};
  Object.keys(all).forEach(function(k) {
    if (k.indexOf(prefixLegacy) === 0) {
      max = Math.max(max, Number(all[k]) || 0);
    }
  });

  const sheetName = opSeqSheetName_(sectionKey);
  if (sheetName) {
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      sheetRowsAsObjects_(sheet).forEach(function(row) {
        if (rowEmployee_(row) !== String(username || '').trim()) return;
        max = Math.max(max, Number(row[COL.SEQ]) || 0);
      });
    } catch (e) { /* تجاهل */ }
  }

  if (max > 0) props.setProperty(seqKey, String(max));
  return max;
}

/**
 * معاينة رقم العملية التالي لمستخدم + قسم (بدون زيادة العداد)
 * sectionKey: IN | OUT | EX | TR | AD | OB
 */
function getNextOperationNumber(session, sectionKey) {
  try {
    const auth = requireSession_(session);
    if (!auth.ok) {
      return Object.assign({ success: false, number: 1 }, authFailFields_(auth));
    }
    const seqKey = opSeqPropertyKey_(auth.username, sectionKey);
    const props = PropertiesService.getScriptProperties();
    const count = bootstrapOpSeqCount_(props, seqKey, auth.username, sectionKey);
    return {
      success: true,
      number: count + 1,
      section: sectionKey,
      user: auth.username
    };
  } catch (e) {
    return { success: false, number: 1, error: e.message };
  }
}

/**
 * زيادة عداد المستخدم/القسم الدائم وإرجاع الرقم المستخدم للحفظ
 */
function consumeOperationNumber_(username, sectionKey) {
  const seqKey = opSeqPropertyKey_(username, sectionKey);
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let count = bootstrapOpSeqCount_(props, seqKey, username, sectionKey);
    count += 1;
    props.setProperty(seqKey, String(count));
    return count;
  } finally {
    lock.releaseLock();
  }
}

function parseTrxDate_(value) {
  if (!value) return new Date();
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  const s = String(value).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const parts = s.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** تاريخ العملية كنص تاريخ فقط بدون وقت (yyyy-MM-dd) */
function formatTrxDateOnly_(value) {
  const d = parseTrxDate_(value);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * وظيفة تُشغل لمرة واحدة فقط لتهيئة قاعدة البيانات
 * ستقوم بإنشاء جميع الأوراق (Sheets) ووضع عناوين الأعمدة بشكل احترافي
 */
function initializeDatabase() {
  ensureSheet_(SHEETS.INCOMES, HEADERS_INCOMES);
  ensureSheet_(SHEETS.OUTCOMES, HEADERS_OUTCOMES);
  ensureSheet_(SHEETS.EXCHANGES, HEADERS_EXCHANGES);
  ensureSheet_(SHEETS.TRANSFERS, HEADERS_TRANSFERS);
  ensureSheet_(SHEETS.ADVANCES, HEADERS_ADVANCES);
  ensureSheet_(SHEETS.OPENING, HEADERS_OPENING);

  ensureSheet_(SHEETS.AUDIT, [
    'معرف الحركة', 'المرجع الأصلي', 'الموظف الطالب', 'نوع الإجراء',
    'التفاصيل القديمة', 'التفاصيل الجديدة', 'وقت الطلب', 'حالة الطلب', 'قرار المشرف', 'السبب'
  ]);
  ensureSheet_(SHEETS.EMPLOYEES, [
    'اسم الموظف', 'كلمة السر', 'الصلاحية', 'حالة الحساب'
  ]);
  ensureSheet_(SHEETS.BORROWERS, ['اسم المستلف', 'الحالة']);
  seedDefaultBorrowers_();
  ensureSheet_(SHEETS.PROJECTS, ['اسم المشروع', 'الحالة', 'أماكن الظهور']);
  seedDefaultProjects_();
  ensureSheet_(SHEETS.BANKS, ['اسم البنك', 'الحالة']);
  seedDefaultBanks_();
  ensureSheet_(SHEETS.NOTIFICATIONS, [
    'معرف الإشعار', 'الموظف', 'الرسالة', 'التاريخ', 'الحالة',
    'القسم', 'معرف الطلب', 'نوع الإجراء', 'المرجع', 'مقدم الطلب'
  ]);

  return 'تم تهيئة قاعدة البيانات بنجاح!';
}

/**
 * تفريغ ورقة والإبقاء على صف العناوين فقط (بهيكل الإنتاج الحالي)
 */
function resetSheetWithHeaders_(sheetName, headers) {
  const sheet = ensureSheet_(sheetName, headers);
  sheet.clear();
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f3f3');
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * حذف محتويات مجلد مرفقات الاختبار (الملفات والمجلدات الفرعية)
 */
function clearReceiptsFolderContents_() {
  const folderName = 'مرفقات Powered by UNI GATE';
  const folders = DriveApp.getFoldersByName(folderName);
  let removed = 0;
  while (folders.hasNext()) {
    const folder = folders.next();
    const files = folder.getFiles();
    while (files.hasNext()) {
      files.next().setTrashed(true);
      removed += 1;
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) {
      subs.next().setTrashed(true);
      removed += 1;
    }
  }
  return removed;
}

/**
 * تنظيف كامل بعد التجربة — يُشغَّل يدوياً من محرر Apps Script فقط.
 * يفرّغ العمليات والإشعارات وسجل التدقيق والحسابات والعدادات والجلسات والكاش ومرفقات الاختبار،
 * ثم يعيد تهيئة القوائم الافتراضية (مستلفون / مشاريع) بهيكل الإنتاج بدون عمولة.
 *
 * بعد التشغيل: أضف حساب مشرف واحد على الأقل في ورقة Employees قبل التسليم.
 */
function resetForDelivery() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const HEADERS_AUDIT = [
      'معرف الحركة', 'المرجع الأصلي', 'الموظف الطالب', 'نوع الإجراء',
      'التفاصيل القديمة', 'التفاصيل الجديدة', 'وقت الطلب', 'حالة الطلب', 'قرار المشرف', 'السبب'
    ];
    const HEADERS_EMPLOYEES = ['اسم الموظف', 'كلمة السر', 'الصلاحية', 'حالة الحساب'];
    const HEADERS_BORROWERS = ['اسم المستلف', 'الحالة'];
    const HEADERS_PROJECTS = ['اسم المشروع', 'الحالة', 'أماكن الظهور'];
    const HEADERS_BANKS = ['اسم البنك', 'الحالة'];
    const HEADERS_NOTIFICATIONS = [
      'معرف الإشعار', 'الموظف', 'الرسالة', 'التاريخ', 'الحالة',
      'القسم', 'معرف الطلب', 'نوع الإجراء', 'المرجع', 'مقدم الطلب'
    ];

    resetSheetWithHeaders_(SHEETS.INCOMES, HEADERS_INCOMES);
    resetSheetWithHeaders_(SHEETS.OUTCOMES, HEADERS_OUTCOMES);
    resetSheetWithHeaders_(SHEETS.EXCHANGES, HEADERS_EXCHANGES);
    resetSheetWithHeaders_(SHEETS.TRANSFERS, HEADERS_TRANSFERS);
    resetSheetWithHeaders_(SHEETS.ADVANCES, HEADERS_ADVANCES);
    resetSheetWithHeaders_(SHEETS.OPENING, HEADERS_OPENING);
    resetSheetWithHeaders_(SHEETS.AUDIT, HEADERS_AUDIT);
    resetSheetWithHeaders_(SHEETS.NOTIFICATIONS, HEADERS_NOTIFICATIONS);
    resetSheetWithHeaders_(SHEETS.EMPLOYEES, HEADERS_EMPLOYEES);
    resetSheetWithHeaders_(SHEETS.BORROWERS, HEADERS_BORROWERS);
    resetSheetWithHeaders_(SHEETS.PROJECTS, HEADERS_PROJECTS);
    resetSheetWithHeaders_(SHEETS.BANKS, HEADERS_BANKS);

    seedDefaultBorrowers_();
    seedDefaultProjects_();
    seedDefaultBanks_();

    const props = PropertiesService.getScriptProperties();
    const beforeProps = Object.keys(props.getProperties() || {}).length;
    props.deleteAllProperties();

    try { CacheService.getScriptCache().removeAll(); } catch (eCache) { /* ignore */ }

    const removedDrive = clearReceiptsFolderContents_();

    return [
      'تم تنظيف النظام للتسليم بنجاح.',
      '• فُرغت كل أوراق العمليات والرصيد الافتتاحي والتدقيق والإشعارات.',
      '• فُرغت حسابات Employees — أضف مشرفاً واحداً على الأقل قبل التسليم.',
      '• أُعيدت القوائم الافتراضية (مستلفون / مشاريع) وهيكل التحويل بلا عمولة.',
      '• حُذفت خصائص السكريبت (' + beforeProps + ') بما فيها العدادات والجلسات والأقفال.',
      '• صُفِّر الكاش، ونُقلت عناصر مرفقات الاختبار إلى المهملات (' + removedDrive + ').',
      'العداد سيبدأ من 1 لكل موظف وكل نوع عملية بعد أول استخدام.'
    ].join('\n');
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ====== دوال واجهة المستخدم (Web App) والتوجيه ======

/**
 * توجيه التطبيق:
 * - الرابط العادي            → صفحة دخول موحّدة (موظفون + مشرفون)
 * - ?page=employee           → واجهة الموظف (Employee.html)
 * - ?page=supervisor         → واجهة المشرف (Supervisor.html)
 *
 * ملاحظة: معاملات الرابط تُمرَّر للـ HTML من السيرفر لأن location.search
 * داخل iframe تطبيقات GAS غالباً لا يحتوي page/role.
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const page = String(params.page || '').trim();

  if (page === 'employee') {
    return serveHtml_('Employee', 'Powered by UNI GATE');
  }
  if (page === 'supervisor' || page === 'admin') {
    return serveHtml_('Supervisor', 'Powered by UNI GATE');
  }

  // صفحة دخول واحدة للجميع (توافق خلفي مع ?role=supervisor القديم)
  return serveLogin_();
}

function serveHtml_(filename, title) {
  return HtmlService.createTemplateFromFile(filename)
      .evaluate()
      .setTitle(title || 'Powered by UNI GATE')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** صفحة الدخول الموحّدة */
function serveLogin_() {
  const template = HtmlService.createTemplateFromFile('Login');
  template.loginAudience = 'all';
  return template.evaluate()
      .setTitle('Powered by UNI GATE')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * جلب الرابط الأساسي للتطبيق (يُستخدم للانتقال بعد تسجيل الدخول)
 */
function getAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * دالة مساعدة لربط ملفات الـ CSS والـ JS داخل ملفات الـ HTML
 * هذا يمنع تداخل الأكواد ويبقيها مرتبة
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ====== أدوات الحماية والتعقيم (Security & Sanitization) ======

/**
 * تعقيم أي نص قادم من المستخدم قبل تخزينه: إزالة وسوم HTML/سكريبت المحتملة،
 * قصّ المسافات الزائدة، وتحديد طول أقصى لمنع إغراق قاعدة البيانات
 * @param {*} value - القيمة الخام
 * @param {number} maxLen - الطول الأقصى المسموح (افتراضياً 500)
 * @returns {string}
 */
function sanitizeText(value, maxLen) {
  maxLen = maxLen || 500;
  if (value === null || value === undefined) return '';
  let str = String(value);
  // إزالة أي وسوم HTML/XML بالكامل (يمنع تخزين <script> أو أي عنصر تفاعلي)
  str = str.replace(/<[^>]*>/g, '');
  // إزالة محارف التحكم غير المرئية التي قد تُستخدم لتجاوز الفلاتر
  str = str.replace(/[\u0000-\u001F\u007F]/g, '');
  return str.trim().slice(0, maxLen);
}

/**
 * تعقيم كل الحقول النصية داخل كائن بشكل سطحي (shallow) — تُستخدم مع بيانات النماذج
 * @param {Object} obj
 * @param {number} maxLen
 * @returns {Object}
 */
function sanitizeObjectStrings_(obj, maxLen) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  Object.keys(obj).forEach(function(key) {
    const val = obj[key];
    result[key] = (typeof val === 'string') ? sanitizeText(val, maxLen) : val;
  });
  return result;
}

// ====== أدوات مساعدة (Utilities) ======

/**
 * توليد مرجع فريد لكل عملية (عداد دائم لكل نوع — التاريخ للعرض فقط)
 * @param {string} type - نوع العملية ('IN', 'OUT', 'EX', ...)
 * @returns {string} - مثال: IN-260716-001
 */
function generateReference(type) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const tz = Session.getScriptTimeZone();
    const dateString = Utilities.formatDate(new Date(), tz, 'yyMMdd');
    const props = PropertiesService.getScriptProperties();
    const counterKey = 'REF_COUNTER_' + String(type || 'X');

    let count = Number(props.getProperty(counterKey)) || 0;
    if (!count) {
      // ترحيل من العدادات اليومية القديمة إن وُجدت
      const all = props.getProperties() || {};
      const legacyPrefix = 'REF_COUNTER_';
      const legacySuffix = '_' + String(type || 'X');
      Object.keys(all).forEach(function(k) {
        if (k.indexOf(legacyPrefix) !== 0) return;
        if (k === counterKey) return;
        if (k.slice(-legacySuffix.length) === legacySuffix && /REF_COUNTER_\d{6}_/.test(k)) {
          count = Math.max(count, Number(all[k]) || 0);
        }
      });
    }

    count += 1;
    props.setProperty(counterKey, String(count));
    const countString = String(count).padStart(3, '0');
    return String(type) + '-' + dateString + '-' + countString;
  } finally {
    lock.releaseLock();
  }
}

// ====== نظام تسجيل الدخول (Login System) ======

/**
 * جلب قائمة أسماء الموظفين النشطين لعرضها في القائمة المنسدلة
 */
/**
 * قائمة الدخول حسب الجمهور:
 * audience = 'employee' → موظفين فقط (بدون مشرفين)
 * audience = 'supervisor' → مشرفين فقط
 * بدون وسيط / 'all' → كل النشطين (توافق خلفي + إدارة)
 */
function getLoginUsersList(audience) {
  audience = String(audience || 'employee').trim().toLowerCase();
  const cacheKey = 'ug_login_' + (audience === 'supervisor' ? 'supervisor' : (audience === 'all' ? 'all' : 'employee'));
  const cached = cacheGetJson_(cacheKey);
  if (cached && cached.names) return cached.names;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.EMPLOYEES);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const names = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][3] || '').trim() !== 'نشط') continue;
    const name = String(data[i][0] == null ? '' : data[i][0]).trim();
    if (!name) continue;
    const role = String(data[i][2] || ROLES.EMPLOYEE).trim();
    const isSupervisor = role === ROLES.SUPERVISOR;
    if (audience === 'supervisor' && !isSupervisor) continue;
    if (audience === 'employee' && isSupervisor) continue;
    names.push(name);
  }
  cachePutJson_(cacheKey, { names: names }, 300);
  return names;
}

/** توافق خلفي: القائمة القديمة كانت كل النشطين */
function getEmployeesList() {
  return getLoginUsersList('all');
}

/**
 * التحقق من بيانات الدخول
 * ملاحظة أمان: لا تُعاد أي رسالة نصية بلغة محددة من السيرفر، بل "كود" ثابت
 * تتولى الواجهة ترجمته فوراً بأي لغة (نظام ترجمة احترافي بدون تكرار المشكلة)
 * @param {string} username - اسم الموظف
 * @param {string} password - كلمة المرور
 */
/**
 * @param {string} username
 * @param {string} password
 * @param {string} [audience] - employee | supervisor (يقيّد الدور المسموح من صفحة الدخول)
 */
function verifyLogin(username, password, audience) {
  username = sanitizeText(username, 100);
  password = String(password || '').slice(0, 200);
  // audience محفوظ للتوافق الخلفي — الدخول الموحّد يقبل أي دور نشط
  audience = String(audience || 'all').trim().toLowerCase();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const sheetUser = String(data[i][0] == null ? '' : data[i][0]).trim();
    const sheetPass = String(data[i][1] == null ? '' : data[i][1]).trim();
    if (sheetUser === username && sheetPass === String(password).trim()) {
      if (String(data[i][3] || '').trim() !== 'نشط') {
        return { success: false, code: 'INACTIVE' };
      }
      const role = String(data[i][2] || ROLES.EMPLOYEE).trim();
      const session = createSession(sheetUser, role);
      return { success: true, role: session.role, code: 'OK', session: session };
    }
  }
  return { success: false, code: 'WRONG_CREDENTIALS' };
}

/**
 * التحقق من كلمة المرور فقط (بدون إصدار جلسة جديدة) — يُستخدم في شاشة القفل التلقائي
 */
function verifyPasswordOnly(username, password) {
  username = sanitizeText(username, 100);
  password = String(password || '').slice(0, 200);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const sheetUser = String(data[i][0] == null ? '' : data[i][0]).trim();
    const sheetPass = String(data[i][1] == null ? '' : data[i][1]).trim();
    if (sheetUser === username && sheetPass === String(password).trim()) {
      if (String(data[i][3] || '').trim() !== 'نشط') return { success: false, code: 'INACTIVE' };
      return { success: true, code: 'OK' };
    }
  }
  return { success: false, code: 'WRONG_CREDENTIALS' };
}

/** مفتاح قفل المستخدم حتى منتصف الليل (يمنع تجاوز القفل بتسجيل دخول جديد) */
function userLockKey_(username) {
  return 'USER_LOCKED_' + username;
}

function isUserDayLocked_(username) {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(userLockKey_(username));
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (!data || !data.until) return false;
    return Date.now() < Number(data.until);
  } catch (e) {
    return false;
  }
}

function setUserDayLocked_(username, locked) {
  const props = PropertiesService.getScriptProperties();
  const key = userLockKey_(username);
  if (locked) {
    props.setProperty(key, JSON.stringify({ until: getNextMidnightTimestamp_() }));
  } else {
    props.deleteProperty(key);
  }
}

/**
 * قراءة جلسة خام بالرمز حتى لو كانت مقفلة (لاستخدام القفل/الفتح)
 */
function getSessionRecord_(username, token) {
  if (!username || !token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty('SESSION_' + username);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.token !== token) return null;
    if (Date.now() > data.expiry) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function writeSessionRecord_(username, data) {
  PropertiesService.getScriptProperties().setProperty(
    'SESSION_' + username,
    JSON.stringify(data)
  );
}

// ====== إدارة الجلسات (Session Management) ======

/**
 * حساب الطابع الزمني لمنتصف الليل القادم (بتوقيت السكريبت) — تُستخدم كحد أقصى لصلاحية الجلسة
 */
function getNextMidnightTimestamp_() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return midnight.getTime();
}

/**
 * إنشاء جلسة عمل آمنة جديدة.
 * تسجيل الدخول الناجح يثبت الهوية بكلمة السر → يُلغى قفل اليوم فوراً (لا شاشة قفل بعد الدخول).
 */
function createSession(username, role) {
  const token = Utilities.getUuid();
  const expiry = getNextMidnightTimestamp_();
  const roleText = String(role || '').trim();
  const normalizedRole = (roleText === ROLES.SUPERVISOR) ? ROLES.SUPERVISOR : ROLES.EMPLOYEE;
  const lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { /* متابعة */ }
  try {
    setUserDayLocked_(username, false);
    writeSessionRecord_(username, {
      token: token,
      expiry: expiry,
      role: normalizedRole,
      locked: false,
      createdAt: Date.now()
    });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
  return { token: token, expiry: expiry, role: normalizedRole, locked: false };
}

/**
 * قراءة بيانات الجلسة المخزّنة إن كانت صالحة (بما فيها حالة القفل)
 */
function getValidSessionData_(username, token) {
  const data = getSessionRecord_(username, token);
  if (!data) return null;
  const dayLocked = isUserDayLocked_(username);
  const locked = !!(data.locked || dayLocked);
  return {
    username: username,
    token: token,
    role: data.role === ROLES.SUPERVISOR ? ROLES.SUPERVISOR : ROLES.EMPLOYEE,
    expiry: data.expiry,
    locked: locked
  };
}

/**
 * حالة الجلسة للواجهة عند الإقلاع (لا يرفض القفل — يُرجع locked)
 */
function checkClientSession(session) {
  const data = getValidSessionData_(session && session.username, session && session.token);
  if (!data) {
    return { ok: false, sessionExpired: true, messageKey: 'session.expiredGeneric' };
  }
  return {
    ok: true,
    locked: !!data.locked,
    role: data.role,
    username: data.username
  };
}

/** قفل الجلسة على السيرفر — لا يمكن تجاوزه بالريفرش */
function lockActiveSession(session) {
  const data = getSessionRecord_(session && session.username, session && session.token);
  if (!data) {
    return { success: false, sessionExpired: true, messageKey: 'session.expiredGeneric' };
  }
  data.locked = true;
  writeSessionRecord_(session.username, data);
  setUserDayLocked_(session.username, true);
  return { success: true, locked: true };
}

/** فتح القفل بعد التحقق من كلمة المرور + صحة رمز الجلسة */
function unlockActiveSession(session, password) {
  const data = getSessionRecord_(session && session.username, session && session.token);
  if (!data) {
    return { success: false, sessionExpired: true, code: 'EXPIRED', messageKey: 'session.expiredGeneric' };
  }
  const auth = verifyPasswordOnly(session.username, password);
  if (!auth.success) return auth;
  data.locked = false;
  writeSessionRecord_(session.username, data);
  setUserDayLocked_(session.username, false);
  return { success: true, code: 'OK' };
}

/**
 * التحقق من صحة جلسة الموظف قبل تنفيذ أي عملية حساسة على الباك-إند
 */
function validateSession(username, token) {
  const data = getValidSessionData_(username, token);
  return !!(data && !data.locked);
}

/**
 * التحقق من الجلسة وإرجاع بيانات المستخدم/الدور، أو كائن فشل موحّد
 * الجلسة المقفلة تُرفض للعمليات العادية (ما عدا unlock/check)
 */
function requireSession_(session) {
  const data = getValidSessionData_(session && session.username, session && session.token);
  if (!data) {
    return {
      ok: false,
      result: { success: false, sessionExpired: true, messageKey: 'session.expiredGeneric' }
    };
  }
  if (data.locked) {
    return {
      ok: false,
      result: {
        success: false,
        sessionLocked: true,
        messageKey: 'session.locked'
      }
    };
  }
  return { ok: true, username: data.username, role: data.role };
}

/** حقول فشل المصادقة — نفرّق القفل عن انتهاء الجلسة لتفادي دوامة تسجيل الخروج */
function authFailFields_(auth) {
  const r = (auth && auth.result) || {};
  return {
    sessionExpired: !!r.sessionExpired,
    sessionLocked: !!r.sessionLocked,
    messageKey: r.messageKey || 'auth.forbidden'
  };
}

/** هل الدور مشرف؟ */
function isSupervisorRole_(role) {
  return role === ROLES.SUPERVISOR;
}

/**
 * مثل requireSession_ مع اشتراط دور معيّن (أو قائمة أدوار)
 * @param {Object} session
 * @param {string|string[]} allowedRoles
 */
function requireRole_(session, allowedRoles) {
  const auth = requireSession_(session);
  if (!auth.ok) return auth;
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (allowed.indexOf(auth.role) === -1) {
    return {
      ok: false,
      result: { success: false, messageKey: 'auth.forbidden' }
    };
  }
  return auth;
}

/**
 * إنهاء جلسة الموظف صراحةً (عند تسجيل الخروج)
 * لا تُحذف الجلسة إلا إذا تطابق الرمز — يمنع مسح جلسة جديدة بعد إعادة الدخول السريع
 * @param {string} username
 * @param {string} [token]
 */
function destroySession(username, token) {
  if (!username) return { success: false };
  const key = 'SESSION_' + username;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(key);
  if (!raw) return { success: true };
  if (token) {
    try {
      const data = JSON.parse(raw);
      if (data && data.token && data.token !== token) {
        return { success: true, skipped: true };
      }
    } catch (e) { /* تجاهل */ }
  } else {
    // بدون رمز: لا نحذف — تجنّب سباق مع جلسة أحدث
    return { success: true, skipped: true };
  }
  props.deleteProperty(key);
  return { success: true };
}

// ====== محرك حفظ البيانات والمرفقات ======

/**
 * دالة للبحث عن مجلد المرفقات أو إنشائه إن لم يكن موجوداً
 */
function getOrCreateReceiptsFolder() {
  const folderName = "مرفقات Powered by UNI GATE";
  const folders = DriveApp.getFoldersByName(folderName);
  let folder;
  
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }
  
  shareAnyoneWithLink_(folder);
  return folder;
}

/**
 * google.script.run قد يحوّل المصفوفة إلى كائن مفهرس — نعيدها لمصفوفة آمنة
 */
function normalizeAttachments_(attachments) {
  if (!attachments) return [];
  let list = [];
  if (Object.prototype.toString.call(attachments) === '[object Array]') {
    list = attachments.slice();
  } else if (typeof attachments === 'object') {
    Object.keys(attachments).sort(function(a, b) { return Number(a) - Number(b); }).forEach(function(k) {
      if (k === 'length') return;
      const v = attachments[k];
      if (v && typeof v === 'object') list.push(v);
    });
  }
  return list.filter(function(f) {
    return f && String(f.base64 || f.data || f.content || '').length > 0;
  });
}

function shareAnyoneWithLink_(driveItem) {
  if (!driveItem) return;
  try {
    driveItem.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e1) {
    try {
      driveItem.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e2) { /* سياسة Workspace قد تمنع المشاركة العامة — العرض يبقى عبر النظام */ }
  }
}

function attachmentBase64_(file) {
  return String((file && (file.base64 || file.data || file.content)) || '');
}

function looksLikePdfName_(name) {
  const n = String(name || '').toLowerCase();
  return n.indexOf('pdf') !== -1;
}

/**
 * إنشاء الملف داخل المجلد المحدد (وليس جذر درايف) ثم مشاركته للرابط
 */
function createAttachmentFileInFolder_(folder, file) {
  const raw = attachmentBase64_(file);
  let fileName = sanitizeText((file && file.name) || 'file', 180) || 'file';
  const mime = (file && file.type) || 'application/octet-stream';
  if ((mime.indexOf('pdf') !== -1 || looksLikePdfName_(fileName)) && !/\.pdf$/i.test(fileName)) {
    fileName = fileName + '.pdf';
  }
  const blob = Utilities.newBlob(
    Utilities.base64Decode(raw),
    mime,
    fileName
  );
  const created = folder.createFile(blob);
  try { folder.addFile(created); } catch (eAdd) { /* الملف داخل المجلد مسبقاً */ }
  let inFolder = false;
  try {
    const parents = created.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === folder.getId()) { inFolder = true; break; }
    }
  } catch (ePar) { inFolder = true; }
  if (inFolder) {
    try { DriveApp.getRootFolder().removeFile(created); } catch (eRoot) { /* ليس في الجذر */ }
  }
  shareAnyoneWithLink_(created);
  return created;
}

function writeAttachmentsIntoFolder_(folder, attachments) {
  const list = normalizeAttachments_(attachments);
  let written = 0;
  list.forEach(function(file) {
    try {
      createAttachmentFileInFolder_(folder, file);
      written += 1;
    } catch (eWrite) { /* نكمل بقية الملفات */ }
  });
  shareAnyoneWithLink_(folder);
  return written;
}

/**
 * حفظ مرفقات لعملية موجودة وإرجاع رابط المجلد
 */
function saveAttachmentsForRef_(ref, attachments) {
  const list = normalizeAttachments_(attachments);
  if (!list.length) return null;
  const mainFolder = getOrCreateReceiptsFolder();
  const txFolder = mainFolder.createFolder('مرفقات العملية ' + ref + ' - ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss'));
  writeAttachmentsIntoFolder_(txFolder, list);
  return txFolder.getUrl();
}

/** استخراج معرف مجلد Drive من رابط المجلد */
function extractDriveFolderId_(url) {
  const s = String(url || '');
  let m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function getAttachFolderByUrl_(url) {
  const id = extractDriveFolderId_(url);
  if (!id) return null;
  try { return DriveApp.getFolderById(id); } catch (e) { return null; }
}

function addAttachmentsToFolderUrl_(folderUrl, attachments) {
  const list = normalizeAttachments_(attachments);
  if (!list.length) return folderUrl || null;
  let folder = getAttachFolderByUrl_(folderUrl);
  if (!folder) {
    return saveAttachmentsForRef_('EDIT', list);
  }
  writeAttachmentsIntoFolder_(folder, list);
  return folder.getUrl();
}

function collectDriveFiles_(folder) {
  const out = [];
  if (!folder) return out;
  const files = folder.getFiles();
  while (files.hasNext()) out.push(files.next());
  return out;
}

function driveFileToMeta_(f) {
  shareAnyoneWithLink_(f);
  return {
    id: f.getId(),
    name: f.getName(),
    size: f.getSize(),
    url: f.getUrl(),
    mime: f.getMimeType()
  };
}

/**
 * استرجاع حذر لملفات رُفعت قديماً وبقيت في المجلد الأب بدل مجلد العملية.
 * لا يحذف شيئاً، ولا يأخذ ملفاً من مجلد عملية أخرى، ويتوقف إذا وُجد التباس زمني.
 */
function recoverOrphanAttachments_(txFolder) {
  const existing = collectDriveFiles_(txFolder);
  if (existing.length) return existing;

  let parent = null;
  try {
    const pars = txFolder.getParents();
    if (pars.hasNext()) parent = pars.next();
  } catch (ePar) { return []; }
  if (!parent) return [];

  const created = txFolder.getDateCreated().getTime();
  const WINDOW = 4 * 60 * 1000;
  let otherEmptyInWindow = 0;
  const sibs = parent.getFolders();
  while (sibs.hasNext()) {
    const sub = sibs.next();
    if (sub.getId() === txFolder.getId()) continue;
    if (Math.abs(sub.getDateCreated().getTime() - created) > WINDOW) continue;
    if (sub.getFiles().hasNext()) continue;
    otherEmptyInWindow += 1;
  }
  if (otherEmptyInWindow > 0) return [];

  const orphans = [];
  const parentFiles = parent.getFiles();
  while (parentFiles.hasNext()) {
    const f = parentFiles.next();
    if (Math.abs(f.getDateCreated().getTime() - created) > WINDOW) continue;
    orphans.push(f);
  }
  if (!orphans.length) return [];

  orphans.forEach(function(f) {
    try { txFolder.addFile(f); } catch (eAdd) { return; }
    var inTx = false;
    try {
      const parents = f.getParents();
      while (parents.hasNext()) {
        if (parents.next().getId() === txFolder.getId()) { inTx = true; break; }
      }
    } catch (eChk) { inTx = false; }
    if (!inTx) return;
    try { parent.removeFile(f); } catch (eRem) { /* الملف صار داخل مجلد العملية حتى لو بقي نسخة في الأب */ }
  });
  return collectDriveFiles_(txFolder);
}

function listFilesInAttachFolder_(folderUrl) {
  const folder = getAttachFolderByUrl_(folderUrl);
  if (!folder) return [];
  shareAnyoneWithLink_(folder);
  let files = collectDriveFiles_(folder);
  if (!files.length) {
    try { files = recoverOrphanAttachments_(folder); } catch (eRec) { files = []; }
  }
  return files.map(driveFileToMeta_);
}

/**
 * قائمة ملفات مجلد مرفق عملية (للتعديل)
 */
function listTransactionAttachments(session, folderUrl) {
  const auth = requireSession_(session);
  if (!auth.ok) return { success: false, files: [] };
  if (!folderUrl || String(folderUrl).indexOf('http') !== 0) {
    return { success: true, files: [] };
  }
  return { success: true, files: listFilesInAttachFolder_(folderUrl), folderUrl: folderUrl };
}

/**
 * جلب ملف مرفق عبر النظام (حساب السكربت يرى الملف حتى لو درايف فارغ للزائر)
 */
function getTransactionAttachmentFile(session, folderUrl, fileId) {
  const auth = requireSession_(session);
  if (!auth.ok) return auth.result;
  fileId = sanitizeText(fileId, 120);
  const folder = getAttachFolderByUrl_(folderUrl);
  if (!folder) return { success: false, messageKey: 'edit.attachNotFound' };
  try {
    const file = DriveApp.getFileById(fileId);
    const parents = file.getParents();
    let ok = false;
    while (parents.hasNext()) {
      if (parents.next().getId() === folder.getId()) { ok = true; break; }
    }
    if (!ok) return { success: false, messageKey: 'auth.forbidden' };
    const blob = file.getBlob();
    const bytes = blob.getBytes();
    if (bytes.length > 6 * 1024 * 1024) {
      return { success: false, messageKey: 'edit.attachTooLarge', url: file.getUrl() };
    }
    return {
      success: true,
      name: file.getName(),
      mime: file.getMimeType() || blob.getContentType() || 'application/octet-stream',
      base64: Utilities.base64Encode(bytes),
      url: file.getUrl()
    };
  } catch (e) {
    return { success: false, messageKey: 'edit.attachNotFound', message: String(e && e.message || e) };
  }
}

/**
 * حذف ملف واحد من مجلد المرفقات
 */
function deleteTransactionAttachmentFile(session, folderUrl, fileId) {
  const auth = requireSession_(session);
  if (!auth.ok) return auth.result;
  fileId = sanitizeText(fileId, 120);
  const folder = getAttachFolderByUrl_(folderUrl);
  if (!folder) return { success: false, messageKey: 'edit.attachNotFound' };
  try {
    const file = DriveApp.getFileById(fileId);
    // تأكد أن الملف داخل المجلد
    const parents = file.getParents();
    let ok = false;
    while (parents.hasNext()) {
      if (parents.next().getId() === folder.getId()) { ok = true; break; }
    }
    if (!ok) return { success: false, messageKey: 'auth.forbidden' };
    file.setTrashed(true);
    const remaining = listFilesInAttachFolder_(folderUrl);
    return {
      success: true,
      files: remaining,
      folderUrl: remaining.length ? folderUrl : '',
      empty: remaining.length === 0
    };
  } catch (e) {
    return { success: false, messageKey: 'edit.attachDeleteFail', message: e.message };
  }
}

/**
 * استلام بيانات العملية وحفظها
 * @param {Object} session - {username, token} بيانات الجلسة الحالية للتحقق الأمني
 * @param {Object} data - كائن يحتوي على تفاصيل العملية
 * @param {Array} attachments - مصفوفة المرفقات (الصور)
 */
function processTransaction(session, data, attachments) {
  const auth = requireSession_(session);
  if (!auth.ok) {
    return Object.assign({ success: false }, authFailFields_(auth));
  }

  data = sanitizeObjectStrings_(data, 500);
  // الموظف المسؤول دائماً من الجلسة — لا يُقبل من الواجهة (عزل أرصدة كل موظف)
  data.employee = auth.username;

  try {
    const systemDate = new Date();
    const trxDateOnly = formatTrxDateOnly_(data.trxDate);
    let refType = '';
    let sheet = null;
    let dict = {};

    if (data.type === 'وارد') refType = 'IN';
    else if (data.type === 'صادر') refType = 'OUT';
    else if (data.type === 'تصريف') refType = 'EX';
    else if (data.type === 'تحويل') refType = 'TR';
    else if (data.type === 'سلفة') refType = 'AD';
    else return { success: false, messageKey: 'form.err.unknownType' };

    const ref = generateReference(refType);
    const dailyNum = consumeOperationNumber_(auth.username, refType);

    let fileUrl = 'لا يوجد مرفق';
    const attachList = normalizeAttachments_(attachments);
    if (attachList.length > 0) {
      const mainFolder = getOrCreateReceiptsFolder();
      const txFolder = mainFolder.createFolder('مرفقات العملية ' + ref);
      const written = writeAttachmentsIntoFolder_(txFolder, attachList);
      if (written > 0) {
        fileUrl = txFolder.getUrl();
      }
    }

    const base = {};
    base[COL.SEQ] = dailyNum;
    base[COL.TRX_DATE] = trxDateOnly; // تاريخ فقط بدون وقت
    base[COL.SYS_DATE] = systemDate;  // تاريخ+وقت الإدخال التلقائي
    base['التاريخ والوقت'] = systemDate; // توافق مع المخطط القديم إن وُجد العمود
    base[COL.ATTACH] = fileUrl;
    base[COL.NOTES] = data.notes || '';
    base[COL.EMPLOYEE] = data.employee || '';
    base[COL.STATUS] = 'مكتملة';
    base[COL.REF] = ref;

    if (data.type === 'وارد' || data.type === 'صادر') {
      sheet = ensureSheet_(data.type === 'وارد' ? SHEETS.INCOMES : SHEETS.OUTCOMES,
        data.type === 'وارد' ? HEADERS_INCOMES : HEADERS_OUTCOMES);
      dict = Object.assign({}, base);
      dict[COL.PROJECT] = data.project || '';
      dict[COL.DESC] = data.description || '';
      dict[COL.FUND] = data.fund || FUND.VAULT;
      dict[COL.BANK] = (data.fund === FUND.BANK) ? (data.bank || '') : '';
      dict[data.type === 'وارد' ? COL.SENDER : COL.DELIVERER] = data.sender || '';
      dict[COL.RECEIVER] = data.receiver || '';
      dict[COL.CURRENCY] = data.currency || '';
      dict[COL.QTY] = data.quantity || '';
      dict[COL.AMOUNT] = data.amount || '';
      dict[COL.TOTAL] = data.total || '';
      if (data.fund === FUND.BANK && !dict[COL.BANK]) {
        return { success: false, messageKey: 'form.err.bankRequired' };
      }
    } else if (data.type === 'تصريف') {
      sheet = ensureSheet_(SHEETS.EXCHANGES, HEADERS_EXCHANGES);
      dict = Object.assign({}, base);
      dict[COL.FUND] = data.fund || FUND.VAULT;
      dict[COL.BANK] = (data.fund === FUND.BANK) ? (data.bank || '') : '';
      // الاتجاه والإجمالي من الخادم دائماً — لا يُعتمد على حساب المتصفح
      const exDir = exchangeDirection_(data.exchangeType);
      const exAmt = Number(data.exchangeAmount) || 0;
      const exRate = Number(data.exchangeRate) || 0;
      const exTotal = convertByRate_(exAmt, exRate, exDir.from, exDir.to);
      dict[COL.EX_TYPE] = data.exchangeType || '';
      dict[COL.PAID_CUR] = exDir.from;
      dict[COL.REC_CUR] = exDir.to;
      dict[COL.AMT_CUR] = exDir.from;
      dict[COL.EX_AMT] = exAmt;
      dict[COL.EX_RATE] = exRate;
      dict[COL.TOTAL] = exTotal;
      if (data.fund === FUND.BANK && !dict[COL.BANK]) {
        return { success: false, messageKey: 'form.err.bankRequired' };
      }
      if (!(exAmt > 0 && exRate > 0 && exTotal > 0)) {
        return { success: false, messageKey: 'form.err.amountInvalid' };
      }
    } else if (data.type === 'تحويل') {
      sheet = ensureSheet_(SHEETS.TRANSFERS, HEADERS_TRANSFERS);
      dict = Object.assign({}, base);
      dict[COL.FROM_FUND] = data.fromFund || '';
      dict[COL.TO_FUND] = data.toFund || '';
      dict[COL.FROM_BANK] = (data.fromFund === FUND.BANK) ? (data.fromBank || '') : '';
      dict[COL.TO_BANK] = (data.toFund === FUND.BANK) ? (data.toBank || '') : '';
      dict[COL.CURRENCY] = data.currency || '';
      dict[COL.AMOUNT] = data.amount || '';
      dict[COL.BORROWER] = data.borrower || '';
      if (data.fromFund === FUND.BANK && !dict[COL.FROM_BANK]) {
        return { success: false, messageKey: 'form.err.bankRequired' };
      }
      if (data.toFund === FUND.BANK && !dict[COL.TO_BANK]) {
        return { success: false, messageKey: 'form.err.bankRequired' };
      }
    } else if (data.type === 'سلفة') {
      sheet = ensureSheet_(SHEETS.ADVANCES, HEADERS_ADVANCES);
      dict = Object.assign({}, base);
      dict[COL.BORROWER] = data.borrower || '';
      dict[COL.ADV_TYPE] = data.advType || '';
      dict[COL.PROJECT] = data.project || '';
      dict[COL.DESC] = data.description || '';
      dict[COL.RECEIVER] = data.receiver || '';
      dict[COL.CURRENCY] = data.currency || '';
      dict[COL.QTY] = data.quantity || '';
      dict[COL.AMOUNT] = data.amount || '';
      dict[COL.EX_RATE] = data.exchangeRate || '';
      dict[COL.TOTAL] = data.total || '';
      dict[COL.FROM_CUR] = data.fromCurrency || '';
      dict[COL.TO_CUR] = data.toCurrency || '';
      if (data.advType === 'تصريف') {
        const advFrom = normalizeCurrency_(data.fromCurrency);
        const advTo = normalizeCurrency_(data.toCurrency);
        if (!advFrom || !advTo || advFrom === advTo) {
          return { success: false, messageKey: 'form.err.sameCurrency' };
        }
        const amt = Number(data.amount) || 0;
        const rate = Number(data.exchangeRate) || 0;
        const advTotal = convertByRate_(amt, rate, advFrom, advTo);
        dict[COL.FROM_CUR] = advFrom;
        dict[COL.TO_CUR] = advTo;
        dict[COL.CURRENCY] = advFrom;
        dict[COL.AMOUNT] = amt;
        dict[COL.EX_RATE] = rate;
        dict[COL.TOTAL] = advTotal;
        if (!(amt > 0 && rate > 0 && advTotal > 0)) {
          return { success: false, messageKey: 'form.err.amountInvalid' };
        }
      }
    }

    appendRowByHeaders_(sheet, dict);
    invalidateBalanceCache_(auth.username);
    return { success: true, messageKey: 'form.saved', seq: dailyNum, ref: ref };

  } catch (e) {
    return { success: false, messageKey: 'form.err.server', message: e.message };
  }
}

// ====== أدوات الحسابات (Balances) ======

/**
 * حساب أرصدة صناديق المستخدم الحالي فقط (كل موظف له خزنته/شام كاش/سلف خاصة)
 * @param {Object} session - {username, token}
 */
function getSafeBalances(session, skipCache) {
  const auth = requireSession_(session);
  if (!auth.ok) {
    return Object.assign({
      success: false,
      funds: { vault: [], sham: [], banks: [], advances: [] }
    }, authFailFields_(auth));
  }

  const empName = String(auth.username || '').trim();
  return computeEmployeeBalances_(empName, !skipCache);
}

/**
 * حساب أرصدة موظف (داخلي) — يُستخدم للموظف الحالي ولمشرف صندوق الموظف
 * @param {string} empName
 * @param {boolean} useCache
 */
function computeEmployeeBalances_(empName, useCache) {
  empName = String(empName || '').trim();
  if (!empName) {
    return { success: false, funds: { vault: [], sham: [], banks: [], advances: [] } };
  }
  if (useCache) {
    const cachedBal = cacheGetJson_('ug_bal_' + empName);
    if (cachedBal && cachedBal.success) return cachedBal;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fundMaps = {};
  fundMaps[FUND.VAULT] = {};
  fundMaps[FUND.SHAM] = {};
  const fundTouched = {};
  fundTouched[FUND.VAULT] = {};
  fundTouched[FUND.SHAM] = {};
  const bankMaps = {}; // bankName -> currency -> amount
  const bankTouched = {};
  const advancesMap = {};
  const advancesTouched = {};

  function currencyCode(name) {
    if (name === 'دولار') return 'USD';
    if (name === 'ليرة سورية') return 'SYP';
    return String(name || '').substring(0, 6).toUpperCase() || '—';
  }

  function touchCashFund(fundName, currency, delta) {
    if (!currency) return;
    if (fundName !== FUND.VAULT && fundName !== FUND.SHAM) return;
    if (!fundMaps[fundName]) { fundMaps[fundName] = {}; fundTouched[fundName] = {}; }
    fundTouched[fundName][currency] = true;
    fundMaps[fundName][currency] = (fundMaps[fundName][currency] || 0) + (Number(delta) || 0);
  }

  function touchBank(bankName, currency, delta) {
    if (!bankName || !currency) return;
    if (!bankMaps[bankName]) bankMaps[bankName] = {};
    if (!bankTouched[bankName]) bankTouched[bankName] = {};
    bankTouched[bankName][currency] = true;
    bankMaps[bankName][currency] = (bankMaps[bankName][currency] || 0) + (Number(delta) || 0);
  }

  function touchFund(fundName, currency, delta, bankName) {
    if (!currency) return;
    if (fundName === FUND.BANK) {
      touchBank(bankName, currency, delta);
      return;
    }
    if (fundName === FUND.SHAM) {
      touchCashFund(FUND.SHAM, currency, delta);
      return;
    }
    if (fundName === FUND.VAULT || !fundName) {
      touchCashFund(FUND.VAULT, currency, delta);
    }
  }

  function touchAdvance(borrower, currency, delta) {
    if (!borrower || !currency) return;
    if (!advancesMap[borrower]) advancesMap[borrower] = {};
    if (!advancesTouched[borrower]) advancesTouched[borrower] = {};
    advancesTouched[borrower][currency] = true;
    advancesMap[borrower][currency] = (advancesMap[borrower][currency] || 0) + (Number(delta) || 0);
  }

  function mapToCurrencyList(balanceMap, touchedMap) {
    const order = { 'دولار': 0, 'ليرة سورية': 1 };
    const list = [];
    Object.keys(touchedMap || {}).forEach(function(cur) {
      list.push({ currency: cur, code: currencyCode(cur), amount: balanceMap[cur] || 0 });
    });
    list.sort(function(a, b) {
      const ao = order.hasOwnProperty(a.currency) ? order[a.currency] : 50;
      const bo = order.hasOwnProperty(b.currency) ? order[b.currency] : 50;
      return ao - bo;
    });
    return list;
  }

  function isOwnComplete(row) {
    if (isDeletedTxStatus_(row[COL.STATUS])) return false;
    if (!statusAffectsBalance_(row[COL.STATUS])) return false;
    return rowEmployee_(row) === empName;
  }

  try {
    sheetRowsAsObjects_(ss.getSheetByName(SHEETS.INCOMES)).forEach(function(row) {
      if (!isOwnComplete(row)) return;
      touchFund(row[COL.FUND], row[COL.CURRENCY], Number(row[COL.TOTAL]) || 0, row[COL.BANK]);
    });

    sheetRowsAsObjects_(ss.getSheetByName(SHEETS.OUTCOMES)).forEach(function(row) {
      if (!isOwnComplete(row)) return;
      touchFund(row[COL.FUND], row[COL.CURRENCY], -(Number(row[COL.TOTAL]) || 0), row[COL.BANK]);
    });

    sheetRowsAsObjects_(ss.getSheetByName(SHEETS.EXCHANGES)).forEach(function(row) {
      if (!isOwnComplete(row)) return;
      const fund = row[COL.FUND] || FUND.VAULT;
      const bank = row[COL.BANK];
      const legs = exchangeLegs_(row);
      touchFund(fund, legs.paidCur, -legs.paidAmount, bank);
      touchFund(fund, legs.recCur, legs.recAmount, bank);
    });

    sheetRowsAsObjects_(ss.getSheetByName(SHEETS.TRANSFERS)).forEach(function(row) {
      if (!isOwnComplete(row)) return;
      const fromFund = row[COL.FROM_FUND];
      const toFund = row[COL.TO_FUND];
      const fromBank = row[COL.FROM_BANK];
      const toBank = row[COL.TO_BANK];
      const currency = row[COL.CURRENCY];
      const amount = Number(row[COL.AMOUNT]) || 0;
      const borrower = row[COL.BORROWER];

      if (fromFund === FUND.ADVANCES) touchAdvance(borrower, currency, -amount);
      else touchFund(fromFund, currency, -amount, fromBank);

      if (toFund === FUND.ADVANCES) touchAdvance(borrower, currency, amount);
      else touchFund(toFund, currency, amount, toBank);
    });

    sheetRowsAsObjects_(ss.getSheetByName(SHEETS.ADVANCES)).forEach(function(row) {
      if (!isOwnComplete(row)) return;
      const borrower = row[COL.BORROWER];
      const advType = row[COL.ADV_TYPE];
      if (advType === 'صادر' || advType === 'وارد') {
        // الصادر/الوارد في السلف ينقص رصيد المستلف (وارد هنا بمعنى خروج من رصيد المستلف)
        touchAdvance(borrower, row[COL.CURRENCY], -(Number(row[COL.TOTAL]) || 0));
      } else if (advType === 'تصريف') {
        const fromCur = row[COL.FROM_CUR];
        const toCur = row[COL.TO_CUR];
        const amount = Number(row[COL.AMOUNT]) || 0;
        const rate = Number(row[COL.EX_RATE]) || 0;
        // الصفوف السابقة لإضافة سعر الصرف سُجّلت بمبلغ واحد للطرفين — تبقى كما هي
        let received = Number(row[COL.TOTAL]) || 0;
        if (!received) received = rate > 0 ? convertByRate_(amount, rate, fromCur, toCur) : amount;
        touchAdvance(borrower, fromCur, -amount);
        touchAdvance(borrower, toCur, received);
      }
    });

    ensureSheet_(SHEETS.OPENING, HEADERS_OPENING);
    sheetRowsAsObjects_(ss.getSheetByName(SHEETS.OPENING)).forEach(function(row) {
      if (!isOwnComplete(row)) return;
      touchFund(row[COL.FUND] || FUND.VAULT, row[COL.CURRENCY], Number(row[COL.AMOUNT]) || 0, '');
    });

    const vault = mapToCurrencyList(fundMaps[FUND.VAULT], fundTouched[FUND.VAULT]);
    const sham = mapToCurrencyList(fundMaps[FUND.SHAM], fundTouched[FUND.SHAM]);
    const banks = Object.keys(bankTouched).sort().map(function(name) {
      return {
        name: name,
        balances: mapToCurrencyList(bankMaps[name], bankTouched[name])
      };
    });
    const advances = Object.keys(advancesTouched).map(function(name) {
      return {
        name: name,
        balances: mapToCurrencyList(advancesMap[name], advancesTouched[name])
      };
    });

    const payload = {
      success: true,
      employee: empName,
      usd: (fundMaps[FUND.VAULT]['دولار'] || 0),
      syp: (fundMaps[FUND.VAULT]['ليرة سورية'] || 0),
      funds: { vault: vault, sham: sham, banks: banks, advances: advances }
    };
    if (useCache) cachePutJson_('ug_bal_' + empName, payload, 45);
    return payload;
  } catch (e) {
    return { success: false, error: e.message, funds: { vault: [], sham: [], banks: [], advances: [] } };
  }
}

/**
 * نظرة شاملة لصناديق موظف — مشرف فقط
 */
function getEmployeeFundsOverview(session, employeeName) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) return auth.result;

  const emp = sanitizeText(employeeName || '', 100);
  if (!emp) return { success: false, messageKey: 'empFunds.pickEmployee' };

  const bal = computeEmployeeBalances_(emp, false);
  if (!bal || !bal.success) {
    return {
      success: false,
      messageKey: 'form.err.server',
      message: (bal && bal.error) || ''
    };
  }

  const tz = Session.getScriptTimeZone();
  return {
    success: true,
    employee: emp,
    funds: bal.funds || { vault: [], sham: [], banks: [], advances: [] },
    generatedAt: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss')
  };
}

// ====== الرصيد الافتتاحي (Supervisor) ======

/**
 * حفظ رصيد افتتاحي لصندوق موظف (خزنة / شام كاش)
 * للمشرف فقط — يخصم/يُضاف لاحقاً ضمن أرصدة ذلك الموظف فقط
 */
function saveOpeningBalance(session, data) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) return auth.result;

  data = sanitizeObjectStrings_(data || {}, 500);
  const employee = sanitizeText(data.employee || auth.username, 100);
  const fund = sanitizeText(data.fund || 'الخزنة', 40);
  const currency = sanitizeText(data.currency || '', 40);
  const notes = sanitizeText(data.notes || '', 500);
  const amount = Number(data.amount);

  if (!employee) return { success: false, messageKey: 'opening.err.employee' };
  if (fund !== 'الخزنة' && fund !== 'شام كاش') {
    return { success: false, messageKey: 'opening.err.fund' };
  }
  if (currency !== 'دولار' && currency !== 'ليرة سورية') {
    return { success: false, messageKey: 'opening.err.currency' };
  }
  if (!isFinite(amount) || amount === 0) {
    return { success: false, messageKey: 'opening.err.amount' };
  }

  const sheet = ensureSheet_(SHEETS.OPENING, HEADERS_OPENING);
  // عداد الرصيد الافتتاحي لكل موظف مستهدف على حدة (يومياً)
  const dailyNum = consumeOperationNumber_(employee, 'OB');
  const ref = generateReference('OB');
  const trxDateOnly = formatTrxDateOnly_(data.trxDate || new Date());

  appendRowByHeaders_(sheet, {
    'رقم العملية': dailyNum,
    'تاريخ العملية': trxDateOnly,
    'تاريخ الإدخال': new Date(),
    'الصندوق': fund,
    'العملة': currency,
    'المبلغ': amount,
    'ملاحظات': notes,
    'الموظف': employee,
    'الحالة': 'مكتملة',
    'المرجع': ref
  });

  invalidateBalanceCache_(employee);

  return {
    success: true,
    messageKey: 'opening.saved',
    ref: ref,
    seq: dailyNum,
    employee: employee
  };
}

/**
 * سجل الأرصدة الافتتاحية — مشرف فقط
 * @param {Object} session
 * @param {Object} filters - { employee, fund, currency }
 */
function getOpeningBalanceLog(session, filters) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) {
    return {
      success: false,
      sessionExpired: !!(auth.result && auth.result.sessionExpired),
      sessionLocked: !!(auth.result && auth.result.sessionLocked),
      messageKey: (auth.result && auth.result.messageKey) || 'auth.forbidden',
      rows: []
    };
  }

  filters = filters || {};
  const employee = String(filters.employee || '').trim().slice(0, 500);
  const fund = String(filters.fund || '').trim().slice(0, 120);
  const currency = String(filters.currency || '').trim().slice(0, 120);
  const trxDateFrom = String(filters.trxDateFrom || '').trim();
  const trxDateTo = String(filters.trxDateTo || '').trim();
  const sysDateFrom = String(filters.sysDateFrom || '').trim();
  const sysDateTo = String(filters.sysDateTo || '').trim();

  ensureSheet_(SHEETS.OPENING, HEADERS_OPENING);
  const rows = sheetTailRowsAsObjects_(
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.OPENING),
    SHEET_TAIL_SCAN_CAP
  );
  const out = [];

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (employee && !matchExactFilter_(rowEmployee_(row), employee)) continue;
    if (fund && !matchExactFilter_(row[COL.FUND], fund)) continue;
    if (currency && !matchExactFilter_(row[COL.CURRENCY], currency)) continue;
    const trxD = rowDateValue_(row, true);
    const sysD = rowDateValue_(row, false);
    if (!matchDateRange_(trxD, trxDateFrom, trxDateTo)) continue;
    if (!matchDateRange_(sysD, sysDateFrom, sysDateTo)) continue;

    out.push({
      seq: row[COL.SEQ] || '-',
      trxDate: formatLogDate_(row[COL.TRX_DATE], false),
      sysDate: formatLogDate_(row[COL.SYS_DATE], true),
      fund: row[COL.FUND] || '-',
      currency: row[COL.CURRENCY] || '-',
      amount: row[COL.AMOUNT] || 0,
      notes: row[COL.NOTES] || '-',
      employee: rowEmployee_(row) || '-',
      status: row[COL.STATUS] || '-',
      ref: row[COL.REF] || '-'
    });
    if (out.length >= 300) break;
  }

  return { success: true, rows: out };
}

// ====== إدارة الموظفين (Supervisor) ======

/**
 * قائمة الموظفين للإدارة (مع الدور والحالة — بدون إرجاع كلمة السر في القائمة)
 */
function listManagedEmployees(session) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) {
    return {
      success: false,
      sessionExpired: !!(auth.result && auth.result.sessionExpired),
      sessionLocked: !!(auth.result && auth.result.sessionLocked),
      messageKey: (auth.result && auth.result.messageKey) || 'auth.forbidden',
      rows: []
    };
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EMPLOYEES);
  if (!sheet) return { success: true, rows: [] };
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] == null ? '' : data[i][0]).trim();
    if (!name) continue;
    rows.push({
      name: name,
      role: String(data[i][2] || ROLES.EMPLOYEE).trim(),
      status: String(data[i][3] || '').trim(),
      rowIndex: i + 1
    });
  }
  return { success: true, rows: rows };
}

/**
 * إضافة أو تعديل موظف
 * data: { mode: 'add'|'edit', name, password, role, status, originalName }
 * عند التعديل: إن تُركت كلمة السر فارغة تبقى كما هي
 */
function saveManagedEmployee(session, data) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) return auth.result;

  data = data || {};
  const mode = sanitizeText(data.mode || 'add', 20);
  const name = sanitizeText(data.name || '', 100);
  const passwordRaw = String(data.password == null ? '' : data.password).slice(0, 200);
  const role = String(data.role || ROLES.EMPLOYEE).trim();
  const status = String(data.status || 'نشط').trim();
  const originalName = sanitizeText(data.originalName || '', 100);

  if (!name) return { success: false, messageKey: 'employees.err.name' };
  if (role !== ROLES.EMPLOYEE && role !== ROLES.SUPERVISOR) {
    return { success: false, messageKey: 'employees.err.role' };
  }
  if (status !== 'نشط' && status !== 'موقوف') {
    return { success: false, messageKey: 'employees.err.status' };
  }

  const sheet = ensureSheet_(SHEETS.EMPLOYEES, [
    'اسم الموظف', 'كلمة السر', 'الصلاحية', 'حالة الحساب'
  ]);
  const values = sheet.getDataRange().getValues();

  function findRowByName_(target) {
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] == null ? '' : values[i][0]).trim() === target) return i + 1;
    }
    return -1;
  }

  if (mode === 'edit') {
    const rowIndex = findRowByName_(originalName || name);
    if (rowIndex < 0) return { success: false, messageKey: 'employees.err.notFound' };

    // منع تكرار الاسم إذا تغيّر
    if (name !== (originalName || name)) {
      if (findRowByName_(name) > 0) return { success: false, messageKey: 'employees.err.duplicate' };
    }

    const currentPass = String(values[rowIndex - 1][1] == null ? '' : values[rowIndex - 1][1]);
    const newPass = passwordRaw !== '' ? passwordRaw : currentPass;
    // Sheet.getRange(row, col, numRows, numColumns) — ليس endRow/endCol
    sheet.getRange(rowIndex, 1, 1, 4).setValues([[name, newPass, role, status]]);

    // لا يوقف المشرف نفسه بالخطأ دون بديل — تحذير بسيط عبر السماح مع تنبيه لاحقاً إن لزم
    invalidateUserListsCache_();
    return { success: true, messageKey: 'employees.updated' };
  }

  // إضافة
  if (findRowByName_(name) > 0) return { success: false, messageKey: 'employees.err.duplicate' };
  if (!passwordRaw) return { success: false, messageKey: 'employees.err.password' };
  sheet.appendRow([name, passwordRaw, role, status]);
  invalidateUserListsCache_();
  return { success: true, messageKey: 'employees.created' };
}

// ====== سجل العمليات (Transaction Log) ======

/** تنسيق تاريخ للعرض (تاريخ فقط أو تاريخ+وقت) */
function formatLogDate_(value, withTime) {
  if (value === null || value === undefined || value === '') return '-';
  let d = value;
  if (!(d instanceof Date)) {
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split('-').reverse().join('/');
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return String(value);
  const datePart = Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  if (!withTime) return datePart;
  return datePart + ' - ' + Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
}

function parseFilterDateBound_(value, endOfDay) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const p = s.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function rowDateValue_(row, preferTrx) {
  let v = preferTrx
    ? (row[COL.TRX_DATE] || row[COL.SYS_DATE] || row['التاريخ والوقت'] || (row.__raw && row.__raw[1]))
    : (row[COL.SYS_DATE] || row['التاريخ والوقت'] || row[COL.TRX_DATE] || (row.__raw && row.__raw[1]));
  if (v instanceof Date) return v;
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const p = s.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function mapRowToLogRecord_(row, typeName) {
  const trxRaw = row[COL.TRX_DATE] || row[COL.SYS_DATE] || row['التاريخ والوقت'] || (row.__raw && row.__raw[1]);
  const sysRaw = row[COL.SYS_DATE] || row['التاريخ والوقت'] || row[COL.TRX_DATE] || (row.__raw && row.__raw[1]);
  const base = {
    typeName: typeName,
    seq: row[COL.SEQ] || '-',
    trxDate: formatLogDate_(trxRaw, false),
    sysDate: formatLogDate_(sysRaw, true),
    dateStr: formatLogDate_(trxRaw, false),
    notes: row[COL.NOTES] || row[COL.DESC] || '-',
    description: row[COL.DESC] || '-',
    link: row[COL.ATTACH] || '',
    status: row[COL.STATUS] || '-',
    ref: row[COL.REF],
    fund: row[COL.FUND] || 'الخزنة',
    employee: row[COL.EMPLOYEE] || ''
  };

  if (typeName === 'وارد' || typeName === 'صادر') {
    return Object.assign(base, {
      project: row[COL.PROJECT] || '-',
      bank: row[COL.BANK] || '-',
      sender: row[COL.SENDER] || row[COL.DELIVERER] || '-',
      receiver: row[COL.RECEIVER] || '-',
      currency: row[COL.CURRENCY] || '-',
      qty: row[COL.QTY] || '-',
      amount: row[COL.AMOUNT] || '-',
      total: row[COL.TOTAL] || '-',
      notes: row[COL.NOTES] || row[COL.DESC] || '-'
    });
  }
  if (typeName === 'تصريف') {
    // المبلغ يُعرض دائماً بعملة المصدر والإجمالي بعملة الوجهة مهما كان تاريخ الصف
    const legs = exchangeLegs_(row);
    return Object.assign(base, {
      bank: row[COL.BANK] || '-',
      exType: row[COL.EX_TYPE] || '-',
      paidCur: legs.paidCur || '-',
      recCur: legs.recCur || '-',
      exAmt: legs.paidAmount,
      exRate: row[COL.EX_RATE] || '-',
      total: legs.recAmount,
      notes: row[COL.NOTES] || '-'
    });
  }
  if (typeName === 'تحويل') {
    return Object.assign(base, {
      fromFund: row[COL.FROM_FUND] || '-',
      toFund: row[COL.TO_FUND] || '-',
      fromBank: row[COL.FROM_BANK] || '-',
      toBank: row[COL.TO_BANK] || '-',
      currency: row[COL.CURRENCY] || '-',
      amount: row[COL.AMOUNT] || '-',
      borrower: row[COL.BORROWER] || '-',
      notes: row[COL.NOTES] || '-'
    });
  }
  // سلفة
  return Object.assign(base, {
    borrower: row[COL.BORROWER] || '-',
    advType: row[COL.ADV_TYPE] || '-',
    project: row[COL.PROJECT] || '-',
    currency: row[COL.CURRENCY] || row[COL.FROM_CUR] || '-',
    fromCurrency: row[COL.FROM_CUR] || '-',
    toCurrency: row[COL.TO_CUR] || '-',
    qty: row[COL.QTY] || '-',
    amount: row[COL.AMOUNT] || row[COL.TOTAL] || '-',
    exRate: row[COL.EX_RATE] || '-',
    total: row[COL.TOTAL] || '-',
    receiver: row[COL.RECEIVER] || '-',
    notes: row[COL.NOTES] || row[COL.DESC] || '-'
  });
}

function resolveLogSheet_(tableType) {
  if (tableType === 'tbody-incomes' || tableType === 'IN') return { sheetName: SHEETS.INCOMES, typeName: 'وارد' };
  if (tableType === 'tbody-outcomes' || tableType === 'OUT') return { sheetName: SHEETS.OUTCOMES, typeName: 'صادر' };
  if (tableType === 'tbody-exchanges' || tableType === 'EX') return { sheetName: SHEETS.EXCHANGES, typeName: 'تصريف' };
  if (tableType === 'tbody-transfers' || tableType === 'TR') return { sheetName: SHEETS.TRANSFERS, typeName: 'تحويل' };
  if (tableType === 'tbody-advances' || tableType === 'AD') return { sheetName: SHEETS.ADVANCES, typeName: 'سلفة' };
  return null;
}

function matchTextFilter_(cellValue, filterValue) {
  if (!filterValue) return true;
  return String(cellValue || '').toLowerCase().indexOf(String(filterValue).toLowerCase()) !== -1;
}

function matchExactFilter_(cellValue, filterValue) {
  if (filterValue === null || filterValue === undefined || filterValue === '' || filterValue === 'ALL') {
    return true;
  }
  if (Array.isArray(filterValue)) {
    if (!filterValue.length) return true;
    const cell = String(cellValue == null ? '' : cellValue).trim();
    return filterValue.map(function(v) { return String(v).trim(); })
      .filter(Boolean)
      .indexOf(cell) !== -1;
  }
  const raw = String(filterValue);
  if (raw.indexOf('|') !== -1) {
    const parts = raw.split('|').map(function(v) { return v.trim(); }).filter(Boolean);
    if (!parts.length) return true;
    return parts.indexOf(String(cellValue == null ? '' : cellValue).trim()) !== -1;
  }
  return String(cellValue == null ? '' : cellValue).trim() === raw.trim();
}

/** فلترة عملة صف سلفة: التصريف يمسّ عملتين فيُقبل بأيٍّ منهما */
function matchAdvanceCurrencyFilter_(row, currencyFilter) {
  if (!currencyFilter) return true;
  if (String(row[COL.ADV_TYPE] || '') === 'تصريف') {
    return matchExactFilter_(row[COL.FROM_CUR], currencyFilter) ||
      matchExactFilter_(row[COL.TO_CUR], currencyFilter);
  }
  return matchExactFilter_(row[COL.CURRENCY] || row[COL.FROM_CUR], currencyFilter);
}

function matchDateRange_(dateObj, fromStr, toStr) {
  if (!fromStr && !toStr) return true;
  if (!dateObj || isNaN(dateObj.getTime())) return false;
  const from = parseFilterDateBound_(fromStr, false);
  const to = parseFilterDateBound_(toStr, true);
  if (from && dateObj < from) return false;
  if (to && dateObj > to) return false;
  return true;
}

/**
 * جلب سجل العمليات لآخر 7 أيام حسب تاريخ الإدخال (بحد أقصى 500 عملية لكل جدول)
 * تاريخ العملية يبقى للعرض/البحث المتقدم فقط — لا يُستخدم في النافذة التلقائية
 * السجل الشخصي يعرض عمليات المستخدم الحالي فقط (موظف ومشرف)
 * @param {Object} session - {username, token}
 */
function getRecentTransactions(session) {
  const auth = requireSession_(session);
  if (!auth.ok) {
    return Object.assign({
      incomes: [], outcomes: [], exchanges: [], transfers: [], advances: []
    }, authFailFields_(auth));
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = { incomes: [], outcomes: [], exchanges: [], transfers: [], advances: [] };
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  sevenDaysAgo.setHours(0, 0, 0, 0);

  function collect(sheetName, typeName, arrayRef) {
    // آخر 8000 صف كافية لآخر 7 أيام حتى مع نشاط عالٍ
    const rows = sheetTailRowsAsObjects_(ss.getSheetByName(sheetName), SHEET_TAIL_SCAN_CAP);
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (String(row[COL.EMPLOYEE] || '') !== auth.username) continue;
      // النافذة التلقائية: تاريخ الإدخال (متى سجّل الموظف)، وليس تاريخ العملية
      const d = rowDateValue_(row, false);
      if (!d || d < sevenDaysAgo) continue;
      arrayRef.push(mapRowToLogRecord_(row, typeName));
    }
  }

  collect(SHEETS.INCOMES, 'وارد', result.incomes);
  collect(SHEETS.OUTCOMES, 'صادر', result.outcomes);
  collect(SHEETS.EXCHANGES, 'تصريف', result.exchanges);
  collect(SHEETS.TRANSFERS, 'تحويل', result.transfers);
  collect(SHEETS.ADVANCES, 'سلفة', result.advances);

  result.incomes = result.incomes.slice(0, 500);
  result.outcomes = result.outcomes.slice(0, 500);
  result.exchanges = result.exchanges.slice(0, 500);
  result.transfers = result.transfers.slice(0, 500);
  result.advances = result.advances.slice(0, 500);
  return result;
}

/** توافق خلفي مع الاستدعاءات القديمة — البحث اليومي التلقائي حسب تاريخ الإدخال */
function getTransactionsByDate(session, dateString, tableType) {
  const parts = String(dateString || '').split('/');
  let iso = '';
  if (parts.length === 3) iso = parts[2] + '-' + parts[1] + '-' + parts[0];
  return searchTransactions(session, { sysDateFrom: iso, sysDateTo: iso }, tableType);
}

/**
 * بحث متقدم بدون حد أيام — filters كائن مرن حسب نوع السجل
 * السجل الشخصي مقصور على عمليات المستخدم الحالي
 * @param {Object} session
 * @param {Object} filters
 * @param {string} tableType
 */
function searchTransactions(session, filters, tableType) {
  const auth = requireSession_(session);
  if (!auth.ok) return [];

  filters = filters || {};
  const meta = resolveLogSheet_(tableType);
  if (!meta) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rows = sheetTailRowsAsObjects_(ss.getSheetByName(meta.sheetName), SHEET_TAIL_SCAN_CAP);
  const results = [];

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (String(row[COL.EMPLOYEE] || '') !== auth.username) continue;

    const trxD = rowDateValue_(row, true);
    const sysD = rowDateValue_(row, false);

    if (!matchDateRange_(trxD, filters.trxDateFrom, filters.trxDateTo)) continue;
    if (!matchDateRange_(sysD, filters.sysDateFrom, filters.sysDateTo)) continue;

    if (meta.typeName === 'وارد' || meta.typeName === 'صادر') {
      if (!matchExactFilter_(row[COL.PROJECT], filters.project)) continue;
      if (!matchTextFilter_(row[COL.SENDER] || row[COL.DELIVERER], filters.sender)) continue;
      if (!matchTextFilter_(row[COL.RECEIVER], filters.receiver)) continue;
      if (!matchExactFilter_(row[COL.CURRENCY], filters.currency)) continue;
      if (!matchExactFilter_(row[COL.FUND] || 'الخزنة', filters.fund)) continue;
    } else if (meta.typeName === 'تصريف') {
      if (!matchExactFilter_(row[COL.EX_TYPE], filters.exType)) continue;
      if (!matchExactFilter_(row[COL.PAID_CUR], filters.paidCur)) continue;
      if (!matchExactFilter_(row[COL.REC_CUR], filters.recCur)) continue;
      if (!matchExactFilter_(row[COL.FUND] || 'الخزنة', filters.fund)) continue;
    } else if (meta.typeName === 'تحويل') {
      if (!matchExactFilter_(row[COL.FROM_FUND], filters.fromFund)) continue;
      if (!matchExactFilter_(row[COL.TO_FUND], filters.toFund)) continue;
      if (!matchExactFilter_(row[COL.CURRENCY], filters.currency)) continue;
      if (!matchExactFilter_(row[COL.BORROWER], filters.borrower)) continue;
    } else if (meta.typeName === 'سلفة') {
      if (!matchExactFilter_(row[COL.BORROWER], filters.borrower)) continue;
      if (!matchExactFilter_(row[COL.ADV_TYPE], filters.advType)) continue;
      if (!matchAdvanceCurrencyFilter_(row, filters.currency)) continue;
      if (!matchExactFilter_(row[COL.PROJECT], filters.project)) continue;
    }

    results.push(mapRowToLogRecord_(row, meta.typeName));
    if (results.length >= 500) break;
  }
  return results;
}

/**
 * مراقبة عمليات الموظفين — للمشرف فقط (عرض كل العمليات أو فلترة بموظف)
 * @param {Object} session
 * @param {Object} filters - { tableType, employee, trxDateFrom, trxDateTo, sysDateFrom, sysDateTo, ... }
 */
function getMonitorTransactions(session, filters) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) {
    return {
      success: false,
      sessionExpired: !!(auth.result && auth.result.sessionExpired),
      sessionLocked: !!(auth.result && auth.result.sessionLocked),
      messageKey: (auth.result && auth.result.messageKey) || 'auth.forbidden',
      rows: [],
      tableType: '',
      typeName: ''
    };
  }

  filters = filters || {};
  const tableType = sanitizeText(filters.tableType || 'tbody-incomes', 40);
  const meta = resolveLogSheet_(tableType);
  if (!meta) {
    return { success: false, messageKey: 'form.err.unknownType', rows: [], tableType: tableType, typeName: '' };
  }

  const employeeFilter = String(filters.employee || '').trim().slice(0, 500);
  let trxFrom = sanitizeText(filters.trxDateFrom || '', 20);
  let trxTo = sanitizeText(filters.trxDateTo || '', 20);
  let sysFrom = sanitizeText(filters.sysDateFrom || '', 20);
  let sysTo = sanitizeText(filters.sysDateTo || '', 20);

  // افتراضي: آخر 7 أيام حسب تاريخ الإدخال إن لم يُحدد أي نطاق تاريخ
  if (!trxFrom && !trxTo && !sysFrom && !sysTo) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    sysFrom = Utilities.formatDate(sevenDaysAgo, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    sysTo = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rows = sheetTailRowsAsObjects_(ss.getSheetByName(meta.sheetName), SHEET_TAIL_SCAN_CAP);
  const results = [];

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (employeeFilter && !matchExactFilter_(rowEmployee_(row), employeeFilter)) continue;

    const trxD = rowDateValue_(row, true);
    const sysD = rowDateValue_(row, false);
    if (!matchDateRange_(trxD, trxFrom, trxTo)) continue;
    if (!matchDateRange_(sysD, sysFrom, sysTo)) continue;

    if (meta.typeName === 'وارد' || meta.typeName === 'صادر') {
      if (!matchExactFilter_(row[COL.PROJECT], filters.project)) continue;
      if (!matchTextFilter_(row[COL.SENDER] || row[COL.DELIVERER], filters.sender)) continue;
      if (!matchTextFilter_(row[COL.RECEIVER], filters.receiver)) continue;
      if (!matchExactFilter_(row[COL.CURRENCY], filters.currency)) continue;
      if (!matchExactFilter_(row[COL.FUND] || 'الخزنة', filters.fund)) continue;
    } else if (meta.typeName === 'تصريف') {
      if (!matchExactFilter_(row[COL.EX_TYPE], filters.exType)) continue;
      if (!matchExactFilter_(row[COL.PAID_CUR], filters.paidCur)) continue;
      if (!matchExactFilter_(row[COL.REC_CUR], filters.recCur)) continue;
      if (!matchExactFilter_(row[COL.FUND] || 'الخزنة', filters.fund)) continue;
    } else if (meta.typeName === 'تحويل') {
      if (!matchExactFilter_(row[COL.FROM_FUND], filters.fromFund)) continue;
      if (!matchExactFilter_(row[COL.TO_FUND], filters.toFund)) continue;
      if (!matchExactFilter_(row[COL.CURRENCY], filters.currency)) continue;
      if (!matchExactFilter_(row[COL.BORROWER], filters.borrower)) continue;
    } else if (meta.typeName === 'سلفة') {
      if (!matchExactFilter_(row[COL.BORROWER], filters.borrower)) continue;
      if (!matchExactFilter_(row[COL.ADV_TYPE], filters.advType)) continue;
      if (!matchAdvanceCurrencyFilter_(row, filters.currency)) continue;
      if (!matchExactFilter_(row[COL.PROJECT], filters.project)) continue;
    }

    results.push(mapRowToLogRecord_(row, meta.typeName));
    if (results.length >= 500) break;
  }

  return {
    success: true,
    rows: results,
    tableType: tableType,
    typeName: meta.typeName,
    trxDateFrom: trxFrom,
    trxDateTo: trxTo,
    sysDateFrom: sysFrom,
    sysDateTo: sysTo
  };
}

/**
 * قائمة الموظفين لفلاتر المشرف — الموظفون النشطون فقط (بدون المشرفين)
 */
function getMonitorEmployees(session) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) return [];
  return getLoginUsersList('employee');
}

/**
 * قائمة المستفيدين من الرصيد الافتتاحي: كل الحسابات النشطة (موظفين + مشرفين)
 */
function getOpeningBalanceEmployees(session) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) return [];
  return getLoginUsersList('all');
}

/**
 * قائمة موظفين فقط لصندوق الموظف (بدون مشرفين)
 */
function getEmployeeFundsEmployees(session) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) return [];
  return getLoginUsersList('employee');
}

/**
 * المستلفون الافتراضيون عند أول تهيئة
 */
function seedDefaultBorrowers_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BORROWERS);
  if (!sheet || sheet.getLastRow() > 1) return;
  const defaults = ['أيمن مهباني', 'خالد عرفات', 'حسام مدور'];
  defaults.forEach(function(name) {
    sheet.appendRow([name, 'نشط']);
  });
}

/**
 * قائمة المستلفين النشطين للنماذج والتقارير
 */
function getActiveBorrowersList() {
  const cached = cacheGetJson_('ug_borrowers_active');
  if (cached && cached.names) return cached.names;

  ensureSheet_(SHEETS.BORROWERS, ['اسم المستلف', 'الحالة']);
  seedDefaultBorrowers_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BORROWERS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] == null ? '' : data[i][0]).trim();
    const status = String(data[i][1] || 'نشط').trim();
    if (!name) continue;
    if (status && status !== 'نشط') continue;
    out.push(name);
  }
  cachePutJson_('ug_borrowers_active', { names: out }, 300);
  return out;
}

/** قائمة كاملة لإدارة المشرف */
function listManagedBorrowers(session) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) {
    return {
      success: false,
      sessionExpired: !!(auth.result && auth.result.sessionExpired),
      sessionLocked: !!(auth.result && auth.result.sessionLocked),
      messageKey: (auth.result && auth.result.messageKey) || 'auth.forbidden',
      rows: []
    };
  }
  ensureSheet_(SHEETS.BORROWERS, ['اسم المستلف', 'الحالة']);
  seedDefaultBorrowers_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BORROWERS);
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] == null ? '' : data[i][0]).trim();
    if (!name) continue;
    rows.push({
      name: name,
      status: String(data[i][1] || 'نشط').trim() || 'نشط',
      rowIndex: i + 1
    });
  }
  return { success: true, rows: rows };
}

/**
 * إضافة / تعديل / حذف مستلف
 * data: { mode: 'add'|'edit'|'delete', name, status, originalName }
 */
function saveManagedBorrower(session, data) {
  try {
    const auth = requireRole_(session, ROLES.SUPERVISOR);
    if (!auth.ok) return auth.result;

    data = data || {};
    const mode = sanitizeText(data.mode || 'add', 20);
    const name = sanitizeText(data.name || '', 100);
    const status = String(data.status || 'نشط').trim();
    const originalName = sanitizeText(data.originalName || '', 100);

    const sheet = ensureSheet_(SHEETS.BORROWERS, ['اسم المستلف', 'الحالة']);
    const values = sheet.getDataRange().getValues();

    function findRow_(target) {
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0] == null ? '' : values[i][0]).trim() === target) return i + 1;
      }
      return -1;
    }

    if (mode === 'delete') {
      const target = originalName || name;
      const rowIndex = findRow_(target);
      if (rowIndex < 0) return { success: false, messageKey: 'borrowers.err.notFound' };
      sheet.deleteRow(rowIndex);
      invalidateUserListsCache_();
      return { success: true, messageKey: 'borrowers.deleted' };
    }

    if (!name) return { success: false, messageKey: 'borrowers.err.name' };
    if (status !== 'نشط' && status !== 'موقوف') {
      return { success: false, messageKey: 'borrowers.err.status' };
    }

    if (mode === 'edit') {
      const rowIndex = findRow_(originalName || name);
      if (rowIndex < 0) return { success: false, messageKey: 'borrowers.err.notFound' };
      if (name !== (originalName || name) && findRow_(name) > 0) {
        return { success: false, messageKey: 'borrowers.err.duplicate' };
      }
      // Sheet.getRange(row, col, numRows, numColumns)
      sheet.getRange(rowIndex, 1, 1, 2).setValues([[name, status]]);
      invalidateUserListsCache_();
      return { success: true, messageKey: 'borrowers.updated' };
    }

    if (findRow_(name) > 0) return { success: false, messageKey: 'borrowers.err.duplicate' };
    sheet.appendRow([name, status]);
    invalidateUserListsCache_();
    return { success: true, messageKey: 'borrowers.created' };
  } catch (e) {
    return { success: false, messageKey: 'form.err.server', message: String(e && e.message || e) };
  }
}

// ====== المشاريع (ديناميكية) ======

function normalizeProjectShowIn_(arr) {
  const allowed = [
    PROJECT_SHOW.INCOME,
    PROJECT_SHOW.OUTCOME,
    PROJECT_SHOW.ADVANCES,
    PROJECT_SHOW.REPORTS
  ];
  const src = Array.isArray(arr) ? arr : String(arr || '').split(/[|,،]/);
  const out = [];
  src.forEach(function(v) {
    const s = String(v || '').trim();
    if (!s) return;
    if (allowed.indexOf(s) === -1) return;
    if (out.indexOf(s) === -1) out.push(s);
  });
  return out;
}

function projectShowInToStorage_(arr) {
  return normalizeProjectShowIn_(arr).join('|');
}

function projectShowInFromStorage_(value) {
  return normalizeProjectShowIn_(value);
}

function seedDefaultProjects_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PROJECTS);
  if (!sheet || sheet.getLastRow() > 1) return;
  const defaults = [
    ['المكتب', 'نشط', projectShowInToStorage_([PROJECT_SHOW.OUTCOME, PROJECT_SHOW.ADVANCES, PROJECT_SHOW.REPORTS])],
    ['رأس مال', 'نشط', projectShowInToStorage_([PROJECT_SHOW.INCOME, PROJECT_SHOW.REPORTS])],
    ['مزرعة الأبقار', 'نشط', projectShowInToStorage_([
      PROJECT_SHOW.INCOME, PROJECT_SHOW.OUTCOME, PROJECT_SHOW.ADVANCES, PROJECT_SHOW.REPORTS
    ])],
    ['محلات الصناعة', 'نشط', projectShowInToStorage_([
      PROJECT_SHOW.INCOME, PROJECT_SHOW.OUTCOME, PROJECT_SHOW.ADVANCES, PROJECT_SHOW.REPORTS
    ])]
  ];
  defaults.forEach(function(row) { sheet.appendRow(row); });
}

/** قائمة المشاريع النشطة للنماذج/التقارير: [{name, showIn:[]}] */
function getActiveProjectsList() {
  const cached = cacheGetJson_('ug_projects_active');
  if (cached && cached.items) return cached.items;

  ensureSheet_(SHEETS.PROJECTS, ['اسم المشروع', 'الحالة', 'أماكن الظهور']);
  seedDefaultProjects_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PROJECTS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] == null ? '' : data[i][0]).trim();
    const status = String(data[i][1] || 'نشط').trim();
    if (!name || status !== 'نشط') continue;
    out.push({
      name: name,
      showIn: projectShowInFromStorage_(data[i][2])
    });
  }
  cachePutJson_('ug_projects_active', { items: out }, 300);
  return out;
}

function listManagedProjects(session) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) {
    return {
      success: false,
      sessionExpired: !!(auth.result && auth.result.sessionExpired),
      sessionLocked: !!(auth.result && auth.result.sessionLocked),
      messageKey: (auth.result && auth.result.messageKey) || 'auth.forbidden',
      rows: []
    };
  }
  ensureSheet_(SHEETS.PROJECTS, ['اسم المشروع', 'الحالة', 'أماكن الظهور']);
  seedDefaultProjects_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PROJECTS);
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] == null ? '' : data[i][0]).trim();
    if (!name) continue;
    rows.push({
      name: name,
      status: String(data[i][1] || 'نشط').trim() || 'نشط',
      showIn: projectShowInFromStorage_(data[i][2]),
      rowIndex: i + 1
    });
  }
  return { success: true, rows: rows };
}

/**
 * data: { mode, name, status, originalName, showIn:[] }
 */
function saveManagedProject(session, data) {
  try {
    const auth = requireRole_(session, ROLES.SUPERVISOR);
    if (!auth.ok) return auth.result;

    data = data || {};
    const mode = sanitizeText(data.mode || 'add', 20);
    const name = sanitizeText(data.name || '', 100);
    const status = String(data.status || 'نشط').trim();
    const originalName = sanitizeText(data.originalName || '', 100);
    // showIn قد يصل كمصفوفة أو كائن مفهرس أو نص مفصول من google.script.run
    let showInRaw = data.showIn;
    if ((!showInRaw || (Array.isArray(showInRaw) && !showInRaw.length)) && data.showInStr) {
      showInRaw = data.showInStr;
    }
    if (showInRaw && typeof showInRaw === 'object' && !Array.isArray(showInRaw)) {
      showInRaw = Object.keys(showInRaw).sort(function(a, b) { return Number(a) - Number(b); })
        .map(function(k) { return showInRaw[k]; });
    }
    const showIn = normalizeProjectShowIn_(showInRaw);

    const sheet = ensureSheet_(SHEETS.PROJECTS, ['اسم المشروع', 'الحالة', 'أماكن الظهور']);
    const values = sheet.getDataRange().getValues();

    function findRow_(target) {
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0] == null ? '' : values[i][0]).trim() === target) return i + 1;
      }
      return -1;
    }

    if (mode === 'delete') {
      const target = originalName || name;
      const rowIndex = findRow_(target);
      if (rowIndex < 0) return { success: false, messageKey: 'projects.err.notFound' };
      sheet.deleteRow(rowIndex);
      invalidateUserListsCache_();
      return { success: true, messageKey: 'projects.deleted' };
    }

    if (!name) return { success: false, messageKey: 'projects.err.name' };
    if (status !== 'نشط' && status !== 'موقوف') {
      return { success: false, messageKey: 'projects.err.status' };
    }
    if (!showIn.length) return { success: false, messageKey: 'projects.err.showIn' };

    const storedShow = projectShowInToStorage_(showIn);

    if (mode === 'edit') {
      const rowIndex = findRow_(originalName || name);
      if (rowIndex < 0) return { success: false, messageKey: 'projects.err.notFound' };
      if (name !== (originalName || name) && findRow_(name) > 0) {
        return { success: false, messageKey: 'projects.err.duplicate' };
      }
      // Sheet.getRange(row, col, numRows, numColumns) — صف واحد × 3 أعمدة
      sheet.getRange(rowIndex, 1, 1, 3).setValues([[name, status, storedShow]]);
      invalidateUserListsCache_();
      return { success: true, messageKey: 'projects.updated' };
    }

    if (findRow_(name) > 0) return { success: false, messageKey: 'projects.err.duplicate' };
    sheet.appendRow([name, status, storedShow]);
    invalidateUserListsCache_();
    return { success: true, messageKey: 'projects.created' };
  } catch (e) {
    return { success: false, messageKey: 'form.err.server', message: String(e && e.message || e) };
  }
}

// ====== البنوك (ديناميكية) ======

function seedDefaultBanks_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BANKS);
  if (!sheet || sheet.getLastRow() > 1) return;
  // بدون بنوك افتراضية — المشرف يضيفها
}

function getActiveBanksList() {
  const cached = cacheGetJson_('ug_banks_active');
  if (cached && cached.names) return cached.names;

  ensureSheet_(SHEETS.BANKS, ['اسم البنك', 'الحالة']);
  seedDefaultBanks_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BANKS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] == null ? '' : data[i][0]).trim();
    const status = String(data[i][1] || 'نشط').trim();
    if (!name || status !== 'نشط') continue;
    out.push(name);
  }
  cachePutJson_('ug_banks_active', { names: out }, 300);
  return out;
}

function listManagedBanks(session) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) {
    return {
      success: false,
      sessionExpired: !!(auth.result && auth.result.sessionExpired),
      sessionLocked: !!(auth.result && auth.result.sessionLocked),
      messageKey: (auth.result && auth.result.messageKey) || 'auth.forbidden',
      rows: []
    };
  }
  ensureSheet_(SHEETS.BANKS, ['اسم البنك', 'الحالة']);
  seedDefaultBanks_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BANKS);
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] == null ? '' : data[i][0]).trim();
    if (!name) continue;
    rows.push({
      name: name,
      status: String(data[i][1] || 'نشط').trim() || 'نشط',
      rowIndex: i + 1
    });
  }
  return { success: true, rows: rows };
}

function saveManagedBank(session, data) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) return auth.result;

  data = data || {};
  const mode = sanitizeText(data.mode || 'add', 20);
  const name = sanitizeText(data.name || '', 100);
  const status = String(data.status || 'نشط').trim();
  const originalName = sanitizeText(data.originalName || '', 100);

  const sheet = ensureSheet_(SHEETS.BANKS, ['اسم البنك', 'الحالة']);
  const values = sheet.getDataRange().getValues();

  function findRow_(target) {
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] == null ? '' : values[i][0]).trim() === target) return i + 1;
    }
    return -1;
  }

  if (mode === 'delete') {
    const target = originalName || name;
    const rowIndex = findRow_(target);
    if (rowIndex < 0) return { success: false, messageKey: 'banks.err.notFound' };
    sheet.deleteRow(rowIndex);
    invalidateUserListsCache_();
    return { success: true, messageKey: 'banks.deleted' };
  }

  if (!name) return { success: false, messageKey: 'banks.err.name' };
  if (status !== 'نشط' && status !== 'موقوف') {
    return { success: false, messageKey: 'banks.err.status' };
  }

  if (mode === 'edit') {
    const rowIndex = findRow_(originalName || name);
    if (rowIndex < 0) return { success: false, messageKey: 'banks.err.notFound' };
    if (name !== (originalName || name) && findRow_(name) > 0) {
      return { success: false, messageKey: 'banks.err.duplicate' };
    }
    // Sheet.getRange(row, col, numRows, numColumns)
    sheet.getRange(rowIndex, 1, 1, 2).setValues([[name, status]]);
    invalidateUserListsCache_();
    return { success: true, messageKey: 'banks.updated' };
  }

  if (findRow_(name) > 0) return { success: false, messageKey: 'banks.err.duplicate' };
  sheet.appendRow([name, status]);
  invalidateUserListsCache_();
  return { success: true, messageKey: 'banks.created' };
}

/**
 * تسجيل طلب تعديل أو حذف في سجل الرقابة (Audit Trail) — للموظف فقط
 * السبب مطلوب؛ العملية يجب أن تكون ملكاً للطالب وبحالة مكتملة
 */
function requestAction(session, ref, actionType, oldDataObj, newDataObj, empName, reason, attachments) {
  const auth = requireSession_(session);
  if (!auth.ok) return auth.result;

  // المشرف يعدّل/يحذف عملياته مباشرة عبر applyDirectAction
  if (isSupervisorRole_(auth.role)) {
    return { success: false, messageKey: 'auth.useDirectAction' };
  }

  ref = sanitizeText(ref, 50);
  actionType = sanitizeText(actionType, 50);
  empName = sanitizeText(empName || auth.username, 100);
  reason = sanitizeText(reason || '', 500);
  oldDataObj = sanitizeObjectStrings_(oldDataObj, 500);
  newDataObj = sanitizeObjectStrings_(newDataObj, 500);

  const found = findTransactionByRef_(ref);
  if (!found) return { success: false, messageKey: 'log.err.notFound' };
  if (String(found.row[COL.EMPLOYEE] || '') !== auth.username) {
    return { success: false, messageKey: 'auth.forbidden' };
  }
  if (String(found.row[COL.STATUS] || '') !== 'مكتملة') {
    return { success: false, messageKey: 'log.err.notEditable' };
  }

  if (actionType === 'تعديل' && newDataObj) {
    if (normalizeAttachments_(attachments).length > 0) {
      const existing = newDataObj.existingAttach || newDataObj.attach || '';
      const url = (existing && String(existing).indexOf('http') === 0)
        ? addAttachmentsToFolderUrl_(existing, attachments)
        : saveAttachmentsForRef_(ref, attachments);
      if (url) {
        newDataObj.attach = url;
        delete newDataObj.removeAttach;
      }
    }
    delete newDataObj.existingAttach;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(SHEETS.AUDIT, [
    'معرف الحركة', 'المرجع الأصلي', 'الموظف الطالب', 'نوع الإجراء',
    'التفاصيل القديمة', 'التفاصيل الجديدة', 'وقت الطلب', 'حالة الطلب', 'قرار المشرف', 'السبب'
  ]);
  const auditSheet = ss.getSheetByName(SHEETS.AUDIT);

  const pendingUpdate = {};
  pendingUpdate[COL.STATUS] = 'بانتظار الموافقة';
  updateRowByHeaders_(found.sheet, found.row.__rowIndex, pendingUpdate);

  const auditId = 'REQ-' + Date.now();
  appendRowByHeaders_(auditSheet, {
    'معرف الحركة': auditId,
    'المرجع الأصلي': ref,
    'الموظف الطالب': empName,
    'نوع الإجراء': actionType,
    'التفاصيل القديمة': JSON.stringify(oldDataObj),
    'التفاصيل الجديدة': newDataObj ? JSON.stringify(newDataObj) : '-',
    'وقت الطلب': new Date(),
    'حالة الطلب': 'بانتظار الموافقة',
    'قرار المشرف': '-',
    'السبب': reason || '-'
  });

  createRequestNotifications_(empName, actionType, ref, auditId, reason);

  return { success: true, messageKey: 'log.requestSent', auditId: auditId };
}

/**
 * بناء قاموس التحديث من بيانات التعديل القادمة من الواجهة
 */
function buildEditUpdateDict_(typeName, newData, currentRow) {
  const dict = {};
  if (newData.trxDate) dict[COL.TRX_DATE] = formatTrxDateOnly_(newData.trxDate);

  if (typeName === 'وارد' || typeName === 'صادر') {
    if (newData.project !== undefined) dict[COL.PROJECT] = newData.project;
    if (newData.currency !== undefined && newData.currency !== '') {
      const cur = String(newData.currency).trim();
      if (cur === 'دولار' || cur === 'ليرة سورية') dict[COL.CURRENCY] = cur;
    }
    if (newData.description !== undefined) dict[COL.DESC] = newData.description;
    if (newData.sender !== undefined) {
      dict[typeName === 'وارد' ? COL.SENDER : COL.DELIVERER] = newData.sender;
    }
    if (newData.receiver !== undefined) dict[COL.RECEIVER] = newData.receiver;
    if (newData.qty !== undefined && newData.qty !== '') dict[COL.QTY] = Number(newData.qty);
    if (newData.amount !== undefined && newData.amount !== '') dict[COL.AMOUNT] = Number(newData.amount);
    const qty = Number(dict.hasOwnProperty(COL.QTY) ? dict[COL.QTY] : currentRow[COL.QTY]) || 0;
    const amt = Number(dict.hasOwnProperty(COL.AMOUNT) ? dict[COL.AMOUNT] : currentRow[COL.AMOUNT]) || 0;
    dict[COL.TOTAL] = qty * amt;
    if (newData.notes !== undefined) dict[COL.NOTES] = newData.notes;
  } else if (typeName === 'تصريف') {
    const exType = newData.exType || currentRow[COL.EX_TYPE];
    if (newData.exType !== undefined) dict[COL.EX_TYPE] = newData.exType;
    const exDir = exchangeDirection_(exType);
    // التعديل يُعيد الصف إلى الصيغة الموحّدة: المبلغ بعملة المصدر والإجمالي محسوب
    const legs = exchangeLegs_(currentRow);
    const exAmt = (newData.exAmt !== undefined && newData.exAmt !== '')
      ? Number(newData.exAmt) : legs.paidAmount;
    const exRate = (newData.exRate !== undefined && newData.exRate !== '')
      ? Number(newData.exRate) : legs.rate;
    dict[COL.PAID_CUR] = exDir.from;
    dict[COL.REC_CUR] = exDir.to;
    dict[COL.AMT_CUR] = exDir.from;
    dict[COL.EX_AMT] = exAmt;
    dict[COL.EX_RATE] = exRate;
    dict[COL.TOTAL] = convertByRate_(exAmt, exRate, exDir.from, exDir.to);
    if (newData.notes !== undefined) dict[COL.NOTES] = newData.notes;
  } else if (typeName === 'تحويل') {
    if (newData.currency !== undefined && newData.currency !== '') {
      const cur = String(newData.currency).trim();
      if (cur === 'دولار' || cur === 'ليرة سورية') dict[COL.CURRENCY] = cur;
    }
    if (newData.amount !== undefined && newData.amount !== '') dict[COL.AMOUNT] = Number(newData.amount);
    if (newData.notes !== undefined) dict[COL.NOTES] = newData.notes;
  } else if (typeName === 'سلفة') {
    if (newData.project !== undefined) dict[COL.PROJECT] = newData.project;
    if (newData.currency !== undefined && newData.currency !== '') {
      const cur = String(newData.currency).trim();
      if (cur === 'دولار' || cur === 'ليرة سورية') dict[COL.CURRENCY] = cur;
    }
    if (newData.description !== undefined) dict[COL.DESC] = newData.description;
    if (newData.receiver !== undefined) dict[COL.RECEIVER] = newData.receiver;
    if (newData.qty !== undefined && newData.qty !== '') dict[COL.QTY] = Number(newData.qty);
    if (newData.amount !== undefined && newData.amount !== '') dict[COL.AMOUNT] = Number(newData.amount);
    const advType = currentRow[COL.ADV_TYPE];
    if (advType === 'صادر') {
      const qty = Number(dict.hasOwnProperty(COL.QTY) ? dict[COL.QTY] : currentRow[COL.QTY]) || 0;
      const amt = Number(dict.hasOwnProperty(COL.AMOUNT) ? dict[COL.AMOUNT] : currentRow[COL.AMOUNT]) || 0;
      dict[COL.TOTAL] = qty * amt;
    } else if (advType === 'تصريف') {
      if (newData.fromCurrency !== undefined && newData.fromCurrency !== '') {
        const cur = normalizeCurrency_(newData.fromCurrency);
        if (cur === CUR.USD || cur === CUR.SYP) dict[COL.FROM_CUR] = cur;
      }
      if (newData.toCurrency !== undefined && newData.toCurrency !== '') {
        const cur = normalizeCurrency_(newData.toCurrency);
        if (cur === CUR.USD || cur === CUR.SYP) dict[COL.TO_CUR] = cur;
      }
      if (newData.exRate !== undefined && newData.exRate !== '') dict[COL.EX_RATE] = Number(newData.exRate);
      const advFrom = dict.hasOwnProperty(COL.FROM_CUR) ? dict[COL.FROM_CUR] : currentRow[COL.FROM_CUR];
      const advTo = dict.hasOwnProperty(COL.TO_CUR) ? dict[COL.TO_CUR] : currentRow[COL.TO_CUR];
      const amt = Number(dict.hasOwnProperty(COL.AMOUNT) ? dict[COL.AMOUNT] : currentRow[COL.AMOUNT]) || 0;
      const rate = Number(dict.hasOwnProperty(COL.EX_RATE) ? dict[COL.EX_RATE] : currentRow[COL.EX_RATE]) || 0;
      dict[COL.CURRENCY] = advFrom;
      dict[COL.TOTAL] = convertByRate_(amt, rate, advFrom, advTo);
    } else if (newData.amount !== undefined && newData.amount !== '') {
      dict[COL.TOTAL] = Number(newData.amount);
    }
    if (newData.notes !== undefined) dict[COL.NOTES] = newData.notes;
  }
  if (newData.removeAttach) {
    dict[COL.ATTACH] = 'لا يوجد مرفق';
  } else if (newData.attach) {
    dict[COL.ATTACH] = newData.attach;
  }
  return dict;
}

/**
 * تعديل أو حذف مباشر لعملية المشرف على عملياته فقط (بدون انتظار موافقة)
 * @param {Object} session
 * @param {string} ref
 * @param {string} actionType - تعديل | حذف
 * @param {Object} newDataObj - بيانات التعديل (null عند الحذف)
 * @param {string} reason
 */
function applyDirectAction(session, ref, actionType, newDataObj, reason, attachments) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) return auth.result;

  ref = sanitizeText(ref, 50);
  actionType = sanitizeText(actionType, 50);
  reason = sanitizeText(reason || '', 500);
  newDataObj = sanitizeObjectStrings_(newDataObj, 500);

  const found = findTransactionByRef_(ref);
  if (!found) return { success: false, messageKey: 'log.err.notFound' };
  if (String(found.row[COL.EMPLOYEE] || '') !== auth.username) {
    return { success: false, messageKey: 'auth.forbidden' };
  }
  if (String(found.row[COL.STATUS] || '') !== 'مكتملة') {
    return { success: false, messageKey: 'log.err.notEditable' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(SHEETS.AUDIT, [
    'معرف الحركة', 'المرجع الأصلي', 'الموظف الطالب', 'نوع الإجراء',
    'التفاصيل القديمة', 'التفاصيل الجديدة', 'وقت الطلب', 'حالة الطلب', 'قرار المشرف', 'السبب'
  ]);
  const auditSheet = ss.getSheetByName(SHEETS.AUDIT);
  const oldMapped = mapRowToLogRecord_(found.row, found.typeName);

  if (actionType === 'حذف') {
    if (!markTransactionDeleted_(found)) {
      return { success: false, messageKey: 'notif.err.deleteFailed' };
    }
  } else if (actionType === 'تعديل') {
    if (!newDataObj) return { success: false, messageKey: 'log.err.notFound' };
    if (normalizeAttachments_(attachments).length > 0) {
      const existing = newDataObj.existingAttach || newDataObj.attach || '';
      const url = (existing && String(existing).indexOf('http') === 0)
        ? addAttachmentsToFolderUrl_(existing, attachments)
        : saveAttachmentsForRef_(ref, attachments);
      if (url) {
        newDataObj.attach = url;
        delete newDataObj.removeAttach;
      }
    }
    delete newDataObj.existingAttach;
    const dict = buildEditUpdateDict_(found.typeName, newDataObj, found.row);
    updateRowByHeaders_(found.sheet, found.row.__rowIndex, dict);
  } else {
    return { success: false, messageKey: 'form.err.unknownType' };
  }

  appendRowByHeaders_(auditSheet, {
    'معرف الحركة': 'DIR-' + Date.now(),
    'المرجع الأصلي': ref,
    'الموظف الطالب': auth.username,
    'نوع الإجراء': actionType,
    'التفاصيل القديمة': JSON.stringify(oldMapped),
    'التفاصيل الجديدة': actionType === 'حذف' ? '-' : JSON.stringify(newDataObj),
    'وقت الطلب': new Date(),
    'حالة الطلب': 'منفّذ مباشرة',
    'قرار المشرف': 'مباشر',
    'السبب': reason || '-'
  });

  invalidateBalanceCache_(auth.username);

  return {
    success: true,
    messageKey: actionType === 'حذف' ? 'log.deletedDirect' : 'log.editedDirect'
  };
}

// ====== التقارير (Employee Reports) ======

const REPORT_MAX_ROWS = 2000;

function toNumber_(value) {
  if (value === null || value === undefined || value === '' || value === '-') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const n = Number(String(value).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function reportPassCommonFilters_(row, filters, empName) {
  // empName فارغ = كل الموظفين؛ نص|نص = متعدد؛ وإلا موظف واحد
  if (empName) {
    if (!matchExactFilter_(row[COL.EMPLOYEE], empName)) return false;
  }
  const status = filters.status || 'مكتملة';
  if (!matchExactFilter_(row[COL.STATUS], status)) return false;
  // نطاق التقرير حسب تاريخ الإدخال (مفاتيح trx* القديمة تُعامل كتاريخ إدخال للتوافق)
  const dateFrom = filters.sysDateFrom || filters.trxDateFrom;
  const dateTo = filters.sysDateTo || filters.trxDateTo;
  const sysD = rowDateValue_(row, false);
  if (!matchDateRange_(sysD, dateFrom, dateTo)) return false;
  return true;
}

function collectEmployeeRows_(ss, empName, filters, sheetName, typeName, extraFilter) {
  // قراءة من ذيل الورقة بحد واسع — مناسب لسنة تشغيل قبل التصفير السنوي
  const rows = sheetTailRowsAsObjects_(ss.getSheetByName(sheetName), REPORT_SHEET_SCAN_CAP);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!reportPassCommonFilters_(row, filters, empName)) continue;
    if (typeof extraFilter === 'function' && !extraFilter(row)) continue;
    out.push({ sheetRow: row, typeName: typeName, mapped: mapRowToLogRecord_(row, typeName) });
    if (out.length >= REPORT_MAX_ROWS) break;
  }
  return out;
}

function buildSeriesByKey_(items, keyFn, valueFn) {
  const map = {};
  items.forEach(function(item) {
    let key = keyFn(item);
    if (key == null || key === '' || key === '-') key = '—';
    else key = String(key);
    map[key] = (map[key] || 0) + (Number(valueFn(item)) || 0);
  });
  // مصفوفات صريحة (تجنب مشاكل تسلسل Apps Script)
  const labels = [];
  const values = [];
  Object.keys(map).forEach(function(k) {
    labels.push(String(k));
    values.push(Math.round(map[k] * 100) / 100);
  });
  return { labels: labels, values: values };
}

function buildSeriesByDay_(items, valueFn) {
  const map = {};
  items.forEach(function(item) {
    const d = item.mapped.trxDate || item.mapped.dateStr || '—';
    map[d] = (map[d] || 0) + valueFn(item);
  });
  const labels = Object.keys(map).sort(function(a, b) {
    const pa = a.split('/');
    const pb = b.split('/');
    if (pa.length === 3 && pb.length === 3) {
      return (pa[2] + pa[1] + pa[0]).localeCompare(pb[2] + pb[1] + pb[0]);
    }
    return String(a).localeCompare(String(b));
  });
  return { labels: labels, values: labels.map(function(k) { return Math.round(map[k] * 100) / 100; }) };
}

function reportDateSortKey_(d) {
  const p = String(d || '').split('/');
  if (p.length === 3) return p[2] + p[1] + p[0];
  return String(d || '');
}

/**
 * سلسلة تراكمية يومية (أوضح للرسوم من نقطة لكل عملية)
 * القيم: مجموع الأثر لكل يوم ثم تراكم عبر الأيام
 */
function buildCumulativeSeriesByTransaction_(items, signedValueFn) {
  const dayMap = {};
  items.forEach(function(item) {
    const d = item.mapped.trxDate || item.mapped.dateStr || '—';
    dayMap[d] = (dayMap[d] || 0) + (Number(signedValueFn(item)) || 0);
  });
  const labels = Object.keys(dayMap).sort(function(a, b) {
    return reportDateSortKey_(a).localeCompare(reportDateSortKey_(b));
  });
  let run = 0;
  const values = labels.map(function(k) {
    run += dayMap[k];
    return Math.round(run * 100) / 100;
  });
  return { labels: labels, values: values };
}

function truncateItems_(items) {
  const truncated = items.length > REPORT_MAX_ROWS;
  return { items: truncated ? items.slice(0, REPORT_MAX_ROWS) : items, truncated: truncated };
}

function reportRowCommon_(mapped) {
  return {
    seq: mapped.seq,
    trxDate: mapped.trxDate,
    sysDate: mapped.sysDate,
    status: mapped.status,
    ref: mapped.ref,
    typeName: mapped.typeName,
    notes: mapped.notes,
    employee: mapped.employee || '-'
  };
}

/**
 * توليد تقرير
 * scope=employee: عمليات المستخدم الحالي فقط
 * scope=system: للمشرف — كل الموظفين أو موظف محدد عبر filters.employee
 * reportId: funds | borrower | income | outcome | exchange | transfer | advances | overview
 */
function generateReport(session, reportId, filters) {
  const auth = requireSession_(session);
  if (!auth.ok) return auth.result;

  filters = filters || {};
  reportId = sanitizeText(reportId, 40);
  const scope = sanitizeText(filters.scope || 'employee', 20) === 'system' ? 'system' : 'employee';

  // نطاق التقرير: تاريخ الإدخال (مع توافق trx* إن وُجدت وحدها)
  const reportDateFrom = filters.sysDateFrom || filters.trxDateFrom;
  const reportDateTo = filters.sysDateTo || filters.trxDateTo;
  if (!reportDateFrom || !reportDateTo) {
    return { success: false, messageKey: 'report.err.dateRequired' };
  }

  let empScope = auth.username;
  if (scope === 'system') {
    if (!isSupervisorRole_(auth.role)) {
      return { success: false, messageKey: 'auth.forbidden' };
    }
    // فارغ = كل الموظفين — ندعم اختيار متعدد عبر |
    empScope = String(filters.employee || '').trim().slice(0, 500);
  }

  filters.sysDateFrom = sanitizeText(reportDateFrom, 20);
  filters.sysDateTo = sanitizeText(reportDateTo, 20);
  filters.trxDateFrom = sanitizeText(filters.trxDateFrom || '', 20);
  filters.trxDateTo = sanitizeText(filters.trxDateTo || '', 20);
  filters.currency = String(filters.currency || '').trim().slice(0, 120);
  filters.fund = String(filters.fund || '').trim().slice(0, 120);
  filters.project = String(filters.project || '').trim().slice(0, 200);
  filters.borrower = String(filters.borrower || '').trim().slice(0, 200);
  filters.fromFund = String(filters.fromFund || '').trim().slice(0, 120);
  filters.toFund = String(filters.toFund || '').trim().slice(0, 120);
  filters.exType = String(filters.exType || '').trim().slice(0, 120);
  filters.advType = String(filters.advType || '').trim().slice(0, 120);
  filters.employee = String(filters.employee || '').trim().slice(0, 500);
  filters.status = String(filters.status || 'ALL').trim().slice(0, 120);
  if (filters.status === 'ALL' || filters.status === 'الكل') filters.status = 'ALL';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let payload;

  if (reportId === 'funds') payload = buildFundsReport_(ss, empScope, filters);
  else if (reportId === 'borrower') payload = buildBorrowerReport_(ss, empScope, filters);
  else if (reportId === 'income') payload = buildTypeSummaryReport_(ss, empScope, filters, 'وارد', SHEETS.INCOMES);
  else if (reportId === 'outcome') payload = buildTypeSummaryReport_(ss, empScope, filters, 'صادر', SHEETS.OUTCOMES);
  else if (reportId === 'exchange') payload = buildExchangeReport_(ss, empScope, filters);
  else if (reportId === 'transfer') payload = buildTransferReport_(ss, empScope, filters);
  else if (reportId === 'advances') payload = buildAdvancesReport_(ss, empScope, filters);
  else if (reportId === 'overview') payload = buildOverviewReport_(ss, empScope, filters);
  else return { success: false, messageKey: 'report.err.unknown' };

  if (scope === 'system' && payload.columns) {
    const hasEmpCol = payload.columns.some(function(c) { return c.key === 'employee'; });
    if (!hasEmpCol) {
      payload.columns = [{ key: 'employee', labelKey: 'log.col.employee' }].concat(payload.columns);
    }
  }

  return {
    success: true,
    meta: {
      reportId: reportId,
      titleKey: 'report.' + reportId,
      generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
      rowCount: payload.rows.length,
      truncated: payload.truncated,
      employee: scope === 'system' ? (empScope || 'ALL') : auth.username,
      scope: scope
    },
    kpis: payload.kpis,
    series: payload.series,
    columns: payload.columns,
    rows: payload.rows
  };
}

/**
 * أثر عملية على صندوق/عملة محددين لأغراض تقرير حركة الصناديق
 * + داخل الصندوق / − خارج الصندوق / 0 لا يؤثر على الفلتر الحالي
 */
function fundsReportSignedDelta_(item, fundFilter, currencyFilter, fundOk, curOk) {
  const m = item.mapped || {};
  if (item.typeName === 'وارد') {
    if (!fundOk(m.fund || FUND.VAULT) || !curOk(m.currency)) return 0;
    return toNumber_(m.total);
  }
  if (item.typeName === 'صادر') {
    if (!fundOk(m.fund || FUND.VAULT) || !curOk(m.currency)) return 0;
    return -toNumber_(m.total);
  }
  if (item.typeName === 'تصريف') {
    if (!fundOk(m.fund || FUND.VAULT)) return 0;
    // يخرج المبلغ بعملة المصدر ويدخل الإجمالي بعملة الوجهة — يتطلب عملة محددة
    if (!currencyFilter) return 0;
    if (curOk(m.paidCur)) return -toNumber_(m.exAmt);
    if (curOk(m.recCur)) return toNumber_(m.total);
    return 0;
  }
  if (item.typeName === 'تحويل') {
    if (!curOk(m.currency)) return 0;
    const amount = toNumber_(m.amount);
    const fromF = m.fromFund || '';
    const toF = m.toFund || '';
    // بدون فلتر صندوق: التحويل الداخلي صافيه صفر
    if (!fundFilter) return 0;
    if (fundOk(fromF) && fundOk(toF)) return 0;
    if (fundOk(fromF)) return -amount;
    if (fundOk(toF)) return amount;
    return 0;
  }
  if (item.typeName === 'سلفة') {
    // عمليات السلف تؤثر على صندوق «السلف» فقط (وليس الخزنة مباشرة)
    if (!fundOk(FUND.ADVANCES)) return 0;
    const advType = m.advType || '';
    if (advType === 'صادر' || advType === 'وارد') {
      if (!curOk(m.currency)) return 0;
      return -toNumber_(m.total || m.amount);
    }
    // تصريف سلف: تبديل داخل رصيد المستلف
    if (advType === 'تصريف') {
      const fromCur = m.fromCurrency || m.fromCur || '';
      const toCur = m.toCurrency || m.toCur || '';
      const amount = toNumber_(m.amount);
      const received = toNumber_(m.total) || amount;
      if (curOk(fromCur)) return -amount;
      if (curOk(toCur)) return received;
      return 0;
    }
    return 0;
  }
  return 0;
}

function buildFundsReport_(ss, empName, filters) {
  const currencyFilter = filters.currency;
  const fundFilter = filters.fund;

  function curOk(c) { return matchExactFilter_(c, currencyFilter); }
  function fundOk(f) { return matchExactFilter_(f, fundFilter); }

  let items = [];
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.INCOMES, 'وارد', function(row) {
    return fundOk(row[COL.FUND] || FUND.VAULT) && curOk(row[COL.CURRENCY]);
  }));
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.OUTCOMES, 'صادر', function(row) {
    return fundOk(row[COL.FUND] || FUND.VAULT) && curOk(row[COL.CURRENCY]);
  }));
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.EXCHANGES, 'تصريف', function(row) {
    if (!fundOk(row[COL.FUND] || FUND.VAULT)) return false;
    // يظهر التصريف إذا مسّ العملة المفلترة (أو بلا فلتر عملة)
    if (!currencyFilter) return true;
    const exType = row[COL.EX_TYPE] || '';
    if (exType === 'شراء' || exType === 'بيع') {
      return curOk('دولار') || curOk('ليرة سورية');
    }
    return curOk(row[COL.PAID_CUR]) || curOk(row[COL.REC_CUR]);
  }));
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.TRANSFERS, 'تحويل', function(row) {
    const fromF = row[COL.FROM_FUND];
    const toF = row[COL.TO_FUND];
    const touches = !fundFilter || fundOk(fromF) || fundOk(toF);
    return touches && curOk(row[COL.CURRENCY]);
  }));
  // سلف: فقط عند فلترة صندوق السلف أو بلا فلتر صندوق (للشفافية الكاملة)
  if (!fundFilter || fundOk(FUND.ADVANCES)) {
    items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.ADVANCES, 'سلفة', function(row) {
      const advType = row[COL.ADV_TYPE] || '';
      if (advType === 'تصريف') {
        if (!currencyFilter) return true;
        return curOk(row[COL.FROM_CUR]) || curOk(row[COL.TO_CUR]);
      }
      return curOk(row[COL.CURRENCY]);
    }));
  }

  const cut = truncateItems_(items);
  items = cut.items;

  function curMatch_(c, cur) {
    return matchExactFilter_(c, cur);
  }

  function signedFor_(item, cur) {
    return fundsReportSignedDelta_(item, fundFilter, cur, fundOk, function(c) {
      return curMatch_(c, cur);
    });
  }

  // لا نخلط الدولار والليرة في رقم واحد أبداً
  let inflowUsd = 0;
  let outflowUsd = 0;
  let inflowSyp = 0;
  let outflowSyp = 0;

  const rows = items.map(function(item) {
    const m = item.mapped;
    let amount = 0;
    let fund = m.fund || '';
    let currency = m.currency || '';
    const signedUsd = signedFor_(item, 'دولار');
    const signedSyp = signedFor_(item, 'ليرة سورية');
    if (signedUsd > 0) inflowUsd += signedUsd;
    else if (signedUsd < 0) outflowUsd += Math.abs(signedUsd);
    if (signedSyp > 0) inflowSyp += signedSyp;
    else if (signedSyp < 0) outflowSyp += Math.abs(signedSyp);

    // للجدول: الأثر حسب فلتر العملة إن وُجد، وإلا أثر الدولار إن وُجد وإلا الليرة
    let signed = 0;
    if (currencyFilter === 'ليرة سورية') signed = signedSyp;
    else if (currencyFilter === 'دولار') signed = signedUsd;
    else signed = signedUsd !== 0 ? signedUsd : signedSyp;

    if (item.typeName === 'وارد' || item.typeName === 'صادر') {
      amount = toNumber_(m.total);
    } else if (item.typeName === 'تصريف') {
      currency = (m.paidCur || '') + '→' + (m.recCur || '');
      if (currencyFilter === 'ليرة سورية') amount = Math.abs(signedSyp) || exchangeSypLeg_(m);
      else amount = Math.abs(signedUsd) || exchangeUsdLeg_(m);
    } else if (item.typeName === 'تحويل') {
      amount = toNumber_(m.amount);
      fund = (m.fromFund || '') + '→' + (m.toFund || '');
    } else if (item.typeName === 'سلفة') {
      amount = Math.abs(signed) || toNumber_(m.total || m.amount);
      fund = FUND.ADVANCES;
      if (m.advType === 'تصريف') {
        currency = (m.fromCurrency || m.fromCur || '') + '→' + (m.toCurrency || m.toCur || '');
      }
    }
    return Object.assign(reportRowCommon_(m), {
      fund: fund,
      currency: currency,
      amount: amount,
      signedEffect: signed,
      project: m.project || '-',
      detail: m.description || m.notes || m.exType || m.advType || '-'
    });
  });

  // التوزيع حسب النوع: عدد العمليات (لا نخلط مبالغ عملات مختلفة)
  const byType = buildSeriesByKey_(items, function(i) { return i.typeName; }, function() {
    return 1;
  });

  // الحركة التراكمية: عملة الفلتر، أو الدولار عند غياب الفلتر (مع تسمية واضحة)
  const chartCurrency = currencyFilter || 'دولار';
  const byDay = buildCumulativeSeriesByTransaction_(items, function(i) {
    return signedFor_(i, chartCurrency);
  });

  const kpis = [{ key: 'count', labelKey: 'report.kpi.count', value: rows.length }];
  if (currencyFilter === 'ليرة سورية') {
    kpis.push(
      { key: 'inflow', labelKey: 'report.kpi.inflow', value: Math.round(inflowSyp * 100) / 100 },
      { key: 'outflow', labelKey: 'report.kpi.outflow', value: Math.round(outflowSyp * 100) / 100 },
      { key: 'net', labelKey: 'report.kpi.net', value: Math.round((inflowSyp - outflowSyp) * 100) / 100 }
    );
  } else if (currencyFilter === 'دولار') {
    kpis.push(
      { key: 'inflow', labelKey: 'report.kpi.inflow', value: Math.round(inflowUsd * 100) / 100 },
      { key: 'outflow', labelKey: 'report.kpi.outflow', value: Math.round(outflowUsd * 100) / 100 },
      { key: 'net', labelKey: 'report.kpi.net', value: Math.round((inflowUsd - outflowUsd) * 100) / 100 }
    );
  } else {
    // بدون فلتر عملة: بطاقات منفصلة لكل عملة — ممنوع الجمع بينهما
    kpis.push(
      { key: 'inflowUsd', labelKey: 'report.kpi.inflowUsd', value: Math.round(inflowUsd * 100) / 100 },
      { key: 'outflowUsd', labelKey: 'report.kpi.outflowUsd', value: Math.round(outflowUsd * 100) / 100 },
      { key: 'netUsd', labelKey: 'report.kpi.netUsd', value: Math.round((inflowUsd - outflowUsd) * 100) / 100 },
      { key: 'inflowSyp', labelKey: 'report.kpi.inflowSyp', value: Math.round(inflowSyp * 100) / 100 },
      { key: 'outflowSyp', labelKey: 'report.kpi.outflowSyp', value: Math.round(outflowSyp * 100) / 100 },
      { key: 'netSyp', labelKey: 'report.kpi.netSyp', value: Math.round((inflowSyp - outflowSyp) * 100) / 100 }
    );
  }

  return {
    truncated: cut.truncated,
    kpis: kpis,
    series: [
      { name: 'report.chart.byTypeCount', chart: 'doughnut', labels: byType.labels, values: byType.values },
      {
        name: chartCurrency === 'ليرة سورية' ? 'report.chart.byDaySyp' : 'report.chart.byDayUsd',
        chart: 'line',
        labels: byDay.labels,
        values: byDay.values
      }
    ],
    columns: [
      { key: 'seq', labelKey: 'log.col.opNumber' },
      { key: 'ref', labelKey: 'log.col.ref' },
      { key: 'trxDate', labelKey: 'log.col.trxDate' },
      { key: 'sysDate', labelKey: 'log.col.sysDate' },
      { key: 'typeName', labelKey: 'report.col.type' },
      { key: 'fund', labelKey: 'log.col.fund' },
      { key: 'currency', labelKey: 'log.col.currency' },
      { key: 'amount', labelKey: 'log.col.amount' },
      { key: 'project', labelKey: 'log.col.project' },
      { key: 'detail', labelKey: 'log.col.notes' },
      { key: 'status', labelKey: 'log.col.status' }
    ],
    rows: rows
  };
}

/** أثر العملية على رصيد المستلف (+ زيادة / − نقصان / 0 تصريف عملات) */
function borrowerSignedAmount_(item) {
  const m = item.mapped || {};
  const amount = toNumber_(m.amount || m.total);
  if (item.typeName === 'تحويل') {
    if (m.toFund === FUND.ADVANCES) return amount;
    if (m.fromFund === FUND.ADVANCES) return -amount;
    return 0;
  }
  if (item.typeName === 'سلفة') {
    if (m.advType === 'صادر' || m.advType === 'وارد') return -amount;
    if (m.advType === 'تصريف') return 0;
  }
  return 0;
}

function buildBorrowerReport_(ss, empName, filters) {
  const borrowerFilter = filters.borrower;
  let items = [];
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.TRANSFERS, 'تحويل', function(row) {
    const b = row[COL.BORROWER];
    if (!b || b === '-' || b === '') return false;
    return matchExactFilter_(b, borrowerFilter);
  }));
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.ADVANCES, 'سلفة', function(row) {
    return matchExactFilter_(row[COL.BORROWER], borrowerFilter);
  }));

  if (filters.currency) {
    items = items.filter(function(item) {
      const m = item.mapped || {};
      if (item.typeName === 'سلفة' && m.advType === 'تصريف') {
        return matchExactFilter_(m.fromCurrency || m.fromCur, filters.currency) ||
          matchExactFilter_(m.toCurrency || m.toCur, filters.currency);
      }
      const c = m.currency || item.sheetRow[COL.CURRENCY] || item.sheetRow[COL.FROM_CUR];
      return matchExactFilter_(c, filters.currency);
    });
  }

  const cut = truncateItems_(items);
  items = cut.items;

  let net = 0;
  const rows = items.map(function(item) {
    const m = item.mapped;
    const signed = borrowerSignedAmount_(item);
    const rawAmount = toNumber_(m.amount || m.total);
    net += signed;
    return Object.assign(reportRowCommon_(m), {
      borrower: m.borrower,
      advType: m.advType || (item.typeName === 'تحويل' ? 'تحويل' : '-'),
      currency: (item.typeName === 'سلفة' && m.advType === 'تصريف')
        ? ((m.fromCurrency || '') + '→' + (m.toCurrency || ''))
        : m.currency,
      amount: signed,
      rawAmount: rawAmount,
      fromFund: m.fromFund || '-',
      toFund: m.toFund || '-',
      project: m.project || '-',
      detail: m.description || m.notes || '-'
    });
  });

  const byBorrower = buildSeriesByKey_(items, function(i) { return i.mapped.borrower; }, function(i) {
    return borrowerSignedAmount_(i);
  });
  // الرسم الدائري لا يقبل قيماً سالبة — نعرض القيمة المطلقة للصافي
  byBorrower.values = (byBorrower.values || []).map(function(v) { return Math.abs(Number(v) || 0); });
  const byTxn = buildCumulativeSeriesByTransaction_(items, function(i) {
    return borrowerSignedAmount_(i);
  });

  return {
    truncated: cut.truncated,
    kpis: [
      { key: 'count', labelKey: 'report.kpi.count', value: rows.length },
      { key: 'net', labelKey: 'report.kpi.net', value: Math.round(net * 100) / 100 }
    ],
    series: [
      { name: 'report.chart.byBorrower', chart: 'doughnut', labels: byBorrower.labels, values: byBorrower.values },
      { name: 'report.chart.byDay', chart: 'line', labels: byTxn.labels, values: byTxn.values }
    ],
    columns: [
      { key: 'seq', labelKey: 'log.col.opNumber' },
      { key: 'ref', labelKey: 'log.col.ref' },
      { key: 'trxDate', labelKey: 'log.col.trxDate' },
      { key: 'typeName', labelKey: 'report.col.type' },
      { key: 'borrower', labelKey: 'log.col.borrower' },
      { key: 'advType', labelKey: 'log.col.type' },
      { key: 'currency', labelKey: 'log.col.currency' },
      { key: 'amount', labelKey: 'report.col.signedAmount' },
      { key: 'detail', labelKey: 'log.col.notes' },
      { key: 'status', labelKey: 'log.col.status' }
    ],
    rows: rows
  };
}

function buildTypeSummaryReport_(ss, empName, filters, typeName, sheetName) {
  let items = collectEmployeeRows_(ss, empName, filters, sheetName, typeName, function(row) {
    if (!matchExactFilter_(row[COL.CURRENCY], filters.currency)) return false;
    if (!matchExactFilter_(row[COL.PROJECT], filters.project)) return false;
    if (!matchExactFilter_(row[COL.FUND] || 'الخزنة', filters.fund)) return false;
    return true;
  });
  const cut = truncateItems_(items);
  items = cut.items;

  let total = 0;
  const rows = items.map(function(item) {
    const m = item.mapped;
    const amount = toNumber_(m.total);
    total += amount;
    return Object.assign(reportRowCommon_(m), {
      project: m.project,
      fund: m.fund,
      sender: m.sender,
      receiver: m.receiver,
      currency: m.currency,
      qty: m.qty,
      amount: m.amount,
      total: amount,
      detail: m.description || m.notes
    });
  });

  const byProject = buildSeriesByKey_(items, function(i) { return i.mapped.project; }, function(i) {
    return toNumber_(i.mapped.total);
  });
  const byDay = buildSeriesByDay_(items, function(i) { return toNumber_(i.mapped.total); });

  return {
    truncated: cut.truncated,
    kpis: [
      { key: 'count', labelKey: 'report.kpi.count', value: rows.length },
      { key: 'total', labelKey: 'report.kpi.total', value: Math.round(total * 100) / 100 }
    ],
    series: [
      { name: 'report.chart.byProject', chart: 'pie', labels: byProject.labels, values: byProject.values },
      { name: 'report.chart.byDay', chart: 'bar', labels: byDay.labels, values: byDay.values }
    ],
    columns: [
      { key: 'seq', labelKey: 'log.col.opNumber' },
      { key: 'ref', labelKey: 'log.col.ref' },
      { key: 'trxDate', labelKey: 'log.col.trxDate' },
      { key: 'project', labelKey: 'log.col.project' },
      { key: 'fund', labelKey: 'log.col.fund' },
      { key: 'currency', labelKey: 'log.col.currency' },
      { key: 'total', labelKey: 'form.total' },
      { key: 'detail', labelKey: 'log.col.description' },
      { key: 'status', labelKey: 'log.col.status' }
    ],
    rows: rows
  };
}

function buildExchangeReport_(ss, empName, filters) {
  let items = collectEmployeeRows_(ss, empName, filters, SHEETS.EXCHANGES, 'تصريف', function(row) {
    if (!matchExactFilter_(row[COL.FUND] || 'الخزنة', filters.fund)) return false;
    if (!matchExactFilter_(row[COL.EX_TYPE], filters.exType)) return false;
    return true;
  });
  const cut = truncateItems_(items);
  items = cut.items;

  let buy = 0;
  let sell = 0;
  const rows = items.map(function(item) {
    const m = item.mapped;
    // مؤشرا الشراء/البيع يقيسان حجم الدولار مهما كان اتجاه إدخال المبلغ
    const usdLeg = exchangeUsdLeg_(m);
    if (m.exType === 'شراء') buy += usdLeg;
    else if (m.exType === 'بيع') sell += usdLeg;
    return Object.assign(reportRowCommon_(m), {
      fund: m.fund,
      exType: m.exType,
      paidCur: m.paidCur,
      recCur: m.recCur,
      exAmt: toNumber_(m.exAmt),
      exRate: m.exRate,
      total: toNumber_(m.total),
      detail: m.notes
    });
  });

  const byType = buildSeriesByKey_(items, function(i) { return i.mapped.exType; }, function(i) {
    return exchangeUsdLeg_(i.mapped);
  });
  const byDay = buildSeriesByDay_(items, function(i) { return exchangeUsdLeg_(i.mapped); });

  return {
    truncated: cut.truncated,
    kpis: [
      { key: 'count', labelKey: 'report.kpi.count', value: rows.length },
      { key: 'buy', labelKey: 'report.kpi.buy', value: Math.round(buy * 100) / 100 },
      { key: 'sell', labelKey: 'report.kpi.sell', value: Math.round(sell * 100) / 100 }
    ],
    series: [
      { name: 'report.chart.byType', chart: 'doughnut', labels: byType.labels, values: byType.values },
      { name: 'report.chart.byDay', chart: 'line', labels: byDay.labels, values: byDay.values }
    ],
    columns: [
      { key: 'seq', labelKey: 'log.col.opNumber' },
      { key: 'ref', labelKey: 'log.col.ref' },
      { key: 'trxDate', labelKey: 'log.col.trxDate' },
      { key: 'fund', labelKey: 'log.col.fund' },
      { key: 'exType', labelKey: 'form.exchangeType' },
      { key: 'paidCur', labelKey: 'form.paidCurrency' },
      { key: 'recCur', labelKey: 'form.receivedCurrency' },
      { key: 'exAmt', labelKey: 'log.col.amount' },
      { key: 'exRate', labelKey: 'form.exchangeRate' },
      { key: 'total', labelKey: 'form.total' },
      { key: 'status', labelKey: 'log.col.status' }
    ],
    rows: rows
  };
}

function buildTransferReport_(ss, empName, filters) {
  let items = collectEmployeeRows_(ss, empName, filters, SHEETS.TRANSFERS, 'تحويل', function(row) {
    if (!matchExactFilter_(row[COL.CURRENCY], filters.currency)) return false;
    if (!matchExactFilter_(row[COL.FROM_FUND], filters.fromFund)) return false;
    if (!matchExactFilter_(row[COL.TO_FUND], filters.toFund)) return false;
    if (!matchExactFilter_(row[COL.BORROWER], filters.borrower)) return false;
    return true;
  });
  const cut = truncateItems_(items);
  items = cut.items;

  let total = 0;
  const rows = items.map(function(item) {
    const m = item.mapped;
    const amount = toNumber_(m.amount);
    total += amount;
    return Object.assign(reportRowCommon_(m), {
      fromFund: m.fromFund,
      toFund: m.toFund,
      fromBank: m.fromBank || '-',
      toBank: m.toBank || '-',
      currency: m.currency,
      amount: amount,
      borrower: m.borrower,
      detail: m.notes
    });
  });

  const byPair = buildSeriesByKey_(items, function(i) {
    return (i.mapped.fromFund || '') + '→' + (i.mapped.toFund || '');
  }, function(i) { return toNumber_(i.mapped.amount); });
  const byDay = buildSeriesByDay_(items, function(i) { return toNumber_(i.mapped.amount); });

  return {
    truncated: cut.truncated,
    kpis: [
      { key: 'count', labelKey: 'report.kpi.count', value: rows.length },
      { key: 'total', labelKey: 'report.kpi.total', value: Math.round(total * 100) / 100 }
    ],
    series: [
      { name: 'report.chart.byType', chart: 'bar', labels: byPair.labels, values: byPair.values },
      { name: 'report.chart.byDay', chart: 'bar', labels: byDay.labels, values: byDay.values }
    ],
    columns: [
      { key: 'seq', labelKey: 'log.col.opNumber' },
      { key: 'ref', labelKey: 'log.col.ref' },
      { key: 'trxDate', labelKey: 'log.col.trxDate' },
      { key: 'fromFund', labelKey: 'log.col.fromFund' },
      { key: 'toFund', labelKey: 'log.col.toFund' },
      { key: 'currency', labelKey: 'log.col.currency' },
      { key: 'amount', labelKey: 'log.col.amount' },
      { key: 'borrower', labelKey: 'log.col.borrower' },
      { key: 'status', labelKey: 'log.col.status' }
    ],
    rows: rows
  };
}

function buildAdvancesReport_(ss, empName, filters) {
  let items = collectEmployeeRows_(ss, empName, filters, SHEETS.ADVANCES, 'سلفة', function(row) {
    if (!matchExactFilter_(row[COL.BORROWER], filters.borrower)) return false;
    if (!matchExactFilter_(row[COL.ADV_TYPE], filters.advType)) return false;
    if (!matchAdvanceCurrencyFilter_(row, filters.currency)) return false;
    if (!matchExactFilter_(row[COL.PROJECT], filters.project)) return false;
    return true;
  });
  const cut = truncateItems_(items);
  items = cut.items;

  let net = 0;
  const rows = items.map(function(item) {
    const m = item.mapped;
    const signed = borrowerSignedAmount_(item);
    const rawAmount = toNumber_(m.amount || m.total);
    net += signed;
    return Object.assign(reportRowCommon_(m), {
      borrower: m.borrower,
      advType: m.advType,
      project: m.project,
      currency: (m.advType === 'تصريف')
        ? ((m.fromCurrency || '') + '→' + (m.toCurrency || ''))
        : m.currency,
      qty: m.qty,
      rawAmount: rawAmount,
      exRate: m.exRate,
      total: m.total,
      amount: signed,
      detail: m.description || m.notes
    });
  });

  const byBorrower = buildSeriesByKey_(items, function(i) { return i.mapped.borrower; }, function(i) {
    return borrowerSignedAmount_(i);
  });
  byBorrower.values = (byBorrower.values || []).map(function(v) { return Math.abs(Number(v) || 0); });
  const byType = buildSeriesByKey_(items, function(i) { return i.mapped.advType; }, function(i) {
    return Math.abs(borrowerSignedAmount_(i)) || toNumber_(i.mapped.amount || i.mapped.total);
  });

  return {
    truncated: cut.truncated,
    kpis: [
      { key: 'count', labelKey: 'report.kpi.count', value: rows.length },
      { key: 'net', labelKey: 'report.kpi.net', value: Math.round(net * 100) / 100 }
    ],
    series: [
      { name: 'report.chart.byBorrower', chart: 'doughnut', labels: byBorrower.labels, values: byBorrower.values },
      { name: 'report.chart.byType', chart: 'pie', labels: byType.labels, values: byType.values }
    ],
    columns: [
      { key: 'seq', labelKey: 'log.col.opNumber' },
      { key: 'ref', labelKey: 'log.col.ref' },
      { key: 'trxDate', labelKey: 'log.col.trxDate' },
      { key: 'borrower', labelKey: 'log.col.borrower' },
      { key: 'advType', labelKey: 'log.col.type' },
      { key: 'project', labelKey: 'log.col.project' },
      { key: 'currency', labelKey: 'log.col.currency' },
      { key: 'qty', labelKey: 'form.quantity' },
      { key: 'rawAmount', labelKey: 'log.col.amount' },
      { key: 'exRate', labelKey: 'form.exchangeRate' },
      { key: 'total', labelKey: 'form.total' },
      { key: 'amount', labelKey: 'report.col.signedAmount' },
      { key: 'status', labelKey: 'log.col.status' }
    ],
    rows: rows
  };
}

function overviewRowFields_(typeName, m) {
  // صف موحّد للتقرير الشامل مع حقول واضحة حسب نوع العملية
  if (typeName === 'وارد') {
    return {
      party: m.sender || '-',
      fundRoute: m.fund || 'الخزنة',
      subtype: '-',
      project: m.project || '-',
      currency: m.currency || '-',
      amount: toNumber_(m.total),
      detail: m.description || m.notes || '-'
    };
  }
  if (typeName === 'صادر') {
    return {
      party: m.sender || '-',
      fundRoute: m.fund || 'الخزنة',
      subtype: '-',
      project: m.project || '-',
      currency: m.currency || '-',
      amount: toNumber_(m.total),
      detail: m.description || m.notes || '-'
    };
  }
  if (typeName === 'تصريف') {
    return {
      party: '-',
      fundRoute: m.fund || 'الخزنة',
      subtype: m.exType || '-',
      project: '-',
      currency: (m.paidCur || '-') + '→' + (m.recCur || '-'),
      amount: toNumber_(m.exAmt || m.total),
      detail: m.notes || '-'
    };
  }
  if (typeName === 'تحويل') {
    return {
      party: m.borrower && m.borrower !== '-' ? m.borrower : '-',
      fundRoute: (m.fromFund || '-') + ' → ' + (m.toFund || '-'),
      subtype: 'تحويل',
      project: '-',
      currency: m.currency || '-',
      amount: toNumber_(m.amount),
      detail: m.notes || '-'
    };
  }
  // سلفة — الصندوق صندوق السلف وليس الخزنة الافتراضية
  return {
    party: m.borrower || '-',
    fundRoute: 'السلف',
    subtype: m.advType || '-',
    project: m.project || '-',
    currency: m.currency || m.fromCurrency || '-',
    amount: toNumber_(m.amount || m.total),
    detail: m.description || m.notes || '-'
  };
}

function buildOverviewReport_(ss, empName, filters) {
  let items = [];
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.INCOMES, 'وارد'));
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.OUTCOMES, 'صادر'));
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.EXCHANGES, 'تصريف'));
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.TRANSFERS, 'تحويل'));
  items = items.concat(collectEmployeeRows_(ss, empName, filters, SHEETS.ADVANCES, 'سلفة'));

  if (filters.currency) {
    items = items.filter(function(item) {
      const m = item.mapped;
      if (item.typeName === 'تصريف') {
        // التصريف بين دولار/ليرة يمسّ العملتين دائماً
        if (filters.currency === 'دولار' || filters.currency === 'ليرة سورية') return true;
        return matchExactFilter_(m.paidCur, filters.currency) ||
          matchExactFilter_(m.recCur, filters.currency);
      }
      if (item.typeName === 'سلفة' && m.advType === 'تصريف') {
        return matchExactFilter_(m.fromCurrency || m.fromCur, filters.currency) ||
          matchExactFilter_(m.toCurrency || m.toCur, filters.currency);
      }
      const c = m.currency || '';
      return matchExactFilter_(c, filters.currency);
    });
  }

  const cut = truncateItems_(items);
  items = cut.items;

  let totalUsd = 0;
  let totalSyp = 0;
  const rows = items.map(function(item) {
    const m = item.mapped;
    const fields = overviewRowFields_(item.typeName, m);
    const cur = String(fields.currency || '');
    if (item.typeName === 'تصريف') {
      // حجم الحركة بكل عملة (للملخص) — التصريف يحرّك الدولار والليرة معاً
      totalUsd += exchangeUsdLeg_(m);
      totalSyp += exchangeSypLeg_(m);
    } else if (cur.indexOf('دولار') !== -1 && cur.indexOf('→') === -1) {
      totalUsd += fields.amount;
    } else if (cur.indexOf('ليرة') !== -1 && cur.indexOf('→') === -1) {
      totalSyp += fields.amount;
    }
    return Object.assign(reportRowCommon_(m), fields);
  });

  const byType = buildSeriesByKey_(items, function(i) { return i.typeName; }, function(i) {
    return toNumber_(i.mapped.total || i.mapped.amount || i.mapped.exAmt);
  });
  // الحركة التراكمية حسب فلتر العملة (بدون فلتر: أثر الدولار للتصريف)
  const byDay = buildCumulativeSeriesByTransaction_(items, function(i) {
    const m = i.mapped || {};
    const curF = filters.currency;
    if (i.typeName === 'وارد') return toNumber_(m.total);
    if (i.typeName === 'صادر') return -toNumber_(m.total);
    if (i.typeName === 'تصريف') {
      const target = normalizeCurrency_(curF) || CUR.USD;
      if (normalizeCurrency_(m.paidCur) === target) return -toNumber_(m.exAmt);
      if (normalizeCurrency_(m.recCur) === target) return toNumber_(m.total);
      return 0;
    }
    if (i.typeName === 'تحويل') {
      // صافي التقرير الشامل: التحويل الداخلي بين الصناديق = 0
      return 0;
    }
    if (i.typeName === 'سلفة') {
      if (m.advType === 'صادر' || m.advType === 'وارد') return -toNumber_(m.total || m.amount);
      return 0;
    }
    return 0;
  });

  return {
    truncated: cut.truncated,
    kpis: [
      { key: 'count', labelKey: 'report.kpi.count', value: rows.length },
      { key: 'totalUsd', labelKey: 'report.kpi.totalUsd', value: Math.round(totalUsd * 100) / 100 },
      { key: 'totalSyp', labelKey: 'report.kpi.totalSyp', value: Math.round(totalSyp * 100) / 100 }
    ],
    series: [
      { name: 'report.chart.byType', chart: 'polarArea', labels: byType.labels, values: byType.values },
      { name: 'report.chart.byDay', chart: 'line', labels: byDay.labels, values: byDay.values }
    ],
    columns: [
      { key: 'seq', labelKey: 'log.col.opNumber' },
      { key: 'ref', labelKey: 'log.col.ref' },
      { key: 'trxDate', labelKey: 'log.col.trxDate' },
      { key: 'typeName', labelKey: 'report.col.type' },
      { key: 'subtype', labelKey: 'report.col.subtype' },
      { key: 'party', labelKey: 'report.col.party' },
      { key: 'fundRoute', labelKey: 'report.col.fundRoute' },
      { key: 'project', labelKey: 'log.col.project' },
      { key: 'currency', labelKey: 'log.col.currency' },
      { key: 'amount', labelKey: 'log.col.amount' },
      { key: 'detail', labelKey: 'log.col.notes' },
      { key: 'status', labelKey: 'log.col.status' }
    ],
    rows: rows
  };
}

// ==== نظام الإشعارات وطلبات الموافقة (Notifications) ====

var NOTIF_HEADERS = [
  'معرف الإشعار', 'الموظف', 'الرسالة', 'التاريخ', 'الحالة',
  'القسم', 'معرف الطلب', 'نوع الإجراء', 'المرجع', 'مقدم الطلب'
];
var NOTIF_RECIPIENT_SUPERVISORS = '__SUPERVISORS__';
var NOTIF_PAGE_SIZE = 10;
/** حد العرض لكل قسم (معلقة / موافق عليها / مرفوضة) — الأحدث أولاً، بدون حد أيام */
var NOTIF_MAX_WINDOW = 100;

function ensureNotificationsSheet_() {
  return ensureSheet_(SHEETS.NOTIFICATIONS, NOTIF_HEADERS);
}

function createNotification_(recipient, message, category, auditId, actionType, ref, actor) {
  const sheet = ensureNotificationsSheet_();
  const id = 'N-' + Date.now() + '-' + Math.floor(Math.random() * 900 + 100);
  appendRowByHeaders_(sheet, {
    'معرف الإشعار': id,
    'الموظف': recipient,
    'الرسالة': message,
    'التاريخ': new Date(),
    'الحالة': 'نشط',
    'القسم': category || 'pending',
    'معرف الطلب': auditId || '',
    'نوع الإجراء': actionType || '',
    'المرجع': ref || '',
    'مقدم الطلب': actor || ''
  });
  return id;
}

/**
 * هل يوجد إشعار نشط لنفس الطلب + المستلم + القسم؟ (يمنع التكرار)
 */
function hasActiveNotification_(auditId, recipient, category) {
  if (!auditId) return false;
  const sheet = ensureNotificationsSheet_();
  if (!sheet || sheet.getLastRow() < 2) return false;
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const iAudit = headers.indexOf('معرف الطلب');
  const iRecipient = headers.indexOf('الموظف');
  const iStatus = headers.indexOf('الحالة');
  const iCat = headers.indexOf('القسم');
  if (iAudit < 0) return false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][iAudit] || '') !== String(auditId)) continue;
    if (iStatus >= 0 && String(data[i][iStatus] || '') === 'محذوف') continue;
    if (recipient && iRecipient >= 0 && String(data[i][iRecipient] || '') !== String(recipient)) continue;
    if (category && iCat >= 0 && String(data[i][iCat] || '') !== String(category)) continue;
    return true;
  }
  return false;
}

function createRequestNotifications_(empName, actionType, ref, auditId, reason) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e) { /* متابعة بحذر */ }
  try {
    const actionLabel = actionType === 'حذف' ? 'حذف' : 'تعديل';
    const empMsg = actionLabel + '|' + ref + '|' + (reason || '');
    const supMsg = actionLabel + '|' + empName + '|' + ref + '|' + (reason || '');
    // إنشاء مرة واحدة فقط لكل مستلم — يمنع ظهور نفس الطلب مرتين عند المشرف
    if (!hasActiveNotification_(auditId, empName, 'pending')) {
      createNotification_(empName, empMsg, 'pending', auditId, actionType, ref, empName);
    }
    if (!hasActiveNotification_(auditId, NOTIF_RECIPIENT_SUPERVISORS, 'pending')) {
      createNotification_(NOTIF_RECIPIENT_SUPERVISORS, supMsg, 'pending', auditId, actionType, ref, empName);
    }
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function notifAmountHint_(row) {
  if (!row || typeof row !== 'object') return '';
  // في عمليات التصريف يُذكر ما خرج بعملته حتى لا يختلط رقم بعملة أخرى
  let amt;
  let cur;
  if (row.typeName === 'تصريف') {
    amt = row.exAmt;
    cur = row.paidCur;
  } else if (row.typeName === 'سلفة' && row.advType === 'تصريف') {
    amt = row.amount;
    cur = row.fromCurrency;
  } else {
    amt = row.total != null ? row.total : (row.amount != null ? row.amount : row.exAmt);
    cur = row.currency || row.paidCur || row.recCur || '';
  }
  if (amt === '' || amt == null || amt === '-') return '';
  return String(amt) + (cur && cur !== '-' ? (' ' + cur) : '');
}

/** حقول قابلة للمقارنة بين القديم/الجديد لعرض «ما الذي تغيّر» */
var NOTIF_CHANGE_FIELDS_ = [
  { key: 'trxDate', labelKey: 'log.col.trxDate' },
  { key: 'project', labelKey: 'log.col.project' },
  { key: 'description', labelKey: 'log.col.description' },
  { key: 'sender', labelKey: 'form.sender' },
  { key: 'receiver', labelKey: 'form.receiver' },
      { key: 'qty', labelKey: 'form.quantity' },
  { key: 'amount', labelKey: 'log.col.amount' },
  { key: 'total', labelKey: 'log.col.amount' },
  { key: 'currency', labelKey: 'log.col.currency' },
  { key: 'exType', labelKey: 'form.exchangeType' },
  { key: 'exAmt', labelKey: 'form.exchangeAmount' },
  { key: 'exRate', labelKey: 'form.exchangeRate' },
  { key: 'paidCur', labelKey: 'form.paidCurrency' },
  { key: 'recCur', labelKey: 'form.receivedCurrency' },
  { key: 'fromCurrency', labelKey: 'form.fromCurrency' },
  { key: 'toCurrency', labelKey: 'form.toCurrency' },
  { key: 'fromFund', labelKey: 'log.col.fromFund' },
  { key: 'toFund', labelKey: 'log.col.toFund' },
  { key: 'fund', labelKey: 'log.col.fund' },
  { key: 'notes', labelKey: 'log.col.notes' },
  { key: 'borrower', labelKey: 'log.col.borrower' },
  { key: 'attach', labelKey: 'log.col.attach' }
];

function notifNormVal_(v) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  var s = String(v).trim();
  // توحيد صيغ التاريخ حتى لا يظهر «تغيير» وهمي
  var m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) {
    return m1[3] + '-' + ('0' + m1[2]).slice(-2) + '-' + ('0' + m1[1]).slice(-2);
  }
  var m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return m2[1] + '-' + m2[2] + '-' + m2[3];
  return s;
}

/**
 * فرق التعديل: قائمة {labelKey, from, to}
 */
function buildNotifChanges_(oldData, newData) {
  if (!newData || typeof newData !== 'object') return [];
  const oldObj = (oldData && typeof oldData === 'object') ? oldData : {};
  const changes = [];
  const seen = {};
  function isEmptyVal_(v) {
    return v === '' || v === '-' || v === '—' || v == null;
  }
  for (let i = 0; i < NOTIF_CHANGE_FIELDS_.length; i++) {
    const f = NOTIF_CHANGE_FIELDS_[i];
    if (!Object.prototype.hasOwnProperty.call(newData, f.key)) continue;
    if (f.key === 'attach' && (newData.removeAttach || newData.existingAttach)) {
      // يُعرض لاحقاً بشكل مبسّط
    }
    const from = notifNormVal_(oldObj[f.key]);
    const to = notifNormVal_(newData[f.key]);
    if (from === to) continue;
    if (isEmptyVal_(from) && isEmptyVal_(to)) continue;
    if (seen[f.key]) continue;
    seen[f.key] = true;
    const isLink = f.key === 'attach' || /^https?:\/\//i.test(to) || /^https?:\/\//i.test(from);
    changes.push({
      key: f.key,
      labelKey: f.labelKey,
      from: isEmptyVal_(from) ? '—' : from,
      to: isEmptyVal_(to) ? '—' : to,
      isLink: isLink
    });
  }
  if (newData.removeAttach) {
    changes.push({ key: 'attach', labelKey: 'log.col.attach', from: '✓', to: '✕', isLink: false });
  }
  return changes;
}

/**
 * جلب تفاصيل Audit لمعرّفات محددة فقط (أسرع من خريطة كاملة)
 */
function buildAuditDetailsMapForIds_(auditIds) {
  const map = {};
  const want = {};
  let need = 0;
  (auditIds || []).forEach(function(id) {
    id = String(id || '').trim();
    if (!id || want[id]) return;
    want[id] = true;
    need++;
  });
  if (!need) return map;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const auditSheet = ss.getSheetByName(SHEETS.AUDIT);
  if (!auditSheet || auditSheet.getLastRow() < 2) return map;
  const data = auditSheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const iId = headers.indexOf('معرف الحركة');
  const iRef = headers.indexOf('المرجع الأصلي');
  const iEmp = headers.indexOf('الموظف الطالب');
  const iAction = headers.indexOf('نوع الإجراء');
  const iOld = headers.indexOf('التفاصيل القديمة');
  const iNew = headers.indexOf('التفاصيل الجديدة');
  const iReason = headers.indexOf('السبب');
  const iStatus = headers.indexOf('حالة الطلب');
  if (iId < 0) return map;

  for (let i = data.length - 1; i >= 1; i--) {
    const id = String(data[i][iId] || '').trim();
    if (!want[id] || map[id]) continue;
    let oldData = null;
    let newData = null;
    try { oldData = JSON.parse(String(data[i][iOld] || 'null')); } catch (e1) {}
    try { newData = JSON.parse(String(data[i][iNew] || 'null')); } catch (e2) {}
    map[id] = {
      auditId: id,
      ref: iRef >= 0 ? String(data[i][iRef] || '') : '',
      actor: iEmp >= 0 ? String(data[i][iEmp] || '') : '',
      actionType: iAction >= 0 ? String(data[i][iAction] || '') : '',
      reason: iReason >= 0 ? String(data[i][iReason] || '') : '',
      status: iStatus >= 0 ? String(data[i][iStatus] || '') : '',
      oldData: oldData,
      newData: newData,
      typeName: (oldData && oldData.typeName) || (newData && newData.typeName) || '',
      amountHint: notifAmountHint_(oldData || newData),
      changes: buildNotifChanges_(oldData, newData)
    };
    if (Object.keys(map).length >= need) break;
  }
  return map;
}

/**
 * تفاصيل طلب من Audit لزر «تفاصيل»
 */
function getAuditRequestDetails(session, auditId) {
  const auth = requireSession_(session);
  if (!auth.ok) return auth.result;
  auditId = sanitizeText(auditId, 80);
  const audit = findAuditRowById_(auditId);
  if (!audit) return { success: false, messageKey: 'notif.err.notFound' };

  const empName = String(audit['الموظف الطالب'] || '');
  const isSupervisor = isSupervisorRole_(auth.role);
  if (!isSupervisor && empName !== auth.username) {
    return { success: false, messageKey: 'auth.forbidden' };
  }

  let oldData = null;
  let newData = null;
  try { oldData = JSON.parse(String(audit['التفاصيل القديمة'] || 'null')); } catch (e1) {}
  try { newData = JSON.parse(String(audit['التفاصيل الجديدة'] || 'null')); } catch (e2) {}

  return {
    success: true,
    isSupervisor: isSupervisor,
    auditId: auditId,
    ref: String(audit['المرجع الأصلي'] || ''),
    actor: empName,
    actionType: String(audit['نوع الإجراء'] || ''),
    reason: String(audit['السبب'] || ''),
    status: String(audit['حالة الطلب'] || ''),
    typeName: (oldData && oldData.typeName) || (newData && newData.typeName) || '',
    amountHint: notifAmountHint_(oldData || newData),
    changes: buildNotifChanges_(oldData, newData),
    oldData: oldData,
    newData: newData,
    canDecide: isSupervisor && String(audit['حالة الطلب'] || '') === 'بانتظار الموافقة'
  };
}

function softDeleteNotificationsByAudit_(auditId, categoryFilter) {
  const sheet = ensureNotificationsSheet_();
  if (!sheet || sheet.getLastRow() < 2) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const idxId = headers.indexOf('معرف الطلب');
  const idxStatus = headers.indexOf('الحالة');
  const idxCat = headers.indexOf('القسم');
  if (idxId < 0 || idxStatus < 0) return;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId] || '') !== String(auditId)) continue;
    if (categoryFilter && idxCat >= 0 && String(data[i][idxCat] || '') !== categoryFilter) continue;
    sheet.getRange(i + 1, idxStatus + 1).setValue('محذوف');
  }
}

function findAuditRowById_(auditId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(SHEETS.AUDIT, [
    'معرف الحركة', 'المرجع الأصلي', 'الموظف الطالب', 'نوع الإجراء',
    'التفاصيل القديمة', 'التفاصيل الجديدة', 'وقت الطلب', 'حالة الطلب', 'قرار المشرف', 'السبب'
  ]);
  const sheet = ss.getSheetByName(SHEETS.AUDIT);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const idx = headers.indexOf('معرف الحركة');
  if (idx < 0) return null;
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idx] || '') === String(auditId)) {
      const obj = { __rowIndex: i + 1, __sheet: sheet, __headers: headers };
      headers.forEach(function(h, c) { obj[h] = data[i][c]; });
      return obj;
    }
  }
  return null;
}

/**
 * طلب حذف موافق عليه لكن الصف ما زال «بانتظار الموافقة»:
 * تُحدَّث الحالة إلى محذوفة فقط — الصف يبقى للمراجعة.
 */
function repairStuckApprovedDeletes_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('repair_del_v1')) return;
  cache.put('repair_del_v1', '1', 600);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const auditSheet = ss.getSheetByName(SHEETS.AUDIT);
  if (!auditSheet || auditSheet.getLastRow() < 2) return;
  const data = auditSheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const iAction = headers.indexOf('نوع الإجراء');
  const iStatus = headers.indexOf('حالة الطلب');
  const iRef = headers.indexOf('المرجع الأصلي');
  const iEmp = headers.indexOf('الموظف الطالب');
  if (iAction < 0 || iStatus < 0 || iRef < 0) return;

  const seenRef = {};
  const start = Math.max(1, data.length - 500);
  for (let i = data.length - 1; i >= start; i--) {
    if (String(data[i][iAction] || '').trim() !== 'حذف') continue;
    if (String(data[i][iStatus] || '').trim() !== 'موافق عليه') continue;
    const ref = normalizeRef_(data[i][iRef]);
    if (!ref || seenRef[ref]) continue;
    seenRef[ref] = true;
    const leftover = findTransactionByRef_(ref);
    if (!leftover) continue;
    if (String(leftover.row[COL.STATUS] || '').trim() !== 'بانتظار الموافقة') continue;
    if (markTransactionDeleted_(leftover)) {
      invalidateBalanceCache_(String(iEmp >= 0 ? data[i][iEmp] : ''));
    }
  }
}

/**
 * موافقة أو رفض طلب موظف — للمشرف فقط
 * القرار على الحذف يغيّر الحالة إلى محذوفة ولا يحذف الصف
 */
function decideAuditRequest(session, auditId, decision) {
  const auth = requireRole_(session, ROLES.SUPERVISOR);
  if (!auth.ok) return auth.result;

  auditId = sanitizeText(auditId, 80);
  decision = sanitizeText(decision, 40);
  if (decision !== 'موافقة' && decision !== 'رفض') {
    return { success: false, messageKey: 'notif.err.decision' };
  }

  const audit = findAuditRowById_(auditId);
  if (!audit) return { success: false, messageKey: 'notif.err.notFound' };

  const ref = normalizeRef_(audit['المرجع الأصلي']);
  const actionType = String(audit['نوع الإجراء'] || '').trim();
  const empName = String(audit['الموظف الطالب'] || '');
  const auditStatus = String(audit['حالة الطلب'] || '').trim();

  if (auditStatus !== 'بانتظار الموافقة') {
    if (decision === 'موافقة' && actionType === 'حذف') {
      const leftover = findTransactionByRef_(ref);
      if (leftover && String(leftover.row[COL.STATUS] || '').trim() === 'بانتظار الموافقة') {
        if (!markTransactionDeleted_(leftover)) {
          return { success: false, messageKey: 'notif.err.deleteFailed' };
        }
        invalidateBalanceCache_(empName);
        return { success: true, messageKey: 'notif.approvedOk' };
      }
    }
    return { success: false, messageKey: 'notif.err.alreadyDecided' };
  }

  const found = findTransactionByRef_(ref);

  if (decision === 'موافقة') {
    if (actionType === 'حذف') {
      if (!found) return { success: false, messageKey: 'log.err.notFound' };
      if (!markTransactionDeleted_(found)) {
        return { success: false, messageKey: 'notif.err.deleteFailed' };
      }
      invalidateBalanceCache_(empName);
    } else if (actionType === 'تعديل') {
      if (!found) return { success: false, messageKey: 'log.err.notFound' };
      let newDataObj = null;
      try { newDataObj = JSON.parse(String(audit['التفاصيل الجديدة'] || '{}')); } catch (e) { newDataObj = null; }
      if (!newDataObj || typeof newDataObj !== 'object') {
        return { success: false, messageKey: 'notif.err.badPayload' };
      }
      const dict = buildEditUpdateDict_(found.typeName, newDataObj, found.row);
      dict[COL.STATUS] = 'مكتملة';
      updateRowByHeaders_(found.sheet, found.row.__rowIndex, dict);
      invalidateBalanceCache_(empName);
    } else {
      return { success: false, messageKey: 'form.err.unknownType' };
    }
  } else {
    if (found) {
      const restore = {};
      restore[COL.STATUS] = 'مكتملة';
      updateRowByHeaders_(found.sheet, found.row.__rowIndex, restore);
      invalidateBalanceCache_(empName);
    }
  }

  const statusLabel = decision === 'موافقة' ? 'موافق عليه' : 'مرفوض';
  audit.__sheet.getRange(audit.__rowIndex, audit.__headers.indexOf('حالة الطلب') + 1).setValue(statusLabel);
  audit.__sheet.getRange(audit.__rowIndex, audit.__headers.indexOf('قرار المشرف') + 1).setValue(auth.username);

  softDeleteNotificationsByAudit_(auditId, 'pending');

  const actionLabel = actionType === 'حذف' ? 'حذف' : 'تعديل';
  const cat = decision === 'موافقة' ? 'approved' : 'rejected';
  const empMsg = decision === 'موافقة'
    ? ('تمت الموافقة على طلب ' + actionLabel + ' للعملية ' + ref)
    : ('تم رفض طلب ' + actionLabel + ' للعملية ' + ref);
  const supMsg = decision === 'موافقة'
    ? ('وافقتَ على طلب ' + actionLabel + ' من ' + empName + ' — ' + ref)
    : ('رفضتَ طلب ' + actionLabel + ' من ' + empName + ' — ' + ref);

  if (!hasActiveNotification_(auditId, empName, cat)) {
    createNotification_(empName, empMsg, cat, auditId, actionType, ref, empName);
  }
  if (!hasActiveNotification_(auditId, NOTIF_RECIPIENT_SUPERVISORS, cat)) {
    createNotification_(NOTIF_RECIPIENT_SUPERVISORS, supMsg, cat, auditId, actionType, ref, empName);
  }

  return {
    success: true,
    messageKey: decision === 'موافقة' ? 'notif.approvedOk' : 'notif.rejectedOk'
  };
}

/**
 * مزامنة إشعارات معلقة من Audit_Trail للطلبات القديمة التي سبقت نظام الإشعارات
 * مُقيَّدة زمنياً حتى لا تبطئ كل فتح للإشعارات
 */
function syncPendingNotificationsFromAudit_(force) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'notif_sync_v2';
  if (!force && cache.get(cacheKey)) return;
  cache.put(cacheKey, '1', 300); // 5 دقائق

  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(2000)) return;
  } catch (e) { return; }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheet_(SHEETS.AUDIT, [
      'معرف الحركة', 'المرجع الأصلي', 'الموظف الطالب', 'نوع الإجراء',
      'التفاصيل القديمة', 'التفاصيل الجديدة', 'وقت الطلب', 'حالة الطلب', 'قرار المشرف', 'السبب'
    ]);
    const auditSheet = ss.getSheetByName(SHEETS.AUDIT);
    if (!auditSheet || auditSheet.getLastRow() < 2) return;

    const notifSheet = ensureNotificationsSheet_();
    const existingPending = {}; // auditId -> true إذا وُجد أي إشعار معلّق نشط
    if (notifSheet.getLastRow() >= 2) {
      const nd = notifSheet.getDataRange().getValues();
      const nh = nd[0].map(function(h) { return String(h || ''); });
      const iAudit = nh.indexOf('معرف الطلب');
      const iStatus = nh.indexOf('الحالة');
      const iCat = nh.indexOf('القسم');
      if (iAudit >= 0) {
        for (let i = 1; i < nd.length; i++) {
          const aid = String(nd[i][iAudit] || '').trim();
          if (!aid) continue;
          const st = iStatus >= 0 ? String(nd[i][iStatus] || '') : '';
          if (st === 'محذوف') continue;
          const cat = iCat >= 0 ? String(nd[i][iCat] || 'pending') : 'pending';
          if (cat === 'pending') existingPending[aid] = true;
        }
      }
    }

    const data = auditSheet.getDataRange().getValues();
    const headers = data[0].map(function(h) { return String(h || ''); });
    const iId = headers.indexOf('معرف الحركة');
    const iRef = headers.indexOf('المرجع الأصلي');
    const iEmp = headers.indexOf('الموظف الطالب');
    const iAction = headers.indexOf('نوع الإجراء');
    const iStatus = headers.indexOf('حالة الطلب');
    const iReason = headers.indexOf('السبب');
    if (iId < 0 || iStatus < 0) return;

    let created = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][iStatus] || '').trim() !== 'بانتظار الموافقة') continue;
      const auditId = String(data[i][iId] || '').trim();
      if (!auditId || existingPending[auditId]) continue;

      const empName = String(iEmp >= 0 ? data[i][iEmp] : '').trim();
      const actionType = String(iAction >= 0 ? data[i][iAction] : 'تعديل').trim();
      const ref = String(iRef >= 0 ? data[i][iRef] : '').trim();
      const reason = String(iReason >= 0 ? data[i][iReason] : '').trim();
      if (!empName) continue;

      createRequestNotifications_(empName, actionType, ref, auditId, reason === '-' ? '' : reason);
      existingPending[auditId] = true;
      created++;
      if (created >= 40) break;
    }
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/**
 * موجز الإشعارات مع تبويب وتصفح
 * category: pending | approved | rejected
 */
function getNotificationsFeed(session, category, offset, limit) {
  const auth = requireSession_(session);
  if (!auth.ok) {
    return Object.assign({ success: false, items: [], total: 0, hasMore: false }, authFailFields_(auth));
  }

  category = String(category || 'pending').trim();
  if (['pending', 'approved', 'rejected'].indexOf(category) === -1) category = 'pending';
  offset = Math.max(0, Number(offset) || 0);
  limit = Math.min(30, Math.max(5, Number(limit) || NOTIF_PAGE_SIZE));

  const isSupervisor = isSupervisorRole_(auth.role);
  ensureNotificationsSheet_();

  // مزامنة نادرة للمعلق فقط — لا في كل فتح
  if (category === 'pending') {
    try { syncPendingNotificationsFromAudit_(false); } catch (e) { /* ignore */ }
  }
  try { repairStuckApprovedDeletes_(); } catch (e2) { /* ignore */ }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.NOTIFICATIONS);
  if (!sheet || sheet.getLastRow() < 2) {
    return { success: true, items: [], total: 0, hasMore: false, category: category, isSupervisor: isSupervisor };
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const col = function(name) { return headers.indexOf(name); };
  const iId = col('معرف الإشعار');
  const iRecipient = col('الموظف');
  const iMsg = col('الرسالة');
  const iDate = col('التاريخ');
  const iStatus = col('الحالة');
  const iCat = col('القسم');
  const iAudit = col('معرف الطلب');
  const iAction = col('نوع الإجراء');
  const iRef = col('المرجع');
  const iActor = col('مقدم الطلب');

  const username = String(auth.username || '').trim();
  const seenAudit = {};
  const dupRowIndexes = [];
  const matched = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const statusVal = String(data[i][iStatus] || '').trim();
    if (statusVal === 'محذوف') continue;
    const recipient = String(data[i][iRecipient] || '').trim();

    if (isSupervisor) {
      if (recipient !== NOTIF_RECIPIENT_SUPERVISORS) continue;
    } else {
      if (recipient !== username) continue;
    }

    let cat = iCat >= 0 ? String(data[i][iCat] || '').trim() : 'pending';
    if (!cat) cat = 'pending';
    if (cat !== category) continue;

    let d = data[i][iDate];
    if (!(d instanceof Date)) d = new Date(d);
    if (isNaN(d.getTime())) d = new Date();

    const auditId = iAudit >= 0 ? String(data[i][iAudit] || '') : '';
    if (auditId) {
      if (seenAudit[auditId]) {
        dupRowIndexes.push(i + 1);
        continue;
      }
      seenAudit[auditId] = true;
    }

    matched.push({
      id: data[i][iId],
      msg: data[i][iMsg],
      date: Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy - HH:mm'),
      category: cat,
      auditId: auditId,
      actionType: iAction >= 0 ? String(data[i][iAction] || '') : '',
      ref: iRef >= 0 ? String(data[i][iRef] || '') : '',
      actor: iActor >= 0 ? String(data[i][iActor] || '') : '',
      reason: '',
      typeName: '',
      amountHint: '',
      changes: [],
      canDecide: isSupervisor && cat === 'pending' && !!auditId,
      _rowIndex: i + 1
    });

    if (matched.length >= NOTIF_MAX_WINDOW) break;
  }

  // تنظيف صامت للمكررات (لا يؤثر على الطلب — حذف إشعار مرئي فقط)
  if (dupRowIndexes.length && iStatus >= 0) {
    for (let d = 0; d < dupRowIndexes.length && d < 30; d++) {
      try { sheet.getRange(dupRowIndexes[d], iStatus + 1).setValue('محذوف'); } catch (e3) {}
    }
  }

  const slice = matched.slice(offset, offset + limit);
  const auditMap = buildAuditDetailsMapForIds_(slice.map(function(n) { return n.auditId; }));
  slice.forEach(function(n) {
    const info = n.auditId && auditMap[n.auditId] ? auditMap[n.auditId] : null;
    if (!info) return;
    if (!n.actionType) n.actionType = info.actionType || '';
    if (!n.ref) n.ref = info.ref || '';
    if (!n.actor) n.actor = info.actor || '';
    n.reason = (info.reason && info.reason !== '-') ? info.reason : '';
    n.typeName = info.typeName || '';
    n.amountHint = info.amountHint || '';
    n.changes = info.changes || [];
  });
  slice.forEach(function(n) { delete n._rowIndex; });

  return {
    success: true,
    items: slice,
    total: matched.length,
    hasMore: offset + limit < matched.length,
    category: category,
    isSupervisor: isSupervisor,
    offset: offset,
    limit: limit
  };
}

/** عدد الطلبات المعلقة للشارة — خفيف بدون Audit ولا مزامنة ثقيلة */
function getPendingNotificationsCount(session) {
  const auth = requireSession_(session);
  if (!auth.ok) return { success: false, count: 0 };
  const counts = countNotificationsByCategory_(auth);
  return { success: true, count: counts.pending || 0 };
}

/** أعداد التبويبات الثلاثة دفعة واحدة */
function getNotificationTabCounts(session) {
  const auth = requireSession_(session);
  if (!auth.ok) {
    return Object.assign({ success: false, pending: 0, approved: 0, rejected: 0 }, authFailFields_(auth));
  }
  const counts = countNotificationsByCategory_(auth);
  return {
    success: true,
    pending: counts.pending || 0,
    approved: counts.approved || 0,
    rejected: counts.rejected || 0
  };
}

function countNotificationsByCategory_(auth) {
  const out = { pending: 0, approved: 0, rejected: 0 };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.NOTIFICATIONS);
  if (!sheet || sheet.getLastRow() < 2) return out;

  const isSupervisor = isSupervisorRole_(auth.role);
  const username = String(auth.username || '').trim();
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const iRecipient = headers.indexOf('الموظف');
  const iStatus = headers.indexOf('الحالة');
  const iCat = headers.indexOf('القسم');
  const iAudit = headers.indexOf('معرف الطلب');

  const seen = { pending: {}, approved: {}, rejected: {} };

  for (let i = data.length - 1; i >= 1; i--) {
    if (iStatus >= 0 && String(data[i][iStatus] || '') === 'محذوف') continue;
    const recipient = iRecipient >= 0 ? String(data[i][iRecipient] || '').trim() : '';
    if (isSupervisor) {
      if (recipient !== NOTIF_RECIPIENT_SUPERVISORS) continue;
    } else {
      if (recipient !== username) continue;
    }
    let cat = iCat >= 0 ? String(data[i][iCat] || 'pending').trim() : 'pending';
    if (!cat) cat = 'pending';
    if (!out.hasOwnProperty(cat)) continue;
    if (out[cat] >= NOTIF_MAX_WINDOW) continue;

    const auditId = iAudit >= 0 ? String(data[i][iAudit] || '').trim() : '';
    if (auditId) {
      if (seen[cat][auditId]) continue;
      seen[cat][auditId] = true;
    }
    out[cat]++;
    if (out.pending >= NOTIF_MAX_WINDOW && out.approved >= NOTIF_MAX_WINDOW && out.rejected >= NOTIF_MAX_WINDOW) break;
  }
  return out;
}

/**
 * توافق خلفي مع الاستدعاء القديم
 */
function getEmployeeNotifications(empName) {
  // بدون جلسة كاملة: نرجع قائمة بسيطة للمستلم
  const sheet = ensureNotificationsSheet_();
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const iRecipient = headers.indexOf('الموظف');
  const iMsg = headers.indexOf('الرسالة');
  const iDate = headers.indexOf('التاريخ');
  const iStatus = headers.indexOf('الحالة');
  const iId = headers.indexOf('معرف الإشعار');
  const iCat = headers.indexOf('القسم');
  const notifs = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][iStatus] || '') === 'محذوف') continue;
    if (String(data[i][iRecipient] || '') !== String(empName)) continue;
    const cat = iCat >= 0 ? String(data[i][iCat] || 'pending') : 'pending';
    if (cat !== 'pending') continue;
    let d = new Date(data[i][iDate]);
    let dateStr = (!isNaN(d.getTime()))
      ? d.toLocaleDateString('en-GB') + ' - ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '';
    notifs.push({ id: data[i][iId], msg: data[i][iMsg], date: dateStr });
  }
  return notifs;
}

/**
 * جلب وقت آخر تحديث للنظام (يُستخدم في التحديث الصامت كل دقيقة ونصف)
 * كما تُستغل هذه الدورة كـ"نبضة قلب" للتحقق من صلاحية الجلسة من طرف السيرفر،
 * بحيث يُكتشف انتهاء الجلسة (منتصف الليل أو تسجيل دخول من جهاز آخر) خلال دقائق معدودة
 * @param {Object} [session] - {username, token} اختياري للتحقق من صلاحية الجلسة
 */
function getSystemLastUpdate(session) {
  const now = new Date();
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');
  let sessionValid = true;
  let sessionLocked = false;
  if (session && session.username) {
    const data = getValidSessionData_(session.username, session.token);
    if (!data) {
      sessionValid = false;
    } else if (data.locked) {
      sessionLocked = true;
    }
  }
  return {
    success: true,
    time: timeStr,
    timestamp: now.getTime(),
    sessionValid: sessionValid,
    sessionLocked: sessionLocked
  };
}

/**
 * حذف إشعار واحد أو مجموعة / الكل في تبويب معيّن
 * ids: مصفوفة معرفات أو 'ALL'
 * category: عند ALL لحصر التبويب
 */
function deleteNotifications(session, ids, category) {
  const auth = requireSession_(session);
  if (!auth.ok) return auth.result;

  category = String(category || '').trim();
  // المعلقة لا تُحذف يدوياً أبداً — تُزال تلقائياً عند الموافقة/الرفض
  if (category === 'pending') {
    return { success: false, messageKey: 'notif.err.pendingNoDelete' };
  }

  const isSupervisor = isSupervisorRole_(auth.role);
  const sheet = ensureNotificationsSheet_();
  if (!sheet || sheet.getLastRow() < 2) return { success: true, deleted: 0 };

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const iId = headers.indexOf('معرف الإشعار');
  const iRecipient = headers.indexOf('الموظف');
  const iStatus = headers.indexOf('الحالة');
  const iCat = headers.indexOf('القسم');

  const deleteAll = ids === 'ALL' || (ids && ids.all === true);
  const idSet = {};
  if (!deleteAll && ids && ids.length) {
    ids.forEach(function(id) { idSet[String(id)] = true; });
  }

  let deleted = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][iStatus] || '') === 'محذوف') continue;
    const cat = iCat >= 0 ? String(data[i][iCat] || 'pending') : 'pending';
    if (cat === 'pending') continue;
    if (category && cat !== category) continue;
    const recipient = String(data[i][iRecipient] || '');
    const mine = isSupervisor
      ? (recipient === NOTIF_RECIPIENT_SUPERVISORS || recipient === auth.username)
      : (recipient === auth.username);
    if (!mine) continue;
    const nid = String(data[i][iId] || '');
    if (!deleteAll && !idSet[nid]) continue;
    sheet.getRange(i + 1, iStatus + 1).setValue('محذوف');
    deleted++;
  }
  return { success: true, deleted: deleted };
}

/** توافق خلفي */
function deleteNotification(notifId) {
  const sheet = ensureNotificationsSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const iId = headers.indexOf('معرف الإشعار');
  const iStatus = headers.indexOf('الحالة');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][iId]) === String(notifId)) {
      sheet.getRange(i + 1, iStatus + 1).setValue('محذوف');
      return { success: true };
    }
  }
  return { success: false };
}