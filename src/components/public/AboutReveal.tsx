'use client';

import { useEffect } from 'react';

export default function AboutReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observers: IntersectionObserver[] = [];
    document.querySelectorAll<HTMLElement>('[data-about-reveal]').forEach((element) => {
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          element.classList.add('revealed');
          observer.disconnect();
        }
      }, { threshold: 0.12 });
      observers.push(observer);
      observer.observe(element);
    });

    return () => observers.forEach((observer) => observer.disconnect());
  }, []);

  return null;
}
