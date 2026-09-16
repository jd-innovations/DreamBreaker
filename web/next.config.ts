import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { OPTIMIZABLE_IMAGE_HOSTS } from "./src/lib/image-hosts";

const nextConfig: NextConfig = {
  images: {
    // Generated from OPTIMIZABLE_IMAGE_HOSTS rather than listed by hand here.
    // That list is also what SafeImage (components/shared/safe-image.tsx)
    // checks BEFORE choosing next/image over a plain <img> for a src that
    // might be user-typed -- see that file and lib/image-hosts.ts for the
    // incident (a live tournament's cover image on an unlisted host) that
    // made two independent copies of this allowlist worth collapsing into
    // one.
    remotePatterns: OPTIMIZABLE_IMAGE_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  },
  experimental: {
    // F6: Next's own docs recommend this for icon libraries specifically, to
    // guarantee per-icon chunking regardless of how well a library's barrel
    // file tree-shakes on its own. @phosphor-icons/react is imported by name
    // in 38 files; this is not proven to fix an existing oversized chunk (see
    // the audit), it is a zero-downside addition.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

// Wraps the build to upload source maps. Without this a production stack trace
// is minified chunk names and column offsets — technically a crash report, but
// not an actionable one, which is what 4.1 asks for.
export default withSentryConfig(nextConfig, {
  org: "jd-innovations",
  project: "javascript-nextjs",

  // Uploading needs SENTRY_AUTH_TOKEN. It is absent locally on purpose, so the
  // build must not fail without it — only Vercel has the token, and only Vercel
  // builds need to upload.
  silent: !process.env.CI,

  // Source maps are generated for upload and then deleted from the client
  // bundle, so the readable source is available in Sentry but is not served to
  // browsers. Shipping them publicly would hand the whole app source to anyone
  // who opens devtools.
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Routes Sentry's own browser requests through this app's origin so ad
  // blockers — which block ingest.sentry.io by default — do not silently
  // discard the client-side errors we most need to see.
  tunnelRoute: "/monitoring",

  // Strips the SDK's debug logging from the production bundle.
  disableLogger: true,
});
