import type { Metadata } from 'next';
import Link from 'next/link';
import PublicShell from '@/components/public/PublicShell';
import ProductCatalogue from '@/components/public/ProductCatalogue';
import CatalogueError from '@/components/public/CatalogueError';
import { db } from '@/lib/db';
import { Category, Product } from '@/lib/models';
import type { CatalogProduct } from '@/components/public/HomeExperience';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Product catalogue',
  description: 'Browse agricultural produce, regional spices, dehydrated products and botanicals from Hanumanji Agro.',
};

export default async function ProductsPage() {
  let items: CatalogProduct[] = [];
  let failed = false;
  try {
    await db();
    const visibleCategories = await Category.distinct('name', { published: true });
    const rows = visibleCategories.length ? await Product.find({ published: true, archivedAt: { $exists: false }, category: { $in: visibleCategories } }).sort({ featured: -1, name: 1 }).lean() : [];
    items = rows.map((product: any) => ({
      _id: String(product._id),
      name: product.name,
      slug: product.slug,
      category: product.category,
      description: product.shortDescription || product.description,
      image: product.image,
      status: product.status,
      featured: product.featured,
    }));
  } catch {
    failed = true;
  }

  return <PublicShell><main className="products-page">
    <section className="products-page-intro">
      <div><span className="eyebrow-dark">The Hanumanji Agro collection</span><h1>Products of place.<br /><i>Selected with care.</i></h1></div>
      <aside><span>01 — PRODUCT INDEX</span><p>Regional produce, spices, dehydrated ingredients and selected botanical materials. Availability, grades and volumes are confirmed for each enquiry.</p></aside>
    </section>
    <div className="products-page-rule"><span>{items.length.toString().padStart(2, '0')} LISTED PRODUCTS</span><Link href="/enquiry">Your enquiry <b aria-hidden="true">↗</b></Link></div>
    {failed ? <CatalogueError /> : <ProductCatalogue products={items} />}
  </main></PublicShell>;
}
