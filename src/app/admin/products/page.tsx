import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminProductTable from '@/components/admin/AdminProductTable';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { Product } from '@/lib/models';
import { ADMIN_PRODUCT_PAGE_SIZE, escapeRegex, pageCount, parsePageNumber } from '@/lib/catalog-pagination';

export const dynamic = 'force-dynamic';

export default async function ProductsAdmin({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  if (!await owner()) redirect('/admin/login');
  const params = await searchParams;
  const requestedPage = parsePageNumber(params.page) || 1;
  const search = (params.q || '').trim().slice(0, 100);
  const filter: Record<string, unknown> = { archivedAt: { $exists: false } };
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: expression }, { slug: expression }, { category: expression }];
  }
  await db();
  const total = await Product.countDocuments(filter);
  const pages = Math.max(1, pageCount(total, ADMIN_PRODUCT_PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const rows = await Product.find(filter)
    .select('name slug category image status published updatedAt')
    .sort({ updatedAt: -1, _id: -1 })
    .skip((page - 1) * ADMIN_PRODUCT_PAGE_SIZE)
    .limit(ADMIN_PRODUCT_PAGE_SIZE)
    .lean();
  const products = rows.map((product: any) => ({ ...product, _id: String(product._id) }));

  return <main className="admin-page">
    <div className="admin-page-heading">
      <div><small>CATALOGUE MANAGEMENT</small><h1>Products</h1><p>Create, update and publish the public catalogue.</p></div>
      <Link className="admin-primary" href="/admin/products/new">+ Add product</Link>
    </div>
    <section className="admin-panel">
      <AdminProductTable products={products} total={total} page={page} pages={pages} search={search} />
    </section>
  </main>;
}
