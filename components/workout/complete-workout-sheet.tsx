import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { WorkoutSummary } from "@/lib/types";

interface CompleteWorkoutSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  preview: WorkoutSummary;
}

export function CompleteWorkoutSheet({ open, onClose, onConfirm, preview }: CompleteWorkoutSheetProps) {
  const hasNoLoggedWork = preview.workingSetsCompleted === 0;

  return (
    <Sheet open={open} onClose={onClose} title="Complete workout" description="Review before you finish today's session.">
      <div className="space-y-2 text-sm">
        <Row label="Exercises completed" value={String(preview.exercisesCompleted)} />
        <Row label="Exercises skipped" value={String(preview.exercisesSkipped)} />
        <Row
          label="Working sets completed"
          value={String(preview.workingSetsCompleted)}
          warn={hasNoLoggedWork}
        />
        <Row
          label="Missing RPE entries"
          value={String(preview.missingRpeCount)}
          warn={preview.missingRpeCount > 0}
        />
        <Row
          label="Pain reports"
          value={String(preview.painReportCount)}
          warn={preview.painReportCount > 0}
        />
        <Row label="Duration so far" value={`${preview.durationMin} min`} />
      </div>

      {hasNoLoggedWork ? (
        <p className="mt-3 text-xs text-error">
          No working sets have been logged or skipped yet. Log at least one set with an RPE, or skip your
          work with a reason, before submitting.
        </p>
      ) : preview.missingRpeCount > 0 ? (
        <p className="mt-3 text-xs text-warning">
          Some sets are missing an RPE value. You can go back and add it, or finish without it.
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button className="flex-1" onClick={onConfirm} disabled={hasNoLoggedWork}>
          Complete workout
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Go back
        </Button>
      </div>
    </Sheet>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-b-0">
      <span className="text-neutral">{label}</span>
      <span className={warn ? "font-medium text-warning" : "font-medium text-off-white"}>{value}</span>
    </div>
  );
}
