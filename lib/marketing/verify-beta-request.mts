// Pure tests for lib/marketing/beta-request.ts — the waitlist form's
// server-side validation and sanitization. No DB, no network.
// Run with: npm run verify:beta-request

import assert from "node:assert/strict";
import { parseBetaRequest, sanitizeText } from "./beta-request.ts";

let passed = 0;
let failed = 0;
function check(d: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  - ${d}`); } catch (e) { failed++; console.error(`FAIL  - ${d}\n        ${(e as Error).message}`); }
}
const OK = { firstName: "Sam", email: "Sam@Example.com", clientCount: "6-20", instagramOrWebsite: "" };

check("a valid request parses; email is trimmed and lowercased", () => {
  const r = parseBetaRequest({ ...OK, email: "  Sam@Example.COM " });
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.request.email, "sam@example.com"); assert.equal(r.request.instagramOrWebsite, null); }
});
check("missing first name is rejected", () => { const r = parseBetaRequest({ ...OK, firstName: "   " }); assert.equal(r.ok, false); assert.ok(!r.ok && r.errors.firstName); });
for (const bad of ["", "sam", "sam@", "sam@example", "sam @example.com", "@example.com"]) {
  check(`invalid email ${JSON.stringify(bad)} is rejected`, () => { const r = parseBetaRequest({ ...OK, email: bad }); assert.equal(r.ok, false); assert.ok(!r.ok && r.errors.email); });
}
check("an unknown client-count value is rejected", () => assert.equal(parseBetaRequest({ ...OK, clientCount: "1000" }).ok, false));
check("a missing client count is rejected", () => assert.equal(parseBetaRequest({ ...OK, clientCount: "" }).ok, false));
check("over-long first name is rejected", () => assert.equal(parseBetaRequest({ ...OK, firstName: "a".repeat(81) }).ok, false));
check("over-long link is rejected", () => assert.equal(parseBetaRequest({ ...OK, instagramOrWebsite: "x".repeat(201) }).ok, false));
check("optional link is kept when given", () => { const r = parseBetaRequest({ ...OK, instagramOrWebsite: " @coach_sam " }); assert.ok(r.ok && r.request.instagramOrWebsite === "@coach_sam"); });
check("control characters are stripped and whitespace collapsed", () => assert.equal(sanitizeText("  Sam\u0000\n\t  Lee\u007f "), "Sam Lee"));
check("non-string input sanitizes to empty", () => assert.equal(sanitizeText(42), ""));
check("unknown plan interest is dropped, known kept", () => {
  const a = parseBetaRequest({ ...OK, planInterest: "enterprise" }); const b = parseBetaRequest({ ...OK, planInterest: "growth" });
  assert.ok(a.ok && a.request.planInterest === null); assert.ok(b.ok && b.request.planInterest === "growth");
});
check("extra unexpected fields are ignored (never stored)", () => { const r = parseBetaRequest({ ...OK, role: "admin", status: "converted" }); assert.ok(r.ok && !("role" in r.request) && !("status" in r.request)); });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
