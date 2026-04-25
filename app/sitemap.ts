import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.qozob.com';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'always', // Tells Google this page updates constantly (prices change)
      priority: 1.0,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    // If you ever create individual pages for stations (e.g. /station/123), 
    // you will fetch them from Supabase here and map them into this array!
  ];
}