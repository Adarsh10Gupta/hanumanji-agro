import { redirect } from 'next/navigation';
import Link from 'next/link';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { AuditLog, Enquiry, Product, SupplierEnquiry } from '@/lib/models';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  if (!await owner()) redirect('/admin/login');
  await db();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  monthStart.setMonth(monthStart.getMonth() - 11);
  const [productCount, publishedCount, enquiryCount, newCount, pendingQuotes, accepted, completed, suppliers, recent, activity, statusRows, monthlyRows] = await Promise.all([
    Product.countDocuments({ archivedAt: { $exists: false } }),
    Product.countDocuments({ published: true, archivedAt: { $exists: false } }),
    Enquiry.countDocuments(),
    Enquiry.countDocuments({ status: 'New' }),
    Enquiry.countDocuments({ $or: [{ enquiryType: 'Quotation', status: { $in: ['New', 'Contacted'] } }, { 'quotation.lines.0': { $exists: true }, 'quotation.sentAt': { $exists: false } }] }),
    Enquiry.countDocuments({ status: 'Accepted' }),
    Enquiry.countDocuments({ status: 'Completed' }),
    SupplierEnquiry.countDocuments(),
    Enquiry.find().sort({ createdAt: -1 }).limit(6).lean(),
    AuditLog.find().sort({ at: -1 }).limit(6).select('action entity at').lean(),
    Enquiry.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Enquiry.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const monthCounts = new Map(monthlyRows.map((row: any) => [row._id, row.count]));
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth() + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { label: date.toLocaleDateString('en', { month: 'short' }), count: monthCounts.get(key) || 0 };
  });
  const maxMonth = Math.max(1, ...monthly.map((item) => item.count));
  const maxStatus = Math.max(1, ...statusRows.map((item: any) => item.count));
  const metrics = [
    ['Products', productCount, '/admin/products'], ['Published products', publishedCount, '/admin/products'],
    ['Total enquiries', enquiryCount, '/admin/enquiries'], ['New enquiries', newCount, '/admin/enquiries?status=New'],
    ['Pending quotations', pendingQuotes, '/admin/enquiries?status=New'], ['Accepted quotations', accepted, '/admin/enquiries?status=Accepted'],
    ['Completed', completed, '/admin/enquiries?status=Completed'], ['Supplier leads', suppliers, '/admin/suppliers'],
  ];

  return <main className="admin-page">
    <div className="admin-page-heading"><div><small>BUSINESS OVERVIEW</small><h1>Dashboard</h1><p>Live activity from your Hanumanji Agro workspace.</p></div><Link className="admin-primary" href="/admin/products/new">+ Add product</Link></div>
    <section className="admin-metrics">{metrics.map(([label, count, href]) => <Link className="admin-metric" href={String(href)} key={String(label)}><span>{label}</span><strong>{count}</strong><i>View →</i></Link>)}</section>
    <div className="admin-dashboard-lower">
      <section className="admin-panel"><div className="admin-panel-head"><div><small>INCOMING</small><h2>Recent enquiries</h2></div><Link href="/admin/enquiries">View all →</Link></div>
        {recent.length === 0 ? <div className="admin-empty">No enquiries yet. New customer requests will appear here.</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Reference</th><th>Customer</th><th>Type</th><th>Status</th><th>Received</th></tr></thead><tbody>{recent.map((item: any) => <tr key={String(item._id)}><td><Link href={`/admin/enquiries/${item._id}`}>{item.reference}</Link></td><td>{item.customerSnapshot?.name || '—'}</td><td>{item.enquiryType}</td><td><span className={`status-pill status-${String(item.status).toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span></td><td>{new Date(item.createdAt).toLocaleDateString('en-IN')}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="admin-panel"><div className="admin-panel-head"><div><small>AUDIT TRAIL</small><h2>Recent activity</h2></div><span className="admin-live-dot">Live</span></div>
        {activity.length === 0 ? <div className="admin-empty">Admin changes will appear here.</div> : <ul className="admin-activity">{activity.map((entry: any) => <li key={String(entry._id)}><i /><div><b>{String(entry.action || 'Updated').replace(/[._]/g, ' ')}</b><span>{entry.entity} · {new Date(entry.at).toLocaleString('en-IN')}</span></div></li>)}</ul>}
      </section>
    </div>
    <div className="admin-dashboard-lower dashboard-analytics">
      <section className="admin-panel"><div className="admin-panel-head"><div><small>ACTUAL HISTORICAL RECORDS</small><h2>Enquiries by month</h2></div></div><div className="dashboard-month-chart" role="img" aria-label={`Monthly enquiry counts: ${monthly.map((item) => `${item.label} ${item.count}`).join(', ')}`}>{monthly.map((item) => <div key={item.label}><span>{item.count}</span><i style={{ height: `${Math.max(4, item.count / maxMonth * 100)}%` }} /><small>{item.label}</small></div>)}</div></section>
      <section className="admin-panel"><div className="admin-panel-head"><div><small>LIVE WORKFLOW</small><h2>Status distribution</h2></div></div>{statusRows.length === 0 ? <div className="admin-empty">Status data appears when enquiries arrive.</div> : <div className="dashboard-status-list">{statusRows.map((row: any) => <div key={row._id}><span>{row._id || 'Unassigned'}</span><i><b style={{ width: `${row.count / maxStatus * 100}%` }} /></i><strong>{row.count}</strong></div>)}</div>}</section>
    </div>
  </main>;
}
