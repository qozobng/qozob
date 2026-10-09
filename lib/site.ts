// Public business details used by the legal pages, footer and Google brand verification.
// Change them here and every page updates.
export const SITE = {
  name: 'Qozob',
  domain: 'qozob.com',
  url: 'https://www.qozob.com',
  contactEmail: 'support@qozob.com',
  // Support WhatsApp in international format without "+" (e.g. 2348012345678). Set NEXT_PUBLIC_SUPPORT_WHATSAPP in Vercel.
  whatsapp: (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '').replace(/\D/g, ''),
  country: 'Nigeria',
  legalLastUpdated: '9 October 2026',
} as const;

