'use client';

import { FinanceWorkspace } from '../../components/finance-workspace';

export default function SupervisorPage() {
  return <FinanceWorkspace allow={['SUPERVISOR']} subtitle={(user) => user.locationName || ''} />;
}
