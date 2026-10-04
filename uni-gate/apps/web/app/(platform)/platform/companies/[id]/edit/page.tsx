'use client';

import { useParams } from 'next/navigation';
import { CompanyFormScreen } from '@/components/screens/company-screens';

export default function EditCompanyPage() {
  const params = useParams<{ id: string }>();
  return <CompanyFormScreen companyId={params.id} />;
}
