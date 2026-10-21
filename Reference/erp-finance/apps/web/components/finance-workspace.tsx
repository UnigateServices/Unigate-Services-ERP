'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmployeesCard } from './employees-card';
import { ExchangePanel } from './exchange-panel';
import { IncomePanel } from './income-panel';
import { NamedRecordsCard } from './named-records-card';
import { OutcomePanel } from './outcome-panel';
import { ProjectsCard } from './projects-card';
import { AdvancePanel } from './advance-panel';
import { MonitorPanel } from './monitor-panel';
import { AuditLogPanel } from './audit-log-panel';
import { NotificationsPanel } from './notifications-panel';
import { CashReportPanel } from './cash-report-panel';
import { TreasuryHome } from './treasury-home';
import { DashboardHome } from './dashboard-home';
import { CustodyHome } from './custody-home';
import { TransferPanel } from './transfer-panel';
import { PurchasePanel } from './purchases-panel';
import { SalesPanel } from './sales-panel';
import { LedgerPanel } from './ledger-panel';
import { StatementsPanel } from './statements-panel';
import { ReportsHub } from './reports-hub';
import { PolicyPanel } from './policy-panel';
import { OpenItemsPanel } from './open-items-panel';
import { OpeningEntryPanel } from './opening-entry-panel';
import { QuotesPanel } from './quotes-panel';
import { RelationsPanel } from './relations-panel';
import { WarehousePanel } from './warehouse-panel';
import { InventoryNrvPanel } from './inventory-nrv-panel';
import { CommandPalette } from './command-palette';
import { ModuleHome } from './module-home';
import { useModuleNav } from './use-module-nav';
import { WorkspaceShell } from './workspace-shell';
import { defaultSection, groupsForModule, modulesForRole, type ModuleId } from '../lib/modules';
import {
  AdvanceRow,
  AuthUser,
  EmployeeRow,
  ExchangeRow,
  FundsSnapshot,
  IncomeRow,
  LocationRow,
  NamedRecord,
  OutcomeRow,
  ProjectRow,
  Role,
  TransferRow,
  banksApi,
  borrowersApi,
  getFunds,
  getMe,
  getNotificationCounts,
  homePath,
  listAdvances,
  listEmployees,
  listExchanges,
  listIncomes,
  listOutcomes,
  listProjects,
  listTransfers,
  locationsApi,
} from '../lib/api';

type Props = {
  allow: Role[];
  subtitle: (user: AuthUser) => string;
};

