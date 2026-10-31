'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

export default function CustomerManager() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('All');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ search, type, page: String(page), limit: '20' });
      const response = await fetch(`/api/admin/customers?${query}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load customers.');
      setRows(data.rows || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load customers.');
    } finally { setLoading(false); }
  }, [search, type, page]);

  useEffect(() => { void load(); }, [load]);

  async function open(customer: any) {
    setActive(customer);
    setError('');
    try {
      const response = await fetch(`/api/admin/customers/${customer._id}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load enquiry history.');
      setActive(data.customer);
      setHistory(data.enquiries || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load enquiry history.'); }
  }

  return <div className="customer-manager"><section className="admin-panel">
    <div className="admin-toolbar"><label className="admin-search">⌕<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, phone, email or company" /></label><select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} aria-label="Filter customer type"><option>All</option><option>Business</option><option>Individual</option></select><span>{total} customers</span></div>
    {error && <p className="admin-error" role="alert">{error} <button className="admin-secondary" onClick={() => void load()}>Retry</button></p>}
    {loading ? <div className="admin-empty">Loading customers…</div> : rows.length === 0 ? <div className="admin-empty">Customer records appear when an enquiry is submitted.</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>Company</th><th>Type</th><th>Enquiries</th><th>Last enquiry</th></tr></thead><tbody>{rows.map((customer) => <tr key={customer._id} onClick={() => void open(customer)} className="clickable-row"><td><button className="table-link">{customer.name}</button></td><td>{customer.phone}</td><td>{customer.email || '—'}</td><td>{customer.company || '—'}</td><td>{customer.type || '—'}</td><td>{customer.enquiryCount}</td><td>{customer.lastEnquiryAt ? new Date(customer.lastEnquiryAt).toLocaleDateString('en-IN') : '—'}</td></tr>)}</tbody></table></div>}
    <div className="admin-pagination"><span>{total} customers</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>
  </section>
  {active && <section className="admin-panel customer-history"><div className="admin-panel-head"><div><small>CUSTOMER HISTORY</small><h2>{active.name}</h2></div><button className="admin-secondary" onClick={() => setActive(null)}>Close</button></div><p>{active.phone} · {active.email || 'No email'} · {active.company || 'Individual'}</p>{history.length === 0 ? <div className="admin-empty">No enquiry history.</div> : history.map((enquiry) => <Link href={`/admin/enquiries/${enquiry._id}`} className="history-row" key={enquiry._id}><span>{enquiry.reference}</span><span>{enquiry.enquiryType}</span><span>{enquiry.status}</span><span>{new Date(enquiry.createdAt).toLocaleDateString('en-IN')}</span></Link>)}</section>}
  </div>;
}
