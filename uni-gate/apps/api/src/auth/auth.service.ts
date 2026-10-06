import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CompanyStatus, UserKind, UserStatus, VisibilityScope } from '@prisma/client';
import { ErrorCode, isSubscriptionExpired, todayInDamascus } from '@unigate/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { SessionClaims, SessionService } from './session.service';

const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export type MemberContext = {
  companyId: string;
  companyName: string;
  companyCode: string;
  roleKey: string;
  roleName: string;
  locationId: string | null;
  locationName: string | null;
  visibility: VisibilityScope;
  canManageUsers: boolean;
};

export type RequestAuth = SessionClaims & {
  name: string;
  membership: MemberContext | null;
};

@Injectable()
export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async loginPlatform(username: string, password: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: {
        kind: UserKind.PLATFORM,
        username: { equals: username.trim(), mode: 'insensitive' },
      },
    });
    if (!user) {
      await this.padFailure(password);
      throw this.wrongCredentials();
    }
    await this.assertNotLocked(user);
    const matches = await this.passwords.verify(password, user.passwordHash);
    if (!matches) {
      await this.recordFailure(user.id);
      throw this.wrongCredentials();
    }
    if (user.status !== UserStatus.ACTIVE) {
      await this.clearFailures(user.id);
      throw this.inactive();
    }
    await this.clearFailures(user.id);
    return this.sessions.sign({
      userId: user.id,
      actor: 'platform',
      authVersion: user.authVersion,
      actingCompanyId: null,
    });
  }

  async loginMember(companyCode: string, username: string, password: string): Promise<string> {
    const company = await this.prisma.company.findFirst({
      where: { code: { equals: companyCode.trim(), mode: 'insensitive' } },
    });
    const membership = company
      ? await this.prisma.membership.findFirst({
          where: {
            companyId: company.id,
            username: { equals: username.trim(), mode: 'insensitive' },
          },
          include: { user: true },
        })
      : null;
    const user = membership?.user.kind === UserKind.MEMBER ? membership.user : null;
    if (!company || !membership || !user) {
      await this.padFailure(password);
      throw this.wrongCredentials();
    }
    await this.assertNotLocked(user);
    const matches = await this.passwords.verify(password, user.passwordHash);
    if (!matches) {
      await this.recordFailure(user.id);
      throw this.wrongCredentials();
    }
    if (user.status !== UserStatus.ACTIVE) {
      await this.clearFailures(user.id);
      throw this.inactive();
    }
    if (company.status === CompanyStatus.SUSPENDED) {
      await this.clearFailures(user.id);
      throw new ForbiddenException({
        code: ErrorCode.COMPANY_SUSPENDED,
        message: 'This company is suspended.',
      });
    }
    const expiresOn = calendarDate(company.expiresOn);
    if (isSubscriptionExpired(expiresOn, todayInDamascus())) {
      await this.clearFailures(user.id);
      throw new ForbiddenException({
        code: ErrorCode.SUBSCRIPTION_EXPIRED,
        message: 'This subscription has expired.',
      });
    }
    await this.clearFailures(user.id);
    return this.sessions.sign({
      userId: user.id,
      actor: 'member',
      authVersion: user.authVersion,
      actingCompanyId: null,
    });
  }

  async resolve(claims: SessionClaims): Promise<RequestAuth | null> {
    const user = await this.prisma.user.findUnique({ where: { id: claims.userId } });
    if (!user || user.status !== UserStatus.ACTIVE || user.authVersion !== claims.authVersion) return null;
    if (claims.actor === 'platform') {
      if (user.kind !== UserKind.PLATFORM) return null;
      return {
        userId: user.id,
        actor: 'platform',
        authVersion: user.authVersion,
        actingCompanyId: claims.actingCompanyId,
        name: user.name,
        membership: null,
      };
    }
    if (user.kind !== UserKind.MEMBER) return null;
    const membership = await this.prisma.membership.findUnique({
      where: { userId: user.id },
      include: { company: true, role: true, location: true },
    });
    if (!membership || membership.company.status === CompanyStatus.SUSPENDED) return null;
    if (isSubscriptionExpired(calendarDate(membership.company.expiresOn), todayInDamascus())) return null;
    return {
      userId: user.id,
      actor: 'member',
      authVersion: user.authVersion,
      actingCompanyId: null,
      name: user.name,
      membership: {
        companyId: membership.company.id,
        companyName: membership.company.name,
        companyCode: membership.company.code,
        roleKey: membership.role.key,
        roleName: membership.role.name,
        locationId: membership.location?.id ?? null,
        locationName: membership.location?.name ?? null,
        visibility: membership.role.visibilityScope,
        canManageUsers: membership.role.canManageUsers,
      },
    };
  }

  me(auth: RequestAuth) {
    if (auth.actor === 'platform') {
      return {
        actor: 'platform' as const,
        userId: auth.userId,
        name: auth.name,
        actingCompanyId: auth.actingCompanyId,
      };
    }
    const membership = auth.membership;
    if (!membership) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication is required.',
      });
    }
    return {
      actor: 'member' as const,
      userId: auth.userId,
      name: auth.name,
      company: {
        id: membership.companyId,
        name: membership.companyName,
        code: membership.companyCode,
      },
      roleKey: membership.roleKey,
      roleName: membership.roleName,
      locationId: membership.locationId,
      locationName: membership.locationName,
      visibility: membership.visibility,
      canManageUsers: membership.canManageUsers,
    };
  }

  private async assertNotLocked(user: { id: string; lockedUntil: Date | null; failedLoginCount: number }) {
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException({
        code: ErrorCode.LOCKED,
        message: 'This account is temporarily locked.',
      });
    }
    if (user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: null, failedLoginCount: 0 },
      });
    }
  }

  private async recordFailure(userId: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (updated.failedLoginCount >= MAX_FAILURES) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
      });
    }
  }

  private async clearFailures(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  private async padFailure(password: string) {
    this.dummyHash ??= this.passwords.hash('invalid-login-timing-pad');
    await this.passwords.verify(password, await this.dummyHash);
  }

  private wrongCredentials() {
    return new UnauthorizedException({
      code: ErrorCode.WRONG_CREDENTIALS,
      message: 'The sign-in details are not valid.',
    });
  }

  private inactive() {
    return new ForbiddenException({
      code: ErrorCode.INACTIVE,
      message: 'This account is inactive.',
    });
  }
}

function calendarDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
