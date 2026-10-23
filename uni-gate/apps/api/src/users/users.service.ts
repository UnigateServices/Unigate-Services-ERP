import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, RecordStatus, UserKind, UserStatus, VisibilityScope } from '@prisma/client';
import { ErrorCode, atLeast, passwordIssue } from '@unigate/shared';
import { requireAccess, toPermissionMap } from '../auth/access';
import type { RequestAuth } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { isScopeMismatch } from '../roles/roles.service';

export type CustomerUserDto = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  role: {
    id: string;
    key: string;
    name: string;
    visibilityScope: VisibilityScope;
    canManageUsers: boolean;
  };
  location: { id: string; name: string; status: RecordStatus } | null;
};

type ListQuery = { page: number; pageSize: number; q?: string };

type ProfileInput = {
  name: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  roleId: string;
  locationId: string | null;
};

type UpdateInput = ProfileInput & { status: UserStatus };

type Scope = {
  companyId: string;
  locationId: string | null | undefined;
  auth: RequestAuth;
};

const membershipInclude = {
  user: true,
  role: { include: { permissions: { select: { area: true, level: true } } } },
  location: true,
} as const;

/** Levels that let a role manage users. A branch-scoped manager cannot reach or grant these roles. */
const MANAGING_LEVELS = ['WRITE', 'APPROVE', 'ADMIN'] as const;

