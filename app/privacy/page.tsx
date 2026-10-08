import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: `Privacy Policy | ${SITE.name}`,
  description: `How ${SITE.name} collects, uses and protects your information, in line with the Nigeria Data Protection Act 2023.`,
  alternates: { canonical: `${SITE.url}/privacy` },
};

const th = 'text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle py-2 pr-3 align-bottom';
const td = 'py-2.5 pr-3 align-top text-sm text-fg-muted border-t border-line';

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`${SITE.name} (${SITE.domain}) helps Nigerians (drivers, generator users, households and businesses) find fuel stations, compare live pump prices and share updates with the community. This policy explains, in plain language, what information we collect, why, how long we keep it and the choices you have. It is written to meet the Nigeria Data Protection Act 2023 (NDPA) and the Nigeria Data Protection Commission's General Application and Implementation Directive (GAID) 2025.`}
    >
      <section>
        <h2>1. Who we are</h2>
        <p>
          {SITE.name} decides how and why your personal information is used, so we are the &ldquo;data controller&rdquo;. For any privacy question, request or complaint,
          contact our data protection contact at <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> (subject: &ldquo;Privacy&rdquo;).
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <p><strong>When you create an account or sign in</strong></p>
        <ul>
          <li>Your email address and password (passwords are stored in scrambled form; we never see them).</li>
          <li>If you choose <strong>Sign in with Google</strong>: your name, email address and profile picture from your Google account. We do not receive your Google password or access your Gmail, contacts, files or any other Google data.</li>
          <li>Details you enter at sign-up, such as your name, phone number, address, state and country.</li>
        </ul>
        <p><strong>When you use the map</strong></p>
        <ul>
          <li>Your device location, <em>only if you allow it</em> in your browser, to show nearby stations and distances. Used this way, your location stays on your device.</li>
          <li>Prices, queue reports and pump-accuracy ratings you submit.</li>
          <li>When you are <strong>signed in and submit a price</strong>, we record your location at that moment, how accurate it was and your distance from the station, together with the report. We use this to check the price came from someone at the station, to stop fake prices and to award reward coins. It is never shown publicly.</li>
        </ul>
        <p><strong>If you join {SITE.name} Rewards</strong> (optional, 18+ only)</p>
        <ul>
          <li><strong>Identity:</strong> your full legal name, date of birth, ID type, ID number and a photo or scan of the ID. We keep only the last 4 characters of the ID number plus a one-way code (a &ldquo;hash&rdquo;) that lets us spot the same ID being used twice. The ID photo is <strong>deleted as soon as it has been reviewed</strong>.</li>
          <li><strong>Phone number</strong>, confirmed with a one-time SMS code.</li>
          <li><strong>Bank details:</strong> bank name, account number and account name, so we can pay prizes. The account number is <strong>encrypted</strong>.</li>
          <li>Your coins, rankings, strikes, review decisions and prize payment records.</li>
        </ul>
        <p>We do <strong>not</strong> ask for your BVN, card details, PINs or passwords for any bank, and we will never ask for them by phone, SMS or email.</p>
        <p><strong>If you are a station owner or manager</strong></p>
        <ul>
          <li>Business details you submit to claim a station: applicant name, phone number, company name, CAC registration number and your CAC document.</li>
          <li>Station details and logos you upload.</li>
        </ul>
        <p><strong>If you subscribe to email updates</strong> (optional)</p>
        <ul>
          <li>Your email address, and optionally your name, state and LGA.</li>
          <li>A record of your consent: when you agreed, where (for example the sign-up page) and the exact wording you agreed to, and when you confirmed or unsubscribed.</li>
          <li>Delivery events from our email provider, such as bounces and spam complaints, so we stop emailing addresses that do not want or cannot receive our emails.</li>
        </ul>
        <p><strong>Automatically</strong></p>
        <ul>
          <li>Essential cookies and browser storage (see section 10).</li>
          <li>Counts of how many times each advert is shown or clicked. These counts are not linked to you.</li>
          <li>Basic technical logs (such as browser type, IP address and error reports) kept by our hosting providers to keep the service secure and working.</li>
        </ul>
      </section>

      <section>
        <h2>3. Why we use it and our legal basis</h2>
        <p>The NDPA only allows us to use personal information when we have a lawful reason. Ours are:</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead><tr><th className={th}>What we do</th><th className={th}>Legal basis</th></tr></thead>
            <tbody>
              <tr><td className={td}>Create and secure your account, show stations and prices, publish your updates</td><td className={td}>Contract (providing the service you signed up for)</td></tr>
              <tr><td className={td}>Use your device location to show nearby stations</td><td className={td}>Consent (your browser asks first; you can switch it off at any time)</td></tr>
              <tr><td className={td}>Record your location with a price report to keep prices honest and prevent abuse</td><td className={td}>Legitimate interests (reliable prices for everyone) and, for Rewards, contract</td></tr>
              <tr><td className={td}>Run Rewards: check eligibility and age, prevent duplicate accounts and fraud, pick winners, pay prizes</td><td className={td}>Contract (the Rewards Official Rules you accept)</td></tr>
              <tr><td className={td}>Keep prize payment and tax records, and deduct tax where required</td><td className={td}>Legal obligation</td></tr>
              <tr><td className={td}>Verify station ownership claims and Manager requests</td><td className={td}>Contract and legitimate interests</td></tr>
              <tr><td className={td}>Send news, fuel tips and reward updates by email</td><td className={td}>Consent (unticked box and email confirmation; withdraw any time)</td></tr>
              <tr><td className={td}>Send essential account emails (password resets, claim decisions, prize notices)</td><td className={td}>Contract</td></tr>
              <tr><td className={td}>Security logs, investigating abuse, responding to lawful requests</td><td className={td}>Legitimate interests and legal obligation</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">We <strong>do not sell</strong> your personal information, and we do not use it to target advertising.</p>
      </section>

      <section>
        <h2>4. Automated checks</h2>
        <p>
          When you submit a price, our system automatically checks things like your distance from the station, how often you have updated, and whether the price
          is far from nearby prices. These checks decide whether coins are awarded straight away, held for a person to review, or not awarded. They never stop your
          price from being published. Suspicious cases are reviewed by a person before any strike is given, and you can ask for a human review of any decision about
          your coins or prizes by emailing <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
        </p>
      </section>

      <section>
        <h2>5. Google user data</h2>
        <p>
          If you sign in with Google, we only request your basic profile (name, email address and profile picture) to create and
          identify your {SITE.name} account. {SITE.name}&apos;s use and transfer of information received from Google APIs adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>, including the Limited Use requirements. We do not share Google user data with third parties except the service
          providers listed below that run {SITE.name} for us, and we never use it for advertising.
        </p>
      </section>

      <section>
        <h2>6. Who can see your information</h2>
        <ul>
          <li><strong>Everyone:</strong> station names, locations, prices, queue status and average ratings. Price updates are shown without your name or email. Rewards leaderboards show only your first name and the first letter of your surname (for example, &ldquo;Chinedu O.&rdquo;), your coins and active days.</li>
          <li><strong>Only you and authorised {SITE.name} staff:</strong> your account details, station claims, CAC documents, Manager requests and Rewards verification details. ID photos and CAC documents are stored privately and can only be opened by authorised administrators. Staff see only the last 4 digits of bank account numbers unless the full number is needed to pay you, and every such view is logged.</li>
          <li><strong>Service providers</strong> who run {SITE.name} for us and may only use your information to provide their service: Supabase (database, sign-in, SMS codes and file storage), Vercel (website hosting), Google (Maps, places search and Google sign-in), Resend (sending emails) and the SMS provider connected to our sign-in system (sending one-time codes).</li>
          <li><strong>Banks</strong>, to transfer prize money to you.</li>
          <li><strong>Authorities</strong>, only where the law requires it, or to report suspected fraud or crime.</li>
        </ul>
      </section>

      <section>
        <h2>7. Transfers outside Nigeria</h2>
        <p>
          Our service providers store and process information on servers outside Nigeria (for example in the United States and the European Union). We only use
          providers that commit, in their data processing terms, to protect personal information and keep it secure, and we rely on the transfer safeguards the NDPA
          allows. You can ask us for more information about these safeguards at <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
        </p>
      </section>

      <section>
        <h2>8. How we protect it</h2>
        <ul>
          <li>Information is sent over encrypted connections (HTTPS).</li>
          <li>Database rules ensure each person can only see and change what they are allowed to, and administrator actions are checked by the database itself.</li>
          <li>Bank account numbers are encrypted; ID numbers are kept only as the last 4 characters and a one-way code; ID photos are deleted after review.</li>
          <li>Sensitive actions (approving IDs, revealing bank details, paying prizes) are recorded in an audit log.</li>
          <li>If a data breach is likely to put your rights at risk, we will report it to the Nigeria Data Protection Commission within 72 hours of becoming aware of it, and tell you without delay, in plain language, if the risk to you is high.</li>
        </ul>
      </section>

      <section>
        <h2>9. How long we keep it</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead><tr><th className={th}>Information</th><th className={th}>How long</th></tr></thead>
            <tbody>
              <tr><td className={td}>Account details</td><td className={td}>While your account is active. When you delete your account, we delete or anonymise it within 30 days, unless the law requires us to keep something.</td></tr>
              <tr><td className={td}>Your exact location attached to price reports</td><td className={td}>Removed after 13 months. The price itself may be kept without it to show price history.</td></tr>
              <tr><td className={td}>ID photo</td><td className={td}>Deleted as soon as it has been reviewed (approved or rejected).</td></tr>
              <tr><td className={td}>ID details (name, date of birth, ID type, last 4 characters, one-way code)</td><td className={td}>While you take part in Rewards, and afterwards only as long as needed to prevent repeat fraud and meet tax and accounting laws.</td></tr>
              <tr><td className={td}>Bank details</td><td className={td}>Until you remove them or leave Rewards. Records of prizes paid are kept as long as tax and accounting laws require.</td></tr>
              <tr><td className={td}>Email subscription</td><td className={td}>Until you unsubscribe. After that we keep only your email address and the date you unsubscribed, so we never email you again by mistake.</td></tr>
              <tr><td className={td}>Station claims and CAC documents</td><td className={td}>As long as needed to verify and manage the station.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>10. Cookies and browser storage</h2>
        <p>We only use storage that is needed for {SITE.name} to work or to remember choices you make:</p>
        <ul>
          <li><strong>Sign-in cookies</strong> that keep you logged in securely.</li>
          <li><strong>Your preferences</strong> saved in your browser: light or dark theme, whether the LGA boundaries are shown, and your saved stations.</li>
        </ul>
        <p>We do not use advertising or tracking cookies. If we ever add analytics or advertising cookies, we will ask for your permission first, with an equally easy way to say no.</p>
      </section>

      <section>
        <h2>11. Your rights</h2>
        <p>Under the NDPA you can ask us to:</p>
        <ul>
          <li>tell you what personal information we hold about you and give you a copy;</li>
          <li>correct information that is wrong or incomplete;</li>
          <li>delete your information, or restrict how we use it;</li>
          <li>give you your information in a common electronic format, or send it to another organisation (portability);</li>
          <li>stop using your information for a particular purpose. You can <strong>always</strong> stop marketing emails, using the unsubscribe link in any email or the switch in your dashboard settings, and we stop straight away;</li>
          <li>withdraw any consent you gave (this does not affect what we did before);</li>
          <li>have a person review a decision made by our automated checks.</li>
        </ul>
        <p>
          Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> from the address linked to your account. We may ask you to confirm your identity, and we
          will respond within 30 days. You can also revoke {SITE.name}&apos;s access to your Google account at any time at{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.
        </p>
        <p>
          If you are not happy with how we handle your information, please tell us first so we can put it right. You also have the right to complain to the{' '}
          <a href="https://ndpc.gov.ng" target="_blank" rel="noopener noreferrer">Nigeria Data Protection Commission (NDPC)</a>.
        </p>
      </section>

      <section>
        <h2>12. Children</h2>
        <p>
          {SITE.name} is not for children under 13. If you are 13 to 17, you may use {SITE.name} only with the permission of a parent or guardian. You must be 18 or
          older to join Rewards, and we check this using your ID. If we learn that we hold information about a child without proper consent, we will delete it.
        </p>
      </section>

      <section>
        <h2>13. Changes to this policy</h2>
        <p>
          If we make important changes, we will update the date at the top of this page and, where appropriate, let you know in the app or by email before the change
          applies. The <Link href="/rewards/rules">Rewards Official Rules</Link> also explain how Rewards information is used.
        </p>
      </section>

      <section>
        <h2>14. Contact us</h2>
        <p>
          Questions about your privacy? Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
