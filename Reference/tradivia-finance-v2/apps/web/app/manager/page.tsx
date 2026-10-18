'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmployeesCard } from '../../components/employees-card';
import { ExchangePanel } from '../../components/exchange-panel';
import { IncomePanel } from '../../components/income-panel';
import { NamedRecordsCard } from '../../components/named-records-card';
import { OutcomePanel } from '../../components/outcome-panel';
import { ProjectsCard } from '../../components/projects-card';
import { AdvancePanel } from '../../components/advance-panel';
import { OpeningPanel } from '../../components/opening-panel';
import { MonitorPanel } from '../../components/monitor-panel';
import { AuditLogPanel } from '../../components/audit-log-panel';
import { NotificationsPanel } from '../../components/notifications-panel';
import { ReportsPanel } from '../../components/reports-panel';
import { TransferPanel } from '../../components/transfer-panel';
import { PurchasePanel } from '../../components/purchases-panel';
import { SalesPanel } from '../../components/sales-panel';
import { LedgerPanel } from '../../components/ledger-panel';
import { StatementsPanel } from '../../components/statements-panel';
import { WarehousePanel } from '../../components/warehouse-panel';
import { InventoryNrvPanel } from '../../components/inventory-nrv-panel';
import { ModuleHome } from '../../components/module-home';
import { useModuleNav } from '../../components/use-module-nav';
import { WorkspaceShell } from '../../components/workspace-shell';
import { defaultSection, groupsForModule, modulesForRole } from '../../lib/modules';
import {
  AdvanceRow,
  AuthUser,
  EmployeeRow,
  ExchangeRow,
  FundsSnapshot,
  IncomeRow,
  LocationRow,
  NamedRecord,
  OpeningRow,
  OutcomeRow,
  ProjectRow,
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
  listOpenings,
  listOutcomes,
  listProjects,
  listTransfers,
  locationsApi,
} from '../../lib/api';

