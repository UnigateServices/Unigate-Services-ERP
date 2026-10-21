import { ConflictException, NotFoundException } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';

export const namedSelect = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function uniqueOrConflict(exists: { id: string } | null, code: string) {
  if (exists) {
    throw new ConflictException(code);
  }
}

export function foundOrThrow<T>(row: T | null, code: string): T {
  if (!row) {
    throw new NotFoundException(code);
  }
  return row;
}

export function usageCount(counts: Record<string, number>) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

export type DeleteResult<T> = T & { action: 'deleted' | 'deactivated' };

export function deletedPayload<T extends { id: string; name: string }>(row: T): DeleteResult<T> {
  return { ...row, action: 'deleted' };
}

export function deactivatedPayload<T extends { status: RecordStatus }>(row: T): DeleteResult<T> {
  return { ...row, status: RecordStatus.INACTIVE, action: 'deactivated' };
}
