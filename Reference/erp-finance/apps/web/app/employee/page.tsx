'use client';

import { FinanceWorkspace } from '../../components/finance-workspace';

export default function EmployeePage() {
  return <FinanceWorkspace allow={['EMPLOYEE']} subtitle={(user) => user.locationName || ''} />;
}
