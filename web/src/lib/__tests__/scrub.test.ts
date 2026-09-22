import { describe, expect, it } from "vitest";
import { scrubText } from "../observability/scrub";

describe("scrubText", () => {
  it("redacts an Expo push token inside free text", () => {
    expect(scrubText("send failed for ExponentPushToken[abcDEF123_-] after retry"))
      .toBe("send failed for [redacted] after retry");
  });
  it("redacts the short ExpoPushToken spelling too", () => {
    expect(scrubText("ExpoPushToken[xyz]")).toBe("[redacted]");
  });
  it("still redacts email addresses", () => {
    expect(scrubText("mail to someone@example.com failed")).toBe("mail to [redacted] failed");
  });
  it("leaves ordinary text alone", () => {
    expect(scrubText("campaign 5b5a45c7 finished")).toBe("campaign 5b5a45c7 finished");
  });
});
