'use client';

const prefix = 'ha-submit:';
const volatileKeys = new Map<string, string>();

export function getSubmissionKey(scope: 'enquiry' | 'supplier') {
  const storageKey = `${prefix}${scope}`;
  let existing = volatileKeys.get(storageKey);
  try { existing = window.sessionStorage.getItem(storageKey) || existing; } catch { /* Use the in-memory key when storage is unavailable. */ }
  if (existing) return existing;
  const key = crypto.randomUUID();
  volatileKeys.set(storageKey, key);
  try { window.sessionStorage.setItem(storageKey, key); } catch { /* In-memory retries still use the same key. */ }
  return key;
}

export function clearSubmissionKey(scope: 'enquiry' | 'supplier') {
  const storageKey = `${prefix}${scope}`;
  volatileKeys.delete(storageKey);
  try { window.sessionStorage.removeItem(storageKey); } catch { /* It may already be unavailable. */ }
}
