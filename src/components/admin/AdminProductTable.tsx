'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminProductTable({
  products,
  total,
  page,
  pages,
  search,
}: {
  products: any[];
  total: number;
  page: number;
  pages: number;
  search: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [rows, setRows] = useState(products);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setQuery(search), [search]);
  useEffect(() => setRows(products), [products]);
  useEffect(() => {
    if (query === search) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      router.replace(`/admin/products${params.size ? `?${params}` : ''}`, { scroll: false });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, router, search]);

  function navigate(nextPage: number) {
    const params = new URLSearchParams();
    params.set('page', String(nextPage));
    if (search) params.set('q', search);
    router.push(`/admin/products?${params}`, { scroll: false });
  }

  async function toggle(product: any) {
    if (busyId) return;
    setBusyId(product._id);
    setMessage('');
    try {
    const response = await fetch(`/api/admin/products/${product._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !product.published }),
    });
    if (response.ok) {
      setRows((current) => current.map((row) => row._id === product._id ? { ...row, published: !product.published } : row));
      setMessage('Product visibility updated.');
    } else {
      const result = await response.json().catch(() => null);
      setMessage(result?.error || 'Could not update product.');
    }
    } catch {
      setMessage('Network error. Product visibility could not be updated.');
    } finally {
      setBusyId(null);
    }
  }

  async function archive(product: any) {
    if (!window.confirm(`Archive “${product.name}”?`)) return;
    if (busyId) return;
    setBusyId(product._id);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/products/${product._id}`, { method: 'DELETE' });
      if (response.ok) {
        setRows((current) => current.filter((row) => row._id !== product._id));
        setMessage('Product archived.');
        const remainingPageCount = Math.max(1, Math.ceil((total - 1) / 100));
        const nextPage = page > remainingPageCount ? remainingPageCount : page;
        const params = new URLSearchParams();
        if (nextPage > 1) params.set('page', String(nextPage));
        if (search) params.set('q', search);
        router.replace(`/admin/products${params.size ? `?${params}` : ''}`);
        router.refresh();
      } else {
        const result = await response.json().catch(() => null);
        setMessage(result?.error || 'Could not archive product.');
      }
    } catch {
      setMessage('Network error. Product could not be archived.');
    } finally {
      setBusyId(null);
    }
  }

  return <>
    <div className="admin-toolbar">
      <label className="admin-search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" /></label>
      <span>{total} products</span>
    </div>
    {message && <p className="admin-feedback" role="status">{message}</p>}
    {!rows.length ? <div className="admin-empty">{search ? 'No products match the search.' : 'No products yet. Add your first product.'}</div> :
      <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Product</th><th>Category</th><th>Availability</th><th>Public status</th><th>Updated</th><th /></tr></thead>
        <tbody>{rows.map((product) => <tr key={product._id}>
          <td><div className="admin-product-cell"><img src={product.image || '/media/botanical-still-life.jpg'} alt="" /><div><b>{product.name}</b><small>/{product.slug}</small></div></div></td>
          <td>{product.category}</td><td>{product.status}</td>
          <td><button className={`admin-toggle ${product.published ? 'on' : ''}`} disabled={busyId === product._id} onClick={() => void toggle(product)}>{busyId === product._id ? 'Saving…' : product.published ? 'Published' : 'Draft'}</button></td>
          <td>{new Date(product.updatedAt).toLocaleDateString('en-IN')}</td>
          <td><div className="admin-row-actions"><Link href={`/admin/products/${product._id}/edit`}>Edit</Link><button disabled={busyId === product._id} onClick={() => void archive(product)}>{busyId === product._id ? 'Archiving…' : 'Archive'}</button></div></td>
        </tr>)}</tbody>
      </table></div>}
    {pages > 1 && <div className="admin-pagination">
      <span>{total} products</span>
      <div><button disabled={page <= 1} onClick={() => navigate(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => navigate(page + 1)}>Next</button></div>
    </div>}
  </>;
}
