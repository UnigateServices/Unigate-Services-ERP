import { ForbiddenException } from '@nestjs/common';
import { VisibilityScope } from '@prisma/client';
import { ErrorCode, atLeast, type PermissionLevel } from '@unigate/shared';
import { requireAccess, type AreaAccess } from '../auth/access';
import type { RequestAuth } from '../auth/auth.service';

/**
 * The finance actor: the session's access to the finance area (phase F1), built on the foundation
 * session. Finance code never reads a role key. Levels and scope decide, per docs/FINANCE_MERGE_PLAN.md
 * decisions B, E, and K:
 *
 * | Original role check            | Here                                                  |
 * |--------------------------------|-------------------------------------------------------|
 * | any finance role may read      | READ                                                  |
 * | employee may record            | WRITE                                                 |
 * | general manager or supervisor  | APPROVE                                               |
 * | general manager only           | ADMIN                                                 |
 * | sees every office              | visibility ALL_BRANCHES                               |
 * | sees own operations            | visibility OWN                                        |
 * | changes operations directly    | WRITE and the role's approval flag is off             |
 *
 * A platform operator in support holds READ with ALL_BRANCHES and has no membership, so every
 * write is refused before it reaches a service (decision K).
 */
export type FinanceActor = AreaAccess & { area: 'finance' };

export function financeActor(auth: RequestAuth, minimum: PermissionLevel = 'READ'): FinanceActor {
  return requireAccess(auth, 'finance', minimum) as FinanceActor;
}

/** The membership that records an operation. Only members write finance data. */
export function actorId(actor: FinanceActor): string {
  if (!actor.membershipId) {
    throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'You do not have permission for this action.' });
  }
  return actor.membershipId;
}

export function isFinanceAdmin(actor: FinanceActor) {
  return actor.level === 'ADMIN';
}

export function seesEveryOffice(actor: FinanceActor) {
  return actor.visibility === VisibilityScope.ALL_BRANCHES;
}

export function locationWhere(actor: FinanceActor) {
  if (seesEveryOffice(actor)) return {};
  return { locationId: actor.locationId ?? '__none__' };
}

/** Own operations for OWN, the branch for BRANCH, everything for ALL_BRANCHES. */
export function operationListWhere(actor: FinanceActor) {
  if (seesEveryOffice(actor)) return {};
  if (actor.visibility === VisibilityScope.OWN) return { employeeId: actor.membershipId ?? '__none__' };
  return { locationId: actor.locationId ?? '__none__' };
}

export function canDirectlyEdit(actor: FinanceActor) {
  return actor.actor === 'member' && atLeast(actor.level, 'WRITE') && !actor.editRequiresApproval;
}

export function canDirectlyDelete(actor: FinanceActor) {
  return actor.actor === 'member' && atLeast(actor.level, 'WRITE') && !actor.deleteRequiresApproval;
}

/** Recorders pick from active master data. Readers and approvers see inactive rows too. */
export function activeMasterDataOnly(actor: FinanceActor) {
  return actor.level === 'WRITE';
}
