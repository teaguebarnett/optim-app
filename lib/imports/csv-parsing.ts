// Gate 6B — Import Staging.
//
// Pure, framework-independent CSV parsing and field extraction for the
// existing-client import model (lib/imports/types.ts). No Supabase, no
// Next.js, no OCR, no AI — a coach exporting their roster from wherever
// they track it today (a spreadsheet) produces plain CSV text, and this
// module turns that text into the exact StagedClient/StagedClientField
// shapes lib/production/imports.ts persists. Split out the same way
// lib/communications/campaign-personalization.ts is split from
// lib/production/campaigns.ts, so this can be unit tested with no live
// database at all.
//
// What this module explicitly does NOT do: decide anything is "safe to
// activate." Every value here is a GUESS with provenance attached — the
// coach's own review/correction (Gate 6B's whole reason for existing) is
// what a real activation would eventually rely on, never this module's own
// normalization.

/** One data row, keyed by the CSV's own (normalized) header names. */
export interface ParsedCsvRow {
  /** 1-indexed, counting the header row as row 1 — matches how a coach
   * would refer to "row 4" if they opened the same file in a spreadsheet
   * app, and is stored verbatim as StagedClientField.sourceLocation. */
  rowNumber: number;
  cells: Record<string, string>;
}

export interface ParsedCsv {
  headers: string[];
  rows: ParsedCsvRow[];
  /** Structural problems (e.g. a data row with more cells than the header
   * row) — surfaced to the coach, never silently dropped or padded. */
  errors: string[];
}

/** A single pass, RFC-4180-shaped CSV tokenizer: comma-delimited,
 * double-quote quoting, "" as an escaped literal quote inside a quoted
 * field, and either \n or \r\n line endings. Deliberately hand-written
 * rather than a new dependency — the grammar this needs to support (a
 * coach's roster export) is small and worth keeping inspectable/testable
 * with zero supply-chain surface. */
function tokenizeCsv(rawText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  // Trailing field/row (a file with no final newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A fully blank trailing line (a file that DOES end with a newline)
  // tokenizes as one empty-string cell — drop it rather than staging a
  // ghost row with nothing in it.
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

/** Turns raw CSV text into headers + normalized-key rows. The header row
 * is required (row 1) — every subsequent row is matched against it
 * positionally, and a row with a different cell count is a real,
 * surfaced error rather than a silently misaligned guess. */
export function parseImportCsv(rawText: string): ParsedCsv {
  const tokenized = tokenizeCsv(rawText);
  if (tokenized.length === 0) {
    return { headers: [], rows: [], errors: ["The file is empty."] };
  }
  const headers = tokenized[0].map(normalizeHeader);
  if (headers.every((h) => h.length === 0)) {
    return { headers: [], rows: [], errors: ["The first row has no column headers."] };
  }

  const errors: string[] = [];
  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < tokenized.length; i++) {
    const raw = tokenized[i];
    const rowNumber = i + 1; // header is row 1
    if (raw.length !== headers.length) {
      errors.push(`Row ${rowNumber} has ${raw.length} column${raw.length === 1 ? "" : "s"}, expected ${headers.length} — skipped.`);
      continue;
    }
    const cells: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h.length > 0) cells[h] = raw[idx].trim();
    });
    // A row that is entirely blank cells (a spacer row some spreadsheet
    // exports include) is normal, not an error — skip it silently.
    if (Object.values(cells).every((v) => v.length === 0)) continue;
    rows.push({ rowNumber, cells });
  }

  return { headers, rows, errors };
}

/** Canonical field_key per lib/imports/types.ts's StagedClientField, and
 * every header alias this module recognizes for it. A header not listed
 * here is still preserved (see buildStagedClientDrafts's "extra" handling)
 * — an unrecognized column is real, sourced data the coach can still see
 * and correct, never silently discarded. */
