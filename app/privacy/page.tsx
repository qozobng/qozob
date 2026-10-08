import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: `Privacy Policy | ${SITE.name}`,
  description: `How ${SITE.name} collects, uses and protects your information.`,
  alternates: { canonical: `${SITE.url}/privacy` },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`${SITE.name} (${SITE.domain}) helps people across ${SITE.country} (drivers, generator users, households and businesses) find fuel stations, compare live pump prices and share updates with the community. This policy explains, in plain language, what information we collect, why, and the choices you have.`}
    >
      <section>
        <h2>1. Information we collect</h2>
        <p><strong>When you create an account or sign in</strong></p>
        <ul>
          <li>Your email address and password (passwords are encrypted. We never see them).</li>
          <li>If you choose <strong>Sign in with Google</strong>: your name, email address and profile picture from your Google account. We do not receive your Google password or access your Gmail, contacts, files or any other Google data.</li>
          <li>Details you enter at sign-up, such as your name, phone number, address, state and country.</li>
        </ul>
        <p><strong>If you are a station owner or manager</strong></p>
        <ul>
          <li>Business details you submit to claim a station: applicant name, phone number, company name, CAC registration number and your CAC document.</li>
          <li>Station details and logos you upload.</li>
        </ul>
        <p><strong>When you use the map</strong></p>
        <ul>
          <li>Your device location, <em>only if you allow it</em>, to show nearby stations and distances. Your location is used on your device and is not stored in your account.</li>
          <li>Prices, queue reports and pump-accuracy ratings you submit.</li>
        </ul>
        <p><strong>Automatically</strong></p>
        <ul>
          <li>Essential cookies that keep you signed in. We do not use advertising cookies.</li>
          <li>Basic technical logs (such as browser type and error reports) kept by our hosting providers to keep the service secure and working.</li>
        </ul>
      </section>

      <section>
        <h2>2. How we use your information</h2>
        <ul>
          <li>To create and secure your account and sign you in.</li>
          <li>To show fuel stations, prices and directions near you.</li>
          <li>To publish community price and queue updates (shown without your name or email).</li>
          <li>To verify station ownership claims and Manager access requests.</li>
          <li>To prevent abuse, such as fake prices or repeated ratings.</li>
          <li>To contact you about your account or a claim you submitted.</li>
        </ul>
        <p>We <strong>do not sell</strong> your personal information, and we do not use it for advertising.</p>
      </section>

      <section>
        <h2>3. Google user data</h2>
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
        <h2>4. Who can see your information</h2>
        <ul>
          <li><strong>Everyone:</strong> station names, locations, prices, queue status and average ratings.</li>
          <li><strong>Only you and the {SITE.name} team:</strong> your account details, station claims, CAC documents and Manager requests. CAC documents are stored privately and can only be opened by authorised {SITE.name} administrators.</li>
          <li><strong>Service providers</strong> who host and run {SITE.name} on our behalf, under their own security and privacy commitments:
            Supabase (database, sign-in and file storage), Vercel (website hosting) and Google (Maps, places search and Google sign-in).</li>
          <li><strong>Authorities</strong>, only where the law requires it.</li>
        </ul>
      </section>

      <section>
        <h2>5. How we protect it</h2>
        <p>
          Information is sent over encrypted connections (HTTPS). Database rules ensure each person can only see and change what
          they are allowed to, and administrator actions are checked by the database itself.
        </p>
      </section>

      <section>
        <h2>6. How long we keep it</h2>
        <p>
          We keep your account information while your account is active. Station claims and CAC documents are kept for as long as
          needed to verify and manage the station. Community price updates may be kept in anonymous form to show price history.
          When you delete your account, we delete or anonymise your personal information within 30 days, unless the law requires us to keep it.
        </p>
      </section>

      <section>
        <h2>7. Your rights</h2>
        <p>Under the Nigeria Data Protection Act 2023 and similar laws, you can ask us to:</p>
        <ul>
          <li>see a copy of the personal information we hold about you;</li>
          <li>correct information that is wrong;</li>
          <li>delete your account and personal information;</li>
          <li>stop using your information for a particular purpose.</li>
        </ul>
        <p>
          Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> from the address linked to your account, and we will respond
          within 30 days. You can also revoke {SITE.name}&apos;s access to your Google account at any time at{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.
        </p>
      </section>

      <section>
        <h2>8. Children</h2>
        <p>{SITE.name} is not intended for children under 13, and we do not knowingly collect their information.</p>
      </section>

      <section>
        <h2>9. Changes to this policy</h2>
        <p>
          If we make important changes, we will update the date at the top of this page and, where appropriate, let you know in
          the app or by email.
        </p>
      </section>

      <section>
        <h2>10. Contact us</h2>
        <p>
          Questions about your privacy? Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
        </p>
      </section>
    </LegalPage>
  );
}

