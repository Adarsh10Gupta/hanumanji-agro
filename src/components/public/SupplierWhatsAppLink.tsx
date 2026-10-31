'use client';

import { phoneDigits, usePublicSettings } from '@/lib/use-public-settings';

export default function SupplierWhatsAppLink() {
  const settings = usePublicSettings();
  const message = `Hello ${settings.businessName}, I am a farmer or supplier and would like to discuss my produce.`;
  return <a className="farmer-whatsapp" href={`https://wa.me/${phoneDigits(settings.whatsapp)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Prefer WhatsApp? Start a conversation ↗</a>;
}
