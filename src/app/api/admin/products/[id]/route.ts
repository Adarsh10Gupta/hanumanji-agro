import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { Category, Product } from '@/lib/models';
import { audit, sameOrigin, tooLarge } from '@/lib/security';

const fields = z.object({ name: z.string().trim().min(2).max(150).optional(), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).optional(), category: z.string().trim().min(2).max(100).optional(), description: z.string().trim().min(2).max(2000).optional(), shortDescription: z.string().max(300).optional(), fullDescription: z.string().max(8000).optional(), image: z.string().url().optional().or(z.literal('')), images: z.array(z.string().url()).max(10).optional(), specifications: z.record(z.string(), z.string().max(300)).optional(), grade: z.string().max(100).optional(), unit: z.string().max(24).optional(), minOrderQuantity: z.number().positive().max(1e9).optional(), status: z.enum(['available', 'seasonal', 'unavailable']).optional(), published: z.boolean().optional(), featured: z.boolean().optional(), seoTitle: z.string().max(160).optional(), seoDescription: z.string().max(320).optional() });
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await owner(); if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const tooBig = tooLarge(req, 48 * 1024); if (tooBig) return tooBig; if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  try { const d = fields.parse(await req.json()); const { id } = await params; await db(); const p = await Product.findById(id); if (!p) return NextResponse.json({ error: 'Product not found.' }, { status: 404 }); const nextCategory = d.category || p.category; const category = await Category.findOne({ name: nextCategory }); if (!category || (d.published === true && !category.published)) return NextResponse.json({ error: 'Choose a category that is available for the selected publication state.' }, { status: 400 }); const next = { ...d, ...(d.images ? { image: d.images[0] || '' } : {}) }; Object.assign(p, next); await p.save(); await audit(admin._id, 'product.update', 'Product', id); revalidatePath('/'); revalidatePath('/products'); revalidatePath(`/products/${p.slug}`); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: 'Unable to update product. Check the fields and slug.' }, { status: 400 }); }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await owner(); if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  try { const { id } = await params; await db(); const p = await Product.findByIdAndUpdate(id, { $set: { published: false, archivedAt: new Date() } }, { new: true }); if (!p) return NextResponse.json({ error: 'Product not found.' }, { status: 404 }); await audit(admin._id, 'product.archive', 'Product', id); revalidatePath('/'); revalidatePath('/products'); revalidatePath(`/products/${p.slug}`); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: 'Unable to archive product.' }, { status: 400 }); }
}
