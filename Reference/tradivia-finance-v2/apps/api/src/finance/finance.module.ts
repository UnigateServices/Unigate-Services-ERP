import { Module } from '@nestjs/common';
import { IncomesModule } from './incomes/incomes.module';
import { OutcomesModule } from './outcomes/outcomes.module';
import { ExchangesModule } from './exchanges/exchanges.module';
import { TransfersModule } from './transfers/transfers.module';
import { AdvancesModule } from './advances/advances.module';
import { OpeningBalancesModule } from './opening-balances/opening-balances.module';
import { MonitorModule } from './monitor/monitor.module';
import { BalancesModule } from './balances/balances.module';
import { MasterDataModule } from './master-data/master-data.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { SalesModule } from './sales/sales.module';
import { PurchasesModule } from './purchases/purchases.module';
import { LedgerModule } from './ledger/ledger.module';
import { StatementsModule } from './statements/statements.module';
import { InventoryNrvModule } from './inventory/inventory-nrv.module';

@Module({
  imports: [
    IncomesModule,
    OutcomesModule,
    ExchangesModule,
    TransfersModule,
    AdvancesModule,
    OpeningBalancesModule,
    MonitorModule,
    BalancesModule,
    MasterDataModule,
    AuditModule,
    NotificationsModule,
    ReportsModule,
    WarehouseModule,
    SalesModule,
    PurchasesModule,
    LedgerModule,
    StatementsModule,
    InventoryNrvModule,
  ],
})
export class FinanceModule {}
