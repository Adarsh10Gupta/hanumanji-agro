'use client';

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="admin-page"><section className="admin-panel admin-error-page" role="alert"><small>WORKSPACE UNAVAILABLE</small><h1>We couldn’t load this page.</h1><p>Your records were not changed. Try loading the page again.</p><button className="admin-primary" onClick={reset}>Retry</button></section></main>;
}
