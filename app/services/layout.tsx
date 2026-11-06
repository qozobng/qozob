import type { Metadata } from 'next';
import { AUTO_SERVICE_CATALOG } from '@/types/services';

export const metadata: Metadata = {
  title: 'Vehicle Papers Renewal, Insurance Calculator, Custom Plates & 4G GPS Tracker — Qozob Nigeria',
  description:
    'Renew Nigerian vehicle papers online with engine-capacity tiered pricing: NIID Third-Party & Comprehensive Auto Insurance Calculator, Vehicle License, Proof of Ownership (POC), Roadworthiness (LACVIS), Hackney & Heavy-Duty Haulage Permits, Dispatch Rider Card, FRSC Learner’s Permit, Driver’s License, Customised Fancy Plates, and 4G GPS Tracker Installation.',
  keywords: [
    'vehicle papers renewal Nigeria',
    'car papers renewal Lagos Abuja',
    'Proof of Ownership Certificate POC renewal Nigeria',
    'NIID third party car insurance Nigeria',
    'comprehensive car insurance calculator Nigeria',
    'vehicle license renewal cost by engine capacity',
    'roadworthiness certificate LACVIS renewal',
    'hackney permit heavy duty haulage permit Nigeria',
    'dispatch rider permit Lagos rider card',
    'customised fancy plate number Nigeria JTB FRSC',
    'lost number plate replacement Nigeria',
    'FRSC learners permit online Nigeria',
    'drivers license renewal Nigeria',
    'NPF tinted glass permit POSSAP CMRIS',
    '4G car GPS tracker installation Nigeria',
    'CarPaddy alternative Nigeria',
  ],
  alternates: {
    canonical: 'https://www.qozob.com/services',
  },
  openGraph: {
    title: 'Vehicle Papers Renewal, Comprehensive Insurance, Permits & 4G GPS Security — Qozob',
    description:
      'Instant engine-capacity tiered pricing for Nigerian vehicle papers, NIID & Comprehensive insurance, POC, Hackney/Haulage/Dispatch permits, Custom Plates, Digital Document Vault & 4G GPS Trackers.',
    url: 'https://www.qozob.com/services',
    siteName: 'Qozob',
    type: 'website',
    locale: 'en_NG',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vehicle Papers Renewal, Insurance Calculator & 4G GPS Trackers — Qozob Nigeria',
    description:
      'Renew Vehicle License, Roadworthiness, POC, NIID & Comprehensive Insurance, Haulage/Dispatch Permits, Custom Plates & 4G Trackers with doorstep delivery.',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Qozob Home', item: 'https://www.qozob.com/' },
        { '@type': 'ListItem', position: 2, name: 'Vehicle Papers, Insurance & GPS Services', item: 'https://www.qozob.com/services' },
      ],
    },
    {
      '@type': 'Service',
      name: 'Qozob Nigerian Vehicle Documentation, Insurance, Permits & 4G GPS Security',
      url: 'https://www.qozob.com/services',
      serviceType: 'Automotive Documentation, Statutory Licensing, Motor Insurance & GPS Telematics',
      areaServed: {
        '@type': 'Country',
        name: 'Nigeria',
      },
      provider: {
        '@type': 'Organization',
        name: 'Qozob',
        url: 'https://www.qozob.com',
      },
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Qozob Auto Services Catalog',
        itemListElement: AUTO_SERVICE_CATALOG.map(item => ({
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: item.title,
            description: item.description,
          },
          price: String(item.privatePrice > 0 ? item.privatePrice : item.commercialPrice ?? 0),
          priceCurrency: 'NGN',
          availability: 'https://schema.org/InStock',
          url: 'https://www.qozob.com/services',
        })),
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How are Vehicle License and Roadworthiness prices calculated on Qozob?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Statutory licensing authorities across Nigeria price renewals by vehicle category and engine capacity. Qozob automatically matches your vehicle make and model to its statutory engine/body tier (Saloon ≤1.8L, Saloon 2.0L+, SUV/Pickup, Bus/Coaster, Heavy-Duty Truck, or Motorcycle/Keke) and applies your state’s official rate.',
          },
        },
        {
          '@type': 'Question',
          name: 'What is the Annual Proof of Ownership Certificate (POC) renewal?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Mandated by the Joint Tax Board (JTB) and state motor registries, the annual Proof of Ownership Certificate (POC) verifies legal title of a motor vehicle on the national database and is renewed alongside your annual Vehicle License.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I order Customised / Fancy Number Plates, Learner’s Permits, or Haulage Permits on Qozob?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Qozob processes official JTB/FRSC Customised (Fancy) Number Plates, lost/damaged number plate replacements, FRSC 3-month Learner’s Permits, Nigerian Driver’s License renewals, Police CMRIS & Tinted Glass Permits, Commercial Hackney/Haulage permits for trucks and buses, and Dispatch Rider Cards for delivery motorcycles.',
          },
        },
        {
          '@type': 'Question',
          name: 'How do automated expiry reminders and the Digital Document Vault work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Once you add your vehicle in Qozob My Garage, the platform monitors your Insurance, Vehicle License, Roadworthiness, POC, and Hackney Permit expiry dates and emails you 30, 14, and 7 days before expiration with a 1-click renewal link. All renewed certificates and uploaded scans are stored in your Digital Document Vault.',
          },
        },
      ],
    },
  ],
};

export default function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {children}
    </>
  );
}