export default function ManagerPage() {
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
  const [openings, setOpenings] = useState<OpeningRow[]>([]);
  const [funds, setFunds] = useState<FundsSnapshot | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sessionLocked, setSessionLocked] = useState(false);

  async function refresh() {
    const [
      people,
      offices,
      borrowerRows,
      projectRows,
      bankRows,
      incomeRows,
      outcomeRows,
      exchangeRows,
      transferRows,
      advanceRows,
      openingRows,
      fundRows,
      notifCounts,
    ] = await Promise.all([
      listEmployees(),
      locationsApi.list(),
      borrowersApi.list(),
      listProjects(),
      banksApi.list(),
      listIncomes(),
      listOutcomes(),
      listExchanges(),
      listTransfers(),
      listAdvances(),
      listOpenings(),
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
    setOpenings(openingRows);
    setFunds(fundRows);
    setUnreadCount(notifCounts.pending);
  }

  useEffect(() => {
    getMe()
      .then(async (result) => {
        if (result.user.role !== 'GENERAL_MANAGER' && result.user.role !== 'MONITOR') {
          router.replace(homePath(result.user.role));
          return;
        }
        setUser(result.user);
        setSessionLocked(Boolean(result.locked));
        if (!result.locked) await refresh();
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!user || !nav.ready) {
    return (
      <main className="shell">
        <section className="card">جاري التحقق من الجلسة...</section>
      </main>
    );
  }

  const notifications = <NotificationsPanel actor={user} onChanged={refresh} />;

  if (!nav.moduleId) {
    return (
      <ModuleHome
        actor={user}
        modules={modulesForRole(user.role)}
        unreadCount={unreadCount}
        notifications={notifications}
        onOpen={nav.openModule}
        onLogout={async () => router.replace('/login')}
      />
    );
  }

  return (
    <WorkspaceShell
      actor={user}
      subtitle={user.role === 'MONITOR' ? 'مراقبة' : 'كل المكاتب'}
      groups={groupsForModule(nav.moduleId, user.role)}
      defaultSection={defaultSection(nav.moduleId, user.role)}
      moduleId={nav.moduleId}
      onHome={nav.goHome}
      funds={funds}
      unreadCount={unreadCount}
      initiallyLocked={sessionLocked}
      onUnlocked={async () => {
        setSessionLocked(false);
        await refresh();
      }}
      onRefresh={refresh}
      onLogout={async () => router.replace('/login')}
      sections={{
        monitor: <MonitorPanel actor={user} employees={employees} />,
        'audit-log': <AuditLogPanel />,
        notifications,
        reports: (
          <ReportsPanel actor={user} employees={employees} projects={projects} borrowers={borrowers} />
        ),
        income: (
          <IncomePanel
            actor={user}
            locations={locations}
            projects={projects}
            banks={banks}
            incomes={incomes}
            funds={funds}
            onChanged={refresh}
          />
        ),
        outcome: (
          <OutcomePanel
            actor={user}
            locations={locations}
            projects={projects}
            banks={banks}
            outcomes={outcomes}
            funds={funds}
            onChanged={refresh}
          />
        ),
        exchange: (
          <ExchangePanel
            actor={user}
            locations={locations}
            banks={banks}
            exchanges={exchanges}
            funds={funds}
            onChanged={refresh}
          />
        ),
        transfer: (
          <TransferPanel
            actor={user}
            locations={locations}
            banks={banks}
            borrowers={borrowers}
            transfers={transfers}
            funds={funds}
            onChanged={refresh}
          />
        ),
        advances: (
          <AdvancePanel
            actor={user}
            locations={locations}
            projects={projects}
            borrowers={borrowers}
            advances={advances}
            funds={funds}
            onChanged={refresh}
          />
        ),
        opening: (
          <OpeningPanel actor={user} employees={employees} openings={openings} funds={funds} onChanged={refresh} />
        ),
        'log-opening': (
          <OpeningPanel part="log" actor={user} employees={employees} openings={openings} funds={funds} onChanged={refresh} />
        ),
        'log-income': (
          <IncomePanel
            part="log"
            actor={user}
            locations={locations}
            projects={projects}
            banks={banks}
            incomes={incomes}
            funds={funds}
            onChanged={refresh}
          />
        ),
        'log-outcome': (
          <OutcomePanel
            part="log"
            actor={user}
            locations={locations}
            projects={projects}
            banks={banks}
            outcomes={outcomes}
            onChanged={refresh}
          />
        ),
        'log-exchange': (
          <ExchangePanel part="log" actor={user} locations={locations} banks={banks} exchanges={exchanges} onChanged={refresh} />
        ),
        'log-transfer': (
          <TransferPanel
            part="log"
            actor={user}
            locations={locations}
            banks={banks}
            borrowers={borrowers}
            transfers={transfers}
            onChanged={refresh}
          />
        ),
        'log-advances': (
          <AdvancePanel
            part="log"
            actor={user}
            locations={locations}
            projects={projects}
            borrowers={borrowers}
            advances={advances}
            onChanged={refresh}
          />
        ),
        locations: (
          <NamedRecordsCard
            title="المكاتب"
            namePlaceholder="اسم المكتب أو المحل"
            emptyText="لا مكاتب بعد. أضف مكتباً من النموذج أعلاه."
            rows={locations}
            api={locationsApi}
            onChanged={refresh}
          />
        ),
        people: (
          <EmployeesCard actor={user} employees={employees} locations={locations} onChanged={refresh} />
        ),
        borrowers: (
          <NamedRecordsCard
            title="المستلفون"
            namePlaceholder="اسم المستلف"
            emptyText="لا مستلفين بعد. أضفهم من النموذج أعلاه فيظهرون في عمليات السلف."
            rows={borrowers}
            api={borrowersApi}
            onChanged={refresh}
          />
        ),
        projects: <ProjectsCard rows={projects} onChanged={refresh} />,
        warehouse: <WarehousePanel actor={user} />,
        nrv: <InventoryNrvPanel />,
        sales: (
          <SalesPanel
            actor={user}
            locations={locations}
            projects={projects}
            banks={banks}
            onChanged={refresh}
          />
        ),
        purchases: (
          <PurchasePanel
            actor={user}
            locations={locations}
            projects={projects}
            banks={banks}
            onChanged={refresh}
          />
        ),
        ledger: <LedgerPanel actor={user} />,
        statements: <StatementsPanel actor={user} />,
        banks: (
          <NamedRecordsCard
            title="البنوك"
            namePlaceholder="اسم البنك"
            emptyText="لا بنوك بعد. أضف حساباً بنكياً من النموذج أعلاه."
            rows={banks}
            api={banksApi}
            onChanged={refresh}
          />
        ),
      }}
    />
  );
}
