import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rewards: win \u20A610,000 every month in your LGA',
  description:
    'Update fuel prices at stations near you on Qozob, earn coins, and the top price updater in each Nigerian LGA wins \u20A610,000 every month.',
  alternates: { canonical: '/rewards' },
};

export default function RewardsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