type MembershipRow = Prisma.MembershipGetPayload<{ include: typeof membershipInclude }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async listForCompany(companyId: string, raw: { page?: string; pageSize?: string; q?: string }) {
    await this.requireCompany(companyId);
    const query = parseListQuery(raw);
    return this.list({ companyId, locationId: undefined, auth: { actor: 'platform' } as RequestAuth }, query);
  }

  getForCompany(companyId: string, userId: string) {
    return this.getOne({ companyId, locationId: undefined, auth: { actor: 'platform' } as RequestAuth }, userId);
  }

  createForCompany(companyId: string, input: ProfileInput & { password: string }, actorUserId: string) {
    return this.create(
      { companyId, locationId: undefined, auth: { actor: 'platform', userId: actorUserId } as RequestAuth },
      input,
      actorUserId,
    );
  }

  updateForCompany(companyId: string, userId: string, input: UpdateInput, actorUserId: string) {
    return this.update(
      { companyId, locationId: undefined, auth: { actor: 'platform', userId: actorUserId } as RequestAuth },
      userId,
      input,
      actorUserId,
    );
  }

  resetForCompany(companyId: string, userId: string, password: string, actorUserId: string) {
    return this.reset(
      { companyId, locationId: undefined, auth: { actor: 'platform', userId: actorUserId } as RequestAuth },
      userId,
      password,
      actorUserId,
    );
  }

  listForSession(auth: RequestAuth, raw: { page?: string; pageSize?: string; q?: string }) {
    return this.list(this.scopeFromSession(auth, 'READ'), parseListQuery(raw));
  }

  getForSession(auth: RequestAuth, userId: string) {
    return this.getOne(this.scopeFromSession(auth, 'READ'), userId);
  }

  createForSession(auth: RequestAuth, input: ProfileInput & { password: string }) {
    const scope = this.scopeFromSession(auth, 'WRITE');
    return this.create(scope, input, auth.userId);
  }

  updateForSession(auth: RequestAuth, userId: string, input: UpdateInput) {
    const scope = this.scopeFromSession(auth, 'WRITE');
    return this.update(scope, userId, input, auth.userId);
  }

  resetForSession(auth: RequestAuth, userId: string, password: string) {
    const scope = this.scopeFromSession(auth, 'WRITE');
    return this.reset(scope, userId, password, auth.userId);
  }

  private async list(scope: Scope, query: ListQuery) {
    const where = this.whereFor(scope, query.q);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.membership.count({ where }),
      this.prisma.membership.findMany({
        where,
        include: membershipInclude,
        orderBy: [{ user: { name: 'asc' } }, { userId: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map(toDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  private async getOne(scope: Scope, userId: string) {
    const row = await this.prisma.membership.findFirst({
      where: { ...this.whereFor(scope), userId },
      include: membershipInclude,
    });
    if (!row || row.user.kind !== UserKind.MEMBER) throw this.userNotFound();
    return toDto(row);
  }

  private async create(scope: Scope, input: ProfileInput & { password: string }, auditActorId: string) {
    if (passwordIssue(input.password)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Password must be at least 8 characters and include a letter and a number.',
      });
    }
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await this.resolveAssignment(tx, scope, input.roleId, input.locationId, null);
        const user = await tx.user.create({
          data: {
            kind: UserKind.MEMBER,
            username: null,
            name: input.name,
            email: input.email ?? null,
            phone: input.phone ?? null,
            passwordHash,
            status: UserStatus.ACTIVE,
          },
        });
        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            companyId: scope.companyId,
            username: input.username,
            roleId: assignment.roleId,
            locationId: assignment.locationId,
          },
          include: membershipInclude,
        });
        await this.audit(tx, auditActorId, scope.companyId, user.id, AuditAction.CREATE);
        return toDto(membership);
      });
    } catch (error) {
      this.rethrowKnown(error);
    }
  }

  private async update(scope: Scope, userId: string, input: UpdateInput, auditActorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.membership.findFirst({
          where: { ...this.whereFor(scope), userId },
          include: membershipInclude,
        });
        if (!existing || existing.user.kind !== UserKind.MEMBER) throw this.userNotFound();
        this.assertNotSelfAdmin(scope.auth, existing, input);
        const assignment = await this.resolveAssignment(tx, scope, input.roleId, input.locationId, {
          roleId: existing.roleId,
          locationId: existing.locationId,
        });
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            name: input.name,
            email: input.email ?? null,
            phone: input.phone ?? null,
            status: input.status,
            // Deactivation ends every existing session, so reactivation needs a new sign-in.
            ...(existing.user.status === UserStatus.ACTIVE && input.status === UserStatus.INACTIVE
              ? { authVersion: { increment: 1 } }
              : {}),
          },
        });
        const membership = await tx.membership.update({
          where: { id: existing.id },
          data: {
            username: input.username,
            roleId: assignment.roleId,
            locationId: assignment.locationId,
          },
          include: membershipInclude,
        });
        await this.audit(tx, auditActorId, scope.companyId, existing.userId, AuditAction.UPDATE);
        return toDto(membership);
      });
    } catch (error) {
      this.rethrowKnown(error);
    }
  }

  private async reset(scope: Scope, userId: string, password: string, auditActorId: string) {
    if (passwordIssue(password)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Password must be at least 8 characters and include a letter and a number.',
      });
    }
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.membership.findFirst({
        where: { ...this.whereFor(scope), userId },
        include: { user: true },
      });
      if (!existing || existing.user.kind !== UserKind.MEMBER) throw this.userNotFound();
      if (scope.auth.actor === 'member' && scope.auth.userId === userId) throw this.selfAdmin();
      await this.passwords.writeHash(tx, userId, passwordHash);
      await this.audit(tx, auditActorId, scope.companyId, userId, AuditAction.UPDATE);
    });
  }

  /** READ lists and opens users. WRITE creates, edits, and resets passwords. */
  private scopeFromSession(auth: RequestAuth, minimum: 'READ' | 'WRITE'): Scope {
    const access = requireAccess(auth, 'users', minimum);
    if (access.actor === 'platform' || access.visibility === VisibilityScope.ALL_BRANCHES) {
      return { companyId: access.companyId, locationId: undefined, auth };
    }
    return { companyId: access.companyId, locationId: access.locationId, auth };
  }

  private whereFor(scope: Scope, q?: string): Prisma.MembershipWhereInput {
    const limited = scope.locationId !== undefined;
    const and: Prisma.MembershipWhereInput[] = [];
    if (limited) {
      // A branch-scoped manager reaches staff on that branch who cannot manage users, and their own record.
      and.push({
        OR: [
          { role: { permissions: { none: { area: 'users', level: { in: [...MANAGING_LEVELS] } } } } },
          { userId: scope.auth.userId },
        ],
      });
    }
    if (q) {
      and.push({
        OR: [
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { username: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    return {
      companyId: scope.companyId,
      user: { kind: UserKind.MEMBER },
      ...(limited ? { locationId: scope.locationId ?? '__none__' } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }

  private async resolveAssignment(
    tx: Prisma.TransactionClient,
    scope: Scope,
    roleId: string,
    locationId: string | null,
    existing: { roleId: string; locationId: string | null } | null,
  ) {
    // Holds the role row until commit, so a concurrent scope change waits and then sees this membership.
    await tx.$queryRaw`SELECT id FROM roles WHERE id = ${roleId} AND company_id = ${scope.companyId} FOR SHARE`;
    const role = await tx.role.findFirst({
      where: { id: roleId, companyId: scope.companyId },
      include: { permissions: { select: { area: true, level: true } } },
    });
    if (!role) throw this.roleNotFound();
    const roleManagesUsers = atLeast(toPermissionMap(role.permissions).users, 'WRITE');
    const scoped = scope.locationId !== undefined;
    if (scoped && role.visibilityScope === VisibilityScope.ALL_BRANCHES) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This role is outside your branch.',
      });
    }
    const keepsOwnRole = existing !== null && existing.roleId === role.id;
    if (scoped && roleManagesUsers && !keepsOwnRole) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This role is outside your scope.',
      });
    }
    // Decision L: a member never grants a role above their own level in any area.
    const actorPermissions = scope.auth.actor === 'member' ? scope.auth.membership?.permissions : undefined;
    if (actorPermissions && !keepsOwnRole) {
      const rolePermissions = toPermissionMap(role.permissions);
      const above = (Object.keys(rolePermissions) as (keyof typeof rolePermissions)[]).some(
        (area) => !atLeast(actorPermissions[area], rolePermissions[area]),
      );
      if (above) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'This role has more permissions than yours.',
        });
      }
    }
    if (role.visibilityScope === VisibilityScope.ALL_BRANCHES) {
      if (locationId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'An all-branch role is not tied to a branch.',
        });
      }
      return { roleId: role.id, locationId: null };
    }
    if (!locationId) {
      throw new BadRequestException({
        code: ErrorCode.LOCATION_REQUIRED,
        message: 'This role requires a branch.',
      });
    }
    if (scoped && locationId !== scope.locationId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This branch is outside your scope.',
      });
    }
    const location = await tx.location.findFirst({ where: { id: locationId, companyId: scope.companyId } });
    if (!location) throw this.locationNotFound();
    const unchanged =
      existing !== null && existing.roleId === role.id && existing.locationId === location.id;
    if (location.status !== RecordStatus.ACTIVE && !unchanged) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Choose an active branch.',
      });
    }
    return { roleId: role.id, locationId: location.id };
  }

  private assertNotSelfAdmin(auth: RequestAuth, existing: MembershipRow, input: UpdateInput) {
    if (auth.actor !== 'member' || auth.userId !== existing.userId) return;
    const locationChanged = (existing.locationId ?? null) !== (input.locationId ?? null);
    if (input.status === UserStatus.INACTIVE || input.roleId !== existing.roleId || locationChanged) {
      throw this.selfAdmin();
    }
  }

  private async requireCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw this.companyNotFound();
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    companyId: string,
    userId: string,
    action: AuditAction,
  ) {
    return tx.auditEntry.create({
      data: {
        actorUserId,
        companyId,
        action,
        targetType: 'user',
        targetId: userId,
      },
    });
  }

  private companyNotFound() {
    return new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Company was not found.' });
  }

  private userNotFound() {
    return new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'User was not found.' });
  }

  private roleNotFound() {
    return new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Role was not found.' });
  }

  private locationNotFound() {
    return new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Location was not found.' });
  }

  private selfAdmin() {
    return new ConflictException({
      code: ErrorCode.CONFLICT,
      message: 'Change your own password from the account screen.',
    });
  }

  private rethrowKnown(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        code: ErrorCode.NAME_TAKEN,
        message: 'Another user in this company already uses this username.',
      });
    }
    if (isScopeMismatch(error)) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'The role scope changed. Choose the role and branch again.',
      });
    }
    throw error;
  }
}

function parseListQuery(raw: { page?: string; pageSize?: string; q?: string }): ListQuery {
  const page = raw.page === undefined || raw.page === '' ? 1 : Number(raw.page);
  const pageSize = raw.pageSize === undefined || raw.pageSize === '' ? 20 : Number(raw.pageSize);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Page and page size are not valid.',
    });
  }
  const q = raw.q?.trim();
  if (q && q.length > 80) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'The search is too long.',
    });
  }
  return { page, pageSize, q: q || undefined };
}

function toDto(row: MembershipRow): CustomerUserDto {
  return {
    id: row.user.id,
    name: row.user.name,
    username: row.username,
    email: row.user.email,
    phone: row.user.phone,
    status: row.user.status,
    role: {
      id: row.role.id,
      key: row.role.key,
      name: row.role.name,
      visibilityScope: row.role.visibilityScope,
      canManageUsers: atLeast(toPermissionMap(row.role.permissions).users, 'WRITE'),
    },
    location: row.location
      ? { id: row.location.id, name: row.location.name, status: row.location.status }
      : null,
  };
}
