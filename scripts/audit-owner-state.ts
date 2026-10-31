import { loadEnvConfig } from '@next/env';
import { db } from '../src/lib/db.js';

loadEnvConfig(process.cwd());

async function run() {
  const mongoose = await db();
  const database = mongoose.connection.db;
  if (!database || database.databaseName !== 'hanumanji_agro') throw new Error('Expected database was not selected.');

  const names = await database.listCollections({}, { nameOnly: true }).toArray();
  const collectionNames = new Set(names.map((collection) => collection.name));
  const adminCount = collectionNames.has('admins') ? await database.collection('admins').countDocuments() : 0;
  const activeAdminCount = collectionNames.has('admins') ? await database.collection('admins').countDocuments({ active: { $ne: false } }) : 0;
  const sessionCount = collectionNames.has('sessions') ? await database.collection('sessions').countDocuments() : 0;
  const products = collectionNames.has('products') ? database.collection('products') : null;
  const categories = collectionNames.has('categories') ? database.collection('categories') : null;
  const enquiries = collectionNames.has('enquiries') ? database.collection('enquiries') : null;
  const suppliers = collectionNames.has('supplierenquiries') ? database.collection('supplierenquiries') : null;
  const productCounts = products ? {
    all: await products.countDocuments(),
    published: await products.countDocuments({ published: true, archivedAt: { $exists: false } }),
    archived: await products.countDocuments({ archivedAt: { $exists: true } }),
  } : { all: 0, published: 0, archived: 0 };
  const categoryCount = categories ? await categories.countDocuments() : 0;
  const enquiryCount = enquiries ? await enquiries.countDocuments() : 0;
  const supplierCount = suppliers ? await suppliers.countDocuments() : 0;
  const adminIndexes = collectionNames.has('admins')
    ? await database.collection('admins').listIndexes().toArray()
    : [];

  console.log(`Database: ${database.databaseName}`);
  console.log(`Existing administrator records: ${adminCount}`);
  console.log(`Active administrator records: ${activeAdminCount}`);
  console.log(`Existing session records: ${sessionCount}`);
  console.log(`Products (all/published-unarchived/archived): ${productCounts.all}/${productCounts.published}/${productCounts.archived}`);
  console.log(`Categories: ${categoryCount}`);
  console.log(`Enquiries: ${enquiryCount}`);
  console.log(`Supplier enquiries: ${supplierCount}`);
  console.log(`Administrator indexes: ${adminIndexes.map((index) => `${index.name}${index.unique ? ' (unique)' : ''}`).join(', ') || 'none'}`);
  console.log('Read-only audit completed; no owner, index, or data was created or changed.');
  await mongoose.disconnect();
}

void run().catch(async () => {
  console.error('Read-only owner audit failed; database details and credentials withheld.');
  process.exitCode = 1;
});
