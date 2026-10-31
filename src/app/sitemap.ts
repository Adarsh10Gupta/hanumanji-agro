import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { Product } from '@/lib/models';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const root = process.env.NEXT_PUBLIC_SITE_URL || 'https://hanumanjiagro.com';
  const paths = ['', '/about', '/products', '/sourcing', '/farmers', '/business-enquiries', '/contact', '/enquiry', '/privacy', '/terms'];
  const pages = paths.map((path) => ({ url: `${root}${path}`, lastModified: new Date() }));

  try {
    await db();
    const products = await Product.find({ published: true, archivedAt: { $exists: false } }).select('slug updatedAt').lean();
    pages.push(...products.map((product: any) => ({
      url: `${root}/products/${product.slug}`,
      lastModified: product.updatedAt || new Date(),
    })));
  } catch {
    // Static pages remain available if the catalogue database is offline.
  }

  return pages;
}
