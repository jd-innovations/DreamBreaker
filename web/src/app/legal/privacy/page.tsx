import type { Metadata } from "next";
import Link from "next/link";
import {
  Callout,
  DataTable,
  LegalShell,
  P,
  Section,
  Strong,
  UL,
} from "@/components/legal/legal-shell";
import {
  LEGAL_ADDRESS,
  LEGAL_ENTITY,
  LEGAL_ROUTES,
  PRIVACY_EMAIL,
  SUPPORT_EMAIL,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Pickleball App",
  description:
    "What Pickleball App collects, why, who we share it with, how long we keep it, and how to delete your account and data.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="PRIVACY POLICY"
      intro={
        <>
          This policy explains what {LEGAL_ENTITY} (&ldquo;Pickleball App&rdquo;,
          &ldquo;we&rdquo;) collects when you use the Pickleball App app and website, why
          we collect it, who else sees it, how long we keep it, and how to get rid of it. It applies
          to every part of the Service.
        </>
      }
    >
      <Section id="summary" heading="1. The short version">
        <UL>
          <li>
            We collect what we need to run a competitive pickleball platform: your profile, the
            events you register for, the payments you make, and the messages you send.
          </li>
          <li>
            <Strong>We do not sell your personal information</Strong>, and we do not share it with
            advertisers or data brokers.
          </li>
          <li>
            Location is used <Strong>while you use the app</Strong> to show nearby events, courts,
            partners, and listings. Precise coordinates stay on your device unless you choose to
            attach a location to something you post.
          </li>
          <li>
            You can delete your account and personal data from inside the app at any time — see{" "}
            <Link className="text-primary hover:underline" href={LEGAL_ROUTES.deleteAccount}>
              Delete Your Account
            </Link>
            .
          </li>
        </UL>
      </Section>

      <Section id="collect" heading="2. What we collect and why">
        <DataTable
          rows={[
            {
              what: "Account and profile",
              why: "Name, email address, password (stored only as a hash) or Apple/Google sign-in identifier, date of birth or age band, profile photo, city, skill level and playing preferences. Used to create and secure your account and to show you to other players.",
            },
            {
              what: "Location",
              why: "With your permission, your device's approximate or precise location while the app is open, used to sort tournaments, courts, partners, and marketplace listings by distance. Foreground only — we never request background location. Coordinates are evaluated on your device; we store only what you choose to save, such as your city or a listing's pickup area, and your radius preferences.",
            },
            {
              what: "Push notification tokens",
              why: "A device token issued by Apple, Google, or Expo, plus the platform name, stored against your account so we can send you match, message, registration, and payment notifications. Deleted when you sign out of that device or delete your account.",
            },
            {
              what: "Payments",
              why: "Amounts, currency, description, status, and the identifiers Stripe returns for a charge, refund, or payout. Card numbers are entered into Stripe and never reach our servers. Sellers and organizers who take payouts also complete Stripe onboarding directly with Stripe.",
            },
            {
              what: "Messages and community content",
              why: "Direct messages, group chats, posts, comments, reactions, polls, partner requests, and reports. Stored so conversations persist across your devices, and accessible to us when investigating a report or complying with law.",
            },
            {
              what: "Support diagnostics",
              why: "When you open a support ticket or send feedback we record the ticket contents and, to reproduce the problem, technical details such as app version, build number, device model, and operating system version.",
            },
            {
              what: "Images and media",
              why: "Profile photos, group and listing photos, facility and event photos you upload. Images are resized and stored in our hosted object storage. Photos you post to public surfaces are visible to other users. We strip nothing from filenames you choose, so avoid identifying filenames.",
            },
            {
              what: "Analytics",
              why: "Aggregated, pseudonymous usage events — screens opened, features used, funnel completion — used to understand what works and what is broken. We do not use analytics for advertising and do not build advertising profiles.",
            },
            {
              what: "Crash and error reporting",
              why: "When the app crashes or hits an unhandled error we collect a stack trace, device model, OS version, app version, and an anonymous installation identifier so the crash can be fixed.",
            },
            {
              what: "Play and rating data",
              why: "Registrations, match results, brackets, check-ins, and the rating history computed from them. Competitive results are part of the public record of an event.",
            },
          ]}
        />
      </Section>

      <Section id="legalbasis" heading="3. Why we are allowed to process it">
        <P>
          Where the GDPR or a similar law applies, we rely on: <Strong>contract</Strong> — to give
          you the Service you signed up for; <Strong>legitimate interests</Strong> — to keep the
          Service secure, prevent fraud and abuse, and improve the product;{" "}
          <Strong>consent</Strong> — for location access, push notifications, and camera or photo
          library access, each of which you grant at the operating system level and can withdraw at
          any time in your device settings; and <Strong>legal obligation</Strong> — for tax,
          accounting, and law-enforcement requirements.
        </P>
      </Section>

      <Section id="sharing" heading="4. Who we share it with">
        <P>We share personal information only with the following categories of recipient.</P>
        <UL>
          <li>
            <Strong>Other users.</Strong> Your profile, results, brackets, group posts, listings,
            and the messages you send are visible to the people you share them with. Tournament
            organizers see the registration details of players in their events.
          </li>
          <li>
            <Strong>Stripe</Strong> — payment processing, payouts, and fraud prevention.
          </li>
          <li>
            <Strong>Supabase</Strong> — our database, authentication, file storage, and server
            functions provider.
          </li>
          <li>
            <Strong>Expo, Apple Push Notification service, and Firebase Cloud Messaging</Strong> —
            delivery of push notifications.
          </li>
          <li>
            <Strong>Apple and Google</Strong> — sign-in, when you use those buttons.
          </li>
          <li>
            <Strong>Email delivery, map, and weather providers</Strong> — to send transactional
            email and render maps and event forecasts.
          </li>
          <li>
            <Strong>Analytics and crash reporting providers</Strong> — as described above.
          </li>
          <li>
            <Strong>Law enforcement or regulators</Strong> — where we are legally required to, or
            where necessary to protect someone&apos;s safety.
          </li>
          <li>
            <Strong>An acquirer</Strong> — if the business is merged or sold, subject to this
            policy.
          </li>
        </UL>
        <Callout>
          <Strong>We do not sell personal information</Strong> and we do not share it for
          cross-context behavioural advertising, as those terms are defined under California law.
        </Callout>
      </Section>

      <Section id="retention" heading="5. How long we keep it">
        <UL>
          <li>
            <Strong>Account and profile data</Strong> — while your account exists. Deleted or
            anonymized when you delete your account.
          </li>
          <li>
            <Strong>Messages</Strong> — deleted with your account, except copies already delivered
            to other participants.
          </li>
          <li>
            <Strong>Push tokens</Strong> — removed on sign-out of the device or on account deletion.
          </li>
          <li>
            <Strong>Payment records</Strong> — retained after account deletion where tax, accounting,
            or anti-fraud law requires it, and by Stripe under its own retention schedule.
          </li>
          <li>
            <Strong>Tournament results and brackets</Strong> — retained as the competitive record of
            the event, with your identity replaced by a deleted-user placeholder.
          </li>
          <li>
            <Strong>Support tickets</Strong> — retained while needed to resolve the issue and to
            handle any related dispute.
          </li>
          <li>
            <Strong>Backups</Strong> — deleted data may persist in encrypted backups for a short
            period before those backups roll off.
          </li>
        </UL>
      </Section>

      <Section id="rights" heading="6. Your rights and choices">
        <P>
          Depending on where you live you may have the right to access, correct, delete, restrict,
          or object to our processing of your personal information, to receive a portable copy, and
          to appeal a refusal. You can exercise most of these directly in the app:
        </P>
        <UL>
          <li>
            <Strong>Access and correction</Strong> — Profile → Edit Profile, and Account Settings.
          </li>
          <li>
            <Strong>Deletion</Strong> — Account Settings → Delete Account. See{" "}
            <Link className="text-primary hover:underline" href={LEGAL_ROUTES.deleteAccount}>
              Delete Your Account
            </Link>
            .
          </li>
          <li>
            <Strong>Location, camera, photos, notifications</Strong> — your device&apos;s system
            settings, at any time.
          </li>
          <li>
            <Strong>Anything else</Strong> — email{" "}
            <a className="text-primary hover:underline" href={`mailto:${PRIVACY_EMAIL}`}>
              {PRIVACY_EMAIL}
            </a>
            . We respond within 30 days, and will never charge you or degrade your service for
            making a request.
          </li>
        </UL>
      </Section>

      <Section id="security" heading="7. How we protect it">
        <P>
          Data is encrypted in transit with TLS and at rest by our hosting provider. Access to the
          production database is restricted, and row-level security policies stop one user&apos;s
          data being read by another. Passwords are stored only as salted hashes. No system is
          perfectly secure; if a breach affects your personal information we will notify you and the
          relevant regulator as required by law.
        </P>
      </Section>

      <Section id="children" heading="8. Children">
        <P>
          The Service is not directed to children under 13, and we do not knowingly collect personal
          information from them. If you believe a child under 13 has created an account, contact{" "}
          <a className="text-primary hover:underline" href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL}
          </a>{" "}
          and we will delete it.
        </P>
      </Section>

      <Section id="transfers" heading="9. International transfers">
        <P>
          We operate from the United States and our providers store data in the United States. If
          you use the Service from outside the United States, your information is transferred there.
          Where required, transfers out of the European Economic Area or the United Kingdom rely on
          the European Commission&apos;s Standard Contractual Clauses.
        </P>
      </Section>

      <Section id="changes" heading="10. Changes to this policy">
        <P>
          We will update this page when our practices change and revise the &ldquo;last
          updated&rdquo; date. If a change materially affects how we use your information we will
          notify you in the app or by email before it takes effect.
        </P>
      </Section>

      <Section id="contact" heading="11. Contact us">
        <P>
          {LEGAL_ENTITY}
          <br />
          {LEGAL_ADDRESS}
          <br />
          Privacy:{" "}
          <a className="text-primary hover:underline" href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL}
          </a>
          <br />
          Support:{" "}
          <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </P>
      </Section>
    </LegalShell>
  );
}
