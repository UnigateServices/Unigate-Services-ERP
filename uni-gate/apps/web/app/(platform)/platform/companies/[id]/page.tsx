'use client';

import { useParams } from 'next/navigation';
import { CompanyDetailsScreen } from '@/components/screens/company-screens';

export default function CompanyDetailsPage() {
  const params = useParams<{ id: string }>();
  return <CompanyDetailsScreen companyId={params.id} />;
}
