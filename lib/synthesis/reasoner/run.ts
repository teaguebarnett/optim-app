// Gate 4.0C-3A — the ReasonerRun artifact: everything needed to audit and
// re-render exactly what a coach reviewed, without calling the model again.
//
// Serialization is canonical (sorted keys, no undefined) and every snapshot
// is hashed, so the same run always hashes the same and a changed input is
// detectable. Never contains secrets: model output is structured JSON and
// provider failures are recorded as error categories only.

import type { EquipmentResolution } from "./equipment-resolution.ts";
import { createHash } from "node:crypto";
import type { ClientState } from "../client-state.ts";
import type { ConstraintSet } from "../constraints.ts";
import type { GoalContract } from "../goal-contract.ts";
import type { PlanSpecification, QualityFinding } from "../plan-spec.ts";
import type { MissingInput } from "../readiness.ts";
import type { DomainRouting } from "./domains.ts";
import type { ReasonerPlan } from "./contract.ts";
import type { ReasoningInput } from "./input.ts";
import type { EvidencePacket } from "./retrieval.ts";
import type { PlanningState } from "../planning-state.ts";
import type { AdequacyResult, FunctionAvailability } from "./adequacy.ts";

/** Gate 4.0C-5 — what the deterministic preflight found before any model call. */
export interface RunPreflight {
  policy: "withhold" | "legacy_allow";
  functions: FunctionAvailability[];
  /** Eligible exercises withheld because OPTIM can't establish their fit (the coach can clear or exclude them). */
  withheld: string[];
  /** Exercises the coach must decide on before planning (only way to train a required target / a goal target). */
  questions: Array<{ exerciseId: string; exerciseName: string; serves: string[]; restriction: string; conditions: string[] }>;
}

export const REASONER_RUN_SCHEMA = "optim.reasoner-run.v1";

export interface ReasonerRunTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface ReasonerAttempt {
  attempt: number;
  /** The model's structured JSON exactly as parsed (null when the call failed). */
  raw: unknown;
  parseErrors: string[];
  validationErrors: string[];
  usage: { inputTokens: number; outputTokens: number } | null;
  latencyMs: number | null;
  requestId: string | null;
  /** Provider failure category (e.g. "AiProviderTimeoutError") — never message text. */
  providerError: string | null;
}

export interface ReasonerRun {
  schema: typeof REASONER_RUN_SCHEMA;
  runId: string;
  createdAtIso: string;
  status: "PLANNED" | "NEEDS_INPUT" | "DOMAIN_NOT_YET_SUPPORTED" | "REJECTED" | "PROVIDER_FAILED";
  versions: { reasoner: string; prompt: string; knowledge: string; coachMethod: { versionId: string; version: number } | null; model: { provider: string; modelId: string } | null };
  hashes: { clientState: string; goalContract: string; constraintSet: string; input: string | null; systemPrompt: string };
  snapshots: { clientState: ClientState; goalContract: GoalContract; constraintSet: ConstraintSet };
  routing: DomainRouting;
  retrievedKnowledge: Array<{ ref: string; version: number | null }>;
  evidence: EvidencePacket | null;
  input: ReasoningInput | null;
  attempts: ReasonerAttempt[];
  result: {
    plan?: ReasonerPlan;
    spec?: PlanSpecification;
    quality?: QualityFinding[];
    missing?: MissingInput[];
    needsInputSource?: string;
    summary?: string;
    message?: string;
    errors?: string[];
    /** Gate 4.0C-5 — current-state adequacy of the planned program (absent on older runs). */
    adequacy?: AdequacyResult;
    /** Equipment resolution of the planned exercises (confirmed-absent apparatus → substitute or coach decision). */
    equipment?: EquipmentResolution[];
  };
  totals: ReasonerRunTotals;
  /** Gate 4.0C-5 — the material planning state this run solved under (absent on older runs: derive from snapshots). */
  planningState?: PlanningState;
  preflight?: RunPreflight;
}

/** Canonical JSON: object keys sorted recursively, undefined dropped, Sets/Maps rejected. */
export function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (v instanceof Set || v instanceof Map) throw new Error("canonicalJson: Set/Map not serializable");
    if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : norm(x)));
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = norm(x);
    }
    return out;
  };
  return JSON.stringify(norm(value));
}

export const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");

export function runHash(run: ReasonerRun): string {
  return sha256(run);
}

/** Serialize for storage/transport; parse validates the schema marker. */
export const serializeRun = (run: ReasonerRun) => canonicalJson(run);
export function parseRun(text: string): ReasonerRun {
  const run = JSON.parse(text) as ReasonerRun;
  if (run.schema !== REASONER_RUN_SCHEMA) throw new Error(`Unsupported reasoner run schema: ${String((run as { schema?: unknown }).schema)}`);
  return run;
}
