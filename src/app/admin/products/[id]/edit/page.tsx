import { redirect, notFound } from 'next/navigation';
import mongoose from 'mongoose';
import ProductForm from '@/components/admin/ProductForm';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { Product } from '@/lib/models';

export const dynamic = 'force-dynamic';

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  if (!await owner()) redirect('/admin/login');
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();
  await db();
  const p: any = await Product.findOne({ _id: id, archivedAt: { $exists: false } }).lean();
  if (!p) notFound();
  const data = {
    ...p,
    _id: String(p._id),
    specifications: p.specifications && typeof p.specifications === 'object' && !Array.isArray(p.specifications) ? p.specifications : {},
    images: Array.isArray(p.images) ? p.images.slice(0, 10) : p.image ? [p.image] : [],
  };
  if (data.image && data.images[0] !== data.image) data.images = [data.image, ...data.images.filter((image: string) => image !== data.image)].slice(0, 10);
  return <main className="admin-page"><div className="admin-page-heading"><div><small>CATALOGUE MANAGEMENT</small><h1>Edit product</h1><p>{p.name}</p></div></div><div className="admin-panel admin-form-panel"><ProductForm product={data}/></div></main>;
}
