import { db } from '@/lib/db';
import { Category, Product } from '@/lib/models';
import HomeExperience, { CatalogProduct } from '@/components/public/HomeExperience';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let products: CatalogProduct[] = [];
  let catalogueError = false;
  try {
    await db();
    const visibleCategories = await Category.distinct('name', { published: true });
    const records = visibleCategories.length ? await Product.find({ published: true, archivedAt: { $exists: false }, category: { $in: visibleCategories } }).sort({ featured: -1, name: 1 }).lean() : [];
    products = records.map((product: any) => ({ _id: String(product._id), name: product.name, slug: product.slug, category: product.category, description: product.description, image: product.image, status: product.status, featured: product.featured }));
  } catch {
    catalogueError = true;
  }
  return <HomeExperience products={products} catalogueError={catalogueError} />;
}
