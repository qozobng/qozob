import { MetadataRoute } from 'next';

// =========================================================================
// PWA MANIFEST
// Lets users "Add to Home Screen" so Qozob opens full-screen like a native app —
// handy for drivers checking prices on the go. Served automatically at /manifest.webmanifest.
// =========================================================================
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Qozob — Live Fuel Prices & Queues',
    short_name: 'Qozob',
    description: 'Find the cheapest PMS prices, live queue status and pump accuracy ratings at filling stations across Nigeria.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F5F0',
    theme_color: '#0F1B2D',
    categories: ['travel', 'navigation', 'utilities'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}

