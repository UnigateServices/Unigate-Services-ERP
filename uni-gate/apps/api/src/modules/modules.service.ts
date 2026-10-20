import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { ErrorCode, MODULE_KEYS, MODULE_REGISTRY, isModuleKey, type ModuleKey } from '@unigate/shared';
import type { RequestAuth } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

const readyByKey = new Map(MODULE_REGISTRY.map((item) => [item.key, item.ready]));

export type SessionModule = {
  key: ModuleKey;
  enabled: boolean;
  ready: boolean;
};

export type PlatformModule = SessionModule & {
  companyId: string;
};

type Flag = {
  key: string;
  enabled: boolean;
};

@Injectable()
export class ModulesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForCompany(companyId: string): Promise<{ items: PlatformModule[] }> {
    await this.requireCompany(companyId);
    const rows = await this.prisma.companyModule.findMany({ where: { companyId } });
    return { items: this.toPlatform(companyId, rows) };
  }

  async replace(companyId: string, modules: Flag[], actorUserId: string): Promise<{ items: PlatformModule[] }> {
    return this.prisma.$transaction(async (tx) => {
      await this.requireCompany(companyId, tx);
      this.assertPayload(modules);
      const existing = await tx.companyModule.findMany({ where: { companyId } });
      const byKey = new Map(existing.map((row) => [row.moduleKey, row]));
      for (const item of modules) {
        const key = item.key as ModuleKey;
        const row = byKey.get(key);
        const current = row?.enabled ?? false;
        if (row && row.enabled === item.enabled) continue;
        if (row) {
          await tx.companyModule.update({ where: { id: row.id }, data: { enabled: item.enabled } });
        } else {
          await tx.companyModule.create({
            data: { companyId, moduleKey: key, enabled: item.enabled },
          });
        }
        if (current !== item.enabled) {
          await tx.auditEntry.create({
            data: {
              actorUserId,
              companyId,
              action: AuditAction.UPDATE,
              targetType: 'module',
              targetId: key,
            },
          });
        }
      }
      const rows = await tx.companyModule.findMany({ where: { companyId } });
      return { items: this.toPlatform(companyId, rows) };
    });
  }

  async listForSession(auth: RequestAuth): Promise<{ items: SessionModule[] }> {
    const companyId = this.companyFromSession(auth);
    const rows = await this.prisma.companyModule.findMany({ where: { companyId } });
    const enabled = new Map(rows.map((row) => [row.moduleKey, row.enabled]));
    return {
      items: MODULE_KEYS.map((key) => ({
        key,
        enabled: enabled.get(key) ?? false,
        ready: this.ready(key),
      })),
    };
  }

  async getForSession(auth: RequestAuth, key: string): Promise<{ key: ModuleKey; ready: boolean }> {
    const moduleKey = await this.assertEnabled(auth, key);
    return { key: moduleKey, ready: this.ready(moduleKey) };
  }

  /**
   * Session company is resolved before the key. A platform operator with no
   * support company gets 409, including for an unknown key. A missing row is
   * disabled. Support context uses the same enabled check as a member.
   */
  async assertEnabled(auth: RequestAuth, key: string): Promise<ModuleKey> {
    const companyId = this.companyFromSession(auth);
    if (!isModuleKey(key)) throw this.unknownModule();
    const row = await this.prisma.companyModule.findUnique({
      where: { companyId_moduleKey: { companyId, moduleKey: key } },
      select: { enabled: true },
    });
    if (!row?.enabled) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This module is not available.',
      });
    }
    return key;
  }

  private ready(key: ModuleKey) {
    return readyByKey.get(key) ?? false;
  }

  private toPlatform(
    companyId: string,
    rows: { moduleKey: ModuleKey; enabled: boolean }[],
  ): PlatformModule[] {
    const enabled = new Map(rows.map((row) => [row.moduleKey, row.enabled]));
    return MODULE_KEYS.map((key) => ({
      key,
      enabled: enabled.get(key) ?? false,
      ready: this.ready(key),
      companyId,
    }));
  }

  private assertPayload(modules: Flag[]) {
    const seen = new Set<string>();
    for (const item of modules) {
      if (!isModuleKey(item.key) || typeof item.enabled !== 'boolean' || seen.has(item.key)) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
        });
      }
      seen.add(item.key);
    }
  }

  private companyFromSession(auth: RequestAuth) {
    if (auth.actor === 'platform') {
      if (!auth.actingCompanyId) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'A support company is required.',
        });
      }
      return auth.actingCompanyId;
    }
    if (!auth.membership) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication is required.',
      });
    }
    return auth.membership.companyId;
  }

  private async requireCompany(companyId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Company was not found.',
      });
    }
  }

  private unknownModule() {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Module was not found.',
    });
  }
}
