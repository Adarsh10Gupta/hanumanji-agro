import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { Category, Product } from '@/lib/models';
import { SITEMAP_PRODUCT_BATCH_SIZE } from '@/lib/catalog-pagination';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const root = process.env.NEXT_PUBLIC_SITE_URL || 'https://hanumanjiagro.com';
  const paths = ['', '/about', '/products', '/sourcing', '/farmers', '/business-enquiries', '/contact', '/enquiry', '/privacy', '/terms'];
  const pages = paths.map((path) => ({ url: `${root}${path}`, lastModified: new Date() }));

  try {
    await db();
    const visibleCategories = await Category.distinct('name', { published: true });
    let lastId: unknown;
    while (true) {
      const filter = {
        published: true,
        archivedAt: { $exists: false },
        category: { $in: visibleCategories },
        ...(lastId ? { _id: { $gt: lastId } } : {}),
      };
      const products = await Product.find(filter).select('slug updatedAt').sort({ _id: 1 }).limit(SITEMAP_PRODUCT_BATCH_SIZE).lean();
      pages.push(...products.map((product: any) => ({
        url: `${root}/products/${product.slug}`,
        lastModified: product.updatedAt || new Date(),
      })));
      if (products.length < SITEMAP_PRODUCT_BATCH_SIZE) break;
      lastId = products[products.length - 1]._id;
    }
  } catch {
    // Static pages remain available if the catalogue database is offline.
  }

  return pages;
}
