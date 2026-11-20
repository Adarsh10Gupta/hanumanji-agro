import { redirect } from 'next/navigation';
import CategoryManager from '@/components/admin/CategoryManager';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { Category } from '@/lib/models';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 100;

export default async function Categories() {
  if (!await owner()) redirect('/admin/login');
  await db();
  const [rows, total] = await Promise.all([
    Category.find().select('name slug description image displayOrder published').sort({ displayOrder: 1, name: 1, _id: 1 }).limit(PAGE_SIZE).lean(),
    Category.countDocuments(),
  ]);
  return <main className="admin-page"><div className="admin-page-heading"><div><small>CATALOGUE STRUCTURE</small><h1>Categories</h1><p>Organise product families used on the public catalogue.</p></div></div><CategoryManager initial={rows.map((category: any) => ({ ...category, _id: String(category._id) }))} total={total} pageSize={PAGE_SIZE} /></main>;
}
