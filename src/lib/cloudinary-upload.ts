type CloudinaryUploadResult = {
  secure_url?: unknown;
  public_id?: unknown;
  width?: unknown;
  height?: unknown;
  format?: unknown;
};

export function uploadToCloudinary(url: string, body: FormData, fetcher: typeof fetch = fetch) {
  return fetcher(url, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(15_000),
  });
}

export function isValidCloudinaryUploadResult(value: unknown, cloud: string, expectedPublicId: string): value is CloudinaryUploadResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as CloudinaryUploadResult;
  if (result.public_id !== expectedPublicId || typeof result.secure_url !== 'string') return false;
  try {
    const url = new URL(result.secure_url);
    return url.protocol === 'https:'
      && url.hostname === 'res.cloudinary.com'
      && url.pathname.startsWith(`/${cloud}/image/upload/`)
      && typeof result.width === 'number'
      && Number.isFinite(result.width)
      && result.width > 0
      && typeof result.height === 'number'
      && Number.isFinite(result.height)
      && result.height > 0
      && ['jpg', 'jpeg', 'png', 'webp'].includes(String(result.format).toLowerCase());
  } catch {
    return false;
  }
}
