'use client';

import { useCallback, useEffect, useState } from 'react';

const statuses = ['All', 'New', 'Contacted', 'Reviewing', 'Approved', 'Declined'];

export default function SupplierManager() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ search, status, page: String(page), limit: '20' });
      const response = await fetch(`/api/admin/suppliers?${query}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load supplier submissions.');
      setRows(data.rows || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load supplier submissions.'); }
    finally { setLoading(false); }
  }, [search, status, page]);

  useEffect(() => { void load(); }, [load]);

  async function update(supplier: any) {
    setError('');
    setMessage('');
    const response = await fetch(`/api/admin/suppliers/${supplier._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: supplier.status, notes: supplier.notes || '' }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || 'Could not update supplier.');
    else setMessage('Supplier record updated.');
  }

  async function retryNotification(supplier: any) {
    const response = await fetch(`/api/admin/suppliers/${supplier._id}/retry-notification`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) setError(data.error || 'Could not retry the supplier notification.');
    else setMessage(data.status === 'sent' ? 'Owner email notification accepted by the provider.' : 'Notification remains pending; check the Resend configuration.');
    void load();
  }

  return <section className="admin-panel"><div className="admin-toolbar"><label className="admin-search">⌕<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, product or location" /></label><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter supplier status">{statuses.map((item) => <option key={item}>{item}</option>)}</select><span>{total} submissions</span></div>
    {error && <p className="admin-error" role="alert">{error} <button className="admin-secondary" onClick={() => void load()}>Retry</button></p>}{message && <p className="admin-feedback" role="status">{message}</p>}
    {loading ? <div className="admin-empty">Loading supplier enquiries…</div> : rows.length === 0 ? <div className="admin-empty">No supplier enquiries match these filters.</div> : <div className="supplier-cards">{rows.map((supplier) => <article className="supplier-card" key={supplier._id}><div className="supplier-card-head"><div><small>{new Date(supplier.createdAt).toLocaleDateString('en-IN')}</small><h2>{supplier.name}</h2></div><span className="status-pill">{supplier.status}</span></div><div className="supplier-facts"><span>PRODUCT</span><b>{supplier.product}</b><span>PHONE</span><a href={`tel:${supplier.phone}`}>{supplier.phone}</a>{supplier.email && <><span>EMAIL</span><a href={`mailto:${supplier.email}`}>{supplier.email}</a></>}<span>LOCATION</span><b>{supplier.location}</b><span>QUANTITY</span><b>{supplier.quantity || 'Not specified'}</b><span>AVAILABILITY</span><b>{supplier.period || 'Not specified'}</b></div>{supplier.description && <p className="supplier-description">{supplier.description}</p>}<div className="supplier-manage"><label>Status<select value={supplier.status} onChange={(event) => setRows((current) => current.map((row) => row._id === supplier._id ? { ...row, status: event.target.value } : row))}>{statuses.filter((item) => item !== 'All').map((item) => <option key={item}>{item}</option>)}</select></label><label>Internal notes<textarea value={supplier.notes || ''} onChange={(event) => setRows((current) => current.map((row) => row._id === supplier._id ? { ...row, notes: event.target.value } : row))} /></label><div><a href={`https://wa.me/${String(supplier.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${supplier.name}, following up on your produce enquiry to Hanumanji Agro.`)}`} target="_blank" rel="noreferrer">WhatsApp supplier ↗</a><button className="admin-primary" onClick={() => void update(supplier)}>Save</button>{supplier.notificationStatus !== 'sent' && <button className="admin-secondary" onClick={() => void retryNotification(supplier)}>Retry owner email</button>}</div></div></article>)}</div>}
    <div className="admin-pagination"><span>{total} submissions</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>
  </section>;
}
