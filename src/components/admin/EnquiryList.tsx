'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const statuses = ['All', 'New', 'Contacted', 'Quotation Sent', 'Accepted', 'Processing', 'Dispatched', 'Completed', 'Rejected', 'Cancelled'];

export default function EnquiryList() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const initialStatus = new URLSearchParams(window.location.search).get('status');
    if (initialStatus && statuses.includes(initialStatus)) setStatus(initialStatus);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ search, status, page: String(page), limit: '20', from, to });
      const response = await fetch(`/api/admin/enquiries?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load enquiries.');
      setRows(data.rows || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load enquiries.');
    } finally {
      setLoading(false);
    }
  }, [search, status, page, from, to]);

  useEffect(() => { void load(); }, [load]);

  function exportCsv() {
    const query = new URLSearchParams({ search, status, from, to, format: 'csv' });
    window.location.assign(`/api/admin/enquiries?${query}`);
  }

  return <section className="admin-panel">
    <div className="admin-toolbar">
      <label className="admin-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search reference, customer or phone" /></label>
      <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter status">{statuses.map((item) => <option key={item}>{item}</option>)}</select>
      <label>From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
      <label>To<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
      <button className="admin-secondary" onClick={exportCsv}>Export CSV ↓</button>
    </div>
    {error && <p className="admin-error" role="alert">{error} <button className="admin-secondary" onClick={() => void load()}>Retry</button></p>}
    {loading ? <div className="admin-empty">Loading enquiries…</div> : rows.length === 0 ? <div className="admin-empty">No enquiries match these filters.</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Enquiry ID</th><th>Customer</th><th>Phone</th><th>Type</th><th>Products</th><th>Date</th><th>Status</th><th /></tr></thead><tbody>{rows.map((item) => <tr key={item._id}>
      <td><Link href={`/admin/enquiries/${item._id}`}>{item.reference}</Link></td><td>{item.customerSnapshot?.name || '—'}</td><td><a href={`tel:${item.customerSnapshot?.phone}`}>{item.customerSnapshot?.phone}</a></td><td>{item.enquiryType}</td><td>{item.items?.length ? item.items.map((line: any) => `${line.snapshot?.name || 'Product'} · ${line.quantity} ${line.unit}`).join(', ') : '—'}</td><td>{new Date(item.createdAt).toLocaleDateString('en-IN')}</td><td><span className={`status-pill status-${String(item.status).toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span></td><td><Link href={`/admin/enquiries/${item._id}`}>Open →</Link></td>
    </tr>)}</tbody></table></div>}
    <div className="admin-pagination"><span>{total} enquiries</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, pages)}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>
  </section>;
}
