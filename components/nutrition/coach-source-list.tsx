import type { CoachSource } from "@/lib/nutrition/education-content";

/**
 * Renders coach-curated sources from structured data (see
 * lib/nutrition/education-content.ts) rather than a hard-wired list, so a
 * future coach dashboard can reorder/edit this content without touching this
 * component. Never attributes invented words to Teague by name — see that
 * file's module doc.
 */
export function CoachSourceList({ sources, detailed = false }: { sources: CoachSource[]; detailed?: boolean }) {
  const ordered = [...sources].sort((a, b) => a.order - b.order);

  return (
    <ul className="space-y-2">
      {ordered.map((source) => (
        <li key={source.id} className="rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-subheading text-off-white">{source.name}</p>
            {source.coachPreferred ? (
              <span className="shrink-0 rounded-full bg-brass-soft px-2 py-0.5 text-label text-brass-strong">
                Coach pick
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-meta text-neutral">
            {source.category} · {source.bestUseContext}
          </p>
          {detailed ? <p className="mt-1 text-body text-neutral">{source.rationale}</p> : null}
          {detailed && source.note ? <p className="mt-1 text-meta text-neutral">Note: {source.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}
