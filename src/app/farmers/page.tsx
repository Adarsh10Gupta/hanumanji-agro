import PublicShell from '@/components/public/PublicShell';
import SupplierLeadForm from '@/components/public/SupplierLeadForm';
import SupplierWhatsAppLink from '@/components/public/SupplierWhatsAppLink';

export const metadata = { title: 'Farmers and suppliers' };

export default function Farmers() {
  return <PublicShell><main className="farmers-page"><section className="farmers-intro"><div className="farmers-intro-image"><img src="/media/northeast-hero.jpg" alt="Illustrative agricultural landscape in the Eastern Himalayas" /><span>LANDSCAPE VISUAL · ILLUSTRATIVE</span></div><div className="farmers-intro-copy"><small>FOR FARMERS & SUPPLIERS</small><h1>Your harvest.<br /><i>A new conversation.</i></h1><p>We welcome enquiries from farmers, growers, aggregators and suppliers interested in discussing potential supply relationships.</p><p>Share the product, where it is grown, likely quantity and timing. Product photographs and available quality details help us understand your offer.</p><SupplierWhatsAppLink /></div></section><section className="supplier-form-section"><div className="supplier-form-aside"><small>WHAT TO INCLUDE</small><h2>Useful details<br />make a better<br /><i>first conversation.</i></h2><ol><li>Product and variety</li><li>Village, district and state</li><li>Approximate quantity available</li><li>Season or supply period</li><li>Fresh, dried or processed form</li></ol><p>Submitting an enquiry does not guarantee a purchase. Any supply is subject to requirements, quality, availability and mutually agreed terms.</p></div><SupplierLeadForm /></section></main></PublicShell>;
}
