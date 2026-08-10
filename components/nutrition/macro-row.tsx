import { ProgressBar } from "@/components/ui/progress-bar";

interface MacroRowProps {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  color: string;
}

export function MacroRow({ label, consumed, target, unit, color }: MacroRowProps) {
  const percent = (consumed / target) * 100;
  const remaining = Math.max(0, target - consumed);

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-off-white">{label}</span>
        <span className="text-neutral">
          <span className="text-off-white">{Math.round(consumed)}</span> / {target}
          {unit}
        </span>
      </div>
      <ProgressBar percent={percent} className="mt-1.5" color={color} />
      <p className="mt-1 text-xs text-neutral">
        {remaining > 0 ? `${Math.round(remaining)}${unit} remaining` : "Target reached"}
      </p>
    </div>
  );
}
