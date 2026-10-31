import { redirect } from 'next/navigation';
import MediaLibrary from '@/components/admin/MediaLibrary';
import { owner } from '@/lib/auth';

export default async function MediaPage() {
  if (!await owner()) redirect('/admin/login');
  return <main className="admin-page"><div className="admin-page-heading"><div><small>IMAGE ASSETS</small><h1>Media library</h1><p>Browse and safely remove unused Cloudinary uploads.</p></div></div><MediaLibrary /></main>;
}
