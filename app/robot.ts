import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/user-dashboard/', '/admin/', '/api/'], // Hide secure routes from Google
    },
    sitemap: 'https://www.qozob.com/sitemap.xml',
  };
}