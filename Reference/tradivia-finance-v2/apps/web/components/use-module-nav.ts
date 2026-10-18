'use client';

import { useEffect, useState } from 'react';
import type { Role } from '../lib/api';
import { defaultSection, groupsForModule, moduleFromHash, type ModuleId } from '../lib/modules';

export function useModuleNav(role: Role | undefined) {
  const [moduleId, setModuleId] = useState<ModuleId | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!role) return;
    setModuleId(moduleFromHash(role));
    setReady(true);
    function sync() {
      if (!role) return;
      setModuleId(moduleFromHash(role));
    }
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [role]);

  function openModule(id: ModuleId) {
    if (!role) return;
    const groups = groupsForModule(id, role);
    const raw = window.location.hash.replace('#', '');
    const section = raw.startsWith(`${id}/`) ? raw.slice(id.length + 1) : '';
    const known = groups.some((group) => group.items.some((item) => item.id === section));
    const next = known ? section : defaultSection(id, role);
    window.history.pushState(null, '', `#${id}/${next}`);
    setModuleId(id);
  }

  function goHome() {
    window.history.pushState(null, '', '#home');
    setModuleId(null);
  }

  return { moduleId, ready: Boolean(role) && ready, openModule, goHome };
}
