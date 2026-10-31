export default function AdminLoading() {
  return <main className="admin-content" aria-busy="true" aria-label="Loading owner workspace"><div className="admin-page-heading"><div><small>OWNER WORKSPACE</small><h1>Loading…</h1></div></div><div className="admin-metrics">{Array.from({ length: 4 }, (_, index) => <div className="admin-metric admin-metric-skeleton" key={index}><span /><strong /><i /></div>)}</div><div className="admin-panel admin-loading-panel" /></main>;
}
