// Gate 6B — Import Staging.
// Pure logic tests for lib/imports/csv-parsing.ts — no DB, no network.
// Run with: npm run verify:csv-parsing

import assert from "node:assert/strict";
import { parseImportCsv, buildStagedClientDrafts, findMatchingClientId } from "./csv-parsing.ts";

let passed = 0;
let failed = 0;

function check(description: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${description}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${description}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log("\n1. Basic CSV tokenizing and header recognition\n");

check("parses a simple well-formed CSV into rows keyed by normalized header", () => {
  const csv = "Name,Email,Goal\nJordan Lee,jordan@example.com,Build strength\n";
  const parsed = parseImportCsv(csv);
  assert.deepEqual(parsed.headers, ["name", "email", "goal"]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].cells.name, "Jordan Lee");
  assert.equal(parsed.rows[0].cells.email, "jordan@example.com");
  assert.equal(parsed.errors.length, 0);
});

check("handles a quoted field containing a comma", () => {
  const csv = 'Name,Goal\n"Lee, Jordan","Build strength, lose fat"\n';
  const parsed = parseImportCsv(csv);
  assert.equal(parsed.rows[0].cells.name, "Lee, Jordan");
  assert.equal(parsed.rows[0].cells.goal, "Build strength, lose fat");
});

check("handles an escaped double-quote inside a quoted field", () => {
  const csv = 'Name,Goal\n"Jordan ""J"" Lee",Strength\n';
  const parsed = parseImportCsv(csv);
  assert.equal(parsed.rows[0].cells.name, 'Jordan "J" Lee');
});

check("handles CRLF line endings the same as LF", () => {
  const csv = "Name,Email\r\nJordan,jordan@example.com\r\n";
  const parsed = parseImportCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].cells.email, "jordan@example.com");
});

check("accepts a file with no trailing newline", () => {
  const csv = "Name,Email\nJordan,jordan@example.com";
  const parsed = parseImportCsv(csv);
  assert.equal(parsed.rows.length, 1);
});

check("silently skips a fully blank spacer row rather than staging a ghost client", () => {
  const csv = "Name,Email\nJordan,jordan@example.com\n,\n\nCasey,casey@example.com\n";
  const parsed = parseImportCsv(csv);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[1].cells.name, "Casey");
});

check("an empty file produces a clear error, not a crash", () => {
  const parsed = parseImportCsv("");
  assert.equal(parsed.rows.length, 0);
  assert.match(parsed.errors[0], /empty/i);
});

check("a data row with the wrong number of columns is a surfaced, skipped error — never silently misaligned", () => {
  const csv = "Name,Email,Goal\nJordan,jordan@example.com\n";
  const parsed = parseImportCsv(csv);
  assert.equal(parsed.rows.length, 0);
  assert.match(parsed.errors[0], /row 2/i);
  assert.match(parsed.errors[0], /2 columns, expected 3/i);
});

check("header row and cell values are trimmed", () => {
  const csv = " Name , Email \n  Jordan  ,  jordan@example.com  \n";
  const parsed = parseImportCsv(csv);
  assert.deepEqual(parsed.headers, ["name", "email"]);
  assert.equal(parsed.rows[0].cells.name, "Jordan");
});

console.log("\n2. Field extraction, provenance, and normalization\n");

check("a recognized header maps to its canonical field_key with the raw text preserved as sourceValue", () => {
  const parsed = parseImportCsv("Full Name,Email Address\nJordan Lee,jordan@example.com\n");
  const [draft] = buildStagedClientDrafts(parsed);
  const nameField = draft.fields.find((f) => f.fieldKey === "display_name");
  assert.ok(nameField);
  assert.equal(nameField!.sourceValue, "Jordan Lee");
  assert.equal(nameField!.normalizedValue, "Jordan Lee");
  assert.equal(nameField!.confidence, 1);
  assert.equal(nameField!.isAmbiguous, false);
});

check("every field carries a non-empty sourceLocation — real provenance, never an invented value with none (mirrors hasProvenance)", () => {
  const parsed = parseImportCsv("Name\nJordan\n");
  const [draft] = buildStagedClientDrafts(parsed);
  for (const f of draft.fields) {
    assert.ok(f.sourceLocation.length > 0);
    assert.ok(f.sourceValue !== null && f.sourceValue !== undefined);
  }
});

check("an unrecognized column is preserved under an extra: field_key, never silently dropped", () => {
  const parsed = parseImportCsv("Name,Favorite Color\nJordan,Blue\n");
  const [draft] = buildStagedClientDrafts(parsed);
  const extra = draft.fields.find((f) => f.fieldKey === "extra:favorite color");
  assert.ok(extra);
  assert.equal(extra!.sourceValue, "Blue");
});

