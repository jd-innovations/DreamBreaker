import { ReviewForm } from './review-form';

// The review link from the invitation email, opened in a browser.
//
// Unlike /claim/[token], this is NOT a "go open the app" wall. The invitation
// is emailed, and email gets opened on a desktop as often as on a phone — a
// page that can only tell a laptop user to install an app is a review that
// never gets written. The same URL opens the native screen when the app is
// installed (universal link), and renders this form when it is not.

export const metadata = {
  title: 'Leave a review · Pickleball App',
  // The token in the URL is a capability. Search engines have no business
  // holding one, and a crawler following the link would burn nothing but would
  // still put the token in an index.
  robots: { index: false, follow: false },
};

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ReviewForm token={token} />;
}
