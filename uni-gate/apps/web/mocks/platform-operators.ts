import type { PlatformOperatorFixture } from '@/types/auth';

/** Local fixtures only. The real password check stays on the server. */
export const PLATFORM_OPERATORS: PlatformOperatorFixture[] = [
  {
    id: 'op_platform_1',
    name: 'operator',
    password: 'Unigate@dev',
    status: 'ACTIVE',
  },
  {
    id: 'op_platform_2',
    name: 'inactive',
    password: 'Unigate@dev',
    status: 'INACTIVE',
  },
];

export const NETWORK_FIXTURE_NAME = 'network';
