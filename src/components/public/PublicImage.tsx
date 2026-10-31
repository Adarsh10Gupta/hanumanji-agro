'use client';

import { SyntheticEvent, useState } from 'react';

type Props = {
  src?: string | null;
  fallback: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
};

export default function PublicImage({ src, fallback, alt, className, loading = 'lazy' }: Props) {
  const [current, setCurrent] = useState(src || fallback);

  function useFallback(event: SyntheticEvent<HTMLImageElement>) {
    event.currentTarget.onerror = null;
    setCurrent(fallback);
  }

  return <img className={className} src={current} alt={alt} loading={loading} onError={useFallback} />;
}
