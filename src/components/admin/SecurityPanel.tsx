'use client';

import { FormEvent, useEffect, useState } from 'react';

type SecurityInfo = {
  session: { createdAt?: string; expiresAt?: string };
  activeSessions: number;
  events: Array<{ action: string; at: string }>;
};

export default function SecurityPanel() {
  const [info, setInfo] = useState<SecurityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/security', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load security information.');
      setInfo(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load security information.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword'));
    const newPassword = String(form.get('newPassword'));
    if (newPassword !== String(form.get('confirmPassword'))) {
      setError('The new password and confirmation do not match.');
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/admin/security/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to update the password.');
      setMessage('Password changed. Sign in again with your new password.');
      formElement.reset();
      window.setTimeout(() => window.location.assign('/admin/login'), 1300);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update the password.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeOthers() {
    if (!window.confirm('Sign out all other active sessions? Your current session will remain active.')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/security', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to revoke sessions.');
      setMessage(`${result.revoked} other session${result.revoked === 1 ? '' : 's'} signed out.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to revoke sessions.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="security-layout">
    <section className="admin-panel security-panel">
      <div className="admin-panel-head"><div><small>ACCOUNT CREDENTIALS</small><h2>Change password</h2></div></div>
      <p className="security-help">Choose a unique password with at least 16 characters. Changing it signs out every active session.</p>
      <form className="security-password-form" onSubmit={changePassword}>
        <label>Current password<input name="currentPassword" type="password" required autoComplete="current-password" maxLength={256} /></label>
        <label>New password<input name="newPassword" type="password" required minLength={16} maxLength={256} autoComplete="new-password" /></label>
        <label>Confirm new password<input name="confirmPassword" type="password" required minLength={16} maxLength={256} autoComplete="new-password" /></label>
        <button className="admin-primary" disabled={busy}>{busy ? 'Updating…' : 'Change password'}</button>
      </form>
    </section>
    <section className="admin-panel security-panel">
      <div className="admin-panel-head"><div><small>ACTIVE ACCESS</small><h2>Sessions</h2></div></div>
      {loading ? <div className="admin-empty">Loading session information…</div> : error && !info ? <div className="admin-error" role="alert">{error}<button className="admin-secondary" onClick={() => void load()}>Retry</button></div> : <>
        <div className="security-session-row"><span>Active sessions</span><b>{info?.activeSessions ?? 0}</b></div>
        <div className="security-session-row"><span>Current session expires</span><b>{info?.session.expiresAt ? new Date(info.session.expiresAt).toLocaleString() : 'Unavailable'}</b></div>
        <button className="admin-secondary" type="button" disabled={busy || (info?.activeSessions ?? 0) <= 1} onClick={() => void revokeOthers()}>Sign out other sessions</button>
      </>}
    </section>
    <section className="admin-panel security-panel security-events">
      <div className="admin-panel-head"><div><small>SECURITY AUDIT</small><h2>Recent events</h2></div></div>
      {loading ? <div className="admin-empty">Loading activity…</div> : info?.events.length ? <ul className="admin-activity">{info.events.map((event, index) => <li key={`${event.action}-${event.at}-${index}`}><i /><div><b>{event.action.replace(/[._-]/g, ' ')}</b><span>{new Date(event.at).toLocaleString()}</span></div></li>)}</ul> : <div className="admin-empty">No security events recorded yet.</div>}
    </section>
    {(message || (error && info)) && <p className={error ? 'admin-error' : 'admin-success'} role={error ? 'alert' : 'status'}>{error || message}</p>}
  </div>;
}
