import PublicShell from '@/components/public/PublicShell';

export default function LoadingProducts() {
  return <PublicShell><main className="products-page" aria-busy="true" aria-label="Loading product catalogue">
    <section className="products-page-intro"><div><span className="eyebrow-dark">The Hanumanji Agro collection</span><h1>Products of place.<br /><i>Selected with care.</i></h1></div></section>
    <div className="catalog-skeleton-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div className="catalog-skeleton" key={index}><div /><span /><b /><i /></div>)}</div>
  </main></PublicShell>;
}
