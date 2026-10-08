import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Email updates',
  robots: { index: false, follow: false },
};

export default function MailingLayout({ children }: { children: React.ReactNode }) {
  return children;
}

