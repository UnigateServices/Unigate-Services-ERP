const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type Role = 'GENERAL_MANAGER' | 'SUPERVISOR' | 'EMPLOYEE' | 'MONITOR';

export type AuthUser = {
  id: string;
  name: string;
  role: Role;
  companyId: string;
  locationId: string | null;
  locationName: string | null;
};

export function homePath(role: Role) {
  if (role === 'GENERAL_MANAGER' || role === 'MONITOR') return '/manager';
  if (role === 'SUPERVISOR') return '/supervisor';
  return '/employee';
}

export function roleLabel(role: Role) {
  if (role === 'GENERAL_MANAGER') return 'مدير عام';
  if (role === 'MONITOR') return 'مراقب';
  if (role === 'SUPERVISOR') return 'مشرف';
  return 'موظف';
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

let sessionLockedHandler: (() => void) | null = null;

export function onSessionLocked(handler: (() => void) | null) {
  sessionLockedHandler = handler;
}

function withReason(path: string, reason?: string) {
  if (!reason) return path;
  const query = new URLSearchParams({ reason });
  return `${path}?${query.toString()}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as {
    code?: string;
    sessionLocked?: boolean;
    message?: { code?: string } | string;
  };

  if (!response.ok) {
    const code =
      data.code ||
      (typeof data.message === 'string' ? data.message : data.message?.code) ||
      'REQUEST_FAILED';
    if (code === 'SESSION_LOCKED' || data.sessionLocked) {
      notifySessionLocked();
      throw new ApiError('SESSION_LOCKED', 'SESSION_LOCKED', response.status);
    }
    throw new ApiError(code, code, response.status);
  }

  return data as T;
}

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  const data = (await response.json().catch(() => ({}))) as {
    code?: string;
    sessionLocked?: boolean;
    message?: { code?: string } | string;
  };

  if (!response.ok) {
    const code =
      data.code ||
      (typeof data.message === 'string' ? data.message : data.message?.code) ||
      'REQUEST_FAILED';
    if (code === 'SESSION_LOCKED' || data.sessionLocked) {
      notifySessionLocked();
      throw new ApiError('SESSION_LOCKED', 'SESSION_LOCKED', response.status);
    }
    throw new ApiError(code, code, response.status);
  }

  return data as T;
}

export type LoginUser = {
  name: string;
  role: Role;
  locationName: string | null;
};

export function getLoginUsers() {
  return request<LoginUser[]>('/api/auth/login-users?audience=all');
}

export function login(username: string, password: string) {
  return request<{
    success: true;
    code: 'OK';
    user: AuthUser;
  }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return request<{ success: true }>('/api/auth/logout', { method: 'POST' });
}

export function getMe() {
  return request<{ ok: true; locked: boolean; user: AuthUser }>('/api/auth/me');
}

export function lockSession() {
  return request<{ success: true; locked: true }>('/api/auth/lock', { method: 'POST' });
}

export function unlockSession(password: string) {
  return request<{ success: true; code: 'OK' }>('/api/auth/unlock', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request<{ success: true }>('/api/auth/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export type LocationRow = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
};

export type EmployeeRow = {
  id: string;
  name: string;
  role: Role;
  accountStatus: 'ACTIVE' | 'INACTIVE';
  locationId: string | null;
  location: { id: string; name: string } | null;
};

export function listLocations() {
  return request<LocationRow[]>('/api/locations');
}

export function listEmployees() {
  return request<EmployeeRow[]>('/api/employees');
}

export function createEmployee(input: {
  name: string;
  password: string;
  role: Role;
  locationId?: string;
}) {
  return request<EmployeeRow>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateEmployee(
  id: string,
  input: {
    name?: string;
    password?: string;
    role?: Role;
    accountStatus?: 'ACTIVE' | 'INACTIVE';
    locationId?: string;
  },
) {
  return request<EmployeeRow>(`/api/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export type RecordStatus = 'ACTIVE' | 'INACTIVE';

export type NamedRecord = {
  id: string;
  name: string;
  status: RecordStatus;
};

export type ProjectRow = NamedRecord & {
  showIn: string[];
};

export type DeleteAction = 'deleted' | 'deactivated';

export const PROJECT_SHOW_OPTIONS = [
  { value: 'INCOME', label: 'وارد' },
  { value: 'OUTCOME', label: 'صادر' },
  { value: 'LOANS', label: 'سلف' },
  { value: 'REPORTS', label: 'تقارير' },
] as const;

function namedApi(path: string) {
  return {
    list: () => request<NamedRecord[]>(path),
    create: (input: { name: string; status?: RecordStatus }) =>
      request<NamedRecord>(path, { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: { name?: string; status?: RecordStatus }) =>
      request<NamedRecord>(`${path}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: string) =>
      request<NamedRecord & { action: DeleteAction }>(`${path}/${id}`, { method: 'DELETE' }),
  };
}

export const locationsApi = namedApi('/api/locations');
export const borrowersApi = namedApi('/api/borrowers');
export const banksApi = namedApi('/api/banks');

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  status: RecordStatus;
  system: boolean;
  parentId: string | null;
  statementLine: string;
  hasChildren: boolean;
};

export type StatementLineOption = {
  code: string;
  name: string;
  statement: 'PROFIT_LOSS' | 'BALANCE_SHEET';
  section: 'INCOME' | 'EXPENSE' | 'ASSET' | 'LIABILITY' | 'EQUITY';
  sort: number;
};

export function listStatementLines() {
  return request<StatementLineOption[]>('/api/ledger/statement-lines');
}

export type JournalLineRow = {
  id: string;
  accountId: string;
  currency: 'USD' | 'SYP';
  debit: string;
  credit: string;
  memo: string;
  costCenterId: string | null;
  costCenter: { id: string; name: string; kind: 'PROJECT' | 'LOCATION' | 'MANUAL' } | null;
  account: { code: string; name: string; type: AccountType };
};

export type JournalEntryRow = {
  id: string;
  number: number;
  transactionDate: string;
  description: string;
  status: 'DRAFT' | 'POSTED';
  reversalOf: { number: number } | null;
  reversedBy: { id: string; number: number } | null;
  employee: { name: string };
  lines: JournalLineRow[];
};

export type JournalLineInput = {
  accountId: string;
  currency: 'USD' | 'SYP';
  debit: number;
  credit: number;
  memo?: string;
  costCenterId?: string;
};

export type JournalEntryInput = {
  transactionDate: string;
  description?: string;
  post?: boolean;
  lines: JournalLineInput[];
};

export function listAccounts() {
  return request<AccountRow[]>('/api/ledger/accounts');
}

export function createAccount(input: { code: string; name: string; type: AccountType; parentId?: string; statementLine?: string }) {
  return request<AccountRow>('/api/ledger/accounts', { method: 'POST', body: JSON.stringify(input) });
}

export function updateAccount(id: string, input: { status?: RecordStatus; parentId?: string | null; statementLine?: string }) {
  return request<AccountRow>(`/api/ledger/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function setAccountStatus(id: string, status: RecordStatus) {
  return updateAccount(id, { status });
}

export function listJournalEntries() {
  return request<JournalEntryRow[]>('/api/ledger/entries');
}

export function createJournalEntry(input: JournalEntryInput) {
  return request<JournalEntryRow>('/api/ledger/entries', { method: 'POST', body: JSON.stringify(input) });
}

export function updateJournalEntry(id: string, input: JournalEntryInput) {
  return request<JournalEntryRow>(`/api/ledger/entries/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function postJournalEntry(id: string) {
  return request<JournalEntryRow>(`/api/ledger/entries/${id}/post`, { method: 'POST', body: '{}' });
}

export function reverseJournalEntry(id: string) {
  return request<JournalEntryRow>(`/api/ledger/entries/${id}/reverse`, { method: 'POST', body: '{}' });
}

export function deleteJournalEntry(id: string) {
  return request<{ id: string }>(`/api/ledger/entries/${id}`, { method: 'DELETE' });
}

export type StatementAmount = { code: string; name: string; amount: string };

export type TrialBook = {
  currency: 'USD' | 'SYP';
  rows: { code: string; name: string; type: AccountType; debit: string; credit: string }[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
};

export type PnlBook = {
  currency: 'USD' | 'SYP';
  income: StatementAmount[];
  expenses: StatementAmount[];
  grossProfit: string;
  totalIncome: string;
  totalExpense: string;
  netProfit: string;
};

export type BalanceBook = {
  currency: 'USD' | 'SYP';
  assets: StatementAmount[];
  liabilities: StatementAmount[];
  equity: StatementAmount[];
  currentEarnings: string;
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  difference: string;
  balanced: boolean;
};

export type FiscalPeriodRow = {
  id: string;
  year: number;
  month: number;
  startsOn: string;
  endsOn: string;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
};

export type BudgetRow = {
  id: string;
  name: string;
  year: number;
  currency: 'USD' | 'SYP';
  status: 'DRAFT' | 'ACTIVE';
  lines: { accountId: string; code: string; name: string; type: AccountType; month: number; amount: string }[];
};

export type VarianceRow = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  line: string;
  budget: string;
  actual: string;
  variance: string;
  favorable: boolean;
};

function statementQuery(query: { from?: string; to?: string; asOf?: string; currency?: string; costCenterId?: string; rate?: number }) {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.asOf) params.set('asOf', query.asOf);
  if (query.currency) params.set('currency', query.currency);
  if (query.costCenterId) params.set('costCenterId', query.costCenterId);
  if (query.rate) params.set('rate', String(query.rate));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export type CostCenterRow = {
  id: string;
  code: string;
  name: string;
  kind: 'PROJECT' | 'LOCATION' | 'MANUAL';
  projectId: string | null;
  locationId: string | null;
};

export function listCostCenters() {
  return request<CostCenterRow[]>('/api/ledger/cost-centers');
}

export function getTrialBalance(asOf: string, currency?: string, costCenterId?: string, rate?: number) {
  return request<{ asOf: string; books: TrialBook[] }>(`/api/statements/trial-balance${statementQuery({ asOf, currency, costCenterId, rate })}`);
}

export function getProfitAndLoss(from: string, to: string, currency?: string, costCenterId?: string, rate?: number) {
  return request<{ from: string; to: string; books: PnlBook[] }>(
    `/api/statements/profit-loss${statementQuery({ from, to, currency, costCenterId, rate })}`,
  );
}

export function getBalanceSheet(asOf: string, currency?: string, costCenterId?: string, rate?: number) {
  return request<{ asOf: string; books: BalanceBook[] }>(`/api/statements/balance-sheet${statementQuery({ asOf, currency, costCenterId, rate })}`);
}

export type CashFlowLine = {
  code: string;
  name: string;
  amount: string;
};

export type CashFlowBook = {
  currency: 'USD' | 'SYP';
  method: 'INDIRECT';
  profit: string;
  adjustments: CashFlowLine[];
  workingCapital: CashFlowLine[];
  operating: string;
  investing: CashFlowLine[];
  investingTotal: string;
  financing: CashFlowLine[];
  financingTotal: string;
  fxOnCash: string;
  revaluationExcluded: string;
  netChange: string;
  cashMovement: string;
  difference: string;
  reconciled: boolean;
};

export type EquityChangeBook = {
  currency: 'USD' | 'SYP';
  opening: string;
  profit: string;
  capital: string;
  retained: string;
  closing: string;
};

export function getCashFlow(from: string, to: string, currency?: string, costCenterId?: string, rate?: number) {
  return request<{ from: string; to: string; method: 'INDIRECT'; books: CashFlowBook[] }>(
    `/api/statements/cash-flow${statementQuery({ from, to, currency, costCenterId, rate })}`,
  );
}

export function getEquityChanges(from: string, to: string, currency?: string, costCenterId?: string, rate?: number) {
  return request<{ from: string; to: string; books: EquityChangeBook[] }>(
    `/api/statements/equity${statementQuery({ from, to, currency, costCenterId, rate })}`,
  );
}

export function closeFiscalYear(year: number) {
  return request<FiscalPeriodRow[]>(`/api/statements/years/${year}/close`, { method: 'POST', body: '{}' });
}

export function reopenFiscalYear(year: number) {
  return request<FiscalPeriodRow[]>(`/api/statements/years/${year}/reopen`, { method: 'POST', body: '{}' });
}

export type AccountingPolicy = {
  functionalCurrency: 'USD' | 'SYP';
  inventoryMethod: string;
};

export function getAccountingPolicy() {
  return request<AccountingPolicy>('/api/statements/policy');
}

export function setInventoryMethod(inventoryMethod: 'WAC') {
  return request<AccountingPolicy>('/api/statements/policy/inventory', {
    method: 'PATCH',
    body: JSON.stringify({ inventoryMethod }),
  });
}

export function setFunctionalCurrency(functionalCurrency: 'USD' | 'SYP') {
  return request<AccountingPolicy>('/api/statements/policy', {
    method: 'PATCH',
    body: JSON.stringify({ functionalCurrency }),
  });
}

export type FxRevaluationQuote = {
  functionalCurrency: 'USD' | 'SYP';
  foreignQty: string;
  carrying: string;
  closingValue: string;
  gain: string;
  rate: string;
};

export function previewFxRevaluation(asOf: string, rate: number) {
  const params = new URLSearchParams({ asOf, rate: String(rate) });
  return request<FxRevaluationQuote>(`/api/statements/fx-revaluation?${params}`);
}

export function postFxRevaluation(asOf: string, rate: number) {
  return request<FxRevaluationQuote>('/api/statements/fx-revaluation', {
    method: 'POST',
    body: JSON.stringify({ asOf, rate }),
  });
}

export function reverseFxRevaluation(asOf: string) {
  return request<{ asOf: string }>(`/api/statements/fx-revaluation/${asOf}/reverse`, { method: 'POST', body: '{}' });
}

export function listFiscalPeriods(year: number) {
  return request<FiscalPeriodRow[]>(`/api/statements/periods?year=${year}`);
}

export function closeFiscalPeriod(id: string) {
  return request<FiscalPeriodRow>(`/api/statements/periods/${id}/close`, { method: 'POST', body: '{}' });
}

export function reopenFiscalPeriod(id: string) {
  return request<FiscalPeriodRow>(`/api/statements/periods/${id}/reopen`, { method: 'POST', body: '{}' });
}

export function listBudgets() {
  return request<BudgetRow[]>('/api/statements/budgets');
}

export function createBudget(input: {
  name: string;
  year: number;
  currency: 'USD' | 'SYP';
  lines: { accountId: string; month: number; amount: number }[];
}) {
  return request<BudgetRow>('/api/statements/budgets', { method: 'POST', body: JSON.stringify(input) });
}

export function setBudgetStatus(id: string, status: 'DRAFT' | 'ACTIVE') {
  return request<BudgetRow>(`/api/statements/budgets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function deleteBudget(id: string) {
  return request<{ id: string }>(`/api/statements/budgets/${id}`, { method: 'DELETE' });
}

export function getBudgetVariance(id: string, from: string, to: string, costCenterId?: string) {
  return request<{
    budgetId: string;
    name: string;
    year: number;
    currency: 'USD' | 'SYP';
    from: string;
    to: string;
    rows: VarianceRow[];
  }>(`/api/statements/budgets/${id}/variance${statementQuery({ from, to, costCenterId })}`);
}

export function listProjects() {
  return request<ProjectRow[]>('/api/projects');
}

export function createProject(input: { name: string; status?: RecordStatus; showIn?: string[] }) {
  return request<ProjectRow>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProject(
  id: string,
  input: { name?: string; status?: RecordStatus; showIn?: string[] },
) {
  return request<ProjectRow>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteProject(id: string) {
  return request<ProjectRow & { action: DeleteAction }>(`/api/projects/${id}`, {
    method: 'DELETE',
  });
}

export type FundType = 'VAULT' | 'SHAM_CASH' | 'BANK' | 'ADVANCES';
export type CurrencyCode = 'USD' | 'SYP';
export type OperationFund = Exclude<FundType, 'ADVANCES'>;

export const OPERATION_FUNDS: { value: OperationFund; label: string }[] = [
  { value: 'VAULT', label: 'الخزنة' },
  { value: 'SHAM_CASH', label: 'شام كاش' },
  { value: 'BANK', label: 'البنك' },
];

export const TRANSFER_FROM_FUNDS = OPERATION_FUNDS;

export const TRANSFER_TO_FUNDS: { value: FundType; label: string }[] = [
  ...OPERATION_FUNDS,
  { value: 'ADVANCES', label: 'السلف' },
];

export const INCOME_FUNDS = OPERATION_FUNDS;

export const OPENING_FUNDS: { value: OperationFund; label: string }[] = [
  { value: 'VAULT', label: 'الخزنة' },
  { value: 'SHAM_CASH', label: 'شام كاش' },
];

export const CURRENCIES: { value: CurrencyCode; label: string; code: string; flag: 'us' | 'sy' }[] = [
  { value: 'USD', label: 'دولار أمريكي', code: 'USD', flag: 'us' },
  { value: 'SYP', label: 'ليرة سورية', code: 'SYP', flag: 'sy' },
];

export type IncomeRow = {
  id: string;
  operationNumber: number;
  transactionDate: string;
  systemDate?: string;
  description: string;
  fund: FundType;
  sender: string;
  receiver: string;
  currency: CurrencyCode;
  fxRate?: string | number | null;
  quantity: string | number | null;
  amount: string | number;
  total: string | number;
  notes: string;
  status: string;
  reference: string;
  attachments?: string;
  project: { id: string; name: string } | null;
  bank: { id: string; name: string } | null;
  employee: { id: string; name: string };
  location: { id: string; name: string } | null;
};

export type IncomeSearch = {
  from?: string;
  to?: string;
  fund?: string;
  currency?: string;
  status?: string;
  projectId?: string;
  bankId?: string;
  locationId?: string;
  employee?: string;
  sender?: string;
  receiver?: string;
  description?: string;
  notes?: string;
  operationNumber?: string;
  minTotal?: string;
  maxTotal?: string;
};

export function listIncomes(search?: IncomeSearch) {
  const query = new URLSearchParams();
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      if (value) query.set(key, value);
    }
  }
  const suffix = query.toString();
  return request<IncomeRow[]>(suffix ? `/api/incomes?${suffix}` : '/api/incomes');
}

export type IncomeInput = {
  transactionDate: string;
  projectId: string;
  description?: string;
  fund: FundType;
  bankId?: string;
  sender?: string;
  receiver?: string;
  currency: CurrencyCode;
  fxRate?: number;
  quantity?: number;
  amount: number;
  notes?: string;
  locationId?: string;
};

export function createIncome(input: IncomeInput) {
  return request<IncomeRow>('/api/incomes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateIncome(id: string, input: IncomeInput, reason?: string) {
  return request<IncomeRow>(withReason(`/api/incomes/${id}`, reason), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteIncome(id: string, reason?: string) {
  return request<IncomeRow>(withReason(`/api/incomes/${id}`, reason), { method: 'DELETE' });
}

export type OutcomeRow = {
  id: string;
  operationNumber: number;
  transactionDate: string;
  description: string;
  fund: FundType;
  deliverer: string;
  receiver: string;
  currency: CurrencyCode;
  fxRate?: string | number | null;
  quantity: string | number | null;
  amount: string | number;
  total: string | number;
  notes: string;
  status: string;
  reference: string;
  systemDate?: string;
  attachments?: string;
  project: { id: string; name: string } | null;
  bank: { id: string; name: string } | null;
  employee: { id: string; name: string };
  location: { id: string; name: string } | null;
};

export type OutcomeSearch = {
  from?: string;
  to?: string;
  fund?: string;
  currency?: string;
  status?: string;
  projectId?: string;
  bankId?: string;
  deliverer?: string;
  receiver?: string;
  description?: string;
  notes?: string;
  operationNumber?: string;
  minTotal?: string;
  maxTotal?: string;
};

export function listOutcomes(search?: OutcomeSearch) {
  const query = new URLSearchParams();
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      if (value) query.set(key, value);
    }
  }
  const suffix = query.toString();
  return request<OutcomeRow[]>(suffix ? `/api/outcomes?${suffix}` : '/api/outcomes');
}

export type OutcomeInput = {
  transactionDate: string;
  projectId: string;
  description?: string;
  fund: FundType;
  bankId?: string;
  deliverer?: string;
  receiver?: string;
  currency: CurrencyCode;
  fxRate?: number;
  quantity?: number;
  amount: number;
  notes?: string;
  locationId?: string;
};

export function createOutcome(input: OutcomeInput) {
  return request<OutcomeRow>('/api/outcomes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateOutcome(id: string, input: OutcomeInput, reason?: string) {
  return request<OutcomeRow>(withReason(`/api/outcomes/${id}`, reason), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteOutcome(id: string, reason?: string) {
  return request<OutcomeRow>(withReason(`/api/outcomes/${id}`, reason), { method: 'DELETE' });
}

export type ExchangeType = 'BUY' | 'SELL';

export const EXCHANGE_TYPES: { value: ExchangeType; label: string }[] = [
  { value: 'BUY', label: 'شراء' },
  { value: 'SELL', label: 'بيع' },
];

export type ExchangeRow = {
  id: string;
  operationNumber: number;
  transactionDate: string;
  fund: FundType;
  exchangeType: ExchangeType;
  paidCurrency: CurrencyCode;
  receivedCurrency: CurrencyCode;
  amountCurrency: CurrencyCode;
  exchangeAmount: string | number;
  exchangeRate: string | number;
  total: string | number;
  notes: string;
  status: string;
  reference: string;
  systemDate?: string;
  attachments?: string;
  bank: { id: string; name: string } | null;
  employee: { id: string; name: string };
  location: { id: string; name: string } | null;
};

export type ExchangeSearch = {
  from?: string;
  to?: string;
  fund?: string;
  exchangeType?: string;
  paidCurrency?: string;
  receivedCurrency?: string;
  status?: string;
  bankId?: string;
  notes?: string;
  operationNumber?: string;
  minTotal?: string;
  maxTotal?: string;
};

export function listExchanges(search?: ExchangeSearch) {
  const query = new URLSearchParams();
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      if (value) query.set(key, value);
    }
  }
  const suffix = query.toString();
  return request<ExchangeRow[]>(suffix ? `/api/exchanges?${suffix}` : '/api/exchanges');
}

export type ExchangeInput = {
  transactionDate: string;
  fund: FundType;
  bankId?: string;
  exchangeType: ExchangeType;
  exchangeAmount: number;
  exchangeRate: number;
  notes?: string;
  locationId?: string;
};

export function createExchange(input: ExchangeInput) {
  return request<ExchangeRow>('/api/exchanges', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateExchange(id: string, input: ExchangeInput, reason?: string) {
  return request<ExchangeRow>(withReason(`/api/exchanges/${id}`, reason), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteExchange(id: string, reason?: string) {
  return request<ExchangeRow>(withReason(`/api/exchanges/${id}`, reason), { method: 'DELETE' });
}

export type TransferRow = {
  id: string;
  operationNumber: number;
  transactionDate: string;
  fromFund: FundType;
  toFund: FundType;
  currency: CurrencyCode;
  fxRate?: string | number | null;
  amount: string | number;
  notes: string;
  status: string;
  reference: string;
  systemDate?: string;
  attachments?: string;
  fromBank: { id: string; name: string } | null;
  toBank: { id: string; name: string } | null;
  borrower: { id: string; name: string } | null;
  employee: { id: string; name: string };
  location: { id: string; name: string } | null;
};

export type TransferSearch = {
  from?: string;
  to?: string;
  fromFund?: string;
  toFund?: string;
  currency?: string;
  status?: string;
  fromBankId?: string;
  toBankId?: string;
  borrowerId?: string;
  notes?: string;
  operationNumber?: string;
  minAmount?: string;
  maxAmount?: string;
};

export function listTransfers(search?: TransferSearch) {
  const query = new URLSearchParams();
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      if (value) query.set(key, value);
    }
  }
  const suffix = query.toString();
  return request<TransferRow[]>(suffix ? `/api/transfers?${suffix}` : '/api/transfers');
}

export type TransferInput = {
  transactionDate: string;
  fromFund: OperationFund;
  toFund: FundType;
  fromBankId?: string;
  toBankId?: string;
  currency: CurrencyCode;
  fxRate?: number;
  amount: number;
  borrowerId?: string;
  notes?: string;
  locationId?: string;
};

export function createTransfer(input: TransferInput) {
  return request<TransferRow>('/api/transfers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTransfer(id: string, input: TransferInput, reason?: string) {
  return request<TransferRow>(withReason(`/api/transfers/${id}`, reason), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteTransfer(id: string, reason?: string) {
  return request<TransferRow>(withReason(`/api/transfers/${id}`, reason), { method: 'DELETE' });
}

export type AdvanceType = 'OUTCOME' | 'EXCHANGE';

export const ADVANCE_TYPES: { value: AdvanceType; label: string }[] = [
  { value: 'OUTCOME', label: 'صادر' },
  { value: 'EXCHANGE', label: 'تصريف' },
];

export type AdvanceRow = {
  id: string;
  operationNumber: number;
  transactionDate: string;
  advanceType: AdvanceType;
  description: string;
  receiver: string;
  currency: CurrencyCode;
  quantity: string | number | null;
  amount: string | number;
  exchangeRate: string | number | null;
  total: string | number;
  fromCurrency: CurrencyCode | null;
  toCurrency: CurrencyCode | null;
  notes: string;
  status: string;
  reference: string;
  systemDate?: string;
  attachments?: string;
  borrower: { id: string; name: string };
  project: { id: string; name: string } | null;
  employee: { id: string; name: string };
  location: { id: string; name: string } | null;
};

export type AdvanceSearch = {
  from?: string;
  to?: string;
  advanceType?: string;
  currency?: string;
  status?: string;
  projectId?: string;
  borrowerId?: string;
  receiver?: string;
  description?: string;
  notes?: string;
  operationNumber?: string;
  minTotal?: string;
  maxTotal?: string;
};

export function listAdvances(search?: AdvanceSearch) {
  const query = new URLSearchParams();
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      if (value) query.set(key, value);
    }
  }
  const suffix = query.toString();
  return request<AdvanceRow[]>(suffix ? `/api/advances?${suffix}` : '/api/advances');
}

export type AdvanceInput = {
  transactionDate: string;
  borrowerId: string;
  advanceType: AdvanceType;
  projectId?: string;
  description?: string;
  receiver?: string;
  currency?: CurrencyCode;
  quantity?: number;
  amount: number;
  exchangeRate?: number;
  fromCurrency?: CurrencyCode;
  toCurrency?: CurrencyCode;
  notes?: string;
  locationId?: string;
};

export function createAdvance(input: AdvanceInput) {
  return request<AdvanceRow>('/api/advances', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAdvance(id: string, input: AdvanceInput, reason?: string) {
  return request<AdvanceRow>(withReason(`/api/advances/${id}`, reason), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteAdvance(id: string, reason?: string) {
  return request<AdvanceRow>(withReason(`/api/advances/${id}`, reason), { method: 'DELETE' });
}

export type OpeningRow = {
  id: string;
  operationNumber: number;
  transactionDate: string;
  systemDate?: string;
  fund: OperationFund;
  currency: CurrencyCode;
  fxRate?: string | number | null;
  amount: string | number;
  notes: string;
  status: string;
  reference: string;
  employee: { id: string; name: string };
  location: { id: string; name: string } | null;
};

export type OpeningSearch = {
  from?: string;
  to?: string;
  fund?: string;
  currency?: string;
  employeeId?: string;
  notes?: string;
  operationNumber?: string;
  minAmount?: string;
  maxAmount?: string;
};

export function listOpenings(search?: OpeningSearch) {
  const query = new URLSearchParams();
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      if (value) query.set(key, value);
    }
  }
  const suffix = query.toString();
  return request<OpeningRow[]>(suffix ? `/api/opening-balances?${suffix}` : '/api/opening-balances');
}

export function createOpening(input: {
  transactionDate: string;
  employeeId: string;
  fund: OperationFund;
  currency: CurrencyCode;
  fxRate?: number;
  amount: number;
  notes?: string;
}) {
  return request<OpeningRow>('/api/opening-balances', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteOpening(id: string) {
  return request<OpeningRow>(`/api/opening-balances/${id}`, { method: 'DELETE' });
}

export type MonitorType = 'INCOME' | 'OUTCOME' | 'EXCHANGE' | 'TRANSFER' | 'ADVANCE';

export const MONITOR_TYPES: { value: MonitorType; label: string }[] = [
  { value: 'INCOME', label: 'وارد' },
  { value: 'OUTCOME', label: 'صادر' },
  { value: 'EXCHANGE', label: 'تصريف' },
  { value: 'TRANSFER', label: 'تحويل' },
  { value: 'ADVANCE', label: 'سلف' },
];

export type MonitorRow = {
  id: string;
  operationNumber: number;
  transactionDate: string;
  systemDate: string;
  status: string;
  reference: string;
  attachments?: string;
  notes?: string;
  description?: string;
  sender?: string;
  receiver?: string;
  deliverer?: string;
  fund?: FundType;
  fromFund?: FundType;
  toFund?: FundType;
  currency?: CurrencyCode;
  paidCurrency?: CurrencyCode;
  receivedCurrency?: CurrencyCode;
  fromCurrency?: CurrencyCode | null;
  toCurrency?: CurrencyCode | null;
  quantity?: string | number | null;
  amount?: string | number;
  total?: string | number;
  exchangeAmount?: string | number;
  exchangeRate?: string | number | null;
  exchangeType?: ExchangeType;
  advanceType?: AdvanceType;
  project?: { id: string; name: string } | null;
  bank?: { id: string; name: string } | null;
  fromBank?: { id: string; name: string } | null;
  toBank?: { id: string; name: string } | null;
  borrower?: { id: string; name: string } | null;
  employee: { id: string; name: string };
  location: { id: string; name: string } | null;
};

export type MonitorResult = {
  type: MonitorType;
  sysFrom: string;
  sysTo: string;
  rows: MonitorRow[];
};

export function listMonitor(input: {
  type: MonitorType;
  employeeId?: string;
  employeeIds?: string[];
  sysFrom?: string;
  sysTo?: string;
}) {
  const query = new URLSearchParams({ type: input.type });
  if (input.employeeIds && input.employeeIds.length > 0) query.set('employeeIds', input.employeeIds.join(','));
  else if (input.employeeId) query.set('employeeId', input.employeeId);
  if (input.sysFrom) query.set('sysFrom', input.sysFrom);
  if (input.sysTo) query.set('sysTo', input.sysTo);
  return request<MonitorResult>(`/api/monitor?${query.toString()}`);
}

export type CurrencyBalance = {
  currency: CurrencyCode;
  amount: number;
};

export type NamedBalances = {
  id: string;
  name: string;
  balances: CurrencyBalance[];
};

export type FundsSnapshot = {
  vault: CurrencyBalance[];
  sham: CurrencyBalance[];
  banks: NamedBalances[];
  advances: NamedBalances[];
};

export function getFunds() {
  return request<FundsSnapshot>('/api/balances');
}

export type AuditDetails = Record<string, unknown>;

export type AuditRequestRow = {
  id: string;
  originalReference: string;
  actionType: 'UPDATE' | 'DELETE';
  reason: string;
  requestStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DIRECT';
  requestedAt: string;
  updatedAt?: string;
  supervisorDecision: string;
  oldDetails: AuditDetails;
  newDetails: AuditDetails;
  requester: { id: string; name: string };
  supervisor: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
};

export function listAuditHistory() {
  return request<AuditRequestRow[]>('/api/audit/requests/history');
}

export function listAuditRequests(status = 'PENDING') {
  const query = new URLSearchParams({ status });
  return request<AuditRequestRow[]>(`/api/audit/requests?${query.toString()}`);
}

export function requestAuditDelete(reference: string, reason?: string) {
  return request<AuditRequestRow>('/api/audit/requests', {
    method: 'POST',
    body: JSON.stringify({ reference, actionType: 'DELETE', reason }),
  });
}

export function requestAuditUpdate(reference: string, patch: Record<string, unknown>, reason?: string) {
  return request<AuditRequestRow>('/api/audit/requests', {
    method: 'POST',
    body: JSON.stringify({ reference, actionType: 'UPDATE', reason, patch }),
  });
}

export function decideAudit(id: string, decision: 'APPROVE' | 'REJECT') {
  return request<AuditRequestRow>(`/api/audit/requests/${id}/decide`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  });
}

export type AttachmentFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  ext: string;
};

export type AttachmentList = {
  reference: string;
  files: AttachmentFile[];
  canUpload: boolean;
  canDelete: boolean;
};

export function attachmentCount(raw?: string | null) {
  const text = String(raw || '').trim();
  if (!text || text === 'لا يوجد مرفق') return 0;
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function listAttachments(reference: string) {
  return request<AttachmentList>(`/api/attachments/${encodeURIComponent(reference)}`);
}

export function uploadAttachments(reference: string, files: File[]) {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  return requestForm<AttachmentList>(`/api/attachments/${encodeURIComponent(reference)}`, form);
}

export function deleteAttachment(reference: string, id: string) {
  return request<AttachmentList>(`/api/attachments/${encodeURIComponent(reference)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function loadAttachment(reference: string, id: string) {
  const response = await fetch(
    `${API_URL}/api/attachments/${encodeURIComponent(reference)}/${encodeURIComponent(id)}`,
    { credentials: 'include' },
  );
  if (!response.ok) {
    throw new ApiError('ATTACH_NOT_FOUND', 'ATTACH_NOT_FOUND', response.status);
  }
  return response.blob();
}

export async function openAttachment(reference: string, id: string) {
  const blob = await loadAttachment(reference, id);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function attachAfterSave(reference: string, files: File[]) {
  if (!files.length) return;
  await uploadAttachments(reference, files);
}

export type NotificationSection = 'pending' | 'approved' | 'rejected';

export type NotificationRow = {
  id: string;
  message: string;
  occurredAt: string;
  status: 'UNREAD' | 'READ';
  section: NotificationSection | string;
  requestId: string;
  actionType: string;
  reference: string;
  requester: { id: string; name: string } | null;
};

export type NotificationCounts = {
  pending: number;
  approved: number;
  rejected: number;
};

export function listNotifications(section: NotificationSection = 'pending') {
  const query = new URLSearchParams({ section });
  return request<NotificationRow[]>(`/api/notifications?${query.toString()}`);
}

export function getNotificationCounts() {
  return request<NotificationCounts>('/api/notifications/counts');
}

export function deleteNotification(id: string) {
  return request<{ ok: true }>(`/api/notifications/${id}`, { method: 'DELETE' });
}

export type ReportFilterKey =
  | 'period'
  | 'employee'
  | 'currency'
  | 'fund'
  | 'project'
  | 'borrower'
  | 'status'
  | 'exchangeType'
  | 'advanceType';

export type ReportDef = {
  id: string;
  group: 'ops' | 'treasury' | 'control' | string;
  title: string;
  description: string;
  filters: ReportFilterKey[];
};

export type ReportCatalog = {
  groups: { id: string; title: string }[];
  reports: ReportDef[];
};

export type ReportKpi = {
  id: string;
  label: string;
  value: number;
  format: 'int' | 'money';
  currency?: CurrencyCode;
  tone?: 'ok' | 'warn' | 'bad';
};

export type ReportChart = {
  id: string;
  title: string;
  type: 'bar' | 'groupedBar' | 'stackedBar' | 'horizontalBar' | 'line' | 'area' | 'pie' | 'doughnut';
  labels: string[];
  series: { name: string; values: number[] }[];
  unit?: string;
};

export type ReportSection = {
  id: string;
  title: string;
  columns: { key: string; label: string; format?: string }[];
  rows: Record<string, string | number>[];
};

export type ReportDoc = {
  reportId: string;
  title: string;
  description: string;
  periodLabel: string;
  from: string | null;
  to: string | null;
  generatedAt: string;
  note: string;
  kpis: ReportKpi[];
  charts: ReportChart[];
  sections: ReportSection[];
  notes: string[];
  truncated: boolean;
};

export function getReportCatalog() {
  return request<ReportCatalog>('/api/reports/catalog');
}

export function runReport(input: {
  reportId: string;
  period?: string;
  from?: string;
  to?: string;
  employeeId?: string;
  currency?: string;
  fund?: string;
  projectId?: string;
  borrowerId?: string;
  status?: string;
  exchangeType?: string;
  advanceType?: string;
}) {
  return request<ReportDoc>('/api/reports/run', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type ProductUnit = 'PIECE' | 'KG' | 'METER' | 'LITER' | 'BOX' | 'SET';
export type StockMoveType = 'IN' | 'OUT' | 'ADJUST';

export type WarehouseRow = {
  id: string;
  name: string;
  isDefault: boolean;
  status: RecordStatus;
};

export type ProductRow = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  unit: ProductUnit;
  costPrice: string | null;
  salePrice: string | null;
  minQuantity: string;
  notes: string;
  status: RecordStatus;
  hasImage: boolean;
  updatedAt: string;
  onHand: string;
  low: boolean;
  out: boolean;
};

export type StockMoveRow = {
  id: string;
  reference: string;
  productId: string;
  productName: string;
  sku: string;
  unit: ProductUnit | null;
  moveType: StockMoveType;
  quantity: string;
  signed: string;
  notes: string;
  employeeName: string;
  createdAt: string;
};

export type ProductInput = {
  name: string;
  sku?: string;
  barcode?: string;
  unit?: ProductUnit;
  costPrice?: number | null;
  salePrice?: number | null;
  minQuantity?: number;
  notes?: string;
  status?: RecordStatus;
};

export function listWarehouses() {
  return request<WarehouseRow[]>('/api/warehouses');
}

export function createWarehouse(name: string) {
  return request<WarehouseRow>('/api/warehouses', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function updateWarehouse(
  id: string,
  input: { name?: string; status?: RecordStatus; isDefault?: boolean },
) {
  return request<WarehouseRow>(`/api/warehouses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getProductCatalog(query: {
  warehouseId?: string;
  q?: string;
  filter?: 'all' | 'available' | 'low' | 'out' | 'inactive';
}) {
  const params = new URLSearchParams();
  if (query.warehouseId) params.set('warehouseId', query.warehouseId);
  if (query.q) params.set('q', query.q);
  if (query.filter) params.set('filter', query.filter);
  const qs = params.toString();
  return request<{
    warehouseId: string;
    kpis: { products: number; stockValue: string; low: number; movesToday: number };
    products: ProductRow[];
    canManage: boolean;
    canMove: boolean;
    canAdjust: boolean;
  }>(`/api/products${qs ? `?${qs}` : ''}`);
}

export type NrvPreviewRow = {
  id: string;
  name: string;
  sku: string;
  onHand: string;
  costPrice: string | null;
  salePrice: string | null;
  unitNrv: string | null;
  suggestedNrv: string | null;
  allowance: string;
  nrvCurrency: CurrencyCode | null;
  carrying: string;
};

export function previewInventoryNrv() {
  return request<NrvPreviewRow[]>('/api/inventory-nrv');
}

export function assessInventoryNrv(input: {
  transactionDate: string;
  currency: CurrencyCode;
  fxRate?: number;
  notes?: string;
  lines: { productId: string; unitNrv: number }[];
}) {
  return request<{
    id: string;
    reference: string;
    currency: CurrencyCode;
    fxRate: string | null;
    writeDown: string;
    reversal: string;
  }>('/api/inventory-nrv', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function scanProduct(code: string, warehouseId?: string) {
  const params = new URLSearchParams({ code });
  if (warehouseId) params.set('warehouseId', warehouseId);
  return request<ProductRow>(`/api/products/scan?${params.toString()}`);
}

export function getProduct(id: string, warehouseId?: string) {
  const qs = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : '';
  return request<{
    warehouseId: string;
    product: ProductRow;
    movements: StockMoveRow[];
    costCurrency: CurrencyCode;
    functionalCurrency: CurrencyCode;
  }>(`/api/products/${id}${qs}`);
}

export function createProduct(input: ProductInput) {
  return request<ProductRow>('/api/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProduct(id: string, input: ProductInput) {
  return request<ProductRow>(`/api/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteProduct(id: string) {
  return request<{ deactivated: boolean; id?: string }>(`/api/products/${id}`, { method: 'DELETE' });
}

export function uploadProductImage(id: string, file: File) {
  const form = new FormData();
  form.set('file', file);
  return requestForm<{ hasImage: boolean; updatedAt: string }>(`/api/products/${id}/image`, form);
}

export function deleteProductImage(id: string) {
  return request<{ hasImage: boolean; updatedAt: string }>(`/api/products/${id}/image`, { method: 'DELETE' });
}

export async function fetchProductImage(id: string) {
  const response = await fetch(`${API_URL}/api/products/${id}/image`, { credentials: 'include' });
  if (!response.ok) return null;
  return response.blob();
}

export function listStockMoves(query: { warehouseId?: string; productId?: string; moveType?: StockMoveType }) {
  const params = new URLSearchParams();
  if (query.warehouseId) params.set('warehouseId', query.warehouseId);
  if (query.productId) params.set('productId', query.productId);
  if (query.moveType) params.set('moveType', query.moveType);
  const qs = params.toString();
  return request<{ warehouseId: string; movements: StockMoveRow[] }>(
    `/api/stock-movements${qs ? `?${qs}` : ''}`,
  );
}

export function createStockMove(input: {
  productId: string;
  warehouseId: string;
  moveType: StockMoveType;
  quantity: number;
  notes?: string;
  fxRate?: number;
}) {
  return request<{ movement: StockMoveRow; onHand: string }>('/api/stock-movements', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  status: RecordStatus;
};

export type SalesInvoiceStatus = 'DRAFT' | 'POSTED' | 'VOID';
export type SalesPaymentState = 'UNPAID' | 'PARTIAL' | 'PAID';

export type SalesInvoiceSummary = {
  id: string;
  number: string;
  reference: string;
  transactionDate: string;
  customerName: string;
  warehouseName: string;
  currency: CurrencyCode;
  fxRate?: string | null;
  total: string;
  paid: string;
  balance: string;
  paymentState: SalesPaymentState;
  status: SalesInvoiceStatus;
  lineCount: number;
  employeeName: string;
  locationName: string;
};

export type SalesInvoiceDetail = SalesInvoiceSummary & {
  customerId: string;
  warehouseId: string;
  notes: string;
  discount: string;
  subtotal: string;
  locationId: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  voidReason: string;
  voidedByName: string;
  lines: {
    id: string;
    productId: string;
    productName: string;
    sku: string;
    unit: ProductUnit;
    quantity: string;
    unitPrice: string;
    discount: string;
    lineTotal: string;
  }[];
  payments: {
    id: string;
    amount: string;
    status: 'POSTED' | 'REVERSED';
    reason: string;
    employeeName: string;
    incomeId: string;
    incomeReference: string;
    fund: FundType;
    transactionDate: string;
    createdAt: string;
  }[];
};

export type SalesInvoiceInput = {
  transactionDate: string;
  customerId: string;
  warehouseId: string;
  currency: CurrencyCode;
  fxRate?: number;
  notes?: string;
  discount?: number;
  locationId?: string;
  lines: { productId: string; quantity: number; unitPrice: number; discount?: number }[];
};

export function listCustomers() {
  return request<CustomerRow[]>('/api/customers');
}

export function createCustomer(input: {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  status?: RecordStatus;
}) {
  return request<CustomerRow>('/api/customers', { method: 'POST', body: JSON.stringify(input) });
}

export function updateCustomer(
  id: string,
  input: { name: string; phone?: string; address?: string; notes?: string; status?: RecordStatus },
) {
  return request<CustomerRow>(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteCustomer(id: string) {
  return request<{ deactivated: boolean; id: string }>(`/api/customers/${id}`, { method: 'DELETE' });
}

export function listSalesInvoices(query?: { status?: SalesInvoiceStatus; q?: string }) {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.q) params.set('q', query.q);
  const qs = params.toString();
  return request<SalesInvoiceSummary[]>(`/api/sales-invoices${qs ? `?${qs}` : ''}`);
}

export function getSalesInvoice(id: string) {
  return request<SalesInvoiceDetail>(`/api/sales-invoices/${id}`);
}

export function createSalesInvoice(input: SalesInvoiceInput) {
  return request<SalesInvoiceDetail>('/api/sales-invoices', { method: 'POST', body: JSON.stringify(input) });
}

export function updateSalesInvoice(id: string, input: SalesInvoiceInput) {
  return request<SalesInvoiceDetail>(`/api/sales-invoices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteSalesInvoice(id: string) {
  return request<{ id: string }>(`/api/sales-invoices/${id}`, { method: 'DELETE' });
}

export function postSalesInvoice(id: string) {
  return request<SalesInvoiceDetail>(`/api/sales-invoices/${id}/post`, { method: 'POST', body: '{}' });
}

export function voidSalesInvoice(id: string, reason: string) {
  return request<SalesInvoiceDetail>(`/api/sales-invoices/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function paySalesInvoice(
  id: string,
  input: {
    transactionDate: string;
    amount: number;
    projectId: string;
    fund: OperationFund;
    bankId?: string;
    notes?: string;
  },
) {
  return request<SalesInvoiceDetail>(`/api/sales-invoices/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function reverseSalesPayment(invoiceId: string, paymentId: string, reason: string) {
  return request<SalesInvoiceDetail>(`/api/sales-invoices/${invoiceId}/payments/${paymentId}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export type SupplierRow = CustomerRow;
export type PurchaseInvoiceStatus = SalesInvoiceStatus;
export type PurchaseInvoiceSummary = Omit<SalesInvoiceSummary, 'customerName'> & { supplierName: string };
export type PurchaseInvoiceDetail = Omit<SalesInvoiceDetail, 'customerId' | 'customerName' | 'payments'> & {
  supplierId: string;
  supplierName: string;
  payments: {
    id: string;
    amount: string;
    status: 'POSTED' | 'REVERSED';
    reason: string;
    employeeName: string;
    outcomeId: string;
    outcomeReference: string;
    fund: FundType;
    transactionDate: string;
    createdAt: string;
  }[];
};
export type PurchaseInvoiceInput = Omit<SalesInvoiceInput, 'customerId'> & { supplierId: string };

export function listSuppliers() {
  return request<SupplierRow[]>('/api/suppliers');
}

export function createSupplier(input: {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  status?: RecordStatus;
}) {
  return request<SupplierRow>('/api/suppliers', { method: 'POST', body: JSON.stringify(input) });
}

export function updateSupplier(
  id: string,
  input: { name: string; phone?: string; address?: string; notes?: string; status?: RecordStatus },
) {
  return request<SupplierRow>(`/api/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteSupplier(id: string) {
  return request<{ deactivated: boolean; id: string }>(`/api/suppliers/${id}`, { method: 'DELETE' });
}

export function listPurchaseInvoices(query?: { status?: PurchaseInvoiceStatus; q?: string }) {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.q) params.set('q', query.q);
  const qs = params.toString();
  return request<PurchaseInvoiceSummary[]>(`/api/purchase-invoices${qs ? `?${qs}` : ''}`);
}

export function getPurchaseInvoice(id: string) {
  return request<PurchaseInvoiceDetail>(`/api/purchase-invoices/${id}`);
}

export function createPurchaseInvoice(input: PurchaseInvoiceInput) {
  return request<PurchaseInvoiceDetail>('/api/purchase-invoices', { method: 'POST', body: JSON.stringify(input) });
}

export function updatePurchaseInvoice(id: string, input: PurchaseInvoiceInput) {
  return request<PurchaseInvoiceDetail>(`/api/purchase-invoices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deletePurchaseInvoice(id: string) {
  return request<{ id: string }>(`/api/purchase-invoices/${id}`, { method: 'DELETE' });
}

export function postPurchaseInvoice(id: string) {
  return request<PurchaseInvoiceDetail>(`/api/purchase-invoices/${id}/post`, { method: 'POST', body: '{}' });
}

export function voidPurchaseInvoice(id: string, reason: string) {
  return request<PurchaseInvoiceDetail>(`/api/purchase-invoices/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function payPurchaseInvoice(
  id: string,
  input: {
    transactionDate: string;
    amount: number;
    projectId: string;
    fund: OperationFund;
    bankId?: string;
    notes?: string;
  },
) {
  return request<PurchaseInvoiceDetail>(`/api/purchase-invoices/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function reversePurchasePayment(invoiceId: string, paymentId: string, reason: string) {
  return request<PurchaseInvoiceDetail>(`/api/purchase-invoices/${invoiceId}/payments/${paymentId}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
