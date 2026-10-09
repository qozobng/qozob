import { redirect } from 'next/navigation';

// Legacy URL. Station claims are reviewed in the main admin panel (Station claims tab),
// which respects each admin's access level.
export default function LegacyAdminClaimsPage() {
  redirect('/admin');
}