import type { Metadata } from "next";
import Link from "next/link";
import { Callout, LegalShell, OL, P, Section, Strong, UL } from "@/components/legal/legal-shell";
import { LEGAL_ROUTES, PRIVACY_EMAIL, SUPPORT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Delete Your Account — Pickleball App",
  description:
    "How to permanently delete your Pickleball App account and personal data, what is removed, and what is retained.",
};

export default function DeleteAccountPage() {
  return (
    <LegalShell
      title="DELETE YOUR ACCOUNT"
      intro={
        <>
          You can delete your Pickleball App account and personal data yourself, from inside the app,
          without contacting us. This page explains how, what is removed, and what we are required
          to keep.
        </>
      }
    >
      <Section id="how" heading="How to delete your account">
        <OL>
          <li>Open the Pickleball App app and sign in.</li>
          <li>
            Tap your profile photo, then <Strong>Account Settings</Strong>.
          </li>
          <li>
            Scroll to <Strong>Delete Account</Strong>.
          </li>
          <li>
            Read what will be deleted and kept, type <Strong>DELETE</Strong> to confirm, then tap{" "}
            <Strong>Permanently delete my account</Strong>.
          </li>
        </OL>
        <Callout>
          Deletion is <Strong>immediate and irreversible</Strong>. There is no grace period and no
          way for us to restore the account afterwards.
        </Callout>
      </Section>

      <Section id="deleted" heading="What is deleted">
        <UL>
          <li>Your name, email address, profile photo, bio, and date of birth.</li>
          <li>Your location, home court, and search and radius settings.</li>
          <li>Your rating profile, play style, and partner preferences.</li>
          <li>Your saved events, bookmarks, group memberships, and marketplace listings.</li>
          <li>Push notification tokens for every device you signed in on.</li>
          <li>Your sign-in credentials — the account can no longer be used to log in.</li>
        </UL>
      </Section>

      <Section id="kept" heading="What is kept, and why">
        <P>
          A small amount of data survives deletion because removing it would corrupt other
          people&apos;s records or break a legal obligation. Where it remains, your identity is
          replaced with an anonymized placeholder.
        </P>
        <UL>
          <li>
            <Strong>Tournament registrations and results</Strong> — so brackets, seeds, and other
            players&apos; match histories stay correct.
          </li>
          <li>
            <Strong>Payment and refund records</Strong> — required for financial reporting, tax, and
            anti-fraud purposes, and retained by Stripe under its own schedule.
          </li>
          <li>
            <Strong>Messages you sent</Strong> — they remain visible to the people who received
            them, the same way a sent email does.
          </li>
          <li>
            <Strong>Support tickets and safety reports</Strong> involving your account.
          </li>
          <li>
            <Strong>Encrypted backups</Strong> — deleted data may persist briefly in backups before
            they roll off.
          </li>
        </UL>
      </Section>

      <Section id="blocked" heading="If deletion is blocked">
        <P>
          Deletion is refused while you have obligations that would strand other people. The app
          tells you which one applies:
        </P>
        <UL>
          <li>You are the director of a tournament that has not finished.</li>
          <li>You have an upcoming coaching session or an unredeemed voucher sold to a player.</li>
          <li>You have a pending payout or an unresolved payment dispute.</li>
        </UL>
        <P>
          Resolve the item — finish or transfer the event, refund or complete the session — and the
          deletion will go through. If you are stuck, email{" "}
          <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </P>
      </Section>

      <Section id="cantsignin" heading="If you cannot sign in">
        <P>
          Email{" "}
          <a className="text-primary hover:underline" href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL}
          </a>{" "}
          from the address on the account, with the subject &ldquo;Account deletion request&rdquo;.
          We verify ownership before deleting anything and respond within 30 days.
        </P>
        <P>
          For everything else this policy covers, see the{" "}
          <Link className="text-primary hover:underline" href={LEGAL_ROUTES.privacy}>
            Privacy Policy
          </Link>
          .
        </P>
      </Section>
    </LegalShell>
  );
}
