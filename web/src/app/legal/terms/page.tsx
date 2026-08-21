import type { Metadata } from "next";
import Link from "next/link";
import {
  Callout,
  LegalShell,
  OL,
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
  title: "Terms of Service — Pickleball App",
  description:
    "The agreement between you and Pickleball App covering accounts, tournaments, payments, marketplace listings, coaching, and acceptable use.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="TERMS OF SERVICE"
      intro={
        <>
          These Terms of Service (the &ldquo;Terms&rdquo;) are a binding agreement between you and{" "}
          {LEGAL_ENTITY} (&ldquo;Pickleball App&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). They
          cover the Pickleball App mobile app, our website, and every related service
          (together, the &ldquo;Service&rdquo;). By creating an account or using the Service you
          accept these Terms. If you do not accept them, do not use the Service.
        </>
      }
    >
      <Section id="eligibility" heading="1. Who may use the Service">
        <P>
          You must be at least 13 years old to create an account. If you are under 18, you may use
          the Service only with the involvement of a parent or legal guardian who agrees to these
          Terms on your behalf. Tournament organizers and facilities may impose their own age
          requirements for specific events.
        </P>
        <P>
          You must provide accurate account information and keep it current. You are responsible for
          everything that happens under your account, including activity by anyone you allow to use
          it. Do not share your credentials. Tell us at{" "}
          <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          if you believe your account has been compromised.
        </P>
      </Section>

      <Section id="account" heading="2. Your account and profile">
        <P>
          Your profile — including your name, photo, skill rating, and play history — is visible to
          other users of the Service. Some of it is public by design: brackets, results, tournament
          rosters, group posts, and marketplace listings are meant to be seen. Do not put anything
          in your profile that you would not want other players to see.
        </P>
        <P>
          You can delete your account at any time from{" "}
          <Strong>Account Settings → Delete Account</Strong> in the mobile app. Deletion is
          permanent and is described in detail on the{" "}
          <Link className="text-primary hover:underline" href={LEGAL_ROUTES.deleteAccount}>
            account deletion page
          </Link>
          .
        </P>
      </Section>

      <Section id="conduct" heading="3. Acceptable use">
        <P>You agree not to use the Service to:</P>
        <UL>
          <li>
            harass, threaten, stalk, impersonate, or abuse another person, on or off the courts;
          </li>
          <li>
            post content that is unlawful, hateful, sexually explicit, or that infringes someone
            else&apos;s rights;
          </li>
          <li>
            misrepresent your skill rating, match results, identity, or eligibility for a division;
          </li>
          <li>
            list, sell, or arrange anything prohibited by law, or anything you do not have the right
            to sell;
          </li>
          <li>
            scrape, crawl, reverse engineer, overload, or circumvent any technical or access control
            in the Service;
          </li>
          <li>
            use the Service to send unsolicited commercial messages, or to collect other users&apos;
            personal information.
          </li>
        </UL>
        <P>
          We operate an in-app reporting and blocking system. Reports of objectionable content or
          abusive users are reviewed, and we remove content and suspend accounts that violate these
          Terms. We aim to act on reports within 24 hours.
        </P>
      </Section>

      <Section id="content" heading="4. Content you post">
        <P>
          You keep ownership of the photos, posts, messages, listings, and other content you submit
          (&ldquo;Your Content&rdquo;). You grant us a worldwide, non-exclusive, royalty-free
          licence to host, store, reproduce, resize, and display Your Content for the purpose of
          operating and promoting the Service. This licence ends when you delete the content or your
          account, except for copies retained in backups, and except where the content has been
          shared with others in a way that cannot be recalled (for example, a message another player
          has already received).
        </P>
        <P>
          You are responsible for Your Content, and you confirm that you have the rights needed to
          post it. We may remove content that violates these Terms without notice.
        </P>
      </Section>

      <Section id="tournaments" heading="5. Tournaments, registrations, and holds">
        <P>
          Tournaments listed on the Service are run by independent organizers and facilities, not by
          Pickleball App. When you register for an event, you enter an agreement with that organizer.
          Their rules — format, divisions, refund window, code of conduct, weather policy — govern
          the event. We provide the software that lists the event, collects the entry fee, and
          publishes brackets and results.
        </P>
        <P>
          A &ldquo;hold&rdquo; reserves a spot in an event for a limited time. Holds may be paid,
          are subject to the organizer&apos;s terms, and expire automatically. An expired hold
          releases the spot to the waitlist.
        </P>
        <P>
          Skill ratings shown in the Service — including our own rating system and any rating
          imported from a third party — are estimates produced from reported results. They are not
          guarantees of eligibility, and organizers may accept, reject, or reclassify any entry.
        </P>
      </Section>

      <Section id="payments" heading="6. Payments, fees, and refunds">
        <P>
          Payments are processed by <Strong>Stripe</Strong>. We do not receive or store your full
          card number. Your use of Stripe is subject to Stripe&apos;s own terms and privacy policy.
        </P>
        <UL>
          <li>
            <Strong>Entry fees and holds</Strong> are set by the organizer and charged at the time
            you register. Refunds are governed by the organizer&apos;s published refund policy, and
            requests should go to the organizer first.
          </li>
          <li>
            <Strong>Court reservations</Strong> are charged by the facility that owns the courts.
            Cancellation windows are set by the facility.
          </li>
          <li>
            <Strong>Coaching sessions and vouchers</Strong> are agreements between you and the
            coach. Unused vouchers expire on the date shown at purchase.
          </li>
          <li>
            <Strong>Marketplace purchases</Strong> are between buyer and seller. See section 7.
          </li>
          <li>
            <Strong>Wallet items</Strong>, offers, and deals have no cash value, are
            non-transferable unless stated otherwise, and expire on the date shown.
          </li>
        </UL>
        <P>
          Where we act only as the payment facilitator, we are not the merchant of record for the
          underlying goods or services and we are not responsible for their delivery or quality. If
          a charge on the Service looks wrong, contact{" "}
          <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          before disputing it with your bank; we can usually resolve it faster.
        </P>
      </Section>

      <Section id="marketplace" heading="7. Marketplace and peer-to-peer transactions">
        <P>
          The marketplace lets players list and buy gear. Pickleball App is not a party to those
          sales. We do not inspect items, verify descriptions, or guarantee that a sale completes.
          Sellers must accurately describe what they list and must have the right to sell it. Buyers
          are responsible for satisfying themselves before purchasing.
        </P>
        <P>
          Listing assistance features that draft or improve listing text produce suggestions only.
          You are responsible for the accuracy of the listing you publish.
        </P>
      </Section>

      <Section id="messaging" heading="8. Messaging and communications">
        <P>
          The Service includes direct messages, group chats, and match/partner requests. Messages
          are visible to their recipients and to us where needed to investigate a report, comply
          with law, or keep the Service running. Do not use messaging to send anything you would not
          want reviewed in a safety investigation.
        </P>
        <P>
          We send transactional email and push notifications about your registrations, payments,
          messages, and account. You can turn off push notifications in your device settings, and
          adjust categories in the app. Some transactional email — receipts, security notices — is
          required to operate your account and cannot be switched off while the account exists.
        </P>
      </Section>

      <Section id="thirdparty" heading="9. Third-party services">
        <P>
          The Service integrates with third parties including Stripe (payments), Supabase (hosting
          and data storage), Expo and the Apple and Google push services (notifications), Apple and
          Google (sign-in), map and weather providers, and email delivery providers. Their handling
          of your data is described in our{" "}
          <Link className="text-primary hover:underline" href={LEGAL_ROUTES.privacy}>
            Privacy Policy
          </Link>
          .
        </P>
      </Section>

      <Section id="availability" heading="10. Availability and changes">
        <P>
          We may change, suspend, or discontinue parts of the Service. We will give reasonable
          notice of material changes that affect paid features. We may update these Terms; if a
          change is material, we will notify you in the app or by email before it takes effect.
          Continuing to use the Service after that date means you accept the updated Terms.
        </P>
      </Section>

      <Section id="termination" heading="11. Suspension and termination">
        <P>
          We may suspend or terminate your access if you breach these Terms, if we are required to
          by law, or if your account presents a security or safety risk. You may stop using the
          Service and delete your account at any time.
        </P>
        <Callout>
          Some records survive account deletion because we are required to keep them: payment and
          refund records for tax and anti-fraud purposes, and the results of tournaments you played
          in, which belong to the event&apos;s competitive record. These are described on the{" "}
          <Link className="text-primary hover:underline" href={LEGAL_ROUTES.deleteAccount}>
            account deletion page
          </Link>
          .
        </Callout>
      </Section>

      <Section id="disclaimers" heading="12. Disclaimers">
        <P>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest
          extent permitted by law, we disclaim all warranties, express or implied, including
          merchantability, fitness for a particular purpose, and non-infringement. We do not warrant
          that the Service will be uninterrupted or error-free, that ratings or results will be
          accurate, or that any event, court booking, coaching session, or sale will take place.
        </P>
        <P>
          <Strong>Pickleball is a physical activity.</Strong> You participate in matches, events,
          and sessions arranged through the Service at your own risk, and you are responsible for
          your own fitness to play and for your own conduct and safety on court.
        </P>
      </Section>

      <Section id="liability" heading="13. Limitation of liability">
        <P>
          To the fullest extent permitted by law, Pickleball App will not be liable for indirect,
          incidental, special, consequential, or punitive damages, or for lost profits, data, or
          goodwill. Our total liability for any claim relating to the Service is limited to the
          greater of (a) the amount you paid us in the twelve months before the claim arose, and (b)
          USD 100.
        </P>
        <P>
          Some jurisdictions do not allow these limitations, in which case they apply to the maximum
          extent permitted, and nothing in these Terms limits liability for death or personal injury
          caused by negligence, fraud, or anything else that cannot be limited by law.
        </P>
      </Section>

      <Section id="indemnity" heading="14. Indemnity">
        <P>
          You agree to indemnify and hold harmless Pickleball App and its officers, employees, and
          agents from claims, damages, and expenses (including reasonable legal fees) arising from
          Your Content, your use of the Service, or your breach of these Terms.
        </P>
      </Section>

      <Section id="apple" heading="15. App Store terms">
        <P>
          If you obtained the app from the Apple App Store, the following applies. This agreement is
          between you and Pickleball App only, not with Apple. Apple has no obligation to provide
          maintenance or support for the app. If the app fails to conform to any applicable
          warranty, you may notify Apple and Apple will refund the purchase price; to the maximum
          extent permitted by law, Apple has no other warranty obligation. Apple is not responsible
          for addressing any claim relating to the app, including product liability, regulatory
          non-compliance, or consumer protection claims. Apple and its subsidiaries are third-party
          beneficiaries of these Terms and may enforce them against you. You represent that you are
          not located in a country subject to a U.S. Government embargo and are not on any U.S.
          Government restricted-parties list.
        </P>
      </Section>

      <Section id="general" heading="16. General">
        <OL>
          <li>
            <Strong>Governing law.</Strong> These Terms are governed by the laws of{" "}
            {"[GOVERNING LAW JURISDICTION]"}, without regard to conflict-of-laws rules, and the
            courts of that jurisdiction have exclusive jurisdiction over disputes.
          </li>
          <li>
            <Strong>Severability.</Strong> If any provision is unenforceable, the rest remains in
            force.
          </li>
          <li>
            <Strong>No waiver.</Strong> Our failure to enforce a provision is not a waiver of it.
          </li>
          <li>
            <Strong>Assignment.</Strong> You may not assign these Terms; we may assign them in
            connection with a merger, acquisition, or sale of assets.
          </li>
          <li>
            <Strong>Entire agreement.</Strong> These Terms and the Privacy Policy are the whole
            agreement between us about the Service.
          </li>
        </OL>
      </Section>

      <Section id="contact" heading="17. Contact">
        <P>
          {LEGAL_ENTITY}
          <br />
          {LEGAL_ADDRESS}
          <br />
          Support:{" "}
          <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          <br />
          Privacy:{" "}
          <a className="text-primary hover:underline" href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL}
          </a>
        </P>
      </Section>
    </LegalShell>
  );
}
