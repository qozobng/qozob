import type { Metadata, Viewport } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';

// Load the modern, Gen-Z friendly "Space Grotesk" font globally
const spaceGrotesk = Space_Grotesk({ 
  subsets: ['latin'],
  display: 'swap',
});

// Setup Viewport and Theme Color (Matches your Indigo-900 header)
export const viewport: Viewport = {
  themeColor: '#312e81',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

// =========================================================================
// HIGH-REACH GLOBAL METADATA
// =========================================================================
export const metadata: Metadata = {
  metadataBase: new URL('https://www.qozob.com'), // Update with your live domain
  title: {
    default: 'Qozob | Live Fuel Prices & Station Queues in Nigeria',
    template: '%s | Qozob',
  },
  description: 'Find the cheapest PMS prices, check live queue status, and rate pump accuracy at filling stations across Nigeria. Community-driven fuel updates.',
  keywords: [
    'fuel prices Nigeria', 'PMS price today', 'cheapest petrol near me', 
    'filling station queue', 'pump accuracy', 'NNPC fuel price', 
    'Lagos fuel price', 'Qozob'
  ],
  authors: [{ name: 'Qozob Team' }],
  creator: 'Qozob',
  publisher: 'Qozob',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: 'https://www.qozob.com',
    title: 'Qozob | Live Fuel Prices & Station Queues',
    description: 'Stop guessing where to buy fuel. See live PMS prices, queue lengths, and community ratings for filling stations near you.',
    siteName: 'Qozob',
    images: [
      {
        url: '/og-image.jpg', // Ensure you upload an og-image.jpg to your public/ folder
        width: 1200,
        height: 630,
        alt: 'Qozob Fuel Tracking Map',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Qozob | Live Fuel Prices & Station Queues',
    description: 'Stop guessing where to buy fuel. See live PMS prices, queue lengths, and community ratings for filling stations near you.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  
  // =========================================================================
  // JSON-LD STRUCTURED DATA (Schema Markup for Google)
  // =========================================================================
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Qozob',
    url: 'https://www.qozob.com',
    description: 'Crowdsourced gas station price tracking and queue monitoring platform in Nigeria.',
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'All',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'NGN',
    },
  };

  return (
    <html lang="en">
      <head>
        {/* Inject JSON-LD Schema directly into the head */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${spaceGrotesk.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}