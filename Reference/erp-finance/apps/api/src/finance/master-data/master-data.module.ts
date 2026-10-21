import { Module } from '@nestjs/common';
import { BanksController } from './banks/banks.controller';
import { BanksService } from './banks/banks.service';
import { BorrowersController } from './borrowers/borrowers.controller';
import { BorrowersService } from './borrowers/borrowers.service';
import { EmployeesController } from './employees/employees.controller';
import { EmployeesService } from './employees/employees.service';
import { LocationsController } from './locations/locations.controller';
import { LocationsService } from './locations/locations.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';

@Module({
  controllers: [
    EmployeesController,
    LocationsController,
    BorrowersController,
    ProjectsController,
    BanksController,
  ],
  providers: [EmployeesService, LocationsService, BorrowersService, ProjectsService, BanksService],
})
export class MasterDataModule {}
