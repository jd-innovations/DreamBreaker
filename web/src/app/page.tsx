export { default } from "./(public)/landing-page";

// Render per-request so newly featured/opened tournaments appear immediately
// instead of being frozen into a statically cached build.
export const dynamic = "force-dynamic";
