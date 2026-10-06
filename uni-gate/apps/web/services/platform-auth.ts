import { api } from '@/lib/api';
import type { LoginFailureCode } from '@/types/auth';

type AuthResult = { ok: true } | { ok: false; code: LoginFailureCode };

export async function loginPlatform(username: string, password: string): Promise<AuthResult> {
  const { status, body } = await api<{ code?: LoginFailureCode }>('/api/auth/platform/login', {
    method: 'POST',
    body: { username, password },
  });
  if (status === 200) return { ok: true };
  return { ok: false, code: body?.code ?? 'WRONG_CREDENTIALS' };
}
