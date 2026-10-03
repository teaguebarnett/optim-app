// Gate 4.0C-3 — a concise, serializable view of a Fitness Reasoner result
// for the internal comparison surface. Reuses the planner view for the
// plan itself and adds the reasoner's decision evidence and the evidence
// it was given. No raw model text beyond the structured fields.

import type { FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import { plannerReviewView, type PlannerReviewView } from "../planners/resistance/view.ts";
import type { ReasonerResult } from "./reasoner.ts";

export interface ReasonerReviewView {
  status: ReasonerResult["status"];
  message?: string;
  routing?: string;
  missing?: Array<{ fact: string; why: string; blockedDecision: string; providedBy: string }>;
  errors?: string[];
  plan?: PlannerReviewView["plan"];
  architecture?: { split: string; name: string; rationale: string };
  sessions?: Array<{ day: string; title: string; purpose: string }>;
  decisions?: Array<{ topic: string; decision: string; because: string }>;
  conflicts?: string[];
  evidenceUsed?: Array<{ ref: string; support: string }>;
  retrieved?: { claims: number; exercises: number };
  model?: { modelId: string; attempts: number; promptVersion: string };
}

export function reasonerReviewView(result: ReasonerResult, knowledge: FitnessKnowledgeRegistry): ReasonerReviewView {
  switch (result.status) {
    case "DOMAIN_NOT_YET_SUPPORTED":
      return { status: result.status, message: result.message, routing: `${result.routing.primary}${result.routing.supporting.length ? ` (+ ${result.routing.supporting.join(", ")})` : ""} — ${result.routing.rationale}` };
    case "NEEDS_INPUT":
      return { status: result.status, missing: result.missing.map((m) => ({ ...m })), message: result.summary };
    case "PROVIDER_FAILED":
      return { status: result.status, message: result.message };
    case "REJECTED":
      return { status: result.status, errors: result.errors, retrieved: { claims: result.evidence.claims.length, exercises: result.evidence.exercises.length } };
    case "PLANNED": {
      const base = plannerReviewView({ status: "PLANNED", planner: "fitness-reasoner", spec: result.spec }, knowledge);
      const cited = new Set(result.plan.decisions.flatMap((d) => d.knowledgeRefs));
      return {
        status: result.status,
        plan: base.plan,
        architecture: result.plan.architecture,
        sessions: result.plan.sessions.map((s) => ({ day: s.day, title: s.title, purpose: s.purpose })),
        decisions: result.plan.decisions.map((d) => ({ topic: d.topic, decision: d.decision, because: d.because })),
        conflicts: result.plan.conflicts.map((c) => c.issue),
        evidenceUsed: result.evidence.claims.filter((c) => cited.has(c.ref)).map((c) => ({ ref: c.ref, support: c.support })),
        retrieved: { claims: result.evidence.claims.length, exercises: result.evidence.exercises.length },
        model: { modelId: result.modelId, attempts: result.attempts, promptVersion: result.spec.provenance.model?.promptVersion ?? "" },
      };
    }
  }
}
