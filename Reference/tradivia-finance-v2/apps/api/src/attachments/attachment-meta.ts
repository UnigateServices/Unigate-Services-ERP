export type AttachmentMeta = {
  id: string;
  name: string;
  size: number;
  mime: string;
  ext: string;
};

export function parseAttachmentMeta(raw: string | null | undefined): AttachmentMeta[] {
  const text = String(raw || '').trim();
  if (!text || text === 'لا يوجد مرفق') return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMeta);
  } catch {
    return [];
  }
}

export function stringifyAttachmentMeta(files: AttachmentMeta[]) {
  return files.length ? JSON.stringify(files) : '';
}

function isMeta(value: unknown): value is AttachmentMeta {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.name === 'string' && typeof row.ext === 'string';
}
