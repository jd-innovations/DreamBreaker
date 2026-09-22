import { assertEquals } from "jsr:@std/assert@1";
import { bearerOf, sameSecret } from "./email-gate.ts";

const req = (auth?: string) =>
  new Request("https://x.test", { method: "POST", headers: auth ? { Authorization: auth } : {} });

Deno.test("bearerOf reads a bearer token", () => {
  assertEquals(bearerOf(req("Bearer abc.def")), "abc.def");
  assertEquals(bearerOf(req("bearer   xyz ")), "xyz");
});

Deno.test("bearerOf rejects anything that is not a bearer", () => {
  assertEquals(bearerOf(req()), null);
  assertEquals(bearerOf(req("Basic abc")), null);
  assertEquals(bearerOf(req("Bearer")), null);
});

Deno.test("sameSecret matches only identical strings", () => {
  assertEquals(sameSecret("service-key", "service-key"), true);
  assertEquals(sameSecret("service-key", "service-kez"), false);
  assertEquals(sameSecret("service-key", "service-key-longer"), false);
  assertEquals(sameSecret("", "service-key"), false);
  assertEquals(sameSecret("", ""), true);
});
