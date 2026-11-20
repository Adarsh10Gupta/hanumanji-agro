import { loadEnvConfig } from '@next/env';
import mongoose from 'mongoose';
import { db } from '../src/lib/db.js';
import {
  Admin,
  Category,
  Customer,
  EmailDailyBudget,
  EmailOutbox,
  Enquiry,
  Product,
  RateLimit,
  Session,
  SiteSettings,
  SupplierEnquiry,
} from '../src/lib/models.js';
import { indexMatches, indexName, type IndexDefinition } from '../src/lib/index-verification.js';

loadEnvConfig(process.cwd());

const models = [
  Product,
  Category,
  Customer,
  Enquiry,
  SupplierEnquiry,
  Admin,
  Session,
  RateLimit,
  EmailOutbox,
  EmailDailyBudget,
  SiteSettings,
];

const expected = models.flatMap((model) => model.schema.indexes().map(([key, options]) => {
  const indexKey = key as Record<string, unknown>;
  const indexOptions = options as Record<string, unknown>;
  return {
    model,
    definition: {
      key: indexKey,
      name: typeof indexOptions.name === 'string' ? indexOptions.name : indexName(indexKey),
      options: indexOptions,
    } satisfies IndexDefinition,
  };
}));

async function duplicateIdempotencyValues(model: typeof Enquiry | typeof SupplierEnquiry) {
  const rows = await model.aggregate([
    { $match: { idempotencyKey: { $type: 'string' } } },
    { $group: { _id: '$idempotencyKey', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  ]);
  return rows.length;
}

async function run() {
  await db();
  let valid = true;
  for (const [label, model] of [['Enquiry', Enquiry], ['SupplierEnquiry', SupplierEnquiry]] as const) {
    try {
      const duplicates = await duplicateIdempotencyValues(model);
      console.info(`${label} duplicate idempotency groups: ${duplicates}`);
      if (duplicates) valid = false;
    } catch {
      console.error(`${label} duplicate check failed; verify read access and collection availability.`);
      valid = false;
    }
  }

  for (const item of expected) {
    try {
      const indexes = await item.model.collection.listIndexes().toArray();
      const index = indexes.find((candidate) => candidate.name === item.definition.name);
      const matches = indexMatches(index && {
        key: index.key as Record<string, unknown>,
        name: index.name,
        options: index,
      }, item.definition);
      console.info(`${item.model.modelName}.${item.definition.name}: ${matches ? 'verified' : 'missing or mismatched'}`);
      if (!matches) valid = false;
    } catch {
      console.error(`${item.model.modelName}.${item.definition.name}: unable to inspect index.`);
      valid = false;
    }
  }

  if (!valid) process.exitCode = 1;
}

void run().catch(() => {
  console.error('Index verification could not complete. Confirm database connectivity and read-only permissions.');
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
