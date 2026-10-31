'use client';

import Link from 'next/link';
import { ReactNode, useState } from 'react';
import { phoneDigits, usePublicSettings } from '@/lib/use-public-settings';

const links = [['About', '/about'], ['Products', '/products'], ['Buy / Sell', '/sourcing'], ['Farmers', '/farmers'], ['Business', '/business-enquiries'], ['Contact', '/contact']] as const;

export default function PublicShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const settings = usePublicSettings();
  const logo = settings.logo || '/brand-logo.jpg';
  const whatsapp = `https://wa.me/${phoneDigits(settings.whatsapp)}`;
  return <>
    <div className="public-topbar"><span>{settings.location}</span><span>Family agricultural trade since 1976</span><a href={`tel:${settings.phone}`}>{settings.phone}</a></div>
    <header className="public-header"><Link className="brand-mark" href="/"><img src={logo} alt={settings.businessName} /><span>{settings.businessName.toUpperCase()}<small>ROOTED IN NATURE</small></span></Link><nav aria-label="Main navigation">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav><Link className="button button-dark" href="/enquiry">Enquire now <span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 16 16 4M6 4h10v10" /></svg></span></Link><button className="public-menu-button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)}><span /><span /></button></header>
    <div className={`public-mobile-menu${open ? ' open' : ''}`} aria-hidden={!open}><button aria-label="Close navigation" onClick={() => setOpen(false)}>×</button>{links.map(([label, href], index) => <Link key={href} href={href} onClick={() => setOpen(false)}><small>0{index + 1}</small>{label}<span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 16 16 4M6 4h10v10" /></svg></span></Link>)}<a href={`mailto:${settings.email}`}>{settings.email}</a></div>
    {children}
    <footer className="public-footer"><div className="public-footer-main"><div><Link className="brand-mark" href="/"><img src={logo} alt={settings.businessName} /><span>{settings.businessName.toUpperCase()}<small>ROOTED IN NATURE</small></span></Link><p>{settings.description || 'Regional produce, agricultural sourcing and a family trading legacy from Kalimpong, Northeast India.'}</p></div><div><small>EXPLORE</small>{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</div><div><small>CONTACT</small><a href={`mailto:${settings.email}`}>{settings.email}</a><a href={`tel:${settings.phone}`}>{settings.phone}</a><a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a><span>{settings.location}</span></div><div><small>FOLLOW</small>{settings.social.facebook && <a href={settings.social.facebook} target="_blank" rel="noreferrer">Facebook ↗</a>}{settings.social.instagram && <a href={settings.social.instagram} target="_blank" rel="noreferrer">Instagram ↗</a>}<Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms</Link></div></div><div className="public-footer-bottom"><span>© {new Date().getFullYear()} {settings.businessName} · Since 1976</span><span>Rooted in Nature. Inspired by the Northeast.</span><Link href="/admin/login">Owner sign in</Link></div></footer>
  </>;
}
