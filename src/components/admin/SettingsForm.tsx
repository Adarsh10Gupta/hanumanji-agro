'use client';

import { FormEvent, useEffect, useState } from 'react';

type Settings = {
  businessName: string;
  location: string;
  email: string;
  phone: string;
  whatsapp: string;
  notificationEmail: string;
  notificationPreferences: { ownerEmail: boolean; customerAcknowledgement: boolean; orderStatus: boolean };
  social?: { facebook?: string; instagram?: string };
  description?: string;
  logo?: string;
};

export default function SettingsForm() {
  const [value, setValue] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [whatsappError, setWhatsappError] = useState('');
  const [emailTestBusy, setEmailTestBusy] = useState(false);
  const [emailTestMessage, setEmailTestMessage] = useState('');
  const [emailTestError, setEmailTestError] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((settings: Settings) => {
        setValue(settings);
        setWhatsappNumber(settings.whatsapp);
      })
      .catch(() => setError('Unable to load settings.'));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const data = {
      businessName: String(form.get('businessName')),
      location: String(form.get('location')),
      email: String(form.get('email')),
      phone: String(form.get('phone')),
      notificationEmail: String(form.get('notificationEmail')),
      notificationPreferences: {
        ownerEmail: form.get('ownerEmail') === 'on',
        customerAcknowledgement: form.get('customerAcknowledgement') === 'on',
        orderStatus: form.get('orderStatus') === 'on',
      },
      social: {
        facebook: String(form.get('facebook')),
        instagram: String(form.get('instagram')),
      },
      description: String(form.get('description')),
      logo: String(form.get('logo') || ''),
    };
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Could not save.');
        return;
      }
      setMessage('Business settings saved.');
      setValue(result);
    } catch {
      setError('Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  async function saveWhatsApp() {
    setWhatsappBusy(true);
    setWhatsappError('');
    setWhatsappMessage('');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp: whatsappNumber }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save WhatsApp number.');
      setWhatsappNumber(result.whatsapp);
      setWhatsappMessage('WhatsApp number saved.');
    } catch (reason) {
      setWhatsappError(reason instanceof Error ? reason.message : 'Could not save WhatsApp number.');
    } finally {
      setWhatsappBusy(false);
    }
  }

  async function sendEmailTest() {
    setEmailTestBusy(true);
    setEmailTestError('');
    setEmailTestMessage('');
    try {
      const response = await fetch('/api/admin/email-test', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Resend did not accept the test email.');
      setEmailTestMessage(`Resend accepted the test email. Message ID: ${result.messageId}`);
    } catch (reason) {
      setEmailTestError(reason instanceof Error ? reason.message : 'Unable to send the test email.');
    } finally {
      setEmailTestBusy(false);
    }
  }

  if (!value) return <div className="admin-panel">{error || 'Loading settings…'}</div>;

  return (
    <form className="admin-panel settings-form" onSubmit={save}>
      <div className="admin-panel-head"><div><small>PUBLIC BUSINESS INFORMATION</small><h2>Contact details</h2></div></div>
      <div className="admin-form-grid">
        <label>Business name<input name="businessName" required maxLength={120} defaultValue={value.businessName || 'Hanumanji Agro'} /></label>
        <label>Location<input name="location" required maxLength={180} defaultValue={value.location || 'Kalimpong, Northeast India'} /></label>
        <label>Business email<input name="email" type="email" required defaultValue={value.email} /></label>
        <label>Phone<input name="phone" required defaultValue={value.phone} /></label>
        <label>Notification email<input name="notificationEmail" type="email" required defaultValue={value.notificationEmail} /></label>
      </div>
      <div className="settings-subhead">
        <label>WhatsApp Business number<input name="whatsapp" type="tel" required maxLength={30} value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} /></label>
        <p>Used for business WhatsApp links. Save this number separately; updating it will not change your other website settings.</p>
        {whatsappMessage && <p className="admin-success" role="status">{whatsappMessage}</p>}
        {whatsappError && <p className="admin-error" role="alert">{whatsappError}</p>}
        <button type="button" className="admin-secondary" onClick={() => void saveWhatsApp()} disabled={whatsappBusy}>{whatsappBusy ? 'Saving…' : 'Save WhatsApp number'}</button>
      </div>
      <div className="admin-panel-head settings-subhead"><div><small>EMAIL NOTIFICATIONS</small><h2>Delivery preferences</h2></div></div>
      <div className="admin-checks">
        <label><input type="checkbox" name="ownerEmail" defaultChecked={value.notificationPreferences?.ownerEmail ?? true} /> Notify the owner about new enquiries</label>
        <label><input type="checkbox" name="customerAcknowledgement" defaultChecked={value.notificationPreferences?.customerAcknowledgement ?? false} /> Send customers an acknowledgement when they consent</label>
        <label><input type="checkbox" name="orderStatus" defaultChecked={value.notificationPreferences?.orderStatus ?? false} /> Email customers when an enquiry status changes</label>
      </div>
      <div className="admin-panel-head settings-subhead"><div><small>RESEND CONNECTION</small><h2>Test email delivery</h2></div></div>
      <p className="settings-email-test-copy">Send one test to the configured owner notification address using onboarding@resend.dev. This action does not contact customers or suppliers.</p>
      {emailTestMessage && <p className="admin-success" role="status">{emailTestMessage}</p>}
      {emailTestError && <p className="admin-error" role="alert">{emailTestError}</p>}
      <button type="button" className="admin-secondary" onClick={() => void sendEmailTest()} disabled={emailTestBusy}>{emailTestBusy ? 'Sending test email…' : 'Send test email'}</button>
      <div className="admin-panel-head settings-subhead"><div><small>PUBLIC CHANNELS</small><h2>Social links</h2></div></div>
      <div className="admin-form-grid">
        <label>Facebook URL<input name="facebook" type="url" defaultValue={value.social?.facebook || ''} /></label>
        <label>Instagram URL<input name="instagram" type="url" defaultValue={value.social?.instagram || ''} /></label>
        <label>Business description<textarea name="description" maxLength={2000} defaultValue={value.description || ''} /></label>
        <label>Logo URL<input name="logo" type="url" defaultValue={value.logo || ''} /></label>
      </div>
      {message && <p className="admin-success" role="status">{message}</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="admin-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
  );
}
