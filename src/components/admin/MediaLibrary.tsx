'use client';

import { useEffect, useState } from 'react';

type Asset = { public_id: string; secure_url: string; width: number; height: number; format: string; bytes: number; created_at: string };

export default function MediaLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load(next = '') {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/media${next ? `?cursor=${encodeURIComponent(next)}` : ''}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load images.');
      setAssets(data.resources || []);
      setCursor(next || null);
      setNextCursor(data.nextCursor || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load images.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function remove(asset: Asset) {
    if (!window.confirm(`Permanently delete ${asset.public_id} from Cloudinary?`)) return;
    setBusyId(asset.public_id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicId: asset.public_id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to delete this image.');
      setNotice('Image deleted.');
      await load(cursor || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete this image.');
    } finally {
      setBusyId('');
    }
  }

  return <section className="admin-panel media-library">
    <div className="admin-panel-head"><div><small>CLOUDINARY ASSETS</small><h2>Hanumanji Agro media</h2></div><button className="admin-secondary" onClick={() => void load(cursor || '')} disabled={loading}>Refresh</button></div>
    <p className="media-help">Only assets in the Hanumanji Agro folder are listed. Images currently referenced by a product or category cannot be deleted.</p>
    {error && <p className="admin-error" role="alert">{error} <button className="admin-secondary" onClick={() => void load(cursor || '')}>Retry</button></p>}
    {notice && <p className="admin-success" role="status">{notice}</p>}
    {loading ? <div className="media-grid" aria-label="Loading media">{Array.from({ length: 6 }, (_, i) => <div className="media-skeleton" key={i} />)}</div> : assets.length === 0 ? <div className="admin-empty">No images found in the Hanumanji Agro Cloudinary folder. Upload images from a product or category form.</div> : <div className="media-grid">{assets.map((asset) => <article className="media-card" key={asset.public_id}><img src={asset.secure_url} alt={asset.public_id.split('/').at(-1) || 'Hanumanji Agro media'} loading="lazy" /><div className="media-card-meta"><b title={asset.public_id}>{asset.public_id.split('/').at(-1)}</b><span>{asset.width} × {asset.height} · {asset.format.toUpperCase()} · {(asset.bytes / 1024).toFixed(0)} KB</span><button className="admin-danger" disabled={busyId === asset.public_id} onClick={() => void remove(asset)}>{busyId === asset.public_id ? 'Deleting…' : 'Delete image'}</button></div></article>)}</div>}
    {!loading && assets.length > 0 && <div className="admin-pagination"><span>{cursor ? 'More media' : 'Latest media'}</span><div><button disabled={!cursor || loading} onClick={() => void load()}>First page</button><button disabled={!nextCursor || loading} onClick={() => void load(nextCursor || '')}>Load more</button></div></div>}
  </section>;
}
