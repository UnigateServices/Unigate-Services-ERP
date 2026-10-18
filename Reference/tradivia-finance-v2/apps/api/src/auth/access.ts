import { AuthUser } from '../auth/current-user.decorator';

export function isGeneralManager(user: AuthUser) {
  return user.role === 'GENERAL_MANAGER';
}

export function seesEveryOffice(user: AuthUser) {
  return user.role === 'GENERAL_MANAGER' || user.role === 'MONITOR';
}

export function locationWhere(user: AuthUser) {
  if (seesEveryOffice(user)) return {};
  return { locationId: user.locationId ?? '__none__' };
}

/** Employee sees own operations; supervisor sees the office; GM and monitor see all. */
export function operationListWhere(user: AuthUser) {
  if (seesEveryOffice(user)) return {};
  if (user.role === 'EMPLOYEE') return { employeeId: user.id };
  return { locationId: user.locationId ?? '__none__' };
}

export function canDirectlyChangeOperations(user: AuthUser) {
  return user.role === 'GENERAL_MANAGER' || user.role === 'SUPERVISOR';
}
