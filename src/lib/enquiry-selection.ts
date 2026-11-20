export const MAX_ENQUIRY_PRODUCTS = 30;

export type EnquirySelectionLine = {
  product: { slug: string };
  quantity: number;
};

export function addEnquirySelection<T extends EnquirySelectionLine>(
  lines: T[],
  line: T,
  incrementExisting = false,
): { lines: T[]; limited: boolean } {
  const existingIndex = lines.findIndex((item) => item.product.slug === line.product.slug);
  if (existingIndex >= 0) {
    if (!incrementExisting) return { lines, limited: false };
    return {
      lines: lines.map((item, index) => index === existingIndex
        ? { ...item, quantity: item.quantity + line.quantity }
        : item),
      limited: false,
    };
  }
  const distinctCount = new Set(lines.map((item) => item.product.slug)).size;
  if (distinctCount >= MAX_ENQUIRY_PRODUCTS) return { lines, limited: true };
  return { lines: [...lines, line], limited: false };
}

export function normalizeEnquirySelection<T extends EnquirySelectionLine>(lines: T[]): T[] {
  const normalized: T[] = [];
  for (const line of lines) {
    const result = addEnquirySelection(normalized, line, true);
    if (result.limited) break;
    normalized.splice(0, normalized.length, ...result.lines);
  }
  return normalized;
}
