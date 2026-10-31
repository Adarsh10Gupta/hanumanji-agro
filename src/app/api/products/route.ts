import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Category, Product } from '@/lib/models';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await db();
    const visibleCategories = await Category.distinct('name', { published: true });
    const products = visibleCategories.length
      ? await Product.find({ published: true, archivedAt: { $exists: false }, category: { $in: visibleCategories } })
        .select('name slug category description shortDescription image images status featured grade unit minOrderQuantity specifications seoTitle seoDescription')
        .sort({ featured: -1, name: 1 }).lean()
      : [];
    return NextResponse.json(products, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Catalogue temporarily unavailable' }, { status: 503 });
  }
}
