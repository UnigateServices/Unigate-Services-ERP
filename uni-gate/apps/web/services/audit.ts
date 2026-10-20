import { api } from '@/lib/api';

export type AuditActionName = 'ENTER' | 'CREATE' | 'UPDATE' | 'DELETE';

export type AuditEntryRow = {
  id: string;
  createdAt: string;
  action: AuditActionName;
  targetType: string;
  targetId: string;
  actorUserId: string;
  actorName: string;
  companyId: string;
  companyName: string;
  companyCode: string;
};

export type AuditList = {
  items: AuditEntryRow[];
  page: number;
  pageSize: number;
  total: number;
};

type Failure = { ok: false; code: string };

function failed(status: number, body: unknown): Failure {
  const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : 'network';
  if (status === 0) return { ok: false, code: 'network' };
  return { ok: false, code };
}

export async function listPlatformAudit(query: { page: number; pageSize?: number; companyId?: string }) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize ?? 20),
  });
  if (query.companyId) params.set('companyId', query.companyId);
  try {
    const { status, body } = await api<AuditList>(`/api/platform/access-log?${params.toString()}`);
    if (status !== 200 || !body?.items) return failed(status, body);
    return { ok: true as const, list: body };
  } catch {
    return failed(0, null);
  }
}
