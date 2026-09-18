"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ComboboxOption {
  value: string;
  /** Primary label — what's shown collapsed and as the option's main line. */
  label: string;
  /** Small supporting text under the label (e.g. a UTC offset, a category). */
  description?: string;
}

/**
 * Phase 5.4A — the one real searchable-combobox primitive this codebase was
 * missing (see this phase's audit: no combobox/popover-select existed
 * before this). Built for "medium categorical list" and "long searchable
 * list" selectors (this phase's brief §IV) — a real ARIA `combobox` +
 * `listbox` pair, not a styled native `<select>` and not a fake text input
 * with no keyboard support. Generic over ComboboxOption so
 * components/ui/timezone-picker.tsx and any future long-list selector
 * (exercise search, coach search, ...) share one implementation.
 */
export function Combobox({
  options,
  value,
  onChange,
  onQueryChange,
  placeholder = "Search…",
  ariaLabel,
  renderTrigger,
  emptyMessage = "No matches.",
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Called with the raw query as the coach types — lets the caller re-run
   * its own search (e.g. timezone-picker's Intl-backed matcher) instead of
   * this component doing naive client-side filtering when the option list
   * is already the full, pre-filtered result. */
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  ariaLabel: string;
  /** Custom trigger content (e.g. timezone-picker's "Chicago · Central
   * Time" + live clock) — falls back to the selected option's label. */
  renderTrigger?: (selected: ComboboxOption | undefined) => React.ReactNode;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    // Deferred, matching hooks/use-prototype-state.tsx's established
    // workaround for the react-hooks/set-state-in-effect rule — this effect
    // is reacting to `open` becoming true (an external event), not
    // synchronizing derived render state, but the linter can't tell those
    // apart from a raw setState call in the effect body.
    const focusTimeout = setTimeout(() => {
      setActiveIndex(0);
      inputRef.current?.focus();
    }, 0);
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      clearTimeout(focusTimeout);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [open]);

  function updateQuery(next: string) {
    setQuery(next);
    onQueryChange?.(next);
  }

  function commit(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
    onQueryChange?.("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) commit(opt.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex h-12 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-strong bg-surface-input px-3.5 text-left text-[15px] text-off-white outline-none transition-colors focus-visible:border-accent hover:border-accent/40"
        style={{ transitionDuration: "var(--motion-fast)" }}
      >
        <span className="truncate">{renderTrigger ? renderTrigger(selected) : (selected?.label ?? placeholder)}</span>
        <ChevronDown size={16} className={cn("shrink-0 text-neutral transition-transform", open && "rotate-180")} style={{ transitionDuration: "var(--motion-fast)" }} aria-hidden="true" />
      </button>

      {open ? (
        <div className="pc-animate-in absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-charcoal shadow-[var(--shadow-elevated)]">
          <div className="relative border-b border-border p-2">
            <Search size={15} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-neutral" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="h-9 w-full rounded-[var(--radius-xs)] bg-transparent pl-6 pr-2 text-sm text-off-white outline-none placeholder:text-neutral"
            />
          </div>
          <ul id={listId} role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto py-1">
            {options.length === 0 ? (
              <li className="px-3.5 py-3 text-sm text-neutral">{emptyMessage}</li>
            ) : (
              options.map((opt, i) => {
                const isSelected = opt.value === value;
                const isActive = i === activeIndex;
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => commit(opt.value)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors",
                        isActive ? "bg-accent-soft text-accent-fg" : "text-off-white",
                        isSelected && !isActive && "text-accent-fg"
                      )}
                      style={{ transitionDuration: "var(--motion-fast)" }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{opt.label}</span>
                        {opt.description ? <span className="block truncate text-meta text-neutral">{opt.description}</span> : null}
                      </span>
                      {isSelected ? <Check size={16} className="shrink-0" aria-hidden="true" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
