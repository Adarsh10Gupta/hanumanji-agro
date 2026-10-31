'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import CatalogueError from '@/components/public/CatalogueError';
import { clearSubmissionKey, getSubmissionKey } from '@/lib/submission-key';
import { phoneDigits, usePublicSettings } from '@/lib/use-public-settings';

export type CatalogProduct = { _id?: string; name: string; slug: string; category: string; description: string; image?: string; status?: string; featured?: boolean };
type CartLine = { product: CatalogProduct; quantity: number; unit: string };

const fallbackImages: Record<string, string> = {
  'fresh-ginger': '/media/ginger-source.jpg',
  turmeric: '/media/ginger-source.jpg',
  'large-black-cardamom': '/media/cardamom-still-life.jpg',
  'dried-ginger-ginger-chips': '/media/ginger-source.jpg',
  'orange-lemon-peel': '/media/botanical-still-life.jpg',
  'majista-timur-pipla': '/media/botanical-still-life.jpg',
  'dried-beetroot-bitter-gourd': '/media/botanical-still-life.jpg',
  'herbal-medicinal-plant-materials': '/media/botanical-still-life.jpg',
  'other-regional-produce': '/media/ginger-source.jpg',
};
const imageFor = (p: CatalogProduct) => p.image && !p.image.includes('images.unsplash.com') ? p.image : fallbackImages[p.slug] || '/media/botanical-still-life.jpg';

