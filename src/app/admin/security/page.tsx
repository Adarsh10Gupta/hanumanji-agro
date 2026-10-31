import { redirect } from 'next/navigation';
import { owner } from '@/lib/auth';
import SecurityPanel from '@/components/admin/SecurityPanel';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  if (!await owner()) redirect('/admin/login');
  return <main className="admin-page">
    <div className="admin-page-heading"><div><small>OWNER ACCESS</small><h1>Security</h1><p>Review account sessions and keep your sign-in credentials current.</p></div></div>
    <SecurityPanel />
  </main>;
}
