'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CompaniesScreen } from '@/components/screens/platform-lists';

function CompaniesRoute() {
  const params = useSearchParams();
  const status = params.get('status');
  const initial = status === 'ACTIVE' || status === 'SUSPENDED' ? status : '';
  return <CompaniesScreen initialStatus={initial} />;
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={null}>
      <CompaniesRoute />
    </Suspense>
  );
}
