import { loadEnvConfig } from '@next/env';
import argon2 from 'argon2';
import { Admin, AuditLog, Session } from '../src/lib/models.js';
import { db } from '../src/lib/db.js';

loadEnvConfig(process.cwd());

async function run() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password || password.length < 16) throw new Error('Set the owner email and a unique password of at least 16 characters in the server environment.');
  await db();
  const owner = await Admin.findOne({ ownerKey: 'primary', email }).select('+passwordHash');
  if (!owner) throw new Error('No matching owner exists. Password reset will not create an account.');
  owner.passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  await owner.save();
  await Session.deleteMany({ admin: owner._id });
  await AuditLog.create({ actor: owner._id, action: 'security.password-reset', entity: 'Admin', entityId: String(owner._id) });
  console.log('Owner password reset. All existing sessions were revoked. Remove the reset password from the server environment.');
}

void run().then(async () => {
  const mongoose = await import('mongoose');
  await mongoose.default.disconnect();
}).catch(async (error: unknown) => {
  const safeMessages = new Set([
    'Set the owner email and a unique password of at least 16 characters in the server environment.',
    'No matching owner exists. Password reset will not create an account.',
  ]);
  console.error(error instanceof Error && safeMessages.has(error.message)
    ? error.message
    : 'Owner password reset failed. Detailed database errors are withheld to protect credentials.');
  const mongoose = await import('mongoose');
  await mongoose.default.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
