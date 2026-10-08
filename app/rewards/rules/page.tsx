import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Rewards Official Rules',
  description: `The official rules of ${SITE.name} Rewards: who can take part, how coins and winners are decided, payouts and fair play.`,
  alternates: { canonical: '/rewards/rules' },
};

// Keep this in step with reward_settings.terms_version in the database.
const RULES_VERSION = '2026-10';

export default function RewardsRulesPage() {
  return (
    <LegalPage
      title="Rewards Official Rules"
      intro={`These rules explain how ${SITE.name} Rewards works: who can take part, how coins are earned, how winners are chosen and paid, and what happens if someone tries to cheat. By joining the programme you agree to these rules, our Terms of Service and our Privacy Policy. Rules version ${RULES_VERSION}.`}
    >
      <section>
        <h2>1. Who runs it</h2>
        <p>
          {SITE.name} Rewards is run by {SITE.name} ({SITE.domain}). Contact us at <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
          It is free to join. You never have to pay, buy fuel or buy anything else to take part or to win.
        </p>
      </section>

      <section>
        <h2>2. Who can take part</h2>
        <ul>
          <li>You must be <strong>18 years or older</strong> and live in Nigeria.</li>
          <li>You need a {SITE.name} account in your own name. <strong>One person, one account.</strong></li>
          <li>To receive a prize you must verify your phone number, verify your identity with a valid government ID (NIN slip or national ID card, voter&apos;s card, driver&apos;s licence or international passport) and add a Nigerian bank account in your own name.</li>
          <li>
            <strong>Not eligible:</strong> {SITE.name} employees, admins, contractors and representatives; owners and managers of filling stations listed on {SITE.name};
            and members of their households. They may still update prices, but they do not earn coins and cannot win.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. How coins are earned</h2>
        <p>You earn coins when you update the price at a filling station on the {SITE.name} map while signed in. Each update is checked automatically:</p>
        <ul>
          <li>Your phone&apos;s location must show you are <strong>at the station</strong> (within about 1 km), with a reasonable GPS signal.</li>
          <li>An update that passes earns <strong>10 coins</strong>, plus a <strong>5-coin bonus</strong> if no one has earned coins at that station in the previous 24 hours.</li>
          <li>You can earn coins at the same station <strong>once every 6 hours</strong>, and for up to <strong>20 updates a day</strong>.</li>
          <li>The price must be within a believable range. Prices very different from other recent prices nearby are <strong>held for review</strong>; their coins count only if a reviewer approves them.</li>
          <li>Location jumps that are not physically possible (for example, two far-apart stations minutes apart) are held for review.</li>
        </ul>
        <p>The exact numbers above can change (see section 10). The current values are always shown on the <Link href="/rewards">Rewards page</Link>. Your price is published straight away even when it earns no coins.</p>
      </section>

      <section>
        <h2>4. Monthly prize: top updater in each LGA</h2>
        <ul>
          <li>Each calendar month, the qualified person with the <strong>most coins in a local government area (LGA)</strong> wins that LGA&apos;s monthly prize, currently <strong>&#8358;10,000</strong>.</li>
          <li>A station&apos;s LGA is decided by its map position using official LGA boundaries.</li>
          <li>To qualify you must have earned coins on at least <strong>8 different days</strong> in that month, and your phone, ID and bank account must be verified by the time we close the month (usually within the first three days of the next month).</li>
          <li>One person can win <strong>one monthly prize</strong> per month. If you top more than one LGA, you win the LGA where you have the most coins, and the next qualified person wins the other LGA.</li>
          <li><strong>Ties</strong> are broken by (1) the number of different stations updated, then (2) whoever reached the score first. There is no random draw; winning depends only on your effort.</li>
          <li>Monthly prizes are paid by bank transfer <strong>by the 7th day of the following month</strong>.</li>
        </ul>
      </section>

      <section>
        <h2>5. Annual national grand prize</h2>
        <ul>
          <li>One national grand prize goes to the qualified person with the most coins across Nigeria from <strong>1 January to 31 December</strong>.</li>
          <li>You need coins on at least <strong>60 different days</strong> in the year and full verification.</li>
          <li>The amount is announced on the Rewards page. It is paid <strong>by 31 January</strong> of the following year.</li>
          <li>Winning a monthly prize does not stop you winning the grand prize.</li>
        </ul>
      </section>

      <section>
        <h2>6. Payment</h2>
        <ul>
          <li>We pay only into the verified Nigerian bank account in the winner&apos;s own name. The account name must match the name on your ID.</li>
          <li>Prizes are subject to any taxes the law requires. Where required, we will deduct tax (such as withholding tax) at source and give you evidence of the deduction.</li>
          <li>If we cannot verify a winner, or the winner cannot be paid within 60 days after reasonable attempts to contact them, the prize is forfeited and may pass to the next qualified person.</li>
          <li>Prizes cannot be transferred or exchanged.</li>
          <li>To protect your payment, bank details cannot be changed in the app while a prize is being processed. Contact support instead.</li>
        </ul>
      </section>

      <section>
        <h2>7. Fair play and disqualification</h2>
        <p>The programme only works if prices are real. You must not:</p>
        <ul>
          <li>submit made-up, copied or guessed prices, or prices for a station you did not visit;</li>
          <li>fake or spoof your location, or use bots, scripts or emulators;</li>
          <li>use more than one account, share accounts, or use someone else&apos;s ID, phone number or bank account;</li>
          <li>split updates across friends&apos; accounts or work with others to game the rankings.</li>
        </ul>
        <p>
          Rejected or suspicious updates count as <strong>strikes</strong>. Three strikes, or any serious abuse, leads to suspension from Rewards. We may cancel coins, refuse or
          reclaim prizes, close accounts and, where appropriate, report matters to the authorities. Submitting false information to obtain money can be a criminal offence in
          Nigeria, including under the Cybercrimes (Prohibition, Prevention, etc.) Act.
        </p>
      </section>

      <section>
        <h2>8. Your information</h2>
        <ul>
          <li>We use your verification details only to run Rewards: to confirm you are eligible, prevent duplicate entries and fraud, pay you, and meet legal duties such as tax records.</li>
          <li>Your <strong>ID photo is deleted</strong> as soon as it has been reviewed. We keep only your name, date of birth, ID type, the last 4 digits of the ID number and a one-way code that stops the same ID being used twice.</li>
          <li>Your <strong>bank account number is encrypted</strong>. Staff see only the last 4 digits unless they need the full number to pay you, and every such view is logged.</li>
          <li>Your exact location when you update a price is kept for fraud checks and removed after 13 months.</li>
          <li>Public leaderboards show only your first name and the first letter of your surname (for example, &ldquo;Chinedu O.&rdquo;).</li>
        </ul>
        <p>See our <Link href="/privacy">Privacy Policy</Link> for more, including your rights.</p>
      </section>

      <section>
        <h2>9. Decisions and complaints</h2>
        <p>
          Rankings shown during a month are live and unofficial. Final results are confirmed after the checks above. If you disagree with a decision, email{' '}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> within 30 days. We will review it and reply within 14 days. This does not affect any rights you have under Nigerian law,
          including under the Federal Competition and Consumer Protection Act.
        </p>
      </section>

      <section>
        <h2>10. Changes, pauses and ending the programme</h2>
        <p>
          We may change these rules, the coin values, limits or prize amounts, or pause or end the programme, for example to stop abuse or meet legal requirements.
          We will post changes on this page and the Rewards page before they apply. Changes will not reduce a prize already won for a month that has ended.
        </p>
      </section>
    </LegalPage>
  );
}
