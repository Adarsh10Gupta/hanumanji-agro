import Link from 'next/link';

export const metadata = { title: 'Terms and Conditions' };

export default function Terms() {
  return <main className="wrap section"><Link href="/">← Home</Link><h1>Terms and Conditions</h1><p className="tag">DRAFT · CLIENT REVIEW REQUIRED BEFORE PUBLICATION</p><p>Product availability, specifications, quantity, price, delivery and payment terms are discussed and confirmed individually. Submitting an enquiry is not an order or a guarantee of purchase or supply.</p><p>Orders proceed only after quotation and owner confirmation. No online payment is collected on this website.</p><p>This draft requires owner and legal review before publication. No business registration details are asserted here.</p></main>;
}