export function Header({ onEnquire, cartCount }: { onEnquire: () => void; cartCount: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const settings = usePublicSettings();
  useEffect(() => { const update = () => setScrolled(window.scrollY > 32); update(); window.addEventListener('scroll', update, { passive: true }); return () => window.removeEventListener('scroll', update); }, []);
  useEffect(() => { document.body.classList.toggle('menu-open', menuOpen); return () => document.body.classList.remove('menu-open'); }, [menuOpen]);
  const nav = [{ label: 'Our story', href: '/about' }, { label: 'Products', href: '/products' }, { label: 'Sourcing', href: '/sourcing' }, { label: 'Farmers', href: '/farmers' }, { label: 'Business', href: '/business-enquiries' }];
  return <>
    <div className="announcement"><span>{settings.location}</span><span>Family agricultural trade since 1976</span></div>
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="site-header-inner">
        <Link className="brand-mark" href="/" aria-label="Hanumanji Agro home"><img src="/brand-logo.jpg" alt="Hanumanji Agro"/><span>HANUMANJI AGRO<small>ROOTED IN NATURE</small></span></Link>
        <nav className="desktop-nav" aria-label="Main navigation">{nav.map(n => <Link key={n.href} href={n.href}>{n.label}</Link>)}</nav>
        <button className="header-enquire" onClick={onEnquire}>Enquire now <span aria-hidden="true">→</span>{cartCount > 0 && <i>{cartCount}</i>}</button>
        <button className="menu-trigger" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}><span/><span/></button>
      </div>
    </header>
    <div className={`mobile-nav${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
      <div className="mobile-nav-head"><Link className="brand-mark" href="/" onClick={() => setMenuOpen(false)}><img src="/brand-logo.jpg" alt=""/><span>HANUMANJI AGRO<small>NORTHEAST INDIA</small></span></Link><button className="mobile-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button></div>
      <nav aria-label="Mobile navigation">{nav.map((n, i) => <Link key={n.href} style={{ '--menu-index': i } as React.CSSProperties} href={n.href} onClick={() => setMenuOpen(false)}><span>0{i + 1}</span>{n.label}<b aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 16 16 4M6 4h10v10"/></svg></b></Link>)}</nav>
      <div className="mobile-nav-foot"><a href={`tel:${settings.phone}`}>{settings.phone}</a><a href={`mailto:${settings.email}`}>{settings.email}</a></div>
    </div>
  </>;
}

function EnquiryDrawer({ open, onClose, cart, onQuantity, onUnit, onRemove, onSubmit, sending }: { open: boolean; onClose: () => void; cart: CartLine[]; onQuantity: (slug: string, q: number) => void; onUnit: (slug: string, unit: string) => void; onRemove: (slug: string) => void; onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>; sending: boolean }) {
  useEffect(() => { if (!open) return; const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [open, onClose]);
  return <div className={`drawer-backdrop${open ? ' open' : ''}`} aria-hidden={!open} onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <aside className="enquiry-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="drawer-head"><div><span className="eyebrow-dark">QUOTE REQUEST</span><h2 id="drawer-title">Your enquiry</h2></div><button className="drawer-close" aria-label="Close enquiry" onClick={onClose}>×</button></div>
      {cart.length === 0 ? <div className="drawer-empty"><span className="empty-glyph">✳</span><h3>Start with a product</h3><p>Your selected products will appear here. Add an item to begin a quotation request.</p><button className="text-action" onClick={onClose}>Explore the collection <span>↓</span></button></div> : <>
        <div className="drawer-lines">{cart.map(({ product, quantity, unit }) => <article className="drawer-line" key={product.slug}><img src={imageFor(product)} alt=""/><div className="drawer-line-copy"><span>{product.category}</span><h3>{product.name}</h3><div className="quantity-stepper"><button aria-label={`Decrease ${product.name} quantity`} onClick={() => onQuantity(product.slug, Math.max(.1, quantity - 1))}>−</button><input aria-label={`${product.name} quantity`} type="number" min="0.1" step="0.1" value={quantity} onChange={e => onQuantity(product.slug, Number(e.target.value))}/><select aria-label={`${product.name} unit`} value={unit} onChange={e => onUnit(product.slug, e.target.value)}><option>kg</option><option>tonne</option><option>quintal</option><option>boxes</option></select><button aria-label={`Increase ${product.name} quantity`} onClick={() => onQuantity(product.slug, quantity + 1)}>+</button></div></div><button className="remove-line" onClick={() => onRemove(product.slug)} aria-label={`Remove ${product.name}`}>Remove</button></article>)}</div>
        <form className="drawer-form" onSubmit={onSubmit}><p className="quote-note">Final quantity, availability and pricing are confirmed by quotation.</p><div className="drawer-form-grid"><label>Name<input name="name" autoComplete="name" required minLength={2}/></label><label>Phone<input name="phone" autoComplete="tel" required/></label><label>Email <em>optional</em><input name="email" type="email" autoComplete="email"/></label><label>Customer type<select name="customerType"><option>Business</option><option>Individual</option></select></label><label>Company <em>optional</em><input name="company" autoComplete="organization"/></label><label>Delivery city<input name="city" autoComplete="address-level2" required/></label><label>State<input name="state" autoComplete="address-level1" required/></label></div><label className="drawer-message">Requirements<textarea name="message" placeholder="Grade, timing, delivery or other details"/></label><label className="consent-line"><input type="checkbox" name="consent" required/>I agree to be contacted about this enquiry.</label><button className="button button-dark drawer-submit" type="submit" disabled={sending}>{sending ? 'Submitting…' : 'Send quotation request'} <span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 16 16 4M6 4h10v10"/></svg></span></button></form>
      </>}
    </aside>
  </div>;
}

export function Footer({ onEnquire }: { onEnquire: () => void }) {
  const settings = usePublicSettings();
  const logo = settings.logo || '/brand-logo.jpg';
  const whatsapp = `https://wa.me/${phoneDigits(settings.whatsapp)}`;
  return <footer className="editorial-footer"><div className="footer-top"><div className="footer-brand-block"><Link className="brand-mark" href="/"><img src={logo} alt={settings.businessName}/><span>{settings.businessName.toUpperCase()}<small>ROOTED IN NATURE</small></span></Link><p>{settings.description || 'A family agricultural trading legacy from Kalimpong, connecting the produce and knowledge of Northeast India with wider markets.'}</p><button className="footer-enquire" onClick={onEnquire}>Start a sourcing conversation <span>→</span></button></div><div className="footer-column"><span className="footer-label">Explore</span><a href="#heritage">Our story</a><a href="#collection">Product collection</a><a href="#sourcing">Sourcing approach</a><a href="#partnerships">For partners</a></div><div className="footer-column"><span className="footer-label">Get in touch</span><a href={`mailto:${settings.email}`}>{settings.email}</a><a href={`tel:${settings.phone}`}>{settings.phone}</a><a href={whatsapp}>WhatsApp →</a><span>{settings.location}</span></div><div className="footer-column"><span className="footer-label">Follow</span>{settings.social.facebook && <a href={settings.social.facebook} target="_blank" rel="noreferrer">Facebook →</a>}{settings.social.instagram && <a href={settings.social.instagram} target="_blank" rel="noreferrer">Instagram →</a>}<Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms & conditions</Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {settings.businessName} · Since 1976</span><span>Rooted in Nature. Inspired by the Northeast.</span><a href="#top">Back to top ↑</a></div></footer>;
}
export default function HomeExperience({ products, catalogueError = false }: { products: CatalogProduct[]; catalogueError?: boolean }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  useEffect(() => { try { setCart(JSON.parse(localStorage.getItem('ha-cart') || '[]')); } catch { setCart([]); } }, []);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observers: IntersectionObserver[] = [];
    try {
      document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => {
        const observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) { el.classList.add('revealed'); observer.disconnect(); }
        }, { threshold: .12 });
        observers.push(observer);
        observer.observe(el);
      });
    } catch {
      document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => el.classList.add('revealed'));
    }
    return () => observers.forEach(observer => observer.disconnect());
  }, []);
  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map(p => p.category)))], [products]);
  const shown = useMemo(() => products.filter(p => (category === 'All' || p.category === category) && p.name.toLowerCase().includes(search.toLowerCase())), [products, category, search]);
  const persist = (next: CartLine[]) => { setCart(next); localStorage.setItem('ha-cart', JSON.stringify(next)); };
  const add = (p: CatalogProduct) => { const found = cart.find(x => x.product.slug === p.slug); persist(found ? cart : [...cart, { product: p, quantity: 1, unit: 'kg' }]); setDrawerOpen(true); };
  const quantity = (slug: string, q: number) => { if (!Number.isFinite(q) || q <= 0) return; persist(cart.map(x => x.product.slug === slug ? { ...x, quantity: q } : x)); };
  const unit = (slug: string, u: string) => persist(cart.map(x => x.product.slug === slug ? { ...x, unit: u } : x));
  const remove = (slug: string) => persist(cart.filter(x => x.product.slug !== slug));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (sending) return;
    if (!cart.length) { setNotice('Add a product to your enquiry before submitting.'); return; }
    const fields = new FormData(form);
    const payload = {
      name: String(fields.get('name')),
      phone: String(fields.get('phone')),
      email: String(fields.get('email') || ''),
      customerType: String(fields.get('customerType')),
      company: String(fields.get('company') || ''),
      city: String(fields.get('city')),
      state: String(fields.get('state')),
      message: String(fields.get('message') || ''),
      consent: fields.get('consent') === 'on',
      enquiryType: 'Quotation',
      items: cart.map((line) => ({ productId: line.product._id, quantity: line.quantity, unit: line.unit })),
    };
    if (!payload.items.every((item) => item.productId)) { setNotice('The live catalogue is unavailable. Please contact us directly.'); return; }
    setSending(true);
    try {
      const response = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': getSubmissionKey('enquiry') },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) { setNotice(result.error || 'Unable to submit the enquiry.'); return; }
      clearSubmissionKey('enquiry');
      persist([]);
      setDrawerOpen(false);
      form.reset();
      setNotice(`Enquiry saved · reference ${result.reference} · owner email ${result.notificationStatus}`);
    } catch {
      setNotice('Connection issue. Your enquiry may have been saved; retry to check without creating a duplicate.');
    } finally {
      setSending(false);
    }
  };
  const featured = products.filter(p => p.featured).concat(products.filter(p => !p.featured)).slice(0, 4);
  return <div id="top"><Header onEnquire={() => setDrawerOpen(true)} cartCount={cart.length}/><main>
    <section className="home-hero"><div className="hero-shade"/><div className="hero-inner"><div className="hero-kicker"><span/> AGRICULTURAL SOURCING · NORTHEAST INDIA</div><h1><span>Rooted in the</span><em>Northeast.</em><span className="hero-second">Connected to the <i>world.</i></span></h1><div className="hero-foot"><p>Regional produce, considered sourcing and relationships built across generations.</p><div className="hero-actions"><a className="button button-light" href="#collection">Explore products <span>↓</span></a><Link className="hero-story-link" href="/about">Discover our story <span>→</span></Link></div></div><a className="scroll-cue" href="#introduction" aria-label="Scroll to discover"><span>SCROLL TO DISCOVER</span><i/></a><div className="hero-index">01 <span>/</span> 04</div></div></section>

    <section id="introduction" className="intro-section"><div className="intro-topline"><span>01 — FROM KALIMPONG, WITH PURPOSE</span><span>27.06° N · 88.47° E</span></div><div className="intro-grid"><div className="intro-title" data-reveal><div className="eyebrow-dark">A different kind of trade</div><h2>Good sourcing<br/>begins with <i>knowing<br/>where to look.</i></h2><p>Hanumanji Agro brings generations of agricultural trading experience to a new chapter—connecting the growers, regional produce and trading knowledge of Northeast India with buyers who value clear, dependable conversations.</p><Link className="underlined-link" href="/about">Meet Hanumanji Agro <span>→</span></Link></div><div className="intro-image-wrap" data-reveal><img className="intro-image" src="/media/ginger-source.jpg" alt="Fresh ginger roots and green leaves arranged for a product study"/><div className="image-caption"><span>THE INGREDIENT, IN ITS OWN TIME</span><span>GINGER · NORTHEAST INDIA</span></div><span className="image-number">01</span></div></div><div className="intro-note"><span className="note-rule"/><p>Local roots. Generational experience.<br/><strong>A more considered way to connect supply and demand.</strong></p></div></section>

    <section id="collection" className="collection-section"><div className="collection-head"><div><span className="eyebrow-dark">The collection</span><h2>Products of place.<br/><i>Selected with care.</i></h2></div><div className="collection-aside"><p>Fresh produce, regional spices, dehydrated ingredients and selected botanical materials. Each enquiry is discussed around season, specification and intended use.</p><Link className="underlined-link" href="/products">View all products <span>→</span></Link></div></div>{catalogueError ? <CatalogueError /> : products.length === 0 ? <div className="catalog-empty" role="status"><span className="eyebrow-dark">A considered collection</span><h2>Our collection is being updated.</h2><p>There are no published products at the moment. Contact us to discuss regional produce and sourcing availability.</p><Link className="button button-dark" href="/business-enquiries">Start a business enquiry</Link></div> : <><div className="catalog-tools"><label className="catalog-search"><span aria-hidden="true">⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a product" aria-label="Search products"/></label><div className="category-tabs" role="group" aria-label="Filter by category">{categories.map(c => <button key={c} className={c === category ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div></div><div className="editorial-products">{shown.slice(0, 4).map((p, i) => <article className={`editorial-product product-${i + 1}`} key={p.slug} data-reveal><Link className="product-image-link" href={`/products/${p.slug}`}><img src={imageFor(p)} alt={`${p.name} — illustrative product photograph`} loading="lazy"/><span className="view-product">View product <b>→</b></span></Link><div className="product-meta"><span>{p.category}</span><span className={`availability ${p.status === 'available' ? 'available' : ''}`}><i/>{p.status === 'available' ? 'Available' : 'Seasonal · enquire'}</span></div><div className="product-title-row"><div><h3><Link href={`/products/${p.slug}`}>{p.name}</Link></h3><p>{p.description}</p></div><button className="add-product" aria-label={`Add ${p.name} to enquiry`} onClick={() => add(p)}>+</button></div></article>)}</div><div className="collection-bottom"><span>Availability and specifications are confirmed for each enquiry.</span><Link className="underlined-link" href="/products">Explore the full collection <span>→</span></Link></div></>}</section>

    <section id="heritage" className="heritage-section"><div className="heritage-image"><img src="/media/northeast-hero.jpg" alt="Misty forested hills and agricultural terraces in the Eastern Himalayas" loading="lazy"/><div className="heritage-image-label"><span>27° NORTH · THE EASTERN HIMALAYAS</span><span>KALIMPONG · FAMILY ROOTS</span></div><span className="heritage-year">1976</span></div><div className="heritage-copy"><span className="eyebrow-light">An inheritance of knowledge</span><h2>Trade has a<br/><i>long memory.</i></h2><p>Our story began in Kalimpong in 1976, when our grandfather purchased fresh ginger and other agricultural produce directly from farmers and traded through local markets. Each generation carried the work forward, learning the produce, the seasons and the relationships behind the trade.</p><p>Today, proprietor Shivam Singh brings that family experience into a more structured approach to sourcing and business relationships.</p><Link className="button button-outline-light" href="/about">Explore our history <span>→</span></Link><div className="timeline-line"><div className="timeline-track"><i/></div><div className="timeline-markers"><div><b>1976</b><span>A beginning in Kalimpong</span></div><div><b>Next generation</b><span>A broader regional trade</span></div><div><b>Today</b><span>A new chapter in sourcing</span></div></div></div></div></section>

    <section id="sourcing" className="sourcing-section"><div className="sourcing-header"><span className="eyebrow-dark">What we bring together</span><h2>From regional knowledge<br/>to <i>commercial possibility.</i></h2><p>Our work is grounded in conversations about real requirements: product, quantity, specification, season and destination.</p></div><div className="sourcing-layout"><div className="sourcing-photo"><img src="/media/cardamom-still-life.jpg" alt="Large black cardamom pods in a considered natural product still life" loading="lazy"/><span>01 / PRODUCTS OF THE REGION</span></div><div className="sourcing-list"><div className="sourcing-list-head"><span>PRODUCT FAMILIES</span><span>01—04</span></div>{[['01','Agricultural produce','Fresh ginger, turmeric and seasonal produce'],['02','Regional spices','Large black cardamom and selected spices'],['03','Dried & dehydrated','Dried ginger, citrus peels and vegetables'],['04','Botanical materials','Majista, Timur, Pipla and selected botanicals']].map(([n,title,desc])=><article className="sourcing-row" key={n}><span>{n}</span><div><h3>{title}</h3><p>{desc}</p></div><span className="row-arrow">→</span></article>)}<p className="sourcing-footnote">Products, grades, availability and supply terms are discussed and confirmed for each enquiry.</p></div></div></section>

    <section id="partnerships" className="partnership-section"><div className="partnership-visual"><img src="/media/botanical-still-life.jpg" alt="Dried citrus peel and botanical ingredients on natural surfaces" loading="lazy"/><span className="partnership-photo-note">A REGION OF MANY INGREDIENTS</span></div><div className="partnership-copy"><span className="eyebrow-light">A shared supply conversation</span><h2>Better connections<br/>begin <i>at the source.</i></h2><p>We welcome conversations with farmers, growers and suppliers, as well as processors, wholesalers, distributors and institutional buyers. The first step is understanding what is available and what is needed.</p><div className="partner-links"><Link href="/farmers"><span>01</span><b>For farmers & suppliers</b><i>→</i></Link><Link href="/business-enquiries"><span>02</span><b>For buyers & businesses</b><i>→</i></Link><Link href="/sourcing"><span>03</span><b>Our sourcing approach</b><i>→</i></Link></div></div></section>

    <section className="closing-section"><div className="closing-grain"/><span className="eyebrow-light">HANUMANJI AGRO · KALIMPONG</span><h2>Let’s talk about<br/><i>what you’re sourcing.</i></h2><p>Tell us what you need, where it needs to go and when. We’ll take the conversation from there.</p><button className="button button-light" onClick={() => setDrawerOpen(true)}>Start an enquiry <span>→</span></button><span className="closing-orbit" aria-hidden="true">H A · 1 9 7 6</span></section>
  </main><Footer onEnquire={() => setDrawerOpen(true)}/><EnquiryDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} cart={cart} onQuantity={quantity} onUnit={unit} onRemove={remove} onSubmit={submit} sending={sending}/>{notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}>×</button></div>}</div>;
}