const HEADER_ALIASES: Record<string, string> = {
  name: "display_name",
  "display name": "display_name",
  "full name": "display_name",
  "client name": "display_name",
  email: "invited_email",
  "email address": "invited_email",
  goal: "goal",
  phase: "current_phase",
  "current phase": "current_phase",
  "program phase": "current_phase",
  week: "current_week_index",
  "current week": "current_week_index",
  "week index": "current_week_index",
  "program week": "current_week_index",
  "as of date": "as_of_date",
  "as of": "as_of_date",
  date: "as_of_date",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface StagedFieldDraft {
  fieldKey: string;
  sourceValue: string;
  normalizedValue: unknown;
  confidence: number | null;
  isAmbiguous: boolean;
  sourceLocation: string;
}

export interface StagedClientDraft {
  rowNumber: number;
  displayNameGuess: string | null;
  currentPhaseGuess: string | null;
  currentWeekIndexGuess: number | null;
  asOfDateGuess: string | null;
  fields: StagedFieldDraft[];
}

function normalizeOneField(fieldKey: string, sourceValue: string, rowNumber: number): StagedFieldDraft {
  const sourceLocation = `row ${rowNumber}`;
  const trimmed = sourceValue.trim();

  if (fieldKey === "invited_email") {
    if (trimmed.length === 0) return { fieldKey, sourceValue, normalizedValue: null, confidence: null, isAmbiguous: false, sourceLocation };
    const looksValid = EMAIL_PATTERN.test(trimmed);
    return { fieldKey, sourceValue, normalizedValue: looksValid ? trimmed.toLowerCase() : null, confidence: looksValid ? 1 : 0.3, isAmbiguous: !looksValid, sourceLocation };
  }

  if (fieldKey === "current_week_index") {
    if (trimmed.length === 0) return { fieldKey, sourceValue, normalizedValue: null, confidence: null, isAmbiguous: false, sourceLocation };
    const n = Number(trimmed);
    const isValidInt = Number.isInteger(n) && n >= 0;
    return { fieldKey, sourceValue, normalizedValue: isValidInt ? n : null, confidence: isValidInt ? 1 : 0.3, isAmbiguous: !isValidInt, sourceLocation };
  }

  if (fieldKey === "as_of_date") {
    if (trimmed.length === 0) return { fieldKey, sourceValue, normalizedValue: null, confidence: null, isAmbiguous: false, sourceLocation };
    const isValidDate = ISO_DATE_PATTERN.test(trimmed) && !Number.isNaN(Date.parse(trimmed));
    return { fieldKey, sourceValue, normalizedValue: isValidDate ? trimmed : null, confidence: isValidDate ? 1 : 0.3, isAmbiguous: !isValidDate, sourceLocation };
  }

  // display_name, goal, current_phase, and any unrecognized/extra column:
  // preserved as free text, never coerced, never flagged ambiguous merely
  // for being blank (a blank optional field is not a parsing problem).
  return { fieldKey, sourceValue, normalizedValue: trimmed.length > 0 ? trimmed : null, confidence: trimmed.length > 0 ? 1 : null, isAmbiguous: false, sourceLocation };
}

export interface ExistingClientCandidate {
  id: string;
  displayName: string | null;
  invitedEmail: string | null;
}

/** Case-insensitive match against a workspace's real existing clients — a
 * signal for the coach to review ("this looks like Jordan, who's already a
 * client"), never an automatic merge and never itself a reason to skip
 * staging the row. Matches on either invited email or display name; either
 * one is enough to flag it, since a coach's own export may have neither
 * field perfectly aligned with what's already on file. Pure and exported
 * so lib/production/imports.ts's findMatchingClientProfileId (which does
 * the actual Supabase read) can be a thin wrapper around this, independently
 * testable with no live database. Returns the first match in file order —
 * ambiguity between two equally-plausible existing clients is a coach
 * review question, not something this function silently picks a winner
 * for beyond "first listed". */
export function findMatchingClientId(
  candidate: { email: string | null; displayName: string | null },
  existingClients: ExistingClientCandidate[]
): string | null {
  if (!candidate.email && !candidate.displayName) return null;
  const emailLower = candidate.email?.toLowerCase() ?? null;
  const nameLower = candidate.displayName?.trim().toLowerCase() ?? null;
  const match = existingClients.find((row) => {
    const rowEmail = row.invitedEmail?.toLowerCase() ?? null;
    const rowName = row.displayName?.trim().toLowerCase() ?? null;
    return (emailLower !== null && rowEmail === emailLower) || (nameLower !== null && rowName === nameLower);
  });
  return match?.id ?? null;
}

/** One StagedClientDraft per data row. A row is only ever skipped upstream
 * in parseImportCsv (structural errors, fully blank rows) — every row that
 * reaches here becomes a real staged client, even one with no recognizable
 * name/email at all, because the coach reviewing a genuinely bad row is the
 * intended safety net, never a silent drop of a real source row. */
export function buildStagedClientDrafts(parsed: ParsedCsv): StagedClientDraft[] {
  return parsed.rows.map((row) => {
    const fields: StagedFieldDraft[] = [];
    for (const header of parsed.headers) {
      if (header.length === 0) continue;
      const cellValue = row.cells[header] ?? "";
      const fieldKey = HEADER_ALIASES[header] ?? `extra:${header}`;
      fields.push(normalizeOneField(fieldKey, cellValue, row.rowNumber));
    }
    const findNormalized = (key: string) => fields.find((f) => f.fieldKey === key)?.normalizedValue ?? null;
    return {
      rowNumber: row.rowNumber,
      displayNameGuess: (findNormalized("display_name") as string | null) ?? null,
      currentPhaseGuess: (findNormalized("current_phase") as string | null) ?? null,
      currentWeekIndexGuess: (findNormalized("current_week_index") as number | null) ?? null,
      asOfDateGuess: (findNormalized("as_of_date") as string | null) ?? null,
      fields,
    };
  });
}
