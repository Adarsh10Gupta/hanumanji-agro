import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { AuditLog, Category, Product } from '@/lib/models';
import { audit, sameOrigin, tooLarge } from '@/lib/security';

export const runtime = 'nodejs';
const productSchema = z.object({ name: z.string().trim().min(2).max(150), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160), category: z.string().trim().min(2).max(100), description: z.string().trim().min(2).max(2000), shortDescription: z.string().max(300).optional(), fullDescription: z.string().max(8000).optional(), image: z.string().url().optional().or(z.literal('')), images: z.array(z.string().url()).max(10).optional(), specifications: z.record(z.string(), z.string().max(300)).optional(), grade: z.string().max(100).optional(), unit: z.string().max(24).default('kg'), minOrderQuantity: z.number().positive().max(1e9).optional(), status: z.enum(['available', 'seasonal', 'unavailable']).default('seasonal'), published: z.boolean().default(false), featured: z.boolean().default(false), seoTitle: z.string().max(160).optional(), seoDescription: z.string().max(320).optional() });
export async function GET() { if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); try { await db(); return NextResponse.json(await Product.find({ archivedAt: { $exists: false } }).sort({ updatedAt: -1 }).lean()); } catch { return NextResponse.json({ error: 'Unable to load products.' }, { status: 503 }); } }
export async function POST(req: NextRequest) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tooBig = tooLarge(req, 48 * 1024); if (tooBig) return tooBig; if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  try { const d = productSchema.parse(await req.json()); await db(); const category = await Category.findOne({ name: d.category }); if (!category || d.published && !category.published) return NextResponse.json({ error: 'Choose a category that is available for the selected publication state.' }, { status: 400 }); const images = d.images?.length ? d.images : d.image ? [d.image] : []; const p = await Product.create({ ...d, image: images[0], images }); await audit(admin._id, 'product.create', 'Product', String(p._id)); revalidatePath('/'); revalidatePath('/products'); revalidatePath(`/products/${p.slug}`); return NextResponse.json({ id: p._id }, { status: 201 }); }
  catch { return NextResponse.json({ error: 'Unable to create product. Check required fields and confirm its slug is unique.' }, { status: 400 }); }
}
