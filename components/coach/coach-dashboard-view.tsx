// Gate 2 — the live coach dashboard's presentation. Renders exactly what
// lib/coach/dashboard-zones.ts's buildCoachDashboard decided; it never
// decides zone membership, ordering, or copy itself.
//
// Hierarchy (spec: "a prepared briefing, not three equal tiles"):
//   1. Greeting + a state-aware briefing ("Am I okay?") + a quiet roster line.
//   2. NEEDS YOU — the dominant column. Its single top item gets the
//      signature navy surface (docs/design/OPTIM_VISUAL_CONSTITUTION.md §4:
//      reserved for the Command Center's one top-priority decision); for an
//      escalation, the existing EscalationCard (with its real actions) is
//      attached beneath it unchanged.
//   3. WORTH KNOWING, then HANDLED — quieter, on the canvas, no cards.
// On phones the same order stacks in one column; nothing is dropped.
//
// Server-compatible (no hooks); the only client piece is CoachGreeting.

import Link from "next/link";
import type { ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { CoachGreeting } from "@/components/coach/coach-greeting";
import { HANDLED_WINDOW_DAYS, relativeTime, type CoachDashboard, type DashboardItem } from "@/lib/coach/dashboard-zones";

export interface CoachDashboardViewProps {
  dashboard: CoachDashboard;
  coachFirstName: string;
  nowIso: string;
  /** The existing EscalationCard for the focus item, when it is one. */
  focusEscalation?: ReactNode;
  /** The existing pattern-candidate confirmation UI, keyed by signature. */
  patternSlot?: (signature: string) => ReactNode;
  /** The existing confirmed-patterns list (LearnedRulesList), if any. */
  learnedRules?: { count: number; content: ReactNode } | null;
}

export function CoachDashboardView({ dashboard, coachFirstName, nowIso, focusEscalation, patternSlot, learnedRules }: CoachDashboardViewProps) {
  const [focus, ...rest] = dashboard.needsYou;

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <header className="max-w-[640px]">
        <CoachGreeting firstName={coachFirstName} />
        <Briefing dashboard={dashboard} />
      </header>

      <div className="mt-8 grid grid-cols-1 gap-10 md:mt-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
        <section aria-labelledby="zone-needs-you" className="min-w-0">
          <ZoneHeading id="zone-needs-you" label="Needs you" count={dashboard.needsYou.length} />
          {focus ? (
            <div className="mt-3 space-y-3">
              <FocusItem item={focus} nowIso={nowIso} attached={focusEscalation} />
              {rest.length > 0 ? (
                <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-charcoal">
                  {rest.map((item) => (
                    <li key={item.id}>
                      <NeedsYouRow item={item} nowIso={nowIso} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <EmptyZone title="No decisions waiting." check />
          )}
        </section>

        <div className="min-w-0 space-y-10">
          <section aria-labelledby="zone-worth-knowing">
            <ZoneHeading id="zone-worth-knowing" label="Worth knowing" count={dashboard.worthKnowing.length} />
            {dashboard.worthKnowing.length > 0 ? (
              <ul className="mt-2 divide-y divide-border">
                {dashboard.worthKnowing.map((item) => (
                  <li key={item.id} className="py-3.5 first:pt-2">
                    {item.kind === "pattern_candidate" && item.patternSignature && patternSlot ? (
                      <div className="space-y-2">
                        <QuietItem item={item} nowIso={nowIso} />
                        {patternSlot(item.patternSignature)}
                      </div>
                    ) : (
                      <QuietItem item={item} nowIso={nowIso} />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyZone title="Nothing new to know." />
            )}
            {learnedRules && learnedRules.count > 0 ? (
              <details className="mt-3">
                <summary className="flex min-h-11 cursor-pointer items-center text-meta text-neutral hover:text-off-white">
                  {learnedRules.count} confirmed {learnedRules.count === 1 ? "pattern" : "patterns"} OPTIM follows
                </summary>
                <div className="mt-2">{learnedRules.content}</div>
              </details>
            ) : null}
          </section>

          <section aria-labelledby="zone-handled">
            <ZoneHeading id="zone-handled" label="Handled" sublabel={`Last ${HANDLED_WINDOW_DAYS} days`} count={dashboard.handled.length} />
            {dashboard.handled.length > 0 ? (
              <ul className="mt-2 divide-y divide-border">
                {dashboard.handled.map((item) => (
                  <li key={item.id} className="flex gap-3 py-3.5 first:pt-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-strong" aria-hidden="true">
                      <Check size={12} strokeWidth={2.5} />
                    </span>
                    <QuietItem item={item} nowIso={nowIso} showClient />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyZone title="Nothing handled yet." detail="Questions OPTIM answers and items you resolve will appear here." />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Briefing({ dashboard }: { dashboard: CoachDashboard }) {
  const { briefing } = dashboard;
  return (
    <div className="mt-4 space-y-1.5" role="status">
      <p className="flex items-start gap-2.5 text-heading text-off-white">
        <span
          aria-hidden="true"
          className={cn(
            "mt-[0.55em] h-2 w-2 shrink-0 rounded-full",
            briefing.tone === "urgent" ? "bg-error" : briefing.tone === "attention" ? "bg-accent" : "bg-success"
          )}
        />
        {briefing.headline}
      </p>
      {briefing.detail ? <p className="pl-[18px] text-body text-neutral">{briefing.detail}</p> : null}
      {dashboard.incompleteNotice ? <p className="pl-[18px] text-meta text-warning-strong">{dashboard.incompleteNotice}</p> : null}
      {dashboard.rosterLine ? (
        <p className="pl-[18px] text-meta text-neutral sm:pt-1">
          <Link href="/coach/clients" className="inline-flex min-h-11 items-center hover:text-off-white sm:min-h-0">
            {dashboard.rosterLine}
          </Link>
        </p>
      ) : !dashboard.hasClients ? (
        <p className="pl-[18px] text-meta text-neutral sm:pt-1">
          No clients yet.{" "}
          <Link href="/coach/clients" className="inline-flex min-h-11 items-center text-action text-accent-fg hover:underline sm:min-h-0">
            Add your first client
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function ZoneHeading({ id, label, sublabel, count }: { id: string; label: string; sublabel?: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-border pb-2">
      <h2 id={id} className="text-label text-off-white">
        {label}
      </h2>
      {count > 0 ? <span className="text-meta tabular-nums text-neutral">{count}</span> : null}
      {sublabel ? <span className="ml-auto text-meta text-neutral">{sublabel}</span> : null}
    </div>
  );
}

function EmptyZone({ title, detail, check = false }: { title: string; detail?: string; check?: boolean }) {
  return (
    <div className={cn("mt-3", check && "flex items-center gap-2.5")}>
      {check ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-strong" aria-hidden="true">
          <Check size={12} strokeWidth={2.5} />
        </span>
      ) : null}
      <div>
        <p className="text-body text-neutral">{title}</p>
        {detail ? <p className="mt-0.5 text-meta text-neutral">{detail}</p> : null}
      </div>
    </div>
  );
}

function ItemMeta({ item, nowIso, onNavy = false }: { item: DashboardItem; nowIso: string; onNavy?: boolean }) {
  const parts = [item.client?.name, item.occurredAtIso ? relativeTime(item.occurredAtIso, nowIso) : null].filter(Boolean);
  if (parts.length === 0 && !item.urgent) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-meta", onNavy ? "text-navy-ink-muted" : "text-neutral")}>
      {item.urgent ? <span className="rounded-full bg-error px-2 py-0.5 text-label text-on-accent">Safety</span> : null}
      {item.client ? <span className={cn("font-semibold", onNavy ? "text-navy-ink" : "text-off-white")}>{item.client.name}</span> : null}
      {item.occurredAtIso ? <span>{relativeTime(item.occurredAtIso, nowIso)}</span> : null}
    </p>
  );
}

const NAVY_ACTION = "mt-4 inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] bg-navy-ink px-4 text-[15px] font-semibold text-navy transition-opacity hover:opacity-90";

/** The one top NEEDS YOU item — context, evidence, preparation, and the
 * next action, readable without clicking anything. */
function FocusItem({ item, nowIso, attached }: { item: DashboardItem; nowIso: string; attached?: ReactNode }) {
  return (
    <article className="overflow-hidden rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow-subtle)]">
      <div className={cn("bg-navy px-5 py-5 sm:px-6", item.urgent && "border-l-4 border-error!")}>
        <ItemMeta item={item} nowIso={nowIso} onNavy />
        <h3 className="mt-2 text-heading text-navy-ink">{item.title}</h3>
        {item.context ? <p className="mt-1.5 text-body text-navy-ink-muted">{item.context}</p> : null}
        {item.evidence.length > 0 ? (
          <div className="mt-3 space-y-1 border-l-2 border-navy-ink/30! pl-3">
            {item.evidenceLabel ? <p className="text-meta text-navy-ink-muted">{item.evidenceLabel}</p> : null}
            {item.evidence.map((line) => (
              <p key={line} className="text-body text-navy-ink">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        {item.preparation ? (
          <p className="mt-3 text-meta text-navy-ink-muted">
            <span className="font-semibold text-navy-ink">OPTIM prepared · </span>
            {item.preparation}
          </p>
        ) : null}
        {!attached && item.action ? (
          <Link href={item.action.href} className={NAVY_ACTION}>
            {item.action.label}
          </Link>
        ) : null}
      </div>
      {attached && item.action ? (
        // The existing decision surface (EscalationCard, with its real
        // actions), inline — one tap opens it without leaving the briefing.
        <details className="group bg-navy">
          <summary className={cn(NAVY_ACTION, "mx-5 mb-5 mt-0 cursor-pointer list-none gap-2 sm:mx-6 [&::-webkit-details-marker]:hidden")}>
            <span className="group-open:hidden">{item.action.label}</span>
            <span className="hidden group-open:inline">Hide decision</span>
            <ChevronRight size={16} className="transition-transform group-open:rotate-90" aria-hidden="true" />
          </summary>
          <div className="bg-charcoal">{attached}</div>
        </details>
      ) : null}
    </article>
  );
}

/** Remaining NEEDS YOU items — compact, but still say what happened and why,
 * with the action named. The whole row is the route to the decision. */
function NeedsYouRow({ item, nowIso }: { item: DashboardItem; nowIso: string }) {
  const body = (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1 space-y-1">
        <ItemMeta item={item} nowIso={nowIso} />
        <p className="text-subheading text-off-white">{item.title}</p>
        {item.context ? <p className="text-meta text-neutral">{item.context}</p> : null}
        {item.evidence[0] ? (
          <p className="line-clamp-2 text-meta text-off-white">
            {item.evidenceLabel ? <span className="text-neutral">{item.evidenceLabel}: </span> : null}
            {item.evidence[0]}
          </p>
        ) : null}
        {item.action ? <p className="pt-1 text-action text-accent-fg">{item.action.label}</p> : null}
      </div>
      {item.action ? <ChevronRight size={16} className="mt-1 shrink-0 text-neutral" aria-hidden="true" /> : null}
    </div>
  );
  return item.action ? (
    <Link href={item.action.href} className="block transition-colors hover:bg-surface-raised">
      {body}
    </Link>
  ) : (
    body
  );
}

/** WORTH KNOWING / HANDLED — on the canvas, no card, quieter type. */
function QuietItem({ item, nowIso, showClient = true }: { item: DashboardItem; nowIso: string; showClient?: boolean }) {
  return (
    <div className="min-w-0 flex-1 space-y-0.5">
      <p className="text-body text-off-white">
        {showClient && item.client && !item.title.includes(item.client.firstName) ? <span className="font-semibold">{item.client.firstName} · </span> : null}
        {item.title}
      </p>
      {item.context ? <p className="text-meta text-neutral">{item.context}</p> : null}
      {item.evidence.map((line) => (
        <p key={line} className="line-clamp-2 text-meta text-neutral">
          {line}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-x-3">
        {item.occurredAtIso && item.zone !== "handled" ? <span className="text-meta text-neutral">{relativeTime(item.occurredAtIso, nowIso)}</span> : null}
        {item.action ? (
          <Link href={item.action.href} className="inline-flex min-h-11 items-center text-action text-accent-fg hover:underline sm:min-h-0 sm:py-1">
            {item.action.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
