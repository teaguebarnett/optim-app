// Gate 4.0C-2A — the NEW resistance planner, shown for coach REVIEW ONLY.
// Server-rendered from an in-memory planner run; nothing here publishes,
// saves, or replaces the existing Generate Proposal flow.

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { PlannerReviewView } from "@/lib/synthesis/planners/resistance/view";

const PROVIDER: Record<string, string> = { client: "Client", coach: "You", either: "You or the client" };

export function ResistancePlannerPreview({ view, compareHref }: { view: PlannerReviewView; compareHref?: string }) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-off-white">New resistance planner — preview</h3>
          <p className="mt-0.5 text-meta text-neutral">Review only. Not saved, not published, and it doesn&apos;t replace Generate Proposal.</p>
        </div>
        {compareHref ? (
          <Link href={compareHref} className="text-action text-accent-fg hover:underline">Compare with current generator</Link>
        ) : null}
      </div>

      {view.status === "NEEDS_INPUT" ? (
        <div className="space-y-2">
          <p className="text-sm text-off-white">Planning needs these decisions first:</p>
          <ul className="space-y-2">
            {view.missing!.map((m) => (
              <li key={m.fact} className="rounded-[var(--radius-sm)] bg-surface-raised px-3 py-2">
                <p className="text-sm text-off-white">{m.why}</p>
                <p className="text-meta text-neutral">Blocks: {m.blockedDecision} · From: {PROVIDER[m.providedBy] ?? m.providedBy}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.status === "INVALID" ? (
        <ul className="space-y-1">
          {view.errors!.map((e) => (
            <li key={e} className="text-sm text-error">{e}</li>
          ))}
        </ul>
      ) : null}

      {view.plan ? <PlanDetail plan={view.plan} /> : null}
    </Card>
  );
}

function PlanDetail({ plan }: { plan: NonNullable<PlannerReviewView["plan"]> }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Days / week" value={String(plan.frequency)} />
        <Stat label="Structure" value={plan.split} />
        <Stat label="Weeks" value={String(plan.weeks)} />
        <Stat label="Emphasis" value={plan.emphasis} />
      </dl>

      <div className="space-y-3">
        {plan.sessions.map((s) => (
          <div key={s.day} className="rounded-[var(--radius-sm)] border border-border px-3 py-2.5">
            <p className="text-sm font-medium text-off-white">
              {s.day} — {s.purpose} <span className="text-meta font-normal text-neutral">~{s.minutes} min</span>
            </p>
            <ul className="mt-1.5 space-y-1">
              {s.exercises.map((x) => (
                <li key={x.name} className="text-sm text-off-white">
                  {x.name} <span className="text-meta text-neutral">{x.role === "main" ? "main · " : ""}wk 1 {x.week1} · wk 2 {x.week2}</span>
                  {x.repeatedReason ? <span className="block text-meta text-neutral">Repeated: {x.repeatedReason}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {plan.warnings.length ? (
        <Section title="Needs your attention">
          {plan.warnings.map((w) => (
            <li key={w} className="text-sm text-warning-strong">{w}</li>
          ))}
        </Section>
      ) : null}

      <details className="group">
        <summary className="cursor-pointer text-action text-accent-fg">Why this plan?</summary>
        <div className="mt-3 space-y-3">
          <Section title="Frequency"><li className="text-sm text-off-white">{plan.why.frequency}</li></Section>
          <Section title="Structure"><li className="text-sm text-off-white">{plan.why.structure}</li></Section>
          <Section title="Goal"><li className="text-sm text-off-white">{plan.why.goal}</li></Section>
          <Section title="Progression"><li className="text-sm text-off-white">{plan.progression}</li></Section>
          <Section title="Recovery"><li className="text-sm text-off-white">{plan.recovery}</li></Section>
          <Section title="Limitations applied">{plan.constraintsApplied.map((c) => <li key={c} className="text-sm text-off-white">{c}</li>)}</Section>
          {plan.why.assumptions.length ? <Section title="Assumptions">{plan.why.assumptions.map((a) => <li key={a} className="text-sm text-off-white">{a}</li>)}</Section> : null}
          {plan.why.unresolved.length ? <Section title="Still open">{plan.why.unresolved.map((u) => <li key={u} className="text-sm text-off-white">{u}</li>)}</Section> : null}
          {plan.info.length ? <Section title="Notes">{plan.info.map((i) => <li key={i} className="text-meta text-neutral">{i}</li>)}</Section> : null}
        </div>
      </details>

      <details>
        <summary className="cursor-pointer text-action text-accent-fg">Inputs used</summary>
        <div className="mt-3 space-y-3">
          <Section title="Sources">
            <li className="text-meta text-neutral">Coach method: {plan.inputs.coachBrain}</li>
            <li className="text-meta text-neutral">{plan.inputs.knowledge}</li>
            <li className="text-meta text-neutral">Planner: {plan.inputs.planner}</li>
          </Section>
          <Section title="Your method settings used">{plan.why.coachRules.map((r) => <li key={r} className="text-meta text-neutral">{r}</li>)}</Section>
          <Section title="Client answers used">{plan.inputs.clientInputs.map((r) => <li key={r} className="text-meta text-neutral">{r}</li>)}</Section>
          <Section title="Weekly direct sets">{plan.weeklyDirectSets.map((m) => <li key={m.muscle} className="text-meta text-neutral">{m.muscle}: {m.sets}</li>)}</Section>
          <Section title="Week by week">{plan.weekNotes.map((n) => <li key={n} className="text-meta text-neutral">{n}</li>)}</Section>
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label text-neutral">{label}</dt>
      <dd className="text-sm text-off-white">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-label text-neutral">{title}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}