export function FinanceWorkspace({ allow, subtitle }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const nav = useModuleNav(user?.role);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [borrowers, setBorrowers] = useState<NamedRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [banks, setBanks] = useState<NamedRecord[]>([]);
  const [incomes, setIncomes] = useState<IncomeRow[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [funds, setFunds] = useState<FundsSnapshot | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sessionLocked, setSessionLocked] = useState(false);

  async function refresh(role: Role) {
    const seesOffices = role === 'GENERAL_MANAGER' || role === 'MONITOR';
    const seesPeople = role !== 'EMPLOYEE';
    const [people, offices, borrowerRows, projectRows, bankRows, incomeRows, outcomeRows, exchangeRows, transferRows, advanceRows, fundRows, notifCounts] =
      await Promise.all([
        seesPeople ? listEmployees() : Promise.resolve([] as EmployeeRow[]),
        seesOffices ? locationsApi.list() : Promise.resolve([] as LocationRow[]),
        borrowersApi.list(),
        listProjects(),
        banksApi.list(),
        listIncomes(),
        listOutcomes(),
        listExchanges(),
        listTransfers(),
        listAdvances(),
        getFunds(),
        getNotificationCounts(),
      ]);
    setEmployees(people);
    setLocations(offices);
    setBorrowers(borrowerRows);
    setProjects(projectRows);
    setBanks(bankRows);
    setIncomes(incomeRows);
    setOutcomes(outcomeRows);
    setExchanges(exchangeRows);
    setTransfers(transferRows);
    setAdvances(advanceRows);
    setFunds(fundRows);
    setUnreadCount(notifCounts.pending);
  }

  const allowKey = allow.join('|');

  useEffect(() => {
    const allowed = allowKey.split('|');
    getMe()
      .then(async (result) => {
        if (!allowed.includes(result.user.role)) {
          router.replace(homePath(result.user.role));
          return;
        }
        setUser(result.user);
        setSessionLocked(Boolean(result.locked));
        if (!result.locked) await refresh(result.user.role);
      })
      .catch(() => router.replace('/login'));
  }, [router, allowKey]);

  if (!user || !nav.ready) {
    return (
      <main className="shell">
        <section className="card">جاري التحقق من الجلسة...</section>
      </main>
    );
  }

  const reload = () => refresh(user.role);
  const offices = user.role === 'GENERAL_MANAGER' || user.role === 'MONITOR' ? locations : [];
  const canWrite = user.role !== 'MONITOR';
  const notifications = <NotificationsPanel actor={user} onChanged={reload} />;
  const modules = modulesForRole(user.role);

  const home = (
    <ModuleHome
      actor={user}
      modules={modules}
      unreadCount={unreadCount}
      notifications={notifications}
      onOpen={nav.openModule}
      onLogout={async () => router.replace('/login')}
    />
  );

  const activeModule = nav.moduleId;
  const workspace = activeModule && (
    <WorkspaceShell
      actor={user}
      subtitle={subtitle(user)}
      moduleTitle={modules.find((item) => item.id === nav.moduleId)?.title}
      groups={groupsForModule(activeModule, user.role)}
      defaultSection={defaultSection(activeModule, user.role)}
      moduleId={activeModule}
      onHome={nav.goHome}
      apps={modules.map(({ id, title, icon }) => ({ id, title, icon }))}
      onOpenApp={(id) => nav.openModule(id as ModuleId)}
      funds={funds}
      unreadCount={unreadCount}
      initiallyLocked={sessionLocked}
      onUnlocked={async () => {
        setSessionLocked(false);
        await reload();
      }}
      onRefresh={reload}
      onLogout={async () => router.replace('/login')}
      sections={{
        notifications,
        dashboard: <DashboardHome pending={unreadCount} funds={funds} incomes={incomes} outcomes={outcomes} />,
        leads: <RelationsPanel canWrite={canWrite} screen="leads" />,
        pipeline: <RelationsPanel canWrite={canWrite} screen="pipeline" />,
        quotes: <QuotesPanel canWrite={canWrite} />,
        warehouse: <WarehousePanel actor={user} />,
        nrv: <InventoryNrvPanel />,
        sales: <SalesPanel actor={user} locations={offices} projects={projects} banks={banks} screen="invoices" onChanged={reload} />,
        customers: <SalesPanel actor={user} locations={offices} projects={projects} banks={banks} screen="customers" onChanged={reload} />,
        purchases: <PurchasePanel actor={user} locations={offices} projects={projects} banks={banks} screen="invoices" onChanged={reload} />,
        suppliers: <PurchasePanel actor={user} locations={offices} projects={projects} banks={banks} screen="suppliers" onChanged={reload} />,
        'supplier-new': <PurchasePanel actor={user} locations={offices} projects={projects} banks={banks} screen="supplier" onChanged={reload} />,
        monitor: <MonitorPanel actor={user} employees={employees} />,
        'audit-log': <AuditLogPanel />,
        cash: (
          <TreasuryHome
            actor={user}
            locations={offices}
            projects={projects}
            banks={banks}
            onChanged={reload}
            funds={funds}
            incomes={incomes}
            outcomes={outcomes}
            exchanges={exchanges}
            transfers={transfers}
            advances={advances}
          />
        ),
        custody: (
          <CustodyHome actor={user} locations={offices} projects={projects} borrowers={borrowers} banks={banks} funds={funds} advances={advances} onChanged={reload} />
        ),
        'cash-report': <CashReportPanel actor={user} employees={user.role === 'EMPLOYEE' ? undefined : employees} />,
        income: (
          <IncomePanel actor={user} locations={offices} projects={projects} banks={banks} incomes={incomes} funds={funds} onChanged={reload} />
        ),
        outcome: (
          <OutcomePanel actor={user} locations={offices} projects={projects} banks={banks} outcomes={outcomes} funds={funds} onChanged={reload} />
        ),
        exchange: (
          <ExchangePanel actor={user} locations={offices} banks={banks} exchanges={exchanges} funds={funds} onChanged={reload} />
        ),
        transfer: (
          <TransferPanel
            actor={user}
            locations={offices}
            banks={banks}
            transfers={transfers}
            funds={funds}
            onChanged={reload}
          />
        ),
        advances: (
          <AdvancePanel
            actor={user}
            locations={offices}
            projects={projects}
            borrowers={borrowers}
            banks={banks}
            advances={advances}
            funds={funds}
            onChanged={reload}
          />
        ),
        locations: (
          <NamedRecordsCard
            title="المكاتب"
            namePlaceholder="اسم المكتب أو المحل"
            emptyText="لا مكاتب بعد. أضف مكتباً من النموذج أعلاه."
            rows={locations}
            api={locationsApi}
            onChanged={reload}
          />
        ),
        people: <EmployeesCard actor={user} employees={employees} locations={offices} onChanged={reload} />,
        borrowers: (
          <NamedRecordsCard
            title="المستلفون"
            namePlaceholder="اسم المستلف"
            emptyText="لا مستلفين بعد. أضفهم من النموذج أعلاه فيظهرون في عمليات السلف."
            rows={borrowers}
            api={borrowersApi}
            onChanged={reload}
          />
        ),
        projects: <ProjectsCard rows={projects} onChanged={reload} />,
        banks: (
          <NamedRecordsCard
            title="البنوك"
            namePlaceholder="اسم البنك"
            emptyText="لا بنوك بعد. أضف حساباً بنكياً من النموذج أعلاه."
            rows={banks}
            api={banksApi}
            onChanged={reload}
          />
        ),
        policy: <PolicyPanel canEdit={user.role === 'GENERAL_MANAGER'} canRates={user.role === 'GENERAL_MANAGER' || user.role === 'SUPERVISOR'} />,
        ledger: <LedgerPanel actor={user} screen="journal" />,
        'journal-new': <LedgerPanel actor={user} screen="entry" />,
        chart: <LedgerPanel actor={user} screen="chart" />,
        'open-items': <OpenItemsPanel projects={projects} screen="list" canWrite={canWrite} />,
        'opening-entry': <OpeningEntryPanel actor={user} />,
        statements: <ReportsHub actor={user} />,
        'statement-balance': <ReportsHub actor={user} initial="balance" />,
        'statement-trial': <ReportsHub actor={user} initial="trial" />,
        'statement-cash': <StatementsPanel actor={user} screen="cash" />,
        'statement-equity': <StatementsPanel actor={user} screen="equity" />,
        'statement-budget': <StatementsPanel actor={user} screen="budget" />,
        'statement-periods': <StatementsPanel actor={user} screen="periods" />,
        'statement-policy': <StatementsPanel actor={user} screen="policy" />,
      }}
    />
  );

  return (
    <>
      {workspace || home}
      <CommandPalette actor={user} />
    </>
  );
}
