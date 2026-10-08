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
      intro={`These terms are the rules for using ${SITE.name} (${SITE.domain}). By using the website or creating an account, you agree to them. Please read them; the most important points are in sections 2, 4 and 6.`}
    >
      <section>
        <h2>1. What {SITE.name} does</h2>
        <p>
          {SITE.name} is a fuel price map made for Nigerians: drivers, generator users, households and businesses. It shows fuel stations and pump prices
          in {SITE.country}. Prices come from the community, station owners and the {SITE.name} team, and are colour-coded by source. We plan to add more products over
          time (such as diesel/AGO, kerosene/DPK, cooking gas/LPG and CNG).
        </p>
      </section>

      <section>
        <h2>2. Prices are a guide, not a promise</h2>
        <p>
          Prices and queue information are reported by people and can change quickly, so they may be out of date or wrong. Each price shows who reported it and
          how long ago. A &ldquo;verified&rdquo; mark means the price came from the station or our team, not that it is guaranteed. <strong>Always confirm the price at the pump
          before you buy.</strong> {SITE.name} does not sell fuel and is not responsible for the prices, products or service at any station.
        </p>
      </section>

      <section>
        <h2>3. Who can use {SITE.name}, and your account</h2>
        <ul>
          <li>You must be 13 or older. If you are under 18, you need your parent&apos;s or guardian&apos;s permission. You must be 18 or older to join Rewards.</li>
          <li>Give accurate information, keep your password safe and use only one account.</li>
          <li>You are responsible for activity on your account.</li>
          <li>Tell us straight away at <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> if you think someone else is using it.</li>
          <li>You can delete your account at any time by emailing us from your account email.</li>
        </ul>
      </section>

      <section>
        <h2>4. Fair use</h2>
        <p>When you submit prices, queue reports or ratings, you agree:</p>
        <ul>
          <li>to report honestly what you saw at the station, at the time you were there;</li>
          <li>not to post made-up, copied, misleading or spam information;</li>
          <li>not to fake your location, use bots or scripts, or create or use more than one account;</li>
          <li>not to manipulate ratings or rankings, or impersonate a station owner or anyone else;</li>
          <li>not to interfere with, overload or try to break or hack the service.</li>
        </ul>
        <p>
          We may remove content, cancel reward coins or suspend accounts that break these rules. Submitting false information or using someone else&apos;s identity
          to obtain money can be a criminal offence under Nigerian law, including the Cybercrimes (Prohibition, Prevention, etc.) Act, and we may report it to the
          authorities.
        </p>
      </section>

      <section>
        <h2>5. Station owners and managers</h2>
        <ul>
          <li>You may only claim a station you own or are authorised to manage.</li>
          <li>Documents you submit (such as CAC registration) must be genuine. Submitting false documents will lead to rejection and may be reported.</li>
          <li>Approved managers must keep their station&apos;s prices and details accurate.</li>
          <li>{SITE.name} may approve, reject or withdraw station claims and Manager access, giving reasons where we can.</li>
          <li>Station owners and managers cannot earn reward coins or win prizes.</li>
        </ul>
      </section>

      <section>
        <h2>6. {SITE.name} Rewards</h2>
        <p>
          Rewards is an optional, free programme that pays prizes to the top price updaters in each local government area. It is decided only by effort (checked
          price updates), never by chance. Taking part is governed by the <Link href="/rewards/rules">Rewards Official Rules</Link>, which form part of these terms. Prizes
          are subject to any taxes the law requires.
        </p>
      </section>

      <section>
        <h2>7. Emails and messages</h2>
        <p>
          We send essential emails about your account (for example password resets, claim decisions and prize notices). We only send news and marketing emails if you
          opt in, and every one has an unsubscribe link that works straight away. SMS messages are used only for one-time verification codes, never for marketing.
        </p>
      </section>

      <section>
        <h2>8. Adverts</h2>
        <p>
          {SITE.name} shows adverts from businesses. Adverts are not endorsements by {SITE.name}. Advertisers are responsible for their adverts being lawful, truthful
          and approved where the law requires (including vetting by the Advertising Regulatory Council of Nigeria, ARCON). We may refuse or remove any advert.
        </p>
      </section>

      <section>
        <h2>9. Content you submit</h2>
        <p>
          You keep ownership of what you submit. You allow {SITE.name} to display, store and share it on the service (for example, showing a
          price you reported on the map) and to use it in anonymous form, such as price trends. Logos and brand names belong to their respective owners.
          LGA boundaries are from geoBoundaries / GRID3 under the CC BY 4.0 licence.
        </p>
      </section>

      <section>
        <h2>10. Availability</h2>
        <p>
          We work to keep {SITE.name} running smoothly but cannot promise it will always be available or error-free. We may change or
          pause features, and will give notice of important changes where we reasonably can.
        </p>
      </section>

      <section>
        <h2>11. Limitation of liability</h2>
        <p>
          {SITE.name} is a free information service provided &ldquo;as is&rdquo;. To the extent the law allows, we are not liable for indirect or consequential losses,
          or for losses caused by relying on a price or queue report without checking it at the pump. Nothing in these terms removes or limits any right you have under
          the Federal Competition and Consumer Protection Act 2018 or any liability that cannot legally be limited.
        </p>
      </section>

      <section>
        <h2>12. Privacy</h2>
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains how we handle your information, including location, Rewards verification and bank details.
        </p>
      </section>

      <section>
        <h2>13. Complaints</h2>
        <p>
          If something goes wrong, email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. We aim to reply within 14 days. If we cannot resolve it, you
          may contact the Federal Competition and Consumer Protection Commission (FCCPC), or the Nigeria Data Protection Commission for privacy matters.
        </p>
      </section>

      <section>
        <h2>14. Changes and governing law</h2>
        <p>
          We may update these terms and will change the date at the top when we do. For important changes we will tell you in the app or by email before they apply.
          These terms are governed by the laws of the Federal Republic of {SITE.country}, and we will first try to settle any dispute with you amicably.
        </p>
      </section>

      <section>
        <h2>15. Contact</h2>
        <p>Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
      </section>
    </LegalPage>
  );
}
