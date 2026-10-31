'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { CatalogProduct } from '@/components/public/HomeExperience';
import PublicImage from '@/components/public/PublicImage';

const fallbackImages: Record<string, string> = {
  'fresh-ginger': '/media/ginger-source.jpg',
  'large-black-cardamom': '/media/cardamom-still-life.jpg',
  'dried-ginger-ginger-chips': '/media/ginger-source.jpg',
  turmeric: '/media/ginger-source.jpg',
};

export default function ProductCatalogue({ products }: { products: CatalogProduct[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [added, setAdded] = useState('');
  const categories = ['All', ...Array.from(new Set(products.map((product) => product.category)))];
  const shown = useMemo(() => products.filter((product) =>
    (category === 'All' || product.category === category)
    && `${product.name} ${product.description}`.toLowerCase().includes(query.trim().toLowerCase())), [products, category, query]);

  function add(product: CatalogProduct) {
    let cart: Array<{ product?: CatalogProduct; quantity?: number; unit?: string }> = [];
    try { cart = JSON.parse(localStorage.getItem('ha-cart') || '[]'); } catch { /* Start with an empty enquiry. */ }
    if (!cart.some((item) => item.product?.slug === product.slug)) cart.push({ product, quantity: 1, unit: 'kg' });
    localStorage.setItem('ha-cart', JSON.stringify(cart));
    setAdded(product.name);
    window.setTimeout(() => setAdded(''), 2200);
  }

  return <>
    <div className="catalog-control">
      <label className="catalog-search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" aria-label="Search products" /></label>
      <div className="catalog-filters" role="group" aria-label="Filter product categories">
        {categories.map((item) => <button type="button" key={item} className={category === item ? 'selected' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
    </div>
    {products.length === 0 ? <div className="catalog-empty" role="status">
      <span className="eyebrow-dark">A considered collection</span>
      <h2>Our collection is being updated.</h2>
      <p>Contact us to discuss current regional produce and sourcing availability.</p>
      <Link className="button button-dark" href="/enquiry">Start an enquiry</Link>
    </div> : shown.length === 0 ? <div className="catalog-empty" role="status"><h2>No products match your search.</h2><p>Try another product name or category.</p></div> :
      <div className="catalog-grid" aria-live="polite">
        {shown.map((product, index) => <article className={`catalog-product catalog-product-${index % 4 + 1}`} key={product.slug}>
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
    {added && <div className="catalog-toast" role="status">{added} added to your enquiry list. <Link href="/enquiry">Review enquiry ↗</Link></div>}
  </>;
}
