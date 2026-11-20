import { loadEnvConfig } from '@next/env';
import mongoose from 'mongoose';
import { emailQueueCapacity, expireStaleEmailNotifications, processNextEmailNotification, reconcileEmailQueue } from '../src/lib/email-outbox.js';

loadEnvConfig(process.cwd());

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let stopping = false;

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

async function run() {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || process.env.DISABLE_EXTERNAL_NOTIFICATIONS === '1') {
    throw new Error('Configure email delivery before starting the notification worker.');
  }

  await reconcileEmailQueue();
  await expireStaleEmailNotifications();
  console.info(`Email notification worker started; pending capacity is ${emailQueueCapacity()}.`);
  let lastCleanup = Date.now();

  while (!stopping) {
    try {
      const processed = await processNextEmailNotification();
      if (!processed) await delay(5000);
      if (Date.now() - lastCleanup >= 60 * 60 * 1000) {
        await expireStaleEmailNotifications();
        await reconcileEmailQueue();
        lastCleanup = Date.now();
      }
    } catch {
      console.error('Notification worker could not process its queue; retrying after a delay.');
      await delay(10_000);
    }
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Notification worker failed to start.');
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
