// EXPO_PUBLIC_ vars are bundled into the client — this must be the
// publishable key only, never the secret key.
export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

if (!STRIPE_PUBLISHABLE_KEY && __DEV__) {
  console.warn(
    '[stripeConfig] EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — payment screens will fail to open PaymentSheet.',
  );
}
