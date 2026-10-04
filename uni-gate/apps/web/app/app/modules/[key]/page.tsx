'use client';

import { useParams } from 'next/navigation';
import { ModulePlaceholderScreen } from '@/components/screens/org-screens';

export default function ModulePlaceholderPage() {
  const params = useParams<{ key: string }>();
  return <ModulePlaceholderScreen moduleKey={params.key} />;
}
