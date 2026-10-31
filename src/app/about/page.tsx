import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import AboutReveal from '@/components/public/AboutReveal';
import PublicShell from '@/components/public/PublicShell';
import StoryTimeline from '@/components/public/StoryTimeline';

export const metadata: Metadata = {
  title: 'Our story',
  description: 'A family agricultural trading legacy from Kalimpong, Northeast India, since 1976.',
};

const principles = [
  {
    icon: '🌱',
    title: 'Our Vision',
    text: 'To become a trusted and recognised name in agricultural commodities, spices, dehydrated products and botanical raw materials. We want to help showcase the agricultural potential of Northeast India and connect the region’s growers and products with dependable buyers across India and, over time, international markets. We see a future where regional produce can reach more customers through stronger supply links, product understanding and long-term partnerships.',
  },
  {
    icon: '🧭',
    title: 'Our Mission',
    text: 'To connect farmers, growers, processors, traders, institutional buyers and businesses through clear communication and practical sourcing solutions. We aim to understand the needs of each customer, identify suitable produce, discuss quality and quantities transparently, and build relationships that can grow over time. We also want to explore opportunities to supply raw materials to processors and support initiatives that create meaningful market connections for farmers.',
  },
  {
    icon: '🤝',
    title: 'Our Values & Commitment',
    text: 'We value trust, consistency, responsible sourcing, regional knowledge and respect for the people who grow and handle agricultural produce. We aim to discuss quality, grading, availability, packaging, pricing and delivery terms clearly, and to confirm specifications for every order. We believe in realistic commitments, reliable communication and relationships that benefit growers, suppliers and buyers alike.',
  },
  {
    icon: '🌾',
    title: 'Rooted in the Region',
    text: 'Our story begins in Kalimpong and remains connected to the agricultural communities and trading networks of Northeast India. We value the region’s diversity of crops, spices and botanicals, and aim to build on generational experience while adapting to the needs of modern markets.',
  },
  {
    icon: '🏭',
    title: 'Serving Business Needs',
    text: 'We welcome conversations with processors, manufacturers, wholesalers, traders and institutional customers seeking agricultural raw materials. From fresh ginger and turmeric to spices, dried ingredients and selected botanicals, each enquiry can be discussed according to required volume, specifications, season and delivery destination.',
  },
  {
    icon: '🌍',
    title: 'Looking Ahead',
    text: 'We aim to strengthen sourcing relationships, broaden suitable product opportunities and make regional agricultural produce accessible to wider markets. Our guiding principle remains simple: build patiently, communicate honestly and grow through dependable partnerships—naturally sourced, regionally rooted and globally connected.',
  },
] as const;

