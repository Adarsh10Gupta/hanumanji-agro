'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import Link from 'next/link';

export default function CatalogueError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="catalog-empty catalog-error-state" role="alert">
      <span className="eyebrow-dark">A temporary interruption</span>
      <h2>We couldn’t load the collection right now.</h2>
      <p>Please try again in a moment, or tell us what you’re looking for directly.</p>
      <div>
        <button className="button button-dark" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
          {pending ? 'Trying again…' : 'Retry'}
        </button>
        <Link className="button button-light" href="/contact">Contact Hanumanji Agro</Link>
      </div>
    </div>
  );
}
