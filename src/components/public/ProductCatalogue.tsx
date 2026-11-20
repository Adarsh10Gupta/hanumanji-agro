'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogProduct } from '@/components/public/HomeExperience';
import PublicImage from '@/components/public/PublicImage';
import { addEnquirySelection, MAX_ENQUIRY_PRODUCTS, normalizeEnquirySelection } from '@/lib/enquiry-selection';

const fallbackImages: Record<string, string> = {
  'fresh-ginger': '/media/ginger-source.jpg',
  'large-black-cardamom': '/media/cardamom-still-life.jpg',
  'dried-ginger-ginger-chips': '/media/ginger-source.jpg',
  turmeric: '/media/ginger-source.jpg',
};

export default function ProductCatalogue({
  products,
  categories,
  total,
  page,
  pages,
  search,
  selectedCategory,
}: {
  products: CatalogProduct[];
  categories: string[];
  total: number;
  page: number;
  pages: number;
  search: string;
  selectedCategory: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [added, setAdded] = useState('');
  const [selectionLimit, setSelectionLimit] = useState(false);
  const category = selectedCategory || 'All';

  useEffect(() => setQuery(search), [search]);
  useEffect(() => {
    if (query === search) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (category !== 'All') params.set('category', category);
      router.replace(`/products${params.size ? `?${params}` : ''}`, { scroll: false });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [category, query, router, search]);

  function chooseCategory(value: string) {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (value !== 'All') params.set('category', value);
    router.push(`/products${params.size ? `?${params}` : ''}`, { scroll: false });
  }

  const paginationHref = (nextPage: number) => {
    const params = new URLSearchParams();
    params.set('page', String(nextPage));
    if (search) params.set('q', search);
    if (selectedCategory) params.set('category', selectedCategory);
    return `/products?${params}`;
  };

  function add(product: CatalogProduct) {
    let cart: Array<{ product?: CatalogProduct; quantity?: number; unit?: string }> = [];
    try { cart = JSON.parse(localStorage.getItem('ha-cart') || '[]'); } catch { /* Start with an empty enquiry. */ }
    const lines = normalizeEnquirySelection(cart.filter((item): item is { product: CatalogProduct; quantity: number; unit: string } => Boolean(item.product?.slug)));
    const result = addEnquirySelection(lines, { product, quantity: 1, unit: 'kg' });
    if (result.limited) {
      setSelectionLimit(true);
      return;
    }
    setSelectionLimit(false);
    localStorage.setItem('ha-cart', JSON.stringify(result.lines));
    setAdded(product.name);
    window.setTimeout(() => setAdded(''), 2200);
  }

  return <>
    <div className="catalog-control">
      <label className="catalog-search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" aria-label="Search products" /></label>
      <div className="catalog-filters" role="group" aria-label="Filter product categories">
        {['All', ...categories].map((item) => <button type="button" key={item} className={category === item ? 'selected' : ''} aria-pressed={category === item} onClick={() => chooseCategory(item)}>{item}</button>)}
      </div>
    </div>
    {total === 0 && (search || selectedCategory) ? <div className="catalog-empty" role="status"><h2>No products match your search.</h2><p>Try another product name or category.</p></div> :
      total === 0 ? <div className="catalog-empty" role="status">
      <span className="eyebrow-dark">A considered collection</span>
      <h2>Our collection is being updated.</h2>
      <p>Contact us to discuss current regional produce and sourcing availability.</p>
      <Link className="button button-dark" href="/enquiry">Start an enquiry</Link>
    </div> :
      <div className="catalog-grid" aria-live="polite">
        {products.map((product, index) => <article className={`catalog-product catalog-product-${index % 4 + 1}`} key={product.slug}>
          <Link href={`/products/${product.slug}`} className="catalog-product-image">
            <PublicImage src={product.image} fallback={fallbackImages[product.slug] || '/media/botanical-still-life.jpg'} alt={`${product.name}, illustrative product photograph`} />
            <span>View product <b aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 16 16 4M6 4h10v10" /></svg></b></span>
          </Link>
          <div className="catalog-product-info">
            <div><small>{product.category}</small><span className={`availability ${product.status === 'available' ? 'available' : ''}`}><i />{product.status === 'available' ? 'Available' : 'Enquire for season'}</span></div>
            <h2><Link href={`/products/${product.slug}`}>{product.name}</Link></h2>
            <p>{product.description}</p>
            <button className="catalog-add" type="button" onClick={() => add(product)}>Add to enquiry <span>+</span></button>
          </div>
        </article>)}
      </div>}
    {pages > 1 && <nav className="admin-pagination" aria-label="Product pages">
      <Link aria-disabled={page <= 1} href={paginationHref(Math.max(1, page - 1))}>Previous</Link>
      <span>Page {page} of {pages} · {total} products</span>
      <Link aria-disabled={page >= pages} href={paginationHref(Math.min(pages, page + 1))}>Next</Link>
    </nav>}
    {selectionLimit && <div className="catalog-toast" role="status">You can select up to {MAX_ENQUIRY_PRODUCTS} different products.</div>}
    {added && <div className="catalog-toast" role="status">{added} added to your enquiry list. <Link href="/enquiry">Review enquiry ↗</Link></div>}
  </>;
}