export default function About() {
  return (
    <PublicShell>
      <main className="story-page">
        <AboutReveal />
        <section className="story-hero" data-about-reveal>
          <div className="story-hero-photo" />
          <div className="story-hero-copy">
            <span className="eyebrow-light">A family trading legacy · Since 1976</span>
            <h1>Trade has a<br /><i>long memory.</i></h1>
            <p>Our story begins with fresh ginger, local markets and the knowledge carried from one generation to the next.</p>
            <span className="story-hero-index">KALIMPONG · NORTHEAST INDIA</span>
          </div>
        </section>

        <section className="story-origin">
          <div className="story-origin-heading" data-about-reveal>
            <small>01 — THE BEGINNING</small>
            <h2>A legacy built on land, trust and trade.</h2>
          </div>
          <div className="story-origin-copy" data-about-reveal>
            <p>Hanumanji Agro is built on a family agricultural-trading legacy that began in Kalimpong in 1976. Our grandfather started by purchasing fresh ginger and other agricultural produce directly from farmers and trading it through local markets. From the beginning, the business depended on knowing the produce, understanding the seasons and building relationships based on trust.</p>
            <p>Our father carried that legacy forward and expanded beyond ginger into large cardamom, Majista (Manjistha), traditional brooms and other regional commodities. The business grew into wholesale trading, supplying agricultural mandis and buyers across India. Each generation has added experience while staying connected to the growers and the agricultural character of Northeast India.</p>
            <p>Today, Hanumanji Agro works to build on that foundation with a more structured approach to sourcing. Our interests include fresh ginger, turmeric and seasonal produce, premium spices, dried and dehydrated products, and selected botanical raw materials. We aim to connect farmers and regional suppliers with traders, processors, institutional buyers and wider markets.</p>
            <p>Our ambition also includes supporting value chains for corporate processors—for example, sourcing ginger for businesses that make ginger paste—and engaging with institutional and government-linked agricultural initiatives. Our family’s experience includes work associated with initiatives involving the Government of Jharkhand and SIMFED, the Sikkim-linked marketing federation, including ginger seed/rhizome supply efforts intended to support farmers.</p>
            <p>Hanumanji Agro’s broader agricultural trading work sits alongside a separate brand focused on herbal plants, botanicals and dehydrated ingredients such as Majista (Manjistha), Timur, orange peel, lemon peel, dried beetroot and dried bitter gourd. Together, these activities reflect our belief that the region’s agricultural knowledge and natural resources can serve a wider range of markets when matched with reliable sourcing and clear communication.</p>
          </div>
          <figure aria-hidden="true" data-about-reveal>
            <img src="/media/ginger-source.jpg" alt="" loading="lazy" />
          </figure>
        </section>

        <section className="proprietor-section">
          <div className="proprietor-profile" data-about-reveal>
            <figure className="proprietor-portrait">
              <Image
                src="/images/shivam-singh.png"
                alt="Shivam Singh, Proprietor of Hanumanji Agro"
                fill
                sizes="(max-width: 760px) 86vw, 40vw"
              />
            </figure>
            <div className="proprietor-identity">
              <strong>SHIVAM SINGH</strong>
              <span>Proprietor · Hanumanji Agro</span>
            </div>
          </div>
          <div className="proprietor-copy" data-about-reveal>
            <small>THE NEXT GENERATION</small>
            <h2>A family legacy.<br /><i>A forward-looking vision.</i></h2>
            <p className="proprietor-supporting-line">From corporate experience to agricultural entrepreneurship.</p>
            <p>Shivam Singh, proprietor of Hanumanji Agro, represents the next generation of a family business that began in Kalimpong in 1976. After studying Cost and Management Accountancy (CMA), he worked for three years at EY, gaining professional experience before making the decision to leave that career and return to the family enterprise.</p>
            <p>His decision was driven by a long-standing ambition to build something meaningful in agriculture: to combine the family’s practical, generational knowledge of produce and trading with a more structured, professional approach to sourcing, communication and business relationships.</p>
            <p>Shivam’s goal is to help connect farmers and regional suppliers with corporate processors, wholesale buyers and institutional customers. This includes opportunities to supply agricultural raw materials to processors—for example, ginger for ginger-paste manufacturing—as well as participation in government and institutional initiatives that can help farmers access inputs and markets.</p>
            <p>The family’s experience includes work associated with the Government of Jharkhand and SIMFED, a Sikkim-linked marketing federation, including ginger seed/rhizome supply initiatives. These experiences reinforce the importance of building dependable connections between agricultural communities and larger supply chains.</p>
            <p>Alongside Hanumanji Agro’s agricultural commodities, spices and seasonal produce, a separate brand focuses on herbal plants, botanicals and dehydrated ingredients including Majista (Manjistha), Timur, citrus peels, dried beetroot and dried bitter gourd.</p>
            <blockquote>“Our roots are local. Our experience is generational. Our ambition is to connect Northeast India’s agricultural wealth with dependable buyers and wider domestic and international markets.”</blockquote>
          </div>
        </section>

        <section className="purpose-section">
          <div className="purpose-heading" data-about-reveal>
            <small>OUR VISION, MISSION &amp; VALUES</small>
            <h2>Trade built on trust.<br /><i>Growth rooted in nature.</i></h2>
            <p>Our purpose is to help the agricultural richness of Northeast India reach the people and businesses who value it—while respecting the growers, knowledge and relationships behind every product.</p>
          </div>
          <div className="purpose-grid">
            {principles.map((principle) => (
              <article key={principle.title} data-about-reveal>
                <h3><span aria-hidden="true">{principle.icon}</span>{principle.title}</h3>
                <p>{principle.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="story-timeline-section">
          <div className="story-timeline-heading" data-about-reveal>
            <span className="eyebrow-light">A living inheritance</span>
            <h2>Three chapters.<br /><i>One throughline.</i></h2>
            <p>Knowledge of the produce, respect for the relationships and patience to build trade over time.</p>
          </div>
          <div data-about-reveal><StoryTimeline /></div>
        </section>

        <section className="story-purpose">
          <div className="story-purpose-heading" data-about-reveal>
            <small>OUR PURPOSE</small>
            <h2>Grow trust.<br /><i>Connect possibility.</i></h2>
          </div>
          <div className="story-purpose-list">
            <article data-about-reveal>
              <span>01 / VISION</span>
              <h3>Regional knowledge, wider reach</h3>
              <p>To help the agricultural potential of Northeast India reach dependable buyers across India and, over time, wider markets.</p>
            </article>
            <article data-about-reveal>
              <span>02 / MISSION</span>
              <h3>Practical sourcing relationships</h3>
              <p>To connect growers, suppliers, processors, traders and buyers through clear communication and considered sourcing conversations.</p>
            </article>
            <article data-about-reveal>
              <span>03 / VALUES</span>
              <h3>Trust in the details</h3>
              <p>We value consistency, regional knowledge, responsible sourcing, realistic commitments and respect for the people behind the produce.</p>
            </article>
          </div>
        </section>

        <section className="story-end" data-about-reveal>
          <span>HANUMANJI AGRO · KALIMPONG</span>
          <h2>Our roots are local.<br /><i>Let’s grow from there.</i></h2>
          <Link className="button button-light" href="/contact">Start a conversation <span>↗</span></Link>
        </section>
      </main>
    </PublicShell>
  );
}
