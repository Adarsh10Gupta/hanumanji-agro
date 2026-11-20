import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Category, Product } from '@/lib/models';
import { pageCount, parsePageNumber, PRODUCT_API_PAGE_SIZE } from '@/lib/catalog-pagination';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    await db();
    const url = new URL(req.url);
    const slugs = url.searchParams.get('slugs');
    const visibleCategories = await Category.distinct('name', { published: true });
    const filter = { published: true, archivedAt: { $exists: false }, category: { $in: visibleCategories } };

    if (slugs !== null) {
      if (slugs.length > 5000) return NextResponse.json({ error: 'Invalid product lookup.' }, { status: 400 });
      const requestedSlugs = [...new Set(slugs.split(',').filter(Boolean))];
      if (requestedSlugs.length > 30 || requestedSlugs.some((slug) => slug.length > 160)) {
        return NextResponse.json({ error: 'Invalid product lookup.' }, { status: 400 });
      }
      const products = requestedSlugs.length
        ? await Product.find({ ...filter, slug: { $in: requestedSlugs } })
          .select('name slug category description shortDescription image status featured')
          .limit(30)
          .lean()
        : [];
      return NextResponse.json(products, { headers: { 'Cache-Control': 'no-store' } });
    }

    const page = parsePageNumber(url.searchParams.get('page') || undefined);
    if (!page) return NextResponse.json({ error: 'Invalid page.' }, { status: 400 });
    const requestedLimit = Number(url.searchParams.get('limit') || PRODUCT_API_PAGE_SIZE);
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > PRODUCT_API_PAGE_SIZE) {
      return NextResponse.json({ error: 'Invalid page size.' }, { status: 400 });
    }
    const total = await Product.countDocuments(filter);
    const pages = Math.max(1, pageCount(total, requestedLimit));
    const currentPage = Math.min(page, pages);
    const products = await Product.find(filter)
      .select('name slug category description shortDescription image status featured')
      .sort({ featured: -1, name: 1, _id: 1 })
      .skip((currentPage - 1) * requestedLimit)
      .limit(requestedLimit)
      .lean();
    return NextResponse.json({ products, total, page: currentPage, pages }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Catalogue temporarily unavailable' }, { status: 503 });
  }
}
