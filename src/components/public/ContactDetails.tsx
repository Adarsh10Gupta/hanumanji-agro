'use client';

import { phoneDigits, usePublicSettings } from '@/lib/use-public-settings';

export default function ContactDetails() {
  const settings = usePublicSettings();
  const whatsapp = `https://wa.me/${phoneDigits(settings.whatsapp)}`;
  return <div className="contact-details"><small>GET IN TOUCH</small><a href={`mailto:${settings.email}`}><span>Email</span><b>{settings.email}</b><i>↗</i></a><a href={`tel:${settings.phone}`}><span>Phone</span><b>{settings.phone}</b><i>↗</i></a><a href={whatsapp}><span>WhatsApp</span><b>{settings.whatsapp}</b><i>↗</i></a><div className="contact-social"><small>SOCIAL</small>{settings.social.facebook && <a href={settings.social.facebook} target="_blank" rel="noreferrer">Facebook ↗</a>}{settings.social.instagram && <a href={settings.social.instagram} target="_blank" rel="noreferrer">Instagram ↗</a>}</div><p>Business roots in {settings.location}. No street address is listed.</p></div>;
}
