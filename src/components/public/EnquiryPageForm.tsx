'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { CatalogProduct } from './HomeExperience';
import { productImage } from '@/lib/media';
import { clearSubmissionKey, getSubmissionKey } from '@/lib/submission-key';
import { phoneDigits, usePublicSettings } from '@/lib/use-public-settings';

type Line = { product: CatalogProduct; quantity: number; unit: string };

export default function EnquiryPageForm() {
  const settings = usePublicSettings();
  const [lines, setLines] = useState<Line[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [notificationStatus, setNotificationStatus] = useState('pending');
  const [submittedProducts, setSubmittedProducts] = useState<string[]>([]);

  useEffect(() => {
    try { setLines(JSON.parse(localStorage.getItem('ha-cart') || '[]')); } catch { setLines([]); }
    fetch('/api/products').then((response) => response.ok ? response.json() : []).then((products: CatalogProduct[]) => {
      setLines((current) => current.map((line) => ({ ...line, product: { ...line.product, ...products.find((product) => product.slug === line.product.slug) } })));
    }).finally(() => setReady(true));
  }, []);

  function persist(next: Line[]) {
    setLines(next);
    localStorage.setItem('ha-cart', JSON.stringify(next));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length) { setError('Add at least one product to request a quotation.'); return; }
    if (lines.some((line) => !line.product._id)) { setError('The live catalogue is unavailable. Please contact us directly.'); return; }
    setBusy(true);
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      name: String(form.get('name')), phone: String(form.get('phone')), email: String(form.get('email') || ''),
      customerType: String(form.get('customerType')), company: String(form.get('company') || ''), city: String(form.get('city')),
      state: String(form.get('state')), message: String(form.get('message') || ''), consent: form.get('consent') === 'on',
      enquiryType: 'Quotation', items: lines.map((line) => ({ productId: line.product._id, quantity: line.quantity, unit: line.unit })),
    };
    try {
      const response = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': getSubmissionKey('enquiry') },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Could not submit the request.'); return; }
      setReference(result.reference);
      setNotificationStatus(result.notificationStatus);
      setSubmittedProducts(lines.map((line) => `${line.product.name} ${line.quantity} ${line.unit}`));
      clearSubmissionKey('enquiry');
      persist([]);
      formElement.reset();
    } catch {
      setError('Network issue. Your request may have been saved; retry to check without creating a duplicate.');
    } finally {
      setBusy(false);
    }
  }

  const whatsapp = reference ? `https://wa.me/${phoneDigits(settings.whatsapp)}?text=${encodeURIComponent(`Hello ${settings.businessName}, I submitted enquiry ${reference}. ${submittedProducts.length ? `Products and quantities: ${submittedProducts.join(', ')}.` : ''} Please follow up.`)}` : '';

  return <div className="enquiry-page-grid">
    <section className="enquiry-items">
      <div className="enquiry-title-row"><div><small>YOUR PRODUCT SELECTION</small><h2>Enquiry list <span>{lines.length.toString().padStart(2, '0')}</span></h2></div><Link href="/products">Add another product <b>+</b></Link></div>
      {!ready ? <p>Loading your saved enquiry…</p> : lines.length === 0 ? <div className="enquiry-empty"><span>01</span><h3>Your list is empty.</h3><p>Explore the catalogue and add products you’d like to discuss.</p><Link className="button button-dark" href="/products">Explore products <span>↗</span></Link></div> : lines.map((line) => <article className="enquiry-line" key={line.product.slug}>
        <Link href={`/products/${line.product.slug}`}><img src={productImage(line.product.slug, line.product.image)} alt="" /></Link>
        <div><small>{line.product.category}</small><h3>{line.product.name}</h3><p>{line.product.description}</p><label>Quantity <input type="number" min=".1" step=".1" value={line.quantity} onChange={(event) => persist(lines.map((item) => item.product.slug === line.product.slug ? { ...item, quantity: Number(event.target.value) } : item))} /><select value={line.unit} onChange={(event) => persist(lines.map((item) => item.product.slug === line.product.slug ? { ...item, unit: event.target.value } : item))}><option>kg</option><option>tonne</option><option>quintal</option><option>boxes</option></select></label></div>
        <button className="line-remove" onClick={() => persist(lines.filter((item) => item.product.slug !== line.product.slug))}>Remove</button>
      </article>)}
      <p className="enquiry-disclaimer">No prices are displayed. Availability, grade, packaging, minimums and delivery terms are discussed in your quotation.</p>
    </section>
    <form className="quotation-form" onSubmit={submit}>
      <small>REQUEST A QUOTATION</small><h2>Where should<br /><i>we reach you?</i></h2>
      {reference ? <div className="quote-success" role="status"><span>REQUEST RECEIVED</span><h3>{reference}</h3><p>Your enquiry has been saved. {notificationStatus === 'pending' ? 'Owner email notification is pending.' : notificationStatus === 'failed' ? 'The owner email notification needs retrying.' : ''}You can continue the conversation on WhatsApp using this reference.</p><a className="button button-dark" href={whatsapp} target="_blank" rel="noreferrer">Continue on WhatsApp ↗</a></div> : <>
        <div className="form-fields"><label>Your name<input name="name" required minLength={2} autoComplete="name" /></label><label>Phone / WhatsApp<input name="phone" required autoComplete="tel" /></label><label>Email <em>optional</em><input name="email" type="email" autoComplete="email" /></label><label>Customer type<select name="customerType"><option>Business</option><option>Individual</option></select></label><label>Company <em>optional</em><input name="company" autoComplete="organization" /></label><label>Delivery city<input name="city" required autoComplete="address-level2" /></label><label>State<input name="state" required autoComplete="address-level1" /></label></div>
        <label className="form-message">Requirements<textarea name="message" placeholder="Specification, timing, destination or other details" /></label><label className="form-consent"><input type="checkbox" name="consent" required />I agree Hanumanji Agro may contact me about this enquiry.</label>
        {error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark" disabled={busy || !ready}>{busy ? 'Submitting…' : 'Submit quotation request'} <span>↗</span></button>
      </>}
    </form>
  </div>;
}
