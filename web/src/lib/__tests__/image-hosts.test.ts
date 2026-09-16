import { describe, it, expect } from "vitest";
import { isOptimizableImageUrl, OPTIMIZABLE_IMAGE_HOSTS } from "../image-hosts";

describe("isOptimizableImageUrl", () => {
  it("allows every host next.config.ts's remotePatterns is generated from", () => {
    for (const host of OPTIMIZABLE_IMAGE_HOSTS) {
      expect(isOptimizableImageUrl(`https://${host}/some/path.jpg`)).toBe(true);
    }
  });

  it("allows a local path with no scheme", () => {
    expect(isOptimizableImageUrl("/brand/logo.png")).toBe(true);
  });

  // The regression this file exists to prevent: found live in production
  // 2026-09-16. tournaments.cover_img_url is a free-text field, and one real
  // tournament ("Test Hero", status registration_closed -- appears on the
  // public /tournaments list and the landing page's featured section, not
  // just an internal screen) had this exact URL set. next/image throws at
  // render time for a host outside remotePatterns; a client component with
  // no error boundary around it means that render error takes the page down
  // for every visitor, not just shows a broken image icon.
  it("refuses an arbitrary host a director could have pasted in", () => {
    expect(
      isOptimizableImageUrl(
        "https://hartru.com/cdn/shop/files/180-PICKLEFLEXPRO_main_b0783ac5-c852-42d2-81d9-720c033345c8.png?v=1740162296&width=2048",
      ),
    ).toBe(false);
  });

  it("treats null, undefined, empty, and unparseable strings as unsafe", () => {
    expect(isOptimizableImageUrl(null)).toBe(false);
    expect(isOptimizableImageUrl(undefined)).toBe(false);
    expect(isOptimizableImageUrl("")).toBe(false);
    expect(isOptimizableImageUrl("not a url at all")).toBe(false);
  });
});
