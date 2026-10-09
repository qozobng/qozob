import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Auto Services, Papers Renewal & GPS Tracking — Qozob',
  description: 'Renew your vehicle papers, get statutory NIID third-party insurance, police CMRIS, and book professional 4G anti-theft GPS tracker installations with Qozob.',
  alternates: {
    canonical: 'https://www.qozob.com/services',
  },
  openGraph: {
    title: 'Vehicle Papers Renewal & GPS Security — Qozob',
    description: 'Doorstep vehicle documentation renewal, NIID insurance, and 4G GPS anti-theft vehicle tracking in Nigeria.',
    url: 'https://www.qozob.com/services',
    type: 'website',
  },
};

export default function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
