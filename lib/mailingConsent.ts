// Shared wording for the mailing-list consent box. The server stores this exact
// sentence with each subscriber as proof of consent (NDPA 2023 s.26, NDPC GAID 2025).
// If you change the wording, older subscribers keep the sentence they agreed to.
export const MAILING_CONSENT_TEXT =
  'Yes, email me Qozob news, fuel-price tips and reward updates. I can unsubscribe at any time with one click.';

export type MailingSource = 'website' | 'signup' | 'dashboard' | 'rewards' | 'admin';
export const MAILING_SOURCES: MailingSource[] = ['website', 'signup', 'dashboard', 'rewards', 'admin'];

