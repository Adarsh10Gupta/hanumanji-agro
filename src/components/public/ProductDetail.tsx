'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CatalogProduct } from './HomeExperience';
import PublicImage from './PublicImage';
import { phoneDigits, usePublicSettings } from '@/lib/use-public-settings';

type Detail = {
  _id: string; name: string; slug: string; category: string; description: string;
  shortDescription?: string; fullDescription?: string; image?: string; images?: string[];
  specifications?: Record<string, string>; grade?: string; unit?: string;
  minOrderQuantity?: number; status: string;
};

export default function ProductDetail({ product, related }: { product: Detail; related: CatalogProduct[] }) {
  const gallery = [...new Set([product.image, ...(product.images || [])].filter((image): image is string => Boolean(image)))];
  const [image, setImage] = useState(gallery[0] || '/media/botanical-still-life.jpg');
  const [quantity, setQuantity] = useState(product.minOrderQuantity || 1);
  const [notice, setNotice] = useState('');
  const settings = usePublicSettings();
  const businessWhatsApp = phoneDigits(settings.whatsapp);

  function add() {
    let cart: Array<{ product?: Detail; quantity?: number; unit?: string }> = [];
    try { cart = JSON.parse(localStorage.getItem('ha-cart') || '[]'); } catch { /* Start with an empty enquiry. */ }
    const existing = cart.find((line) => line.product?.slug === product.slug);
    if (existing) existing.quantity = (existing.quantity || 0) + quantity;
    else cart.push({ product, quantity, unit: product.unit || 'kg' });
    localStorage.setItem('ha-cart', JSON.stringify(cart));
    setNotice('Added to your enquiry.');
  }

  return <main className="product-detail-page">
    <div className="product-breadcrumb"><Link href="/products">PRODUCTS</Link><span>/</span><span>{product.category.toUpperCase()}</span></div>
    <section className="product-detail-grid">
      <div className="product-gallery">
        <div className="product-detail-image"><PublicImage src={image} fallback="/media/botanical-still-life.jpg" alt={`${product.name}, illustrative product image`} loading="eager" /><span>ILLUSTRATIVE PRODUCT IMAGE</span></div>
        {gallery.length > 1 && <div className="gallery-thumbs">{gallery.map((src, index) => <button className={image === src ? 'active' : ''} key={src} onClick={() => setImage(src)} aria-label={`Show image ${index + 1}`}><PublicImage src={src} fallback="/media/botanical-still-life.jpg" alt="" /></button>)}</div>}
      </div>
      <div className="product-detail-copy">
        <small>{product.category} · PRODUCT NOTE</small>
        <h1>{product.name}</h1>
        <p className="detail-lead">{product.shortDescription || product.description}</p>
        <div className="detail-availability"><i />{product.status === 'available' ? 'Currently available — confirm by enquiry' : 'Seasonal availability — please enquire'}</div>
        <div className="detail-specs">
          <div><span>Category</span><b>{product.category}</b></div>
          {product.grade && <div><span>Grade</span><b>{product.grade}</b></div>}
          <div><span>Unit</span><b>{product.unit || 'To be confirmed'}</b></div>
          {product.minOrderQuantity && <div><span>Minimum enquiry quantity</span><b>{product.minOrderQuantity} {product.unit || 'kg'}</b></div>}
          {Object.entries(product.specifications || {}).map(([key, value]) => <div key={key}><span>{key}</span><b>{value}</b></div>)}
        </div>
        <div className="detail-order"><label>Enquiry quantity <span><input type="number" min={product.minOrderQuantity || 0.1} step="any" value={quantity} onChange={(event) => setQuantity(Math.max(product.minOrderQuantity || 0.1, Number(event.target.value) || 0))} /><select value={product.unit || 'kg'} aria-label="Quantity unit" disabled><option>{product.unit || 'kg'}</option></select></span></label><button className="button button-dark" onClick={add}>Add to enquiry <span>+</span></button></div>
        <p className="detail-quote-note">Pricing is quotation based. Specification, availability, packaging and delivery are confirmed directly.</p>
        {businessWhatsApp && <a className="detail-whatsapp" href={`https://wa.me/${businessWhatsApp}?text=${encodeURIComponent(`Hello ${settings.businessName}, I am enquiring about ${product.name}.`)}`}>Ask about this product on WhatsApp ↗</a>}
        {notice && <p className="detail-notice" role="status">{notice} <Link href="/enquiry">Review enquiry →</Link></p>}
      </div>
    </section>
    {product.fullDescription && <section className="product-story"><small>ABOUT THIS PRODUCT</small><p>{product.fullDescription}</p></section>}
    {related.length > 0 && <section className="related-products"><div><small>CONTINUE EXPLORING</small><h2>Related <i>products.</i></h2></div><div className="related-grid">{related.map((item) => <Link key={item.slug} href={`/products/${item.slug}`}><PublicImage src={item.image} fallback="/media/botanical-still-life.jpg" alt={`${item.name}, illustrative product image`} /><small>{item.category}</small><b>{item.name}</b></Link>)}</div></section>}
  </main>;
}
