import { loadEnvConfig } from '@next/env';
import { db } from '../src/lib/db';
import { Category, Product } from '../src/lib/models';
import { products } from '../src/lib/data';

loadEnvConfig(process.cwd());

async function run() {
  await db();
  const categories = [...new Set(products.map(p => p.category))];
  for (const [displayOrder, name] of categories.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await Category.updateOne({ slug }, { $setOnInsert: { name, slug, displayOrder, published: true } }, { upsert: true });
  }
  for (const p of products) await Product.updateOne({ slug: p.slug }, { $setOnInsert: { ...p, status: 'seasonal', published: true, unit: 'kg' } }, { upsert: true });
  console.log(`Seeded ${products.length} products and ${categories.length} categories (existing records preserved).`);
  process.exit(0);
}
run().catch(error => { console.error(error instanceof Error ? error.message : 'Seed failed'); process.exit(1); });
