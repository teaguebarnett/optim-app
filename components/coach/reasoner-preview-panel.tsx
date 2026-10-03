"use client";

// Gate 4.0C-3 (internal QA) — runs Fitness Reasoner v1 on demand (a model
// call that can take a few minutes) and shows a concise result next to the
// legacy generator and the deterministic planner. Nothing is saved or sent.

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResistancePlannerPreview } from "@/components/coach/resistance-planner-preview";
import { runFitnessReasonerPreviewAction } from "@/app/actions/structured-limitations";
import type { ReasonerReviewView } from "@/lib/synthesis/reasoner/view";

const STATUS: Record<string, string> = {
  PLANNED: "Plan proposed (validated)",
  NEEDS_INPUT: "Needs input before planning",
  DOMAIN_NOT_YET_SUPPORTED: "Domain not supported yet",
  REJECTED: "Rejected by OPTIM's validators",
  PROVIDER_FAILED: "Reasoner unavailable",
};

export function ReasonerPreviewPanel({ workspaceId, clientProfileId }: { workspaceId: string; clientProfileId: string }) {
  const [view, setView] = useState<ReasonerReviewView | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => setView((await runFitnessReasonerPreviewAction({ workspaceId, clientProfileId })) as ReasonerReviewView));

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <p className="text-meta text-neutral">Runs the model with this client&apos;s coach method, facts, confirmed limitations and retrieved evidence. Takes a few minutes. Not saved or published.</p>
        <Button size="sm" onClick={run} loading={pending}>{view ? "Run again" : "Run Fitness Reasoner v1"}</Button>
        {view ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-off-white">{STATUS[view.status] ?? view.status}</p>
            {view.message ? <p className="text-sm text-neutral">{view.message}</p> : null}
            {view.routing ? <p className="text-meta text-neutral">Routed to: {view.routing}</p> : null}
            {view.missing?.length ? (
              <ul className="space-y-1.5">{view.missing.map((m) => <li key={m.fact} className="text-sm text-off-white">{m.why} <span className="text-meta text-neutral">Blocks: {m.blockedDecision} · From: {m.providedBy}</span></li>)}</ul>
            ) : null}
            {view.errors?.length ? <ul className="space-y-1">{view.errors.slice(0, 8).map((e) => <li key={e} className="text-sm text-error">{e}</li>)}</ul> : null}
            {view.architecture ? (
              <div>
                <p className="text-label text-neutral">Weekly architecture</p>
                <p className="text-sm text-off-white">{view.architecture.name} — {view.architecture.rationale}</p>
              </div>
            ) : null}
            {view.sessions?.length ? (
              <div>
                <p className="text-label text-neutral">Session purposes</p>
                <ul className="space-y-1">{view.sessions.map((s) => <li key={s.day} className="text-sm text-off-white">{s.day} — <span className="font-medium">{s.title}</span>: {s.purpose}</li>)}</ul>
              </div>
            ) : null}
            {view.conflicts?.length ? (
              <div>
                <p className="text-label text-warning-strong">Tension with your method</p>
                <ul className="space-y-1">{view.conflicts.map((c) => <li key={c} className="text-sm text-off-white">{c}</li>)}</ul>
              </div>
            ) : null}
            {view.decisions?.length ? (
              <details>
                <summary className="cursor-pointer text-action text-accent-fg">Decisions ({view.decisions.length})</summary>
                <ul className="mt-2 space-y-1.5">{view.decisions.map((d) => <li key={d.decision} className="text-sm text-off-white">{d.decision} <span className="block text-meta text-neutral">{d.because}</span></li>)}</ul>
              </details>
            ) : null}
            {view.evidenceUsed?.length ? (
              <details>
                <summary className="cursor-pointer text-action text-accent-fg">Evidence used ({view.evidenceUsed.length} of {view.retrieved?.claims} retrieved)</summary>
                <ul className="mt-2 space-y-1">{view.evidenceUsed.map((e) => <li key={e.ref} className="text-meta text-neutral">{e.ref.split("#")[1]} — {e.support}</li>)}</ul>
              </details>
            ) : null}
            {view.model ? <p className="text-meta text-neutral">{view.model.modelId} · {view.model.promptVersion} · attempts {view.model.attempts}</p> : null}
          </div>
        ) : null}
      </Card>
      {view?.status === "PLANNED" && view.plan ? <ResistancePlannerPreview view={{ status: "PLANNED", plan: view.plan }} title="Fitness Reasoner v1 — validated plan" /> : null}
    </div>
  );
}
