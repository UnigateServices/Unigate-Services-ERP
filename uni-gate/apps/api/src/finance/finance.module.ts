import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModulesModule } from '../modules/modules.module';
import { AttachmentsController } from './attachments/attachments.controller';
import { AttachmentsService } from './attachments/attachments.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { BalancesController } from './balances/balances.controller';
import { BalancesService } from './balances/balances.service';
import { LedgerController } from './ledger/ledger.controller';
import { LedgerService } from './ledger/ledger.service';
import { BanksController } from './master-data/banks/banks.controller';
import { BanksService } from './master-data/banks/banks.service';
import { BorrowersController } from './master-data/borrowers/borrowers.controller';
import { BorrowersService } from './master-data/borrowers/borrowers.service';
import { MembersController } from './master-data/members/members.controller';
import { MembersService } from './master-data/members/members.service';
import { ProjectsController } from './master-data/projects/projects.controller';
import { ProjectsService } from './master-data/projects/projects.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { OpeningBalancesController } from './opening-balances/opening-balances.controller';
import { OpeningBalancesService } from './opening-balances/opening-balances.service';
import { OpeningEntryController } from './opening-entry/opening-entry.controller';
import { OpeningEntryService } from './opening-entry/opening-entry.service';
import { PolicyController } from './policy/policy.controller';
import { PolicyService } from './policy/policy.service';
import { RateService } from './policy/rate.service';

/**
 * Finance (phase F3a: the finance foundation). Every route is `/api/finance/...`, signed in, and
 * behind the finance module flag. Later batches (F3b to F3d) add their controllers here.
 */
@Module({
  imports: [AuthModule, ModulesModule],
  controllers: [
    PolicyController,
    ProjectsController,
    BanksController,
    BorrowersController,
    MembersController,
    LedgerController,
    OpeningBalancesController,
    OpeningEntryController,
    BalancesController,
    AuditController,
    NotificationsController,
    AttachmentsController,
  ],
  providers: [
    PolicyService,
    RateService,
    ProjectsService,
    BanksService,
    BorrowersService,
    MembersService,
    LedgerService,
    OpeningBalancesService,
    OpeningEntryService,
    BalancesService,
    AuditService,
    NotificationsService,
    AttachmentsService,
  ],
})
export class FinanceModule {}
