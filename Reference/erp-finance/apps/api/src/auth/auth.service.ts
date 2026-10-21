import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RecordStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './current-user.decorator';

export type LoginFailureCode = 'WRONG_CREDENTIALS' | 'INACTIVE';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async listLoginNames(audience: 'all' | 'employee' | 'supervisor' = 'all') {
    const roleFilter =
      audience === 'supervisor'
        ? { in: [Role.SUPERVISOR, Role.GENERAL_MANAGER] }
        : audience === 'employee'
          ? Role.EMPLOYEE
          : undefined;

    const employees = await this.prisma.employee.findMany({
      where: {
        companyId: this.companyId,
        accountStatus: RecordStatus.ACTIVE,
        ...(roleFilter ? { role: roleFilter } : {}),
      },
      select: { name: true, role: true, location: { select: { name: true } } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    return employees.map((row) => ({
      name: row.name,
      role: row.role,
      locationName: row.location?.name ?? null,
    }));
  }

  async login(username: string, password: string) {
    const name = username.trim();
    const employee = await this.prisma.employee.findUnique({
      where: {
        companyId_name: {
          companyId: this.companyId,
          name,
        },
      },
      include: { location: true },
    });

    if (!employee) {
      throw new UnauthorizedException({ success: false, code: 'WRONG_CREDENTIALS' satisfies LoginFailureCode });
    }

    const ok = await bcrypt.compare(password, employee.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ success: false, code: 'WRONG_CREDENTIALS' satisfies LoginFailureCode });
    }

    if (employee.accountStatus !== RecordStatus.ACTIVE) {
      throw new UnauthorizedException({ success: false, code: 'INACTIVE' satisfies LoginFailureCode });
    }

    await setSessionLocked(this.prisma, employee.id, false);

    const token = await this.jwt.signAsync({
      sub: employee.id,
      name: employee.name,
      role: employee.role,
      companyId: employee.companyId,
      locationId: employee.locationId,
    });

    return {
      success: true as const,
      code: 'OK' as const,
      token,
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '8h'),
      user: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        companyId: employee.companyId,
        locationId: employee.locationId,
        locationName: employee.location?.name ?? null,
      },
    };
  }

  async lockSession(actor: AuthUser) {
    await setSessionLocked(this.prisma, actor.id, true);
    return { success: true as const, locked: true as const };
  }

  async unlockSession(actor: AuthUser, password: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: actor.id },
    });
    if (!employee) {
      throw new UnauthorizedException({ success: false, code: 'WRONG_CREDENTIALS' satisfies LoginFailureCode });
    }
    const ok = await bcrypt.compare(String(password || ''), employee.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ success: false, code: 'WRONG_CREDENTIALS' satisfies LoginFailureCode });
    }
    if (employee.accountStatus !== RecordStatus.ACTIVE) {
      throw new UnauthorizedException({ success: false, code: 'INACTIVE' satisfies LoginFailureCode });
    }
    await setSessionLocked(this.prisma, employee.id, false);
    return { success: true as const, code: 'OK' as const };
  }

  async changePassword(actor: AuthUser, currentPassword: string, newPassword: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: actor.id },
    });
    if (!employee || employee.accountStatus !== RecordStatus.ACTIVE) {
      throw new UnauthorizedException({ success: false, code: 'WRONG_CREDENTIALS' satisfies LoginFailureCode });
    }
    const current = String(currentPassword || '');
    const next = String(newPassword || '');
    const ok = await bcrypt.compare(current, employee.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ success: false, code: 'WRONG_CREDENTIALS' satisfies LoginFailureCode });
    }
    if (current === next) {
      throw new BadRequestException('PASSWORD_SAME');
    }
    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { passwordHash: await bcrypt.hash(next, 10) },
    });
    return { success: true as const };
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

async function setSessionLocked(prisma: PrismaService, id: string, locked: boolean) {
  await prisma.$executeRaw`UPDATE "employees" SET "session_locked" = ${locked} WHERE "id" = ${id}`;
}
