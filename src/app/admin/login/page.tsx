'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('expired') === '1') setNotice('Your session expired. Sign in again to continue.');
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error || 'Unable to sign in. Check your details and try again.');
        return;
      }
      window.location.assign('/admin/dashboard');
    } catch {
      setError('Sign in is temporarily unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="owner-login">
    <section className="owner-login-story" aria-label="Hanumanji Agro">
      <Link href="/" className="owner-login-brand"><img src="/brand-logo.jpg" alt="Hanumanji Agro logo" /><span>HANUMANJI AGRO<small>ROOTED IN NATURE</small></span></Link>
      <div className="owner-login-story-copy"><small>PRIVATE OWNER WORKSPACE</small><h1>Good trade<br /><i>begins with trust.</i></h1><p>Manage the products, enquiries and relationships behind Hanumanji Agro.</p></div>
      <span className="owner-login-caption">KALIMPONG · NORTHEAST INDIA · SINCE 1976</span>
    </section>
    <section className="owner-login-panel">
      <Link href="/" className="owner-login-back">← Public website</Link>
      <div className="owner-login-form-wrap"><span className="eyebrow-dark">OWNER ACCESS</span><h2>Welcome back.</h2><p>Sign in to continue to your business workspace.</p>
        {notice && <div className="admin-feedback" role="status">{notice}</div>}
        <form className="owner-login-form" onSubmit={submit}>
          <label>Email address<input name="email" type="email" required maxLength={254} autoComplete="username" autoFocus /></label>
          <label>Password<span className="owner-password-field"><input name="password" type={showPassword ? 'text' : 'password'} required maxLength={256} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></span></label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button className="admin-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}<span aria-hidden="true">↗</span></button>
        </form>
        <small className="owner-login-note">This area is restricted to the Hanumanji Agro owner.</small>
      </div>
      <footer>Hanumanji Agro <span>·</span> Private access</footer>
    </section>
  </main>;
}
