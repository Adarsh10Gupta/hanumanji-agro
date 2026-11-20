export const PUBLIC_PRODUCT_PAGE_SIZE = 48;
export const ADMIN_PRODUCT_PAGE_SIZE = 100;
export const PRODUCT_API_PAGE_SIZE = 100;
export const SITEMAP_PRODUCT_BATCH_SIZE = 500;

export function parsePageNumber(value: string | undefined, fallback = 1) {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function pageCount(total: number, limit: number) {
  return Math.ceil(total / limit);
}

export function pageSlice<T>(items: readonly T[], page: number, limit: number) {
  return items.slice((page - 1) * limit, page * limit);
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
