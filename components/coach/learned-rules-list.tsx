// Phase 9B — "Confirmed patterns": the findable deactivation path spec
// section 15 requires ("I don't coach this way anymore"). Deliberately
// small and adjacent to "OPTIM noticed" (same page, same section family)
// rather than a separate settings page — this repo's coach Settings page
// is demo-mode only today (no Supabase-mode split exists there yet;
// rebuilding that split is out of this phase's scope), and this dashboard
// is already the real Supabase-mode operational home (see app/coach/page.tsx's
// own module doc). Renders nothing when the coach has zero active rules —
// no empty-state clutter.
//
// Phase 13A.1 — the caller (the Command Center's Handled zone) puts this
// behind its own <details> disclosure with the count already in the
// <summary>, so this renders only the row list, never a repeated "Confirmed
// patterns" header.

import { revalidatePath } from "next/cache";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deactivateLearnedRuleAction } from "@/app/actions/coach-learned-rules";
import type { LearnedRuleRecord } from "@/lib/production/learned-rules";

function RuleRow({ workspaceId, rule }: { workspaceId: string; rule: LearnedRuleRecord }) {
  async function deactivate() {
    "use server";
    await deactivateLearnedRuleAction({ workspaceId, ruleId: rule.id });
    revalidatePath(`/coach`);
  }
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-off-white">{rule.summary}</p>
        <p className="text-meta text-neutral">
          {rule.scope === "client_specific" ? `For ${rule.clientDisplayName ?? "this client"} · ` : ""}
          Confirmed {new Date(rule.confirmedAtIso).toLocaleDateString()}
        </p>
      </div>
      <form action={deactivate} className="shrink-0">
        <Button type="submit" variant="ghost" size="sm">
          I don&apos;t coach this way anymore
        </Button>
      </form>
    </div>
  );
}

export function LearnedRulesList({ workspaceId, rules }: { workspaceId: string; rules: LearnedRuleRecord[] }) {
  const active = rules.filter((r) => r.status === "active");
  if (active.length === 0) return null;
  return (
    <Card className="divide-y divide-border p-0">
      {active.map((r) => (
        <RuleRow key={r.id} workspaceId={workspaceId} rule={r} />
      ))}
    </Card>
  );
}
