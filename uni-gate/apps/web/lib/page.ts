export const PAGE_SIZE = 20;

export function pageOf<T>(rows: T[], page: number) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE) || 1);
  const safe = Math.min(Math.max(1, page), pages);
  const start = (safe - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), page: safe, pages };
}
