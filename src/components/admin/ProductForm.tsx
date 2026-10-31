'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type ProductDraft = {
  _id?: string; name?: string; slug?: string; category?: string; description?: string;
  shortDescription?: string; fullDescription?: string; images?: string[]; image?: string;
  specifications?: Record<string, string>; grade?: string; unit?: string;
  minOrderQuantity?: number; status?: string; published?: boolean; featured?: boolean;
  seoTitle?: string; seoDescription?: string;
};

export default function ProductForm({ product }: { product?: ProductDraft }) {
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [images, setImages] = useState<string[]>(product?.images?.length ? product.images : product?.image ? [product.image] : []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [specText, setSpecText] = useState(JSON.stringify(product?.specifications || {}, null, 2));

  useEffect(() => {
    fetch('/api/admin/categories')
      .then(async (response) => { if (!response.ok) throw new Error('Unable to load categories.'); return response.json(); })
      .then(setCategories)
      .catch(() => setError('Categories could not be loaded. Retry the page or create a category first.'));
  }, []);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    for (const file of Array.from(files)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        setError('Choose JPEG, PNG or WebP images up to 5 MB.');
        continue;
      }
      const body = new FormData();
      body.append('file', file);
      body.append('kind', 'product');
      try {
        const response = await fetch('/api/admin/uploads', { method: 'POST', body });
        const result = await response.json();
        if (!response.ok) { setError(result.error || 'Image upload failed.'); break; }
        setImages((current) => [...current, result.url].slice(0, 10));
      } catch {
        setError('Image upload failed. Check the Cloudinary setup.');
        break;
      }
    }
    setUploading(false);
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    let specifications: Record<string, string>;
    try {
      specifications = JSON.parse(specText || '{}');
      if (!specifications || Array.isArray(specifications) || typeof specifications !== 'object') throw new Error();
    } catch {
      setError('Specifications must be a JSON object of labels and values.');
      setBusy(false);
      return;
    }
    const payload = {
      name: String(form.get('name')), slug: String(form.get('slug')), category: String(form.get('category')),
      description: String(form.get('description')), shortDescription: String(form.get('shortDescription') || ''),
      fullDescription: String(form.get('fullDescription') || ''), images, image: images[0] || '', specifications,
      grade: String(form.get('grade') || ''), unit: String(form.get('unit') || 'kg'),
      minOrderQuantity: form.get('minOrderQuantity') ? Number(form.get('minOrderQuantity')) : undefined,
      status: String(form.get('status')), published: form.get('published') === 'on', featured: form.get('featured') === 'on',
      seoTitle: String(form.get('seoTitle') || ''), seoDescription: String(form.get('seoDescription') || ''),
    };
    try {
      const response = await fetch(product ? `/api/admin/products/${product._id}` : '/api/admin/products', {
        method: product ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save product.');
      router.push('/admin/products');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save product.');
    } finally {
      setBusy(false);
    }
  }

  return <form className="product-admin-form" onSubmit={save}>
    <div className="admin-form-grid">
      <label>Product name<input name="name" defaultValue={product?.name} required maxLength={150} /></label>
      <label>URL slug<input name="slug" defaultValue={product?.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><small>Lowercase words separated by hyphens.</small></label>
      <label>Category<select name="category" defaultValue={product?.category || ''} required><option value="" disabled>Select category</option>{categories.map((category) => <option key={category._id} value={category.name}>{category.name}</option>)}</select>{categories.length === 0 && <small><a href="/admin/categories">Create a category first.</a></small>}</label>
      <label>Availability<select name="status" defaultValue={product?.status || 'seasonal'}><option value="available">Available</option><option value="seasonal">Seasonal / confirm</option><option value="unavailable">Unavailable</option></select></label>
    </div>
    <label>Short description<input name="shortDescription" defaultValue={product?.shortDescription || product?.description} maxLength={300} /></label>
    <label>Catalogue description<textarea name="description" defaultValue={product?.description} required maxLength={2000} /></label>
    <label>Full product information<textarea name="fullDescription" defaultValue={product?.fullDescription} maxLength={8000} /></label>
    <div className="admin-form-grid"><label>Grade<input name="grade" defaultValue={product?.grade} /></label><label>Unit<input name="unit" defaultValue={product?.unit || 'kg'} maxLength={24} /></label><label>Minimum enquiry quantity<input name="minOrderQuantity" type="number" min="0.01" step="any" defaultValue={product?.minOrderQuantity} /></label></div>
    <label>Specifications (JSON)<textarea className="spec-json" value={specText} onChange={(event) => setSpecText(event.target.value)} spellCheck={false} /></label>
    <section className="admin-upload-box"><div><b>Product images</b><small>JPEG, PNG or WebP · up to 5 MB each · max 10 images</small></div>
      <label className="admin-upload-button">{uploading ? 'Uploading…' : 'Upload images'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { void upload(event.target.files); event.currentTarget.value = ''; }} disabled={uploading || images.length >= 10} /></label>
      <div className="admin-image-list">{images.map((url, index) => <div key={url}><img src={url} alt={`Product image ${index + 1}`} /><div className="admin-image-actions"><button type="button" aria-label={`Move image ${index + 1} earlier`} disabled={index === 0} onClick={() => moveImage(index, -1)}>↑</button><button type="button" aria-label={`Move image ${index + 1} later`} disabled={index === images.length - 1} onClick={() => moveImage(index, 1)}>↓</button><button type="button" onClick={() => setImages((current) => current.filter((image) => image !== url))}>Remove</button></div></div>)}</div>
    </section>
    <div className="admin-form-grid"><label>SEO title<input name="seoTitle" defaultValue={product?.seoTitle} maxLength={160} /></label><label>SEO description<input name="seoDescription" defaultValue={product?.seoDescription} maxLength={320} /></label></div>
    <div className="admin-checks"><label><input name="published" type="checkbox" defaultChecked={product?.published ?? false} /> Published on the public catalogue</label><label><input name="featured" type="checkbox" defaultChecked={product?.featured} /> Feature on the homepage</label></div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-form-actions"><button className="admin-primary" disabled={busy || uploading}>{busy ? 'Saving…' : product ? 'Save product' : 'Create product'}</button><a className="admin-secondary" href="/admin/products">Cancel</a></div>
  </form>;
}
