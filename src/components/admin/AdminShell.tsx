'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';

const nav = [
  { title: 'Overview', items: [['Dashboard', '/admin/dashboard', '▦']] },
  { title: 'Catalogue', items: [['Products', '/admin/products', '□'], ['Categories', '/admin/categories', '◇'], ['Media library', '/admin/media', '▧']] },
  { title: 'Relationships', items: [['Enquiries', '/admin/enquiries', '↗'], ['Quotations', '/admin/enquiries?status=Quotation%20Sent', '▤'], ['Suppliers', '/admin/suppliers', '⌂'], ['Customers', '/admin/customers', '◉']] },
  { title: 'Configuration', items: [['Website settings', '/admin/settings', '⚙'], ['Security', '/admin/security', '⌑']] },
] as const;

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (pathname === '/admin/login') return <>{children}</>;

  async function logout() {
    try { await fetch('/api/admin/logout', { method: 'POST' }); } finally {
      router.replace('/admin/login');
      router.refresh();
    }
  }

  const current = pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ') || 'Dashboard';
  return <div className="admin-shell">
    <aside className={`admin-sidebar${open ? ' open' : ''}`}>
      <Link href="/admin/dashboard" className="admin-brand"><img src="/brand-logo.jpg" alt="" /><span>HANUMANJI AGRO<small>OWNER WORKSPACE</small></span></Link>
      <div className="admin-sidebar-scroll">{nav.map((group) => <div className="admin-nav-group" key={group.title}><small>{group.title}</small>{group.items.map(([label, href, icon]) => {
        const target = href.split('?')[0];
        return <Link key={href} href={href} onClick={() => setOpen(false)} className={pathname === target || pathname.startsWith(`${target}/`) ? 'active' : ''}><span aria-hidden="true">{icon}</span>{label}</Link>;
      })}</div>)}</div>
      <button className="admin-logout" onClick={logout}>Sign out <span aria-hidden="true">↗</span></button>
      <Link className="back-to-site" href="/">← View public site</Link>
    </aside>
    {open && <button aria-label="Close admin navigation" className="admin-sidebar-backdrop" onClick={() => setOpen(false)} />}
    <div className="admin-main">
      <header className="admin-topbar"><button className="admin-menu-trigger" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}>☰</button><div><small>OWNER WORKSPACE</small><b>{current}</b></div><Link href="/admin/security" className="admin-topbar-account">Owner account · Security</Link><Link href="/" className="admin-topbar-site">Public site ↗</Link></header>
      <div className="admin-content">{children}</div>
    </div>
  </div>;
}
