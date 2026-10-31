import type { Metadata } from 'next';
import PublicShell from '@/components/public/PublicShell';
import ContactDetails from '@/components/public/ContactDetails';
import EnquiryContactForm from '@/components/public/EnquiryContactForm';

export const metadata: Metadata = { title: 'Contact', description: 'Contact Hanumanji Agro in Kalimpong, Northeast India.' };

export default function Contact() {
  return <PublicShell><main className="contact-page"><section className="contact-page-heading"><span className="eyebrow-dark">Hanumanji Agro · Kalimpong</span><h1>Start with a<br /><i>conversation.</i></h1><p>For product enquiries, supplier offers, bulk sourcing and business partnerships.</p></section><section className="contact-details-layout"><ContactDetails /><EnquiryContactForm type="Contact" /></section></main></PublicShell>;
}
