"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { TrainingScreen } from "@/components/training/training-screen";
import { NutritionScreen } from "@/components/nutrition/nutrition-screen";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

type PlanSection = "training" | "nutrition";

function isPlanSection(value: string | null): value is PlanSection {
  return value === "training" || value === "nutrition";
}

// Phase 13B (Gate 2A) — Plan is the permanent client-facing parent
// destination for Training and Nutrition. It owns exactly one thing: a
// restrained sub-navigation between the two, plus which one is currently
// showing. It intentionally contains no other content of its own (no
// summary, no dashboard, no duplicated data) — see this phase's spec and
// docs/design/OPTIM_VISUAL_CONSTITUTION.md's composition rules.
//
// Both TrainingScreen and NutritionScreen (see components/training/
// training-screen.tsx and components/nutrition/nutrition-screen.tsx — the
// exact same components the standalone /training and /nutrition deep links
// render) are mounted together and toggled with the `hidden` attribute
// rather than each being conditionally rendered. That is deliberate: it's
// what keeps each screen's own local view state (Training's day-carousel
// pick, Nutrition's open macro sheet or photo sheet) intact across a
// subsection switch, exactly as this phase's spec requires — a conditional
// render would remount whichever screen isn't active and silently drop
// that state every time. Each screen's substantive business state already
// lives in the root PrototypeStateProvider (see hooks/use-prototype-state.tsx)
// regardless, so this only protects transient UI state.
//
// The active subsection is kept in the `tab` query param (not component
// state) so switching pushes real browser history — back/forward move
// between subsections sensibly — and so a /plan URL is directly
// shareable/refreshable into either subsection.
export default function PlanPage() {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <PlanScreen />
    </Suspense>
  );
}

function PlanScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeSection: PlanSection = isPlanSection(rawTab) ? rawTab : "training";

  function selectSection(section: PlanSection) {
    if (section === activeSection) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", section);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div className="px-4 pt-4">
        <div role="tablist" aria-label="Plan section" className="flex gap-1 rounded-[var(--radius-md)] bg-off-white/[0.04] p-1">
          <PlanTab label="Training" isActive={activeSection === "training"} onSelect={() => selectSection("training")} />
          <PlanTab label="Nutrition" isActive={activeSection === "nutrition"} onSelect={() => selectSection("nutrition")} />
        </div>
      </div>

      <div hidden={activeSection !== "training"}>
        <TrainingScreen />
      </div>
      <div hidden={activeSection !== "nutrition"}>
        <NutritionScreen />
      </div>
    </div>
  );
}

function PlanTab({ label, isActive, onSelect }: { label: string; isActive: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onSelect}
      className={cn(
        "flex-1 rounded-[var(--radius-sm)] py-2 text-action transition-colors duration-200",
        isActive ? "bg-accent text-on-accent shadow-[var(--shadow-subtle)]" : "text-neutral"
      )}
    >
      {label}
    </button>
  );
}