check("a malformed email is kept as sourceValue but not promoted to normalizedValue, and is flagged ambiguous", () => {
  const parsed = parseImportCsv("Name,Email\nJordan,not-an-email\n");
  const [draft] = buildStagedClientDrafts(parsed);
  const email = draft.fields.find((f) => f.fieldKey === "invited_email");
  assert.equal(email!.sourceValue, "not-an-email");
  assert.equal(email!.normalizedValue, null);
  assert.equal(email!.isAmbiguous, true);
});

check("a valid email normalizes to lowercase and is not ambiguous", () => {
  const parsed = parseImportCsv("Name,Email\nJordan,Jordan@Example.COM\n");
  const [draft] = buildStagedClientDrafts(parsed);
  const email = draft.fields.find((f) => f.fieldKey === "invited_email");
  assert.equal(email!.normalizedValue, "jordan@example.com");
  assert.equal(email!.isAmbiguous, false);
});

check("a non-numeric week value is flagged ambiguous rather than coerced to a wrong number", () => {
  const parsed = parseImportCsv("Name,Week\nJordan,mid-block\n");
  const [draft] = buildStagedClientDrafts(parsed);
  const week = draft.fields.find((f) => f.fieldKey === "current_week_index");
  assert.equal(week!.normalizedValue, null);
  assert.equal(week!.isAmbiguous, true);
});

check("a valid integer week value normalizes to a number", () => {
  const parsed = parseImportCsv("Name,Week\nJordan,7\n");
  const [draft] = buildStagedClientDrafts(parsed);
  assert.equal(draft.currentWeekIndexGuess, 7);
});

check("a non-ISO date is flagged ambiguous rather than guessed", () => {
  const parsed = parseImportCsv("Name,As Of Date\nJordan,09/15/2026\n");
  const [draft] = buildStagedClientDrafts(parsed);
  const date = draft.fields.find((f) => f.fieldKey === "as_of_date");
  assert.equal(date!.normalizedValue, null);
  assert.equal(date!.isAmbiguous, true);
});

check("a blank optional field (goal) is not flagged ambiguous — a missing optional value is not a parsing problem", () => {
  const parsed = parseImportCsv("Name,Goal\nJordan,\n");
  const [draft] = buildStagedClientDrafts(parsed);
  const goal = draft.fields.find((f) => f.fieldKey === "goal");
  assert.equal(goal!.normalizedValue, null);
  assert.equal(goal!.isAmbiguous, false);
});

check("StagedClientDraft's own guess fields mirror the best current normalized values, for at-a-glance review", () => {
  const parsed = parseImportCsv("Name,Phase,Week,As Of Date\nJordan,strength_block,4,2026-09-01\n");
  const [draft] = buildStagedClientDrafts(parsed);
  assert.equal(draft.displayNameGuess, "Jordan");
  assert.equal(draft.currentPhaseGuess, "strength_block");
  assert.equal(draft.currentWeekIndexGuess, 4);
  assert.equal(draft.asOfDateGuess, "2026-09-01");
});

check("a row with no recognizable name or email still becomes a real staged draft — the coach reviewing bad data is the safety net, not a silent drop", () => {
  const parsed = parseImportCsv("Notes\nsome unrelated text\n");
  const drafts = buildStagedClientDrafts(parsed);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].displayNameGuess, null);
});

check("buildStagedClientDrafts produces exactly one draft per real data row, in file order", () => {
  const parsed = parseImportCsv("Name\nAlex\nBailey\nCasey\n");
  const drafts = buildStagedClientDrafts(parsed);
  assert.deepEqual(drafts.map((d) => d.displayNameGuess), ["Alex", "Bailey", "Casey"]);
});

console.log("\n3. Duplicate detection against real existing clients — signal only, never an automatic merge\n");

const EXISTING = [
  { id: "client-1", displayName: "Jordan Lee", invitedEmail: "jordan@example.com" },
  { id: "client-2", displayName: "Casey Kim", invitedEmail: "casey@example.com" },
];

check("matches by email, case-insensitively", () => {
  const id = findMatchingClientId({ email: "JORDAN@EXAMPLE.COM", displayName: null }, EXISTING);
  assert.equal(id, "client-1");
});

check("matches by display name, case-insensitively, when no email is available", () => {
  const id = findMatchingClientId({ email: null, displayName: "casey kim" }, EXISTING);
  assert.equal(id, "client-2");
});

check("returns null when neither email nor name matches any existing client", () => {
  const id = findMatchingClientId({ email: "new@example.com", displayName: "New Person" }, EXISTING);
  assert.equal(id, null);
});

check("returns null when the candidate has neither an email nor a name to match with", () => {
  const id = findMatchingClientId({ email: null, displayName: null }, EXISTING);
  assert.equal(id, null);
});

check("a candidate matching no one is not confused by an unrelated existing client list", () => {
  const id = findMatchingClientId({ email: "casey@example.com", displayName: "Casey Kim" }, []);
  assert.equal(id, null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
