// Gate 4.0C-3A — failure taxonomy: when an evaluation is weak, say WHICH
// subsystem should improve, instead of patching symptoms.

import type { ReasonerResult } from "../reasoner.ts";

export const FAILURE_CATEGORIES = {
  CLIENT_DATA_GAP: "client intake / ClientState",
  COACH_BRAIN_GAP: "Coach Brain (coach decision needed)",
  KNOWLEDGE_GAP: "Fitness Knowledge (coverage / sourcing)",
  RETRIEVAL_FAILURE: "evidence retrieval",
  REASONING_FAILURE: "reasoner prompt / model reasoning",
  SCHEMA_LIMITATION: "input / output schema",
  VALIDATOR_GAP: "deterministic validator",
  MODEL_VARIANCE: "model sampling variance",
  DOMAIN_UNSUPPORTED: "domain coverage",
  SAFE_NEEDS_INPUT: "working as intended (asked instead of guessing)",
  PROVIDER_FAILURE: "provider / runtime",
} as const;
export type FailureCategory = keyof typeof FAILURE_CATEGORIES;

export interface Finding {
  category: FailureCategory;
  subsystem: string;
  evidence: string;
}

const f = (category: FailureCategory, evidence: string): Finding => ({ category, subsystem: FAILURE_CATEGORIES[category], evidence });

/** Machine-classifiable findings for one result (human review adds the rest). */
export function classifyResult(r: ReasonerResult, opts: { hardFailures: string[]; expectedStatus?: string; reviewFlags?: Array<{ ok: boolean; flag: string; category: FailureCategory }> }): Finding[] {
  const out: Finding[] = [];
  for (const h of opts.hardFailures) out.push(f("VALIDATOR_GAP", `Hard expectation failed after validation: ${h}`));
  for (const rf of opts.reviewFlags ?? []) if (!rf.ok) out.push(f(rf.category, rf.flag));
  switch (r.status) {
    case "NEEDS_INPUT":
      out.push(f(opts.expectedStatus === "NEEDS_INPUT" ? "SAFE_NEEDS_INPUT" : r.source === "model" ? "CLIENT_DATA_GAP" : "SAFE_NEEDS_INPUT", `Asked for: ${r.missing.map((m) => m.fact).join(", ")}`));
      return out;
    case "DOMAIN_NOT_YET_SUPPORTED":
      out.push(f("DOMAIN_UNSUPPORTED", `Routed to ${r.routing.primary}`));
      return out;
    case "PROVIDER_FAILED":
      out.push(f("PROVIDER_FAILURE", r.run.attempts.map((a) => a.providerError).filter(Boolean).join(", ") || "no provider"));
      return out;
    case "REJECTED":
      for (const e of r.errors) out.push(f(/must be|too long|too many|could not be read|not one complete/.test(e) ? "REASONING_FAILURE" : "REASONING_FAILURE", `Rejected by validators: ${e}`));
      return out;
    case "PLANNED":
      for (const q of r.quality) {
        if (q.code === "target_omitted" || q.code === "push_pull_balance" || q.code === "session_duration" || q.code === "exercise_repeated" || q.code === "unattributed_decision") out.push(f("REASONING_FAILURE", q.message));
        else if (q.code === "target_excluded") out.push(f("KNOWLEDGE_GAP", `${q.message} (constraint-compatible exercise coverage)`));
        else if (q.code === "cites_unsourced") out.push(f("KNOWLEDGE_GAP", q.message));
        else if (q.code === "coach_method_conflict") out.push(f("COACH_BRAIN_GAP", q.message));
      }
      for (const u of r.plan.unresolved) out.push(f(u.providedBy === "client" ? "CLIENT_DATA_GAP" : "COACH_BRAIN_GAP", `Unresolved: ${u.fact}`));
      if (r.attempts > 1) out.push(f("REASONING_FAILURE", `Needed ${r.attempts} attempts (first output failed validation/schema)`));
      return out;
  }
}
