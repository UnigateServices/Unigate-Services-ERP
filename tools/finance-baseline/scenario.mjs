// Finance baseline scenario (phase F0).
//
// Runs one fixed set of finance operations against a finance API, then records every number the
// system produces (journal, balances, trial balance, statements, open items) as normalized JSON.
// Run it on the original finance app to record the baseline, and again on the merged app in each
// F3 batch: the two outputs must be identical.
//
// Usage: node scenario.mjs <apiBase> <outFile>
//   apiBase  e.g. http://localhost:3101/api (original finance app)
//
// Environment:
//   SCENARIO_TARGET  original (default) or merged. Merged signs in with a company code, and finance
//                    routes live under /finance. Only the sign-in and the paths change, never the steps.
//   SCENARIO_BATCH   full (default) or a merge batch (f3a). A batch runs only the steps its routes cover
//                    and records only what those routes compute. Its reference is baseline/<batch>.json,
//                    recorded on the original app with the same batch.
//
// The database must be fresh: migrated and seeded, with no other operations.
// All dates are fixed, so the output does not depend on the day it runs.

import { writeFileSync } from 'node:fs';

const [, , API = 'http://localhost:3101/api', OUT = 'baseline.json'] = process.argv;
const ORIGIN = process.env.SCENARIO_ORIGIN ?? 'http://localhost:3000';
const PASSWORD = process.env.SCENARIO_PASSWORD ?? 'Tradivia@dev';
const TARGET = process.env.SCENARIO_TARGET ?? 'original';
const BATCH = process.env.SCENARIO_BATCH ?? 'full';
const MERGED = TARGET === 'merged';
/** Merged sign-in: the company code, and one login name per scenario user (display names stay the same). */
const COMPANY_CODE = process.env.SCENARIO_COMPANY ?? 'scenario';
if (!['original', 'merged'].includes(TARGET)) throw new Error(`unknown SCENARIO_TARGET ${TARGET}`);
if (!['full', 'f3a'].includes(BATCH)) throw new Error(`unknown SCENARIO_BATCH ${BATCH}`);

/** Foundation routes keep their path in the merged app. Everything else is a finance route. */
function routeOf(path) {
  if (!MERGED) return path;
  if (path.startsWith('/locations')) return path;
  if (path.startsWith('/employees')) return path.replace('/employees', '/finance/members');
  return `/finance${path}`;
}

/** Login names from the finance seed. A later adapter maps these to foundation users. */
const USERS = {
  manager: 'المدير العام',
  monitor: 'المراقب',
  supervisor1: 'مشرف المكتب 1',
  employee1: 'موظف المكتب 1',
};

const cookies = {};

