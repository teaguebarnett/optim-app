import Link from "next/link";
import { notFound } from "next/navigation";
import { CoachShell } from "@/components/coach/coach-shell";
import { CoachDashboardView } from "@/components/coach/coach-dashboard-view";
import { EscalationDecisionPanel } from "@/components/coach/escalation-decision-panel";
import { buildCoachDashboard } from "@/lib/coach/dashboard-zones";
import { DASHBOARD_FIXTURES, FIXTURE_NOW_ISO, type DashboardFixtureId } from "@/lib/coach/dashboard-fixtures";

/**
 * Gate 2 — development-only visual preview of the live coach dashboard,
 * rendered from the deterministic fixtures in lib/coach/dashboard-fixtures.ts
 * (fictional people only) through the SAME buildCoachDashboard and
 * CoachDashboardView the real /coach page uses, inside the live-mode
 * CoachShell. Lets every required dashboard state be inspected at any
 * width without seeding a database. Action buttons here do nothing.
 *
 * Never rendered in a production build (same rule as /dev).
 * Usage: /dev/coach-dashboard?scenario=mixed
 */
export default async function CoachDashboardPreviewPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { scenario } = await searchParams;
  const id = (scenario && scenario in DASHBOARD_FIXTURES ? scenario : "mixed") as DashboardFixtureId;
  const { input } = DASHBOARD_FIXTURES[id];
  const dashboard = buildCoachDashboard(input);

  async function noop() {
    "use server";
  }
  async function noopForm(formData: FormData) {
    "use server";
    void formData;
  }
  async function noopResolve() {
    "use server";
  }

  const focus = dashboard.needsYou[0];
  const focusAttention = focus?.attentionItemId && (focus.kind === "escalation" || focus.kind === "client_replied") ? input.openAttention.find((i) => i.id === focus.attentionItemId) : undefined;
  const hasSourceMessage = focusAttention ? focusAttention.sourceMessageBody !== null : false;

  return (
    <CoachShell appMode="supabase" supabaseIdentity={{ coachDisplayName: "Alex Rivera", openAttentionCount: input.openAttention.length, coachUserId: "dev-preview-coach" }}>
      <nav aria-label="Preview scenarios" className="mx-auto mb-6 flex w-full max-w-[1080px] flex-wrap gap-1.5 rounded-[var(--radius-md)] border border-dashed border-border-strong p-2 text-meta">
        <span className="px-2 py-1 font-semibold text-warning-strong">Dev preview</span>
        {(Object.keys(DASHBOARD_FIXTURES) as DashboardFixtureId[]).map((key) => (
          <Link key={key} href={`/dev/coach-dashboard?scenario=${key}`} className={key === id ? "rounded-full bg-accent px-2.5 py-1 text-on-accent" : "rounded-full px-2.5 py-1 text-neutral hover:text-off-white"}>
            {key}
          </Link>
        ))}
      </nav>
      <CoachDashboardView
        dashboard={dashboard}
        coachFirstName="Alex"
        nowIso={FIXTURE_NOW_ISO}
        focusEscalation={
          focusAttention ? (
            <EscalationDecisionPanel
              item={focusAttention}
              actions={{ approve: hasSourceMessage ? noop : undefined, editAndSend: hasSourceMessage ? noopForm : undefined, respondPersonally: hasSourceMessage ? noopForm : undefined, resolveThread: noop, resolveSilently: noop, proposeExample: noopForm }}
              healthReview={
                focusAttention.escalationReason === "pain_or_safety"
                  ? {
                      clientFirstName: focusAttention.clientDisplayName.split(" ")[0],
                      record: { clientId: focusAttention.clientId, workspaceId: "dev", status: "review_needed", reasons: focusAttention.sourceMessageBody ? [focusAttention.sourceMessageBody] : focusAttention.proposedResponse ? [focusAttention.proposedResponse] : [], createdAtIso: focusAttention.createdAtIso, updatedAtIso: focusAttention.createdAtIso },
                      clientReportedDetail: null,
                      onResolve: noopResolve,
                    }
                  : undefined
              }
            />
          ) : undefined
        }
        patternSlot={() => null}
        learnedRules={null}
      />
    </CoachShell>
  );
}
