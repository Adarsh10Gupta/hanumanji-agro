import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { AuditLog, Category, Product } from '@/lib/models';
import { audit, readJsonBody, sameOrigin } from '@/lib/security';
import { ADMIN_PRODUCT_PAGE_SIZE, escapeRegex, pageCount, parsePageNumber } from '@/lib/catalog-pagination';

export const runtime = 'nodejs';
const productSchema = z.object({
  name: z.string().trim().min(2).max(150),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(2000),
  shortDescription: z.string().max(300).optional(),
  fullDescription: z.string().max(8000).optional(),
  image: z.string().url().optional().or(z.literal('')),
  images: z.array(z.string().url()).max(10).optional(),
  specifications: z.record(z.string().trim().min(1).max(100), z.string().max(300)).optional(),
  grade: z.string().max(100).optional(),
  unit: z.string().max(24).default('kg'),
  minOrderQuantity: z.number().positive().max(1e9).optional(),
  status: z.enum(['available', 'seasonal', 'unavailable']).default('seasonal'),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  seoTitle: z.string().max(160).optional(),
  seoDescription: z.string().max(320).optional(),
}).superRefine((data, ctx) => {
  if (data.images && data.images.length > 10) ctx.addIssue({ code: 'custom', path: ['images'], message: 'A product can have at most 10 images.' });
  if (data.image && data.images && data.images[0] !== data.image) ctx.addIssue({ code: 'custom', path: ['image'], message: 'The primary image must be the first image.' });
});
export async function GET(req: NextRequest) {
  if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const page = parsePageNumber(req.nextUrl.searchParams.get('page') || undefined);
  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || ADMIN_PRODUCT_PAGE_SIZE);
  if (!page || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > ADMIN_PRODUCT_PAGE_SIZE) {
    return NextResponse.json({ error: 'Invalid pagination.' }, { status: 400 });
  }
  const search = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 100);
  const filter: Record<string, unknown> = { archivedAt: { $exists: false } };
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: expression }, { slug: expression }, { category: expression }];
  }
  try {
    await db();
    const total = await Product.countDocuments(filter);
    const pages = Math.max(1, pageCount(total, requestedLimit));
    const currentPage = Math.min(page, pages);
    const products = await Product.find(filter).select('name slug category image status published updatedAt')
      .sort({ updatedAt: -1, _id: -1 })
      .skip((currentPage - 1) * requestedLimit)
      .limit(requestedLimit)
      .lean();
    return NextResponse.json({ products, total, page: currentPage, pages });
  } catch {
    return NextResponse.json({ error: 'Unable to load products.' }, { status: 503 });
  }
}
export async function POST(req: NextRequest) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  const body = await readJsonBody(req, 48 * 1024); if (!body.ok) return body.response;
  try {
    const d = productSchema.parse(body.data);
    await db();
    const category = await Category.findOne({ name: d.category });
    if (!category || d.published && !category.published) {
      return NextResponse.json({ error: 'Choose a category that is available for the selected publication state.' }, { status: 400 });
    }
    const images = d.images?.length ? d.images.slice(0, 10) : d.image ? [d.image] : [];
    const p = await Product.create({ ...d, image: images[0] || '', images });
    await audit(admin._id, 'product.create', 'Product', String(p._id));
    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath(`/products/${p.slug}`);
    revalidatePath('/admin/products');
    return NextResponse.json({ id: p._id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Please check the product fields.' }, { status: 400 });
    if ((error as { code?: number }).code === 11000) return NextResponse.json({ error: 'A product with this slug already exists.' }, { status: 409 });
    return NextResponse.json({ error: 'Unable to create product. Check required fields and confirm its slug is unique.' }, { status: 400 });
  }
}
