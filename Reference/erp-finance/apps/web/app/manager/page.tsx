'use client';

import { FinanceWorkspace } from '../../components/finance-workspace';

export default function ManagerPage() {
  return (
    <FinanceWorkspace
      allow={['GENERAL_MANAGER', 'MONITOR']}
      subtitle={(user) => (user.role === 'MONITOR' ? 'مراقبة' : 'كل المكاتب')}
    />
  );
}
