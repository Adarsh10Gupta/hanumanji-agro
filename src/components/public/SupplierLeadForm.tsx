'use client';

import { FormEvent, useState } from 'react';
import { clearSubmissionKey, getSubmissionKey } from '@/lib/submission-key';

export default function SupplierLeadForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': getSubmissionKey('supplier') },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || 'Please check the form.'); return; }
      clearSubmissionKey('supplier');
      setMessage(result.notificationStatus === 'pending' ? 'Your supplier enquiry was saved. The owner email notification is pending.' : 'Thank you. Your supplier enquiry has been saved and received.');
      form.reset();
    } catch {
      setMessage('Connection issue. Your enquiry may have been saved; retry to check without creating a duplicate.');
    } finally {
      setBusy(false);
    }
  }

  return <form className="lead-form" onSubmit={submit}>
    <div className="lead-form-heading"><small>FARMER & SUPPLIER ENQUIRY</small><h2>Tell us about<br /><i>what you grow.</i></h2><p>Sharing an enquiry does not guarantee a purchase. Any supply is subject to requirements, quality, availability and agreed terms.</p></div>
    <div className="form-fields"><label>Your name<input name="name" required minLength={2} autoComplete="name" /></label><label>Phone / WhatsApp<input name="phone" required autoComplete="tel" /></label><label>Email <em>optional</em><input name="email" type="email" autoComplete="email" /></label><label>Product you grow or supply<input name="product" required /></label><label>Location<input name="location" required placeholder="Village, district, state" /></label><label>Available quantity<input name="quantity" placeholder="Quantity and unit" /></label><label>Availability period<input name="period" placeholder="Season or supply dates" /></label></div>
    <label className="form-message">Product details<textarea name="description" placeholder="Variety, fresh or dried, grade, photos available, expected timing…" /></label>
    {message && <p className="form-feedback" role="status">{message}</p>}
    <button className="button button-dark" disabled={busy}>{busy ? 'Sending…' : 'Send supplier enquiry'} <span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 16 16 4M6 4h10v10" /></svg></span></button>
  </form>;
}
