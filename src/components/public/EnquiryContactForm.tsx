'use client';

import { FormEvent, useState } from 'react';
import { clearSubmissionKey, getSubmissionKey } from '@/lib/submission-key';

export default function EnquiryContactForm({ type = 'Business' }: { type?: 'Business' | 'Contact' }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const data = {
      name: String(fields.get('name')), phone: String(fields.get('phone')), email: String(fields.get('email') || ''),
      customerType: String(fields.get('customerType')), company: String(fields.get('company') || ''), city: String(fields.get('city') || ''),
      state: String(fields.get('state') || ''), subject: String(fields.get('subject') || ''), message: String(fields.get('message') || ''),
      consent: fields.get('consent') === 'on', enquiryType: type, items: [],
    };
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': getSubmissionKey('enquiry') },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || 'Could not submit. Please try again.'); return; }
      clearSubmissionKey('enquiry');
      const notification = result.notificationStatus === 'pending' ? 'Owner email notification is pending.' : result.notificationStatus === 'failed' ? 'Your enquiry is saved; its owner email notification needs retrying.' : '';
      setMessage(`Thank you. Your enquiry reference is ${result.reference}. Your request has been saved. ${notification}`);
      form.reset();
    } catch {
      setMessage('Connection issue. Your request may have been saved; retry to check without creating a duplicate.');
    } finally {
      setBusy(false);
    }
  }

  return <form className="lead-form" onSubmit={submit}>
    <div className="lead-form-heading"><small>{type === 'Business' ? 'BUSINESS ENQUIRY' : 'CONTACT HANUMANJI AGRO'}</small><h2>{type === 'Business' ? 'Let’s discuss your requirement.' : 'Tell us what you need.'}</h2></div>
    <div className="form-fields"><label>Your name<input name="name" required minLength={2} autoComplete="name" /></label><label>Phone / WhatsApp<input name="phone" required autoComplete="tel" /></label><label>Email <em>optional</em><input name="email" type="email" autoComplete="email" /></label><label>Customer type<select name="customerType"><option>Business</option><option>Individual</option></select></label><label>Company <em>optional</em><input name="company" autoComplete="organization" /></label><label>City <em>optional</em><input name="city" autoComplete="address-level2" /></label><label>State <em>optional</em><input name="state" autoComplete="address-level1" /></label>
      {type === 'Business' && <label>Enquiry subject<input name="subject" required minLength={2} maxLength={160} placeholder="What would you like to discuss?" /></label>}
    </div>
    <label className="form-message">Your requirements<textarea name="message" required placeholder="Product, quantity, specification, timing or destination" /></label>
    <label className="form-consent"><input type="checkbox" name="consent" required />I agree Hanumanji Agro may contact me about this enquiry.</label>
    {message && <p className="form-feedback" role="status">{message}</p>}
    <button className="button button-dark" disabled={busy}>{busy ? 'Sending…' : 'Send enquiry'} <span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 16 16 4M6 4h10v10" /></svg></span></button>
  </form>;
}
