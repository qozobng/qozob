import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

// Inter: clean, highly legible, the standard typeface for professional data-driven apps
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter', // used by Tailwind's `font-sans` (see globals.css)
});

// Browser / phone status-bar colour follows the light or dark theme
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0F1B2D' },
    { media: '(prefers-color-scheme: dark)', color: '#0A101C' },
  ],
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets light/dark BEFORE the page paints, so there is no white flash in dark mode */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Warm up connections to the map + data origins before React asks for them */}
        <link rel="preconnect" href="https://maps.googleapis.com" />
        <link rel="preconnect" href="https://maps.gstatic.com" crossOrigin="anonymous" />
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" />
        )}
        {/* Inject JSON-LD Schema directly into the head */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.className} ${inter.variable} antialiased bg-canvas text-fg`}>
        {children}
      </body>
    </html>
  );
}