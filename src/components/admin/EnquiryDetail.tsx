'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildWhatsAppReplyMessage, buildWhatsAppUrl, normalizeWhatsAppNumber } from '@/lib/whatsapp-number';

const statuses = ['New', 'Contacted', 'Quotation Sent', 'Accepted', 'Processing', 'Dispatched', 'Completed', 'Rejected', 'Cancelled'];
type Line = { productName: string; quantity: number; unit: string; unitPrice: number };
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export default function EnquiryDetail({ id }: { id: string }) {
  const [enquiry, setEnquiry] = useState<any>(null);
  const [status, setStatus] = useState('New');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [transport, setTransport] = useState(0);
  const [additional, setAdditional] = useState(0);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteTerms, setQuoteTerms] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [whatsappDraftOverride, setWhatsappDraftOverride] = useState<{ id: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/enquiries/${id}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load enquiry.');
      setEnquiry(data);
      setStatus(data.status);
      setNotes(data.notes || '');
      const quotation = data.quotation || {};
      setLines(quotation.lines?.length ? quotation.lines : (data.items || []).map((item: any) => ({ productName: item.snapshot?.name || 'Product', quantity: item.quantity, unit: item.unit || 'kg', unitPrice: 0 })));
      setTransport(quotation.transport || 0);
      setAdditional(quotation.additionalCharges || 0);
      setQuoteNotes(quotation.notes || '');
      setQuoteTerms(quotation.terms || '');
      setValidUntil(quotation.validUntil ? new Date(quotation.validUntil).toISOString().slice(0, 10) : '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load enquiry.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) + Number(transport || 0) + Number(additional || 0), [lines, transport, additional]);

  function quotationPayload() {
    return { lines, transport: Number(transport), additionalCharges: Number(additional), notes: quoteNotes, terms: quoteTerms, validUntil: validUntil ? new Date(`${validUntil}T23:59:59.000Z`).toISOString() : undefined };
  }

  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/admin/enquiries/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, notes, quotation: quotationPayload() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save changes.');
      setMessage('Enquiry updates saved.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save changes.');
    } finally { setBusy(false); }
  }

  async function send() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/admin/enquiries/${id}/send-quotation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quotation: quotationPayload() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Quotation was not sent.');
      setMessage(`Quotation email accepted by the provider. Total ${inr.format(data.total)}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Quotation was not sent.');
    } finally { setBusy(false); }
  }

  async function retryOwnerNotification() {
    setNotificationBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/enquiries/${id}/retry-notification`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not retry owner notification.');
      setMessage(result.status === 'sent' ? 'Owner notification accepted by the email provider.' : 'Owner notification remains pending. Check the Resend configuration.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not retry owner notification.');
    } finally { setNotificationBusy(false); }
  }

  async function markContacted() {
    setWhatsappBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/enquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Contacted' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update enquiry status.');
      await load();
      setMessage('Enquiry marked as Contacted. This does not confirm that a WhatsApp message was sent.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update enquiry status.');
    } finally {
      setWhatsappBusy(false);
    }
  }

  if (loading) return <main className="admin-page"><div className="admin-panel admin-empty">Loading enquiry…</div></main>;
  if (!enquiry) return <main className="admin-page"><div className="admin-error" role="alert">{error || 'Enquiry is unavailable.'} <button className="admin-secondary" onClick={() => void load()}>Retry</button></div></main>;

  const customer = enquiry.customerSnapshot || {};
  const whatsappDraft = whatsappDraftOverride && whatsappDraftOverride.id === enquiry._id
    ? whatsappDraftOverride.message
    : buildWhatsAppReplyMessage(enquiry);
  const whatsappPhone = normalizeWhatsAppNumber(customer.phone || '');
  const whatsappUrl = whatsappPhone ? buildWhatsAppUrl(whatsappPhone, whatsappDraft) : null;

  return <main className="admin-page">
    <div className="admin-page-heading"><div><small><Link href="/admin/enquiries">ENQUIRIES</Link> / {enquiry.reference}</small><h1>{enquiry.reference}</h1><p>Received {new Date(enquiry.createdAt).toLocaleString('en-IN')} · Owner email: {enquiry.notificationStatus || 'pending'}</p></div><div className="admin-heading-actions">{customer.email && <a className="admin-secondary" href={`mailto:${customer.email}?subject=${encodeURIComponent(`Hanumanji Agro · ${enquiry.reference}`)}`}>Email customer</a>}{enquiry.notificationStatus !== 'sent' && <button className="admin-secondary" disabled={notificationBusy} onClick={() => void retryOwnerNotification()}>{notificationBusy ? 'Retrying…' : 'Retry owner email'}</button>}</div></div>
    <div className="admin-detail-grid">
      <section className="admin-panel"><div className="admin-panel-head"><div><small>REQUEST</small><h2>Products & requirements</h2></div></div>
        {enquiry.items?.length ? <div className="admin-request-lines">{enquiry.items.map((item: any, index: number) => <div key={index}><b>{item.snapshot?.name || 'Product'}</b><span>{item.quantity} {item.unit}</span><small>{item.snapshot?.category}</small></div>)}</div> : <p className="admin-empty-inline">General {enquiry.enquiryType?.toLowerCase()} enquiry · no product selected.</p>}
        {enquiry.subject && <div className="admin-customer-facts"><div><small>SUBJECT</small><b>{enquiry.subject}</b></div></div>}
        <div className="admin-customer-facts"><div><small>DELIVERY DESTINATION</small><b>{[enquiry.destination?.city, enquiry.destination?.state].filter(Boolean).join(', ') || 'Not provided'}</b></div><div><small>MESSAGE</small><p>{enquiry.message || 'No additional message.'}</p></div></div>
      </section>
      <section className="admin-panel"><div className="admin-panel-head"><div><small>CUSTOMER</small><h2>{customer.name || 'Customer'}</h2></div><span className="status-pill">{customer.type || '—'}</span></div><div className="customer-contact-facts"><span>PHONE</span><a href={`tel:${customer.phone}`}>{customer.phone}</a><span>EMAIL</span>{customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : <b>Not provided</b>}<span>COMPANY</span><b>{customer.company || '—'}</b></div></section>
    </div>
    <section className="admin-panel admin-workflow-panel">
      <div className="admin-panel-head"><div><small>CUSTOMER FOLLOW-UP</small><h2>Reply on WhatsApp</h2></div></div>
      <p className="admin-muted">Review or edit the draft before opening WhatsApp. Opening WhatsApp does not update the enquiry status or confirm delivery.</p>
      <label className="admin-field-block">Message<textarea rows={8} maxLength={4000} value={whatsappDraft} onChange={(event) => setWhatsappDraftOverride({ id: enquiry._id, message: event.target.value })} /></label>
      <div className="admin-form-actions">
        {whatsappUrl
          ? <a className="admin-primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Reply on WhatsApp ↗</a>
          : <button className="admin-secondary" type="button" disabled>Customer phone number is invalid</button>}
        <button className="admin-secondary" type="button" disabled={whatsappBusy || enquiry.status === 'Contacted'} onClick={() => void markContacted()}>
          {enquiry.status === 'Contacted' ? 'Already marked Contacted' : whatsappBusy ? 'Updating status…' : 'Mark as Contacted'}
        </button>
      </div>
    </section>
    <section className="admin-panel admin-workflow-panel"><div className="admin-panel-head"><div><small>OWNER WORKFLOW</small><h2>Status & internal notes</h2></div></div>
      <div className="admin-form-grid"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <label className="admin-field-block">Internal notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Private notes for the owner workspace" /></label>
      <h3>Status history</h3><ol className="status-history">{[...(enquiry.statusHistory || [])].reverse().map((entry: any, index: number) => <li key={index}><span className="status-pill">{entry.status}</span><time>{new Date(entry.at).toLocaleString('en-IN')}</time></li>)}</ol>
    </section>
    <section className="admin-panel admin-workflow-panel"><div className="admin-panel-head"><div><small>QUOTE-BY-QUOTE PRICING</small><h2>Quotation builder</h2></div><span className="admin-muted">No fixed catalogue prices</span></div>
      {lines.length === 0 ? <p className="admin-empty-inline">Add a product line to prepare a quotation for this general enquiry.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Amount</th><th /></tr></thead><tbody>{lines.map((line, index) => <tr key={index}><td><input value={line.productName} aria-label={`Product name for quote line ${index + 1}`} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, productName: event.target.value } : item))} /></td><td><input type="number" min="0.01" step="any" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} /></td><td><input type="number" min="0" step=".01" value={line.unitPrice} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, unitPrice: Number(event.target.value) } : item))} /></td><td>{inr.format(line.quantity * line.unitPrice)}</td><td><button className="admin-danger" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove</button></td></tr>)}</tbody></table></div>}
      <button className="admin-secondary" type="button" onClick={() => setLines((current) => [...current, { productName: '', quantity: 1, unit: 'kg', unitPrice: 0 }])}>+ Add quotation line</button>
      <div className="admin-form-grid quote-charges"><label>Transportation (INR)<input type="number" min="0" step=".01" value={transport} onChange={(event) => setTransport(Number(event.target.value))} /></label><label>Additional charges (INR)<input type="number" min="0" step=".01" value={additional} onChange={(event) => setAdditional(Number(event.target.value))} /></label><label>Valid until<input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label><div className="quote-total"><small>QUOTATION TOTAL</small><b>{inr.format(total)}</b></div></div>
      <label className="admin-field-block">Quotation notes<textarea value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} placeholder="Commercial notes for the customer" /></label>
      <label className="admin-field-block">Terms and conditions<textarea value={quoteTerms} onChange={(event) => setQuoteTerms(event.target.value)} placeholder="Payment, delivery, and validity terms" /></label>
      <div className="admin-form-actions"><button className="admin-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save quotation & status'}</button><button className="admin-secondary" disabled={busy || !customer.email || !lines.length || lines.some((line) => !line.productName.trim() || line.unitPrice <= 0)} onClick={() => void send()}>{busy ? 'Working…' : 'Save and email quotation'}</button></div>
      {enquiry.quotation?.lines?.length > 0 && <div className="admin-form-actions"><a className="admin-secondary" href={`/api/admin/enquiries/${id}/quotation.pdf`}>Download quotation PDF</a></div>}
      {!!enquiry.quotationHistory?.length && <div className="admin-quotation-history"><h3>Previous quotation drafts</h3><ol>{[...enquiry.quotationHistory].reverse().map((entry: any, index: number) => <li key={index}><span>{new Date(entry.savedAt).toLocaleString('en-IN')}</span><b>{entry.lines?.length || 0} lines</b><span>{inr.format((entry.lines || []).reduce((sum: number, line: Line) => sum + line.quantity * line.unitPrice, 0) + Number(entry.transport || 0) + Number(entry.additionalCharges || 0))}</span></li>)}</ol></div>}
      <p className="admin-muted">The server calculates the INR total. The enquiry is marked sent only after the email provider accepts delivery.</p>
    </section>
    {error && <div className="admin-error" role="alert">{error} <button className="admin-secondary" onClick={() => void load()}>Retry</button></div>}
    {message && <div className="admin-feedback" role="status">{message}</div>}
  </main>;
}
