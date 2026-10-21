import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecordStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthUser } from '../../../auth/current-user.decorator';
import { isGeneralManager, locationWhere } from '../../../auth/access';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

const employeeSelect = {
  id: true,
  name: true,
  role: true,
  accountStatus: true,
  locationId: true,
  location: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.employee.findMany({
      where: { companyId: this.companyId, ...locationWhere(actor) },
      select: employeeSelect,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async create(actor: AuthUser, dto: CreateEmployeeDto) {
    const name = dto.name.trim();
    const role = dto.role as Role;
    const locationId = this.resolveLocationId(actor, role, dto.locationId);

    const existing = await this.prisma.employee.findUnique({
      where: { companyId_name: { companyId: this.companyId, name } },
    });
    if (existing) {
      throw new ConflictException('EMPLOYEE_EXISTS');
    }

    if (role === Role.GENERAL_MANAGER) {
      await this.assertSingleGeneralManager();
    }

    return this.prisma.employee.create({
      data: {
        companyId: this.companyId,
        name,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role,
        locationId,
      },
      select: employeeSelect,
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId: this.companyId, ...locationWhere(actor) },
    });
    if (!employee) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }

    if (!isGeneralManager(actor) && employee.role !== Role.EMPLOYEE && employee.id !== actor.id) {
      throw new ForbiddenException('SUPERVISOR_CAN_ONLY_MANAGE_EMPLOYEES');
    }

    if (!isGeneralManager(actor) && dto.role && dto.role !== employee.role) {
      throw new ForbiddenException('SUPERVISOR_CAN_ONLY_MANAGE_EMPLOYEES');
    }

    const name = dto.name !== undefined ? dto.name.trim().replace(/\s+/g, ' ') : employee.name;
    if (name !== employee.name) {
      const clash = await this.prisma.employee.findUnique({
        where: { companyId_name: { companyId: this.companyId, name } },
      });
      if (clash) {
        throw new ConflictException('EMPLOYEE_EXISTS');
      }
    }

    const role = (dto.role as Role | undefined) ?? employee.role;
    if (role === Role.GENERAL_MANAGER && employee.role !== Role.GENERAL_MANAGER) {
      await this.assertSingleGeneralManager(employee.id);
    }
    if (employee.role === Role.GENERAL_MANAGER && role !== Role.GENERAL_MANAGER) {
      throw new BadRequestException('GENERAL_MANAGER_REQUIRED');
    }

    let locationId = employee.locationId;
    if (role === Role.GENERAL_MANAGER || role === Role.MONITOR) {
      if (!isGeneralManager(actor)) {
        throw new ForbiddenException('ONLY_GENERAL_MANAGER');
      }
      locationId = null;
    } else if (dto.locationId !== undefined || dto.role) {
      locationId = this.resolveLocationId(actor, role, dto.locationId ?? employee.locationId ?? undefined);
    }

    return this.prisma.employee.update({
      where: { id },
      data: {
        name,
        ...(dto.role ? { role } : {}),
        ...(dto.accountStatus ? { accountStatus: dto.accountStatus as RecordStatus } : {}),
        ...(dto.password ? { passwordHash: await bcrypt.hash(dto.password, 10) } : {}),
        locationId,
      },
      select: employeeSelect,
    });
  }

  private resolveLocationId(actor: AuthUser, role: Role, requested?: string) {
    if (role === Role.GENERAL_MANAGER || role === Role.MONITOR) {
      if (!isGeneralManager(actor)) {
        throw new ForbiddenException('ONLY_GENERAL_MANAGER');
      }
      return null;
    }

    if (isGeneralManager(actor)) {
      if (!requested) {
        throw new BadRequestException('LOCATION_REQUIRED');
      }
      return requested;
    }

    if (role !== Role.EMPLOYEE) {
      throw new ForbiddenException('SUPERVISOR_CAN_ONLY_CREATE_EMPLOYEES');
    }

    if (!actor.locationId) {
      throw new ForbiddenException('LOCATION_REQUIRED');
    }
    return actor.locationId;
  }

  private async assertSingleGeneralManager(exceptId?: string) {
    const existing = await this.prisma.employee.findFirst({
      where: {
        companyId: this.companyId,
        role: Role.GENERAL_MANAGER,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('ONE_GENERAL_MANAGER');
    }
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}
