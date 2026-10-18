'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdvancePanel } from '../../components/advance-panel';
import { ExchangePanel } from '../../components/exchange-panel';
import { IncomePanel } from '../../components/income-panel';
import { OutcomePanel } from '../../components/outcome-panel';
import { NotificationsPanel } from '../../components/notifications-panel';
import { ReportsPanel } from '../../components/reports-panel';
import { TransferPanel } from '../../components/transfer-panel';
import { PurchasePanel } from '../../components/purchases-panel';
import { SalesPanel } from '../../components/sales-panel';
import { WarehousePanel } from '../../components/warehouse-panel';
import { ModuleHome } from '../../components/module-home';
import { useModuleNav } from '../../components/use-module-nav';
import { WorkspaceShell } from '../../components/workspace-shell';
import { defaultSection, groupsForModule, modulesForRole } from '../../lib/modules';
import {
  AdvanceRow,
  AuthUser,
  ExchangeRow,
  FundsSnapshot,
  IncomeRow,
  NamedRecord,
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
  listExchanges,
  listIncomes,
  listOutcomes,
  listProjects,
  listTransfers,
} from '../../lib/api';

export default function EmployeePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const nav = useModuleNav(user?.role);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [banks, setBanks] = useState<NamedRecord[]>([]);
  const [borrowers, setBorrowers] = useState<NamedRecord[]>([]);
  const [incomes, setIncomes] = useState<IncomeRow[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [funds, setFunds] = useState<FundsSnapshot | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sessionLocked, setSessionLocked] = useState(false);

  async function refresh() {
    const [
      projectRows,
      bankRows,
      borrowerRows,
      incomeRows,
      outcomeRows,
      exchangeRows,
      transferRows,
      advanceRows,
      fundRows,
      notifCounts,
    ] = await Promise.all([
      listProjects(),
      banksApi.list(),
      borrowersApi.list(),
      listIncomes(),
      listOutcomes(),
      listExchanges(),
      listTransfers(),
      listAdvances(),
      getFunds(),
      getNotificationCounts(),
    ]);
    setProjects(projectRows);
    setBanks(bankRows);
    setBorrowers(borrowerRows);
    setIncomes(incomeRows);
    setOutcomes(outcomeRows);
    setExchanges(exchangeRows);
    setTransfers(transferRows);
    setAdvances(advanceRows);
    setFunds(fundRows);
    setUnreadCount(notifCounts.pending);
  }

  useEffect(() => {
    getMe()
      .then(async (result) => {
        if (result.user.role !== 'EMPLOYEE') {
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
      subtitle={user.locationName || ''}
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
        warehouse: <WarehousePanel actor={user} />,
        sales: (
          <SalesPanel actor={user} locations={[]} projects={projects} banks={banks} onChanged={refresh} />
        ),
        purchases: (
          <PurchasePanel actor={user} locations={[]} projects={projects} banks={banks} onChanged={refresh} />
        ),
        notifications: <NotificationsPanel actor={user} onChanged={refresh} />,
        reports: <ReportsPanel actor={user} projects={projects} borrowers={borrowers} />,
        income: (
          <IncomePanel
            actor={user}
            locations={[]}
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
            locations={[]}
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
            locations={[]}
            banks={banks}
            exchanges={exchanges}
            funds={funds}
            onChanged={refresh}
          />
        ),
        transfer: (
          <TransferPanel
            actor={user}
            locations={[]}
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
            locations={[]}
            projects={projects}
            borrowers={borrowers}
            advances={advances}
            funds={funds}
            onChanged={refresh}
          />
        ),
        'log-income': (
          <IncomePanel
            part="log"
            actor={user}
            locations={[]}
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
            locations={[]}
            projects={projects}
            banks={banks}
            outcomes={outcomes}
            onChanged={refresh}
          />
        ),
        'log-exchange': (
          <ExchangePanel part="log" actor={user} locations={[]} banks={banks} exchanges={exchanges} onChanged={refresh} />
        ),
        'log-transfer': (
          <TransferPanel
            part="log"
            actor={user}
            locations={[]}
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
            locations={[]}
            projects={projects}
            borrowers={borrowers}
            advances={advances}
            onChanged={refresh}
          />
        ),
      }}
    />
  );
}
