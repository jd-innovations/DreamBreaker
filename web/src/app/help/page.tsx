import type { Metadata } from "next";
import Link from "next/link";
import { Callout, LegalShell, P, Section, Strong, UL } from "@/components/legal/legal-shell";
import { LEGAL_ROUTES, PRIVACY_EMAIL, SUPPORT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Support — Pickleball App",
  description:
    "Get help with your Pickleball App account, tournament registrations, payments, and safety reports.",
};

export default function HelpPage() {
  return (
    <LegalShell
      title="SUPPORT"
      eyebrow="HELP CENTER"
      lastUpdated={null}
      intro={
        <>
          Every question reaches a person. Email us and we typically reply within one business day.
        </>
      }
    >
      <Section id="contact" heading="Contact us">
        <Callout>
          <Strong>Email</Strong>{" "}
          <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          <br />
          <Strong>Privacy and data requests</Strong>{" "}
          <a className="text-primary hover:underline" href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL}
          </a>
          <br />
          <span className="text-sm">Typical response time: within one business day.</span>
        </Callout>
        <P>
          In the app, open <Strong>Profile → Help &amp; Support</Strong> to start a support ticket.
          Tickets are threaded, so you can follow the conversation without leaving the app.
        </P>
      </Section>

      <Section id="account" heading="Account and sign-in">
        <UL>
          <li>
            <Strong>Forgot your password?</Strong> Use &ldquo;Forgot password&rdquo; on the sign-in
            screen. The reset link is valid for one hour.
          </li>
          <li>
            <Strong>Signed up with Apple or Google?</Strong> Use the same button you signed up with
            — an email-and-password login will not find the account.
          </li>
          <li>
            <Strong>Wrong email on the account?</Strong> Change it in Account Settings, or email us
            from the old address if you no longer have access.
          </li>
          <li>
            <Strong>Deleting your account?</Strong> See{" "}
            <Link className="text-primary hover:underline" href={LEGAL_ROUTES.deleteAccount}>
              Delete Your Account
            </Link>
            .
          </li>
        </UL>
      </Section>

      <Section id="tournaments" heading="Tournaments and registrations">
        <UL>
          <li>
            Registration questions — division placement, partner changes, waitlists — go to the
            tournament director first. Their contact details are on the tournament page.
          </li>
          <li>
            <Strong>Refunds</Strong> follow the refund policy published on each tournament page.
            Directors approve them; we process them.
          </li>
          <li>
            <Strong>A hold expired before you paid?</Strong> The spot returns to the waitlist
            automatically. Re-register if a spot is still open.
          </li>
          <li>
            <Strong>Results or bracket look wrong?</Strong> Ask the director to correct them — they
            control the bracket, and ratings recompute from the corrected result.
          </li>
        </UL>
      </Section>

      <Section id="payments" heading="Payments">
        <P>
          Charges appear on your statement from the organizer, facility, or coach you paid, via
          Stripe. If a charge looks wrong, email{" "}
          <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          with the date and amount before opening a bank dispute — we can usually resolve it in a
          day, and a dispute freezes the funds for weeks.
        </P>
      </Section>

      <Section id="safety" heading="Safety and reporting">
        <P>
          Every profile, post, listing, and message has a report action, and you can block any user
          from their profile. Reports are reviewed and we act on them within 24 hours. To report
          something urgent, email{" "}
          <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          with &ldquo;Safety&rdquo; in the subject line.
        </P>
        <P>If someone is in immediate danger, contact your local emergency services first.</P>
      </Section>

      <Section id="legal" heading="Policies">
        <UL>
          <li>
            <Link className="text-primary hover:underline" href={LEGAL_ROUTES.terms}>
              Terms of Service
            </Link>
          </li>
          <li>
            <Link className="text-primary hover:underline" href={LEGAL_ROUTES.privacy}>
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link className="text-primary hover:underline" href={LEGAL_ROUTES.deleteAccount}>
              Delete Your Account
            </Link>
          </li>
        </UL>
      </Section>
    </LegalShell>
  );
}
