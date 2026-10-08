import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: `Terms of Service | ${SITE.name}`,
  description: `The rules for using ${SITE.name}.`,
  alternates: { canonical: `${SITE.url}/terms` },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms are the rules for using ${SITE.name} (${SITE.domain}). By using the website or creating an account, you agree to them.`}
    >
      <section>
        <h2>1. What {SITE.name} does</h2>
        <p>
          {SITE.name} shows fuel stations and pump prices in {SITE.country}. Prices come from the community, station owners and the{' '}
          {SITE.name} team, and are colour-coded by source.
        </p>
      </section>

      <section>
        <h2>2. Prices are a guide</h2>
        <p>
          Prices and queue information can change quickly and may not always be accurate. Always confirm the price at the pump before
          you buy. {SITE.name} is not responsible for decisions or costs based on information shown on the map.
        </p>
      </section>

      <section>
        <h2>3. Your account</h2>
        <ul>
          <li>Give accurate information and keep your password safe.</li>
          <li>You are responsible for activity on your account.</li>
          <li>Tell us straight away at <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> if you think someone else is using it.</li>
        </ul>
      </section>

      <section>
        <h2>4. Fair use</h2>
        <p>When you submit prices, queue reports or ratings, you agree:</p>
        <ul>
          <li>to report honestly what you saw;</li>
          <li>not to post false, misleading or spam information;</li>
          <li>not to try to manipulate ratings or impersonate a station owner;</li>
          <li>not to interfere with, overload or try to break the service.</li>
        </ul>
        <p>We may remove content or suspend accounts that break these rules.</p>
      </section>

      <section>
        <h2>5. Station owners and managers</h2>
        <ul>
          <li>You may only claim a station you own or are authorised to manage.</li>
          <li>Documents you submit (such as CAC registration) must be genuine. Submitting false documents will lead to rejection and may be reported.</li>
          <li>Approved managers must keep their station&apos;s prices and details accurate.</li>
          <li>{SITE.name} may approve, reject or withdraw station claims and Manager access at its discretion.</li>
        </ul>
      </section>

      <section>
        <h2>6. Content you submit</h2>
        <p>
          You keep ownership of what you submit. You allow {SITE.name} to display, store and share it on the service (for example, showing a
          price you reported on the map). Logos and brand names belong to their respective owners.
        </p>
      </section>

      <section>
        <h2>7. Availability</h2>
        <p>
          We work to keep {SITE.name} running smoothly but cannot promise it will always be available or error-free. We may change or
          pause features at any time.
        </p>
      </section>

      <section>
        <h2>8. Limitation of liability</h2>
        <p>
          To the fullest extent allowed by law, {SITE.name} is provided &quot;as is&quot;, and we are not liable for indirect or consequential
          losses arising from your use of the service.
        </p>
      </section>

      <section>
        <h2>9. Privacy</h2>
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains how we handle your information.
        </p>
      </section>

      <section>
        <h2>10. Changes and governing law</h2>
        <p>
          We may update these terms and will change the date at the top when we do. These terms are governed by the laws of the
          Federal Republic of {SITE.country}.
        </p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
      </section>
    </LegalPage>
  );
}

