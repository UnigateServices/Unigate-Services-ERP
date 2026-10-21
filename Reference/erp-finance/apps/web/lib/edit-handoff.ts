const KEY = 'tf-edit';

export function queueEdit(section: string, id: string) {
  sessionStorage.setItem(KEY, JSON.stringify({ section, id }));
  window.location.hash = section;
}

export function peekEdit(section: string) {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { section?: string; id?: string };
    if (data.section !== section || !data.id) return null;
    return data.id;
  } catch {
    return null;
  }
}

export function clearEdit() {
  sessionStorage.removeItem(KEY);
}
