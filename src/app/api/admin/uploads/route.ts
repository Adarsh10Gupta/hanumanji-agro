import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { owner } from '@/lib/auth';
import { audit, readFormDataBody, sameOrigin } from '@/lib/security';
import { isValidCloudinaryUploadResult, uploadToCloudinary } from '@/lib/cloudinary-upload';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 5.2 * 1024 * 1024;
const signatures: Record<string, (bytes: Buffer) => boolean> = {
  'image/jpeg': (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': (bytes) => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
};

export async function POST(req: NextRequest) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });

  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) {
    return NextResponse.json({ error: 'Image upload is not configured. Add Cloudinary credentials to the server environment.' }, { status: 503 });
  }

  const parsed = await readFormDataBody(req, MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const file = parsed.form.get('file');
  const kind = parsed.form.get('kind');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file.' }, { status: 400 });
  if (kind !== 'product' && kind !== 'category') return NextResponse.json({ error: 'Unsupported upload kind.' }, { status: 400 });
  if (file.size < 1 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'Images must be 5 MB or smaller.' }, { status: 413 });

  const mime = file.type;
  if (!signatures[mime]) return NextResponse.json({ error: 'Use a JPEG, PNG or WebP image.' }, { status: 415 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!signatures[mime](bytes)) return NextResponse.json({ error: 'The file contents do not match its image type.' }, { status: 415 });

  const folder = `hanumanji-agro/${kind === 'category' ? 'categories' : 'products'}`;
  const assetId = randomUUID();
  const publicId = `${folder}/${assetId}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = `folder=${folder}&public_id=${assetId}&timestamp=${timestamp}`;
  const signature = createHash('sha1').update(params + secret).digest('hex');
  const upload = new FormData();
  upload.append('file', new Blob([bytes], { type: mime }), file.name.replace(/[\r\n]/g, ''));
  upload.append('folder', folder);
  upload.append('public_id', assetId);
  upload.append('timestamp', String(timestamp));
  upload.append('api_key', key);
  upload.append('signature', signature);

  let response: Response;
  try {
    response = await uploadToCloudinary(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, upload);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return NextResponse.json({ error: timedOut ? 'Cloudinary upload timed out. Please try again.' : 'Unable to reach Cloudinary.' }, { status: timedOut ? 504 : 502 });
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    return NextResponse.json({ error: 'Cloudinary returned an invalid response.' }, { status: 502 });
  }
  if (!response.ok) return NextResponse.json({ error: 'Cloudinary could not accept this image.' }, { status: 502 });
  if (!isValidCloudinaryUploadResult(result, cloud, publicId)) {
    return NextResponse.json({ error: 'Cloudinary returned incomplete image details.' }, { status: 502 });
  }

  try {
    await audit(admin._id, 'media.upload', 'Cloudinary', publicId);
  } catch {
    return NextResponse.json({ error: 'The image uploaded, but its audit record could not be saved.' }, { status: 503 });
  }
  return NextResponse.json({ url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height, format: result.format }, { status: 201 });
}
