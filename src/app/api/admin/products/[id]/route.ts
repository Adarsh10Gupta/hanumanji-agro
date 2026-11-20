import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { Category, Product } from '@/lib/models';
import { audit, readJsonBody, sameOrigin } from '@/lib/security';
import mongoose from 'mongoose';

const fields = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).optional(),
  category: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().min(2).max(2000).optional(),
  shortDescription: z.string().max(300).optional(),
  fullDescription: z.string().max(8000).optional(),
  image: z.string().url().optional().or(z.literal('')),
  images: z.array(z.string().url()).max(10).optional(),
  specifications: z.record(z.string().trim().min(1).max(100), z.string().max(300)).optional(),
  grade: z.string().max(100).optional(),
  unit: z.string().max(24).optional(),
  minOrderQuantity: z.number().positive().max(1e9).optional(),
  status: z.enum(['available', 'seasonal', 'unavailable']).optional(),
  published: z.boolean().optional(),
  featured: z.boolean().optional(),
  seoTitle: z.string().max(160).optional(),
  seoDescription: z.string().max(320).optional(),
}).superRefine((data, ctx) => {
  if (data.images && data.images.length > 10) ctx.addIssue({ code: 'custom', path: ['images'], message: 'A product can have at most 10 images.' });
  if (data.image !== undefined && data.images && data.images[0] !== data.image) ctx.addIssue({ code: 'custom', path: ['image'], message: 'The primary image must be the first image.' });
});
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  const body = await readJsonBody(req, 48 * 1024);
  if (!body.ok) return body.response;
  try {
    const d = fields.parse(body.data);
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Invalid product ID.' }, { status: 404 });
    await db();
    const p = await Product.findOne({ _id: id, archivedAt: { $exists: false } });
    if (!p) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

    const nextCategory = d.category ?? p.category;
    const nextPublished = d.published ?? p.published;
    const category = await Category.findOne({ name: nextCategory });
    if (!category || (nextPublished && !category.published)) {
      return NextResponse.json({ error: 'Choose a category that is available for the selected publication state.' }, { status: 400 });
    }

    const previousSlug = p.slug;
    const nextImages = d.images
      ?? (d.image !== undefined ? (d.image ? [d.image] : []) : (Array.isArray(p.images) ? p.images : p.image ? [p.image] : []));
    const nextImage = d.images ? d.images[0] || '' : d.image !== undefined ? d.image : nextImages[0] || '';
    const next = { ...d, images: nextImages.slice(0, 10), image: nextImage };
    Object.assign(p, next);
    await p.save();
    await audit(admin._id, 'product.update', 'Product', id);
    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath(`/products/${previousSlug}`);
    if (p.slug !== previousSlug) revalidatePath(`/products/${p.slug}`);
    revalidatePath(`/admin/products/${id}/edit`);
    return NextResponse.json({ ok: true, slug: p.slug });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Please check the product fields.' }, { status: 400 });
    if ((error as { code?: number }).code === 11000) return NextResponse.json({ error: 'A product with this slug already exists.' }, { status: 409 });
    return NextResponse.json({ error: 'Unable to update product. Check the fields and slug.' }, { status: 400 });
  }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await owner(); if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Invalid product ID.' }, { status: 404 });
    await db();
    const p = await Product.findOneAndUpdate(
      { _id: id, archivedAt: { $exists: false } },
      { $set: { published: false, archivedAt: new Date() } },
      { new: true },
    );
    if (!p) {
      const archived = await Product.exists({ _id: id, archivedAt: { $exists: true } });
      return NextResponse.json({ duplicate: Boolean(archived), error: archived ? 'Product is already archived.' : 'Product not found.' }, { status: archived ? 409 : 404 });
    }
    await audit(admin._id, 'product.archive', 'Product', id);
    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath(`/products/${p.slug}`);
    revalidatePath('/admin/products');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unable to archive product.' }, { status: 400 });
  }
}
