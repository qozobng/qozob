import { MetadataRoute } from 'next';

// =========================================================================
// PWA MANIFEST
// Lets users "Add to Home Screen" so Qozob opens full-screen like a native app —
// handy for anyone checking fuel prices on the go. Served automatically at /manifest.webmanifest.
// =========================================================================
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Qozob — Live Fuel Prices & Queues',
    short_name: 'Qozob',
    description: 'Find the cheapest fuel prices, live queue status and pump accuracy ratings at filling stations across Nigeria. Made for Nigerians.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F8FAFC',
    theme_color: '#312E81',
    categories: ['travel', 'navigation', 'utilities'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}