async function call(who, method, path, body) {
  const response = await fetch(`${API}${routeOf(path)}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      ...(cookies[who] ? { Cookie: cookies[who] } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${who} ${method} ${path} -> ${response.status}: ${text.slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function login(who) {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify(
      MERGED
        ? { companyCode: COMPANY_CODE, username: who, password: PASSWORD }
        : { username: USERS[who], password: PASSWORD },
    ),
  });
  if (!response.ok) throw new Error(`login ${who} -> ${response.status}: ${await response.text()}`);
  const raw = response.headers.getSetCookie?.() ?? [];
  cookies[who] = raw.map((item) => item.split(';')[0]).join('; ');
}

const steps = [];
async function step(name, fn) {
  try {
    const result = await fn();
    steps.push({ step: name, ok: true });
    return result;
  } catch (error) {
    steps.push({ step: name, ok: false, error: String(error.message ?? error) });
    throw error;
  }
}

function itemsOf(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && Array.isArray(value.data)) return value.data;
  return [];
}

async function main() {
  for (const who of Object.keys(USERS)) await login(who);

  const employees = itemsOf(await call('manager', 'GET', '/employees'));
  const byName = (name) => employees.find((row) => row.name === name);

  // Exchange rates on fixed dates. The functional currency is USD by default, so the rate is SYP per USD.
  await step('rates', async () => {
    for (const [date, rate] of [
      ['2026-09-01', 13000],
      ['2026-09-10', 13500],
      ['2026-09-20', 14000],
      ['2026-09-30', 14500],
    ]) {
      await call('manager', 'PUT', '/company-policy/rates', { code: 'SYP', date, rate });
    }
  });

  // Master data.
  const project = await step('project', () =>
    call('manager', 'POST', '/projects', { name: 'مشروع عام', showIn: ['INCOME', 'OUTCOME', 'LOANS', 'REPORTS'] }),
  );
  const bank = await step('bank', () => call('manager', 'POST', '/banks', { name: 'بنك تجريبي' }));
  const borrower = await step('borrower', () => call('manager', 'POST', '/borrowers', { name: 'أحمد السلفة' }));
  // Trade master data (F3c). A batch before F3c skips it.
  const trade = BATCH === 'full';
  const customer = trade
    ? await step('customer', () => call('manager', 'POST', '/customers', { name: 'زبون تجريبي', paymentTermDays: 30 }))
    : null;
  const supplier = trade ? await step('supplier', () => call('manager', 'POST', '/suppliers', { name: 'مورد تجريبي' })) : null;
  const warehouse = trade
    ? await step('warehouse', () => call('manager', 'POST', '/warehouses', { name: 'المستودع الرئيسي' }))
    : null;
  const product = trade
    ? await step('product', () =>
        call('manager', 'POST', '/products', { name: 'منتج أ', sku: 'P-A', unit: 'PIECE', costPrice: 50, salePrice: 80 }),
      )
    : null;

  // Opening cash per office employee (custody), then daily operations.
  const office1 = byName(USERS.employee1);
  await step('opening balances', async () => {
    await call('manager', 'POST', '/opening-balances', {
      transactionDate: '2026-09-01', employeeId: office1.id, fund: 'VAULT', currency: 'USD', amount: 5000,
    });
    await call('manager', 'POST', '/opening-balances', {
      transactionDate: '2026-09-01', employeeId: office1.id, fund: 'VAULT', currency: 'SYP', amount: 20000000,
    });
  });

  if (BATCH === 'f3a') {
    // F3a covers policy, master data, the ledger, opening balances, balances, and approvals.
    // Approvals need operations (F3b), so this batch records an empty history.
    const snapshot = {
      steps,
      currencies: await call('manager', 'GET', '/company-policy/currencies'),
      rates: await call('manager', 'GET', '/company-policy/rates?date=2026-09-30'),
      rateHistory: await call('manager', 'GET', '/company-policy/rates/history?code=SYP'),
      quote: await call('employee1', 'GET', '/company-policy/rates/quote?code=SYP&date=2026-09-15'),
      projects: await call('manager', 'GET', '/projects'),
      banks: await call('manager', 'GET', '/banks'),
      borrowers: await call('manager', 'GET', '/borrowers'),
      openingBalances: await call('manager', 'GET', '/opening-balances'),
      balances: await call('manager', 'GET', '/balances'),
      ledgerEntries: await call('manager', 'GET', '/ledger/entries'),
      ledgerAccounts: await call('manager', 'GET', '/ledger/accounts'),
      openingEntry: await call('manager', 'GET', '/opening-entry'),
      approvals: await call('manager', 'GET', '/audit/requests/history'),
      seenBy: {
        monitor: await call('monitor', 'GET', '/balances'),
        supervisor1: await call('supervisor1', 'GET', '/balances'),
        employee1: await call('employee1', 'GET', '/balances'),
        supervisor1Openings: await call('supervisor1', 'GET', '/opening-balances'),
      },
    };
    writeFileSync(OUT, JSON.stringify(normalize(snapshot), null, 2) + '\n');
    console.log(`OK: ${steps.length} steps (batch ${BATCH}), written to ${OUT}`);
    return;
  }

  // Operations by the general manager name the office explicitly: office 1, the employee's office.
  const locations = itemsOf(await call('manager', 'GET', '/locations'));
  const loc = locations.find((row) => row.name === 'المكتب الأول')?.id;
  if (!loc) throw new Error('office 1 not found');
  const incomes = await step('incomes', async () => {
    const usd = await call('employee1', 'POST', '/incomes', {
      transactionDate: '2026-09-02', projectId: project.id, fund: 'VAULT', currency: 'USD', amount: 1200,
      description: 'إيراد خدمة', sender: 'زبون نقدي',
    });
    const syp = await call('employee1', 'POST', '/incomes', {
      transactionDate: '2026-09-03', projectId: project.id, fund: 'VAULT', currency: 'SYP', amount: 3500000,
      description: 'إيراد بالليرة',
    });
    await call('manager', 'POST', '/incomes', {
      transactionDate: '2026-09-04', projectId: project.id, fund: 'BANK', bankId: bank.id, currency: 'USD', amount: 800,
      description: 'تحويل بنكي وارد', locationId: loc,
    });
    return { usd, syp };
  });

  const outcomes = await step('outcomes', async () => {
    const rent = await call('employee1', 'POST', '/outcomes', {
      transactionDate: '2026-09-05', projectId: project.id, fund: 'VAULT', currency: 'SYP', amount: 1250000,
      description: 'إيجار', receiver: 'المالك',
    });
    const stationery = await call('employee1', 'POST', '/outcomes', {
      transactionDate: '2026-09-06', projectId: project.id, fund: 'VAULT', currency: 'USD', amount: 150,
      description: 'قرطاسية',
    });
    return { rent, stationery };
  });

  // Approvals: an employee cannot change an operation directly. The office supervisor decides.
  await step('approvals', async () => {
    const edit = await call('employee1', 'POST', '/audit/requests', {
      reference: incomes.syp.reference, actionType: 'UPDATE', reason: 'تصحيح المبلغ', patch: { amount: 3600000 },
    });
    await call('supervisor1', 'POST', `/audit/requests/${edit.id}/decide`, { decision: 'APPROVE' });
    const removal = await call('employee1', 'POST', '/audit/requests', {
      reference: outcomes.stationery.reference, actionType: 'DELETE', reason: 'مكرر',
    });
    await call('supervisor1', 'POST', `/audit/requests/${removal.id}/decide`, { decision: 'REJECT' });
  });

  await step('transfer', () =>
    call('employee1', 'POST', '/transfers', {
      transactionDate: '2026-09-07', fromFund: 'VAULT', toFund: 'BANK', toBankId: bank.id, currency: 'USD', amount: 1000,
    }),
  );

  await step('exchanges', async () => {
    await call('employee1', 'POST', '/exchanges', {
      // BUY: the amount is in the source currency (SYP). 4,020,000 SYP at 13,400 = 300 USD.
      transactionDate: '2026-09-11', fund: 'VAULT', exchangeType: 'BUY', exchangeAmount: 4020000, exchangeRate: 13400,
    });
    await call('employee1', 'POST', '/exchanges', {
      // SELL: the amount is in USD. 100 USD at 13,600 = 1,360,000 SYP.
      transactionDate: '2026-09-12', fund: 'VAULT', exchangeType: 'SELL', exchangeAmount: 100, exchangeRate: 13600,
    });
  });

  await step('advances', async () => {
    await call('employee1', 'POST', '/advances', {
      transactionDate: '2026-09-13', borrowerId: borrower.id, advanceType: 'ISSUE', fund: 'VAULT', currency: 'USD',
      amount: 400, receiver: 'أحمد',
    });
    await call('employee1', 'POST', '/advances', {
      transactionDate: '2026-09-15', borrowerId: borrower.id, advanceType: 'OUTCOME', projectId: project.id,
      currency: 'USD', amount: 120, description: 'مصروف من السلفة',
    });
    await call('employee1', 'POST', '/advances', {
      transactionDate: '2026-09-16', borrowerId: borrower.id, advanceType: 'RETURN', fund: 'VAULT', currency: 'USD',
      amount: 200,
    });
  });

  const purchase = await step('purchase invoice', async () => {
    const draft = await call('manager', 'POST', '/purchase-invoices', {
      transactionDate: '2026-09-17', supplierId: supplier.id, warehouseId: warehouse.id, currency: 'USD', locationId: loc,
      lines: [{ productId: product.id, quantity: 10, unitPrice: 50 }],
    });
    await call('manager', 'POST', `/purchase-invoices/${draft.id}/post`, {});
    await call('manager', 'POST', `/purchase-invoices/${draft.id}/payments`, {
      transactionDate: '2026-09-18', amount: 300, projectId: project.id, fund: 'BANK', bankId: bank.id,
    });
    return draft;
  });

  const sale = await step('sales invoice', async () => {
    const draft = await call('manager', 'POST', '/sales-invoices', {
      transactionDate: '2026-09-21', customerId: customer.id, warehouseId: warehouse.id, currency: 'USD',
      dueDate: '2026-10-21', locationId: loc,
      lines: [{ productId: product.id, quantity: 4, unitPrice: 80, discountMode: 'PERCENT', discount: 5 }],
    });
    await call('manager', 'POST', `/sales-invoices/${draft.id}/post`, {});
    await call('manager', 'POST', `/sales-invoices/${draft.id}/payments`, {
      transactionDate: '2026-09-25', amount: 200, projectId: project.id, fund: 'VAULT',
    });
    return draft;
  });

  // Record everything the system computes, on fixed dates.
  const range = '?from=2026-09-01&to=2026-09-30';
  const asOf = '?asOf=2026-09-30';
  const snapshot = {
    steps,
    balances: await call('manager', 'GET', '/balances'),
    trialBalance: await call('manager', 'GET', `/statements/trial-balance${asOf}`),
    trialBalanceUsd: await call('manager', 'GET', `/statements/trial-balance${asOf}&currency=USD`),
    profitLoss: await call('manager', 'GET', `/statements/profit-loss${range}`),
    balanceSheet: await call('manager', 'GET', `/statements/balance-sheet${asOf}`),
    cashFlow: await call('manager', 'GET', `/statements/cash-flow${range}`),
    equity: await call('manager', 'GET', `/statements/equity${range}`),
    ledgerEntries: await call('manager', 'GET', '/ledger/entries'),
    ledgerAccounts: await call('manager', 'GET', '/ledger/accounts'),
    openItems: await call('manager', 'GET', '/open-items'),
    aging: await call('manager', 'GET', `/open-items/aging${asOf.replace('?', '?')}`),
    purchase: await call('manager', 'GET', `/purchase-invoices/${purchase.id}`),
    sale: await call('manager', 'GET', `/sales-invoices/${sale.id}`),
    incomes: await call('manager', 'GET', '/incomes'),
    outcomes: await call('manager', 'GET', '/outcomes'),
    transfers: await call('manager', 'GET', '/transfers'),
    exchanges: await call('manager', 'GET', '/exchanges'),
    advances: await call('manager', 'GET', '/advances'),
    approvals: await call('manager', 'GET', '/audit/requests/history'),
    // What each role sees: the same data through four different scopes.
    seenBy: {
      monitor: await call('monitor', 'GET', '/balances'),
      supervisor1: await call('supervisor1', 'GET', '/balances'),
      employee1: await call('employee1', 'GET', '/balances'),
      employee1Incomes: await call('employee1', 'GET', '/incomes'),
    },
  };

  writeFileSync(OUT, JSON.stringify(normalize(snapshot), null, 2) + '\n');
  console.log(`OK: ${steps.length} steps, written to ${OUT}`);
}

// Ids, creation times, and login names differ between runs and between the two systems.
// Business values (amounts, rates, account codes, transaction dates, references) are kept.
const DROP_KEYS = /^(id|systemDate|.*Id|.*Ids|createdAt|updatedAt|postedAt|decidedAt|requestedAt|voidedAt|reversedAt|.*At|passwordHash|token)$/;
const CUID = /^c[a-z0-9]{20,}$/;
const TODAY = new Set([
  new Date().toISOString().slice(0, 10),
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Damascus' }).format(new Date()),
]);
const REFERENCE_ANYWHERE = /\b([A-Z]{2,})-\d{6}-(\d+)\b/g;

function normalize(value) {
  if (Array.isArray(value)) {
    const rows = value.map(normalize);
    return rows.every((row) => row && typeof row === 'object')
      ? rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : rows;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (DROP_KEYS.test(key)) continue;
      out[key] = normalize(value[key]);
    }
    return out;
  }
  if (typeof value === 'string' && CUID.test(value)) return '<id>';
  // Operation references carry the day they were recorded (OUT-261023-002), not the operation date,
  // also inside descriptions.
  if (typeof value === 'string') {
    // Some postings are dated on the day they happen (for example the reversal of an approved edit).
    if (TODAY.has(value)) return '<today>';
    return value.replace(REFERENCE_ANYWHERE, '$1-YYMMDD-$2');
  }
  return value;
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  try {
    writeFileSync(OUT + '.failed.json', JSON.stringify({ steps }, null, 2));
  } catch {}
  process.exit(1);
});
