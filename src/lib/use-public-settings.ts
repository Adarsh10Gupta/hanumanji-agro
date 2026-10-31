'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_BUSINESS_WHATSAPP, normalizeWhatsAppNumber } from './whatsapp-number';

export type PublicSettings = {
  businessName: string;
  location: string;
  email: string;
  phone: string;
  whatsapp: string;
  social: { facebook: string; instagram: string };
  description: string;
  logo: string;
};

const defaults: PublicSettings = {
  businessName: 'Hanumanji Agro',
  location: 'Kalimpong, Northeast India',
  email: 'hanumanjiagro@gmail.com',
  phone: '+91 7001102168',
  whatsapp: DEFAULT_BUSINESS_WHATSAPP,
  social: { facebook: 'https://www.facebook.com/share/1Z4ds1RU35/', instagram: 'https://www.instagram.com/hanu_manjiagro23?mdxt=MXZhdG53NnRseWRw' },
  description: 'Regional produce, agricultural sourcing and a family trading legacy from Kalimpong, Northeast India.',
  logo: '',
};

export function usePublicSettings() {
  const [settings, setSettings] = useState(defaults);
  useEffect(() => {
    fetch('/api/site-settings', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (value) setSettings({ ...defaults, ...value, social: { ...defaults.social, ...value.social } }); })
      .catch(() => undefined);
  }, []);
  return settings;
}

export function phoneDigits(value: string) {
  return normalizeWhatsAppNumber(value) || '';
}
