import { loadEnvConfig } from '@next/env';
import argon2 from 'argon2';
import { Admin, AuditLog } from '../src/lib/models.js';
import { db } from '../src/lib/db.js';

loadEnvConfig(process.cwd());

async function run() {
  await db();
  const existing = await Admin.find({}, { _id: 1, ownerKey: 1 }).lean();
  if (existing.length > 1) throw new Error('Multiple administrator records exist. Bootstrap stopped; resolve them manually before continuing.');

  if (existing.length === 1) {
    const admin = existing[0];
    if (admin.ownerKey && admin.ownerKey !== 'primary') throw new Error('Existing administrator has an unsupported owner marker. No changes were made.');
    await Admin.collection.createIndex({ ownerKey: 1 }, { unique: true });
    await Admin.collection.createIndex({ email: 1 }, { unique: true });
    if (!admin.ownerKey) {
      await Admin.updateOne({ _id: admin._id, ownerKey: { $exists: false } }, { $set: { ownerKey: 'primary' } });
      await AuditLog.create({ actor: admin._id, action: 'owner.adopted', entity: 'Admin', entityId: String(admin._id) });
      console.log('Existing administrator adopted as the single owner. Credentials were left unchanged.');
    } else {
      console.log('The single owner already exists. No credentials or records were changed.');
    }
    return;
  }

  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password || password.length < 16) throw new Error('Set ADMIN_BOOTSTRAP_EMAIL and a unique ADMIN_BOOTSTRAP_PASSWORD of at least 16 characters.');

  await Admin.collection.createIndex({ ownerKey: 1 }, { unique: true });
  await Admin.collection.createIndex({ email: 1 }, { unique: true });
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  const owner = await Admin.create({ ownerKey: 'primary', email, passwordHash, active: true });
  await AuditLog.create({ actor: owner._id, action: 'owner.created', entity: 'Admin', entityId: String(owner._id) });
  console.log('Single owner account created. Remove bootstrap credentials from the server environment.');
}

void run().then(async () => {
  const mongoose = await import('mongoose');
  await mongoose.default.disconnect();
}).catch(async (error: unknown) => {
  const safeMessages = new Set([
    'Multiple administrator records exist. Bootstrap stopped; resolve them manually before continuing.',
    'Existing administrator has an unsupported owner marker. No changes were made.',
    'Set ADMIN_BOOTSTRAP_EMAIL and a unique ADMIN_BOOTSTRAP_PASSWORD of at least 16 characters.',
  ]);
  console.error(error instanceof Error && safeMessages.has(error.message)
    ? error.message
    : 'Owner bootstrap failed. Detailed database errors are withheld to protect credentials.');
  const mongoose = await import('mongoose');
  await mongoose.default.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
