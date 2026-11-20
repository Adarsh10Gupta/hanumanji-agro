import type { Metadata } from 'next';
import Link from 'next/link';
import PublicShell from '@/components/public/PublicShell';
import ProductCatalogue from '@/components/public/ProductCatalogue';
import CatalogueError from '@/components/public/CatalogueError';
import { db } from '@/lib/db';
import { Category, Product } from '@/lib/models';
import type { CatalogProduct } from '@/components/public/HomeExperience';
import { pageCount, parsePageNumber, PUBLIC_PRODUCT_PAGE_SIZE, escapeRegex } from '@/lib/catalog-pagination';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Product catalogue',
  description: 'Browse agricultural produce, regional spices, dehydrated products and botanicals from Hanumanji Agro.',
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; category?: string }> }) {
  let items: CatalogProduct[] = [];
  let failed = false;
  let categories: string[] = [];
  let page = 1;
  let pages = 1;
  let total = 0;
  const params = await searchParams;
  const requestedPage = parsePageNumber(params.page);
  const search = (params.q || '').trim().slice(0, 100);
  let selectedCategory = params.category || '';
  try {
    await db();
    categories = await Category.distinct('name', { published: true });
    if (!categories.includes(selectedCategory)) selectedCategory = '';
    const filter: Record<string, unknown> = {
      published: true,
      archivedAt: { $exists: false },
      category: { $in: categories },
    };
    if (selectedCategory) filter.category = selectedCategory;
    if (search) {
      const expression = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: expression }, { slug: expression }, { description: expression }, { shortDescription: expression }];
    }
    total = await Product.countDocuments(filter);
    pages = Math.max(1, pageCount(total, PUBLIC_PRODUCT_PAGE_SIZE));
    page = requestedPage || 1;
    if (page > pages) page = pages;
    const rows = await Product.find(filter).select('name slug category description shortDescription image status featured')
      .sort({ featured: -1, name: 1, _id: 1 })
      .skip((page - 1) * PUBLIC_PRODUCT_PAGE_SIZE)
      .limit(PUBLIC_PRODUCT_PAGE_SIZE)
      .lean();
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
    <div className="products-page-rule"><span>{total.toString().padStart(2, '0')} LISTED PRODUCTS</span><Link href="/enquiry">Your enquiry <b aria-hidden="true">↗</b></Link></div>
    {failed ? <CatalogueError /> : <ProductCatalogue products={items} categories={categories} total={total} page={page} pages={pages} search={search} selectedCategory={selectedCategory} />}
  </main></PublicShell>;
}
