import type { ReactNode } from "react";

/** The one subsection-title treatment for a coach page — a named zone
 * within the page (e.g. "Needs attention," "Onboarding pipeline") with an
 * optional trailing link/action, never a bare `<h2>` styled ad hoc per
 * route. */
export function SectionHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex items-center justify-between gap-3 ${className ?? ""}`}>
      <h2 className="text-subheading text-off-white">{title}</h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
