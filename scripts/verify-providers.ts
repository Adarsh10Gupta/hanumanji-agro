import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function run() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudKey = process.env.CLOUDINARY_API_KEY;
  const cloudSecret = process.env.CLOUDINARY_API_SECRET;
  const resendKey = process.env.RESEND_API_KEY;

  if (cloud && cloudKey && cloudSecret) {
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/resources/image/upload?prefix=hanumanji-agro%2F&max_results=1`, {
        headers: { Authorization: `Basic ${Buffer.from(`${cloudKey}:${cloudSecret}`).toString('base64')}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      });
      const data = response.ok ? await response.json() as { resources?: unknown[] } : null;
      console.log(`Cloudinary Admin API: ${response.ok ? `available (HTTP ${response.status})` : `failed (HTTP ${response.status})`}`);
      if (data) console.log(`Hanumanji Agro assets returned: ${data.resources?.length || 0} (sample limit 1)`);
    } catch {
      console.log('Cloudinary Admin API: unavailable (network or timeout)');
    }
  } else console.log('Cloudinary Admin API: missing server credentials');

  if (resendKey) {
    try {
      const response = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${resendKey}` }, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      const data = response.ok ? await response.json() as { data?: Array<{ status?: string }> } : null;
      console.log(`Resend API: ${response.ok ? `available (HTTP ${response.status})` : `failed (HTTP ${response.status})`}`);
      if (data) console.log(`Verified sending domains: ${data.data?.filter((domain) => domain.status === 'verified').length || 0}`);
    } catch {
      console.log('Resend API: unavailable (network or timeout)');
    }
  } else console.log('Resend API: missing server credentials');
}

void run().catch(() => {
  console.error('Provider verification failed; credentials are withheld.');
  process.exitCode = 1;
});
