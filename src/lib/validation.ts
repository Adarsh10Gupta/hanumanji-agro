import { z } from 'zod';

export const MAX_ENQUIRY_PRODUCTS = 30;

export function normalizePublicPhone(value: string) {
  return value.replace(/\D/g, '');
}

export const publicPhoneSchema = z.string()
  .trim()
  .regex(/^\+?[\d\s().-]+$/)
  .transform(normalizePublicPhone)
  .refine((phone) => phone.length >= 7 && phone.length <= 15);

export const specificationSchema = z.record(z.string(), z.string().max(300));

export const enquiryUnitSchema = z.enum(['kg', 'tonne', 'quintal', 'boxes']);

export function distinctObjectIds(values: string[]) {
  return new Set(values.map((value) => value.toLowerCase())).size;
}
