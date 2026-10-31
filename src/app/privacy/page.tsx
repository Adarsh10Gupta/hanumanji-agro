import Link from 'next/link';

export const metadata = { title: 'Privacy Policy' };

export default function Privacy() {
  return <main className="wrap section"><Link href="/">← Home</Link><h1>Privacy Policy</h1><p className="tag">DRAFT · CLIENT REVIEW REQUIRED BEFORE PUBLICATION</p><p>This draft describes the information submitted through Hanumanji Agro enquiry forms, including contact details, business details and product requirements. Information is used to respond to enquiries and manage sourcing discussions.</p><h2>Retention and access</h2><p>Enquiry records are stored in the business database and access is restricted to authorised administrators. Contact information is not sold. This draft does not establish retention periods or legal business details; the owner should confirm these before publication.</p><h2>Contact</h2><p>Questions may be sent to hanumanjiagro@gmail.com.</p></main>;
}
