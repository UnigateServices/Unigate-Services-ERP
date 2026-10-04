'use client';

import { useParams } from 'next/navigation';
import { CompanyModulesScreen } from '@/components/screens/company-screens';

export default function CompanyModulesPage() {
  const params = useParams<{ id: string }>();
  return <CompanyModulesScreen companyId={params.id} />;
}
