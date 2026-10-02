"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectMenuOption<T extends string = string> {
  value: T;
  label: string;
  /** Small supporting line under the label (e.g. a chapter's status). */
  description?: string;
  disabled?: boolean;
}

const GAP = 6;
const EDGE = 8;
const MAX_LIST_HEIGHT = 320;

/**
 * Gate 3.1 — OPTIM's themed single-select: a button trigger plus an ARIA
 * `listbox` popup, replacing native `<select>` (whose opened menu is drawn by
 * the browser and ignores the theme). Same contract as a controlled select:
 * `value` in, `onChange(value)` out, options in the order given; nothing is
 * stored or reordered here.
 *
 * The popup renders in a portal with fixed positioning so cards with
 * overflow can't clip it; it flips above the trigger when there's more room
 * there, clamps to the viewport horizontally, and scrolls long lists.
 * Keyboard: ArrowUp/Down/Enter/Space open from the trigger; in the list,
 * arrows/Home/End move, typing jumps by first letters, Enter/Space choose,
 * Escape closes (focus returns to the trigger), Tab closes and moves on.
 * Pointer/touch: tap to choose, tap outside to close.
 */
export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  placeholder = "Choose…",
  disabled = false,
  className,
  renderValue,
}: {
  value: T | "" | null | undefined;
  options: SelectMenuOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Lets an external <label htmlFor> point at the trigger. */
  id?: string;
  /** Shown on the trigger when no option matches `value`. */
  placeholder?: string;
  disabled?: boolean;
  /** Extra classes for the trigger (width etc.). */
  className?: string;
  /** Custom trigger text for the selected option — defaults to its label. */
  renderValue?: (selected: SelectMenuOption<T>) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const baseId = useId();
  const listId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-option-${i}`;
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const firstEnabled = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i;
    return -1;
  };

  function openMenu(prefer?: "first" | "last") {
    if (disabled || options.length === 0) return;
    const start = prefer === "last" ? firstEnabled(options.length - 1, -1) : prefer === "first" ? firstEnabled(0, 1) : selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : firstEnabled(0, 1);
    setActiveIndex(start);
    setOpen(true);
  }

  function closeMenu(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(i: number) {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    closeMenu(true);
    if (opt.value !== value) onChange(opt.value);
  }

  // Place the popup against the trigger, inside the viewport. Written straight
  // to the node's style (no state) so it can follow scroll/resize cheaply.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const list = listRef.current;
      if (!trigger || !list) return;
      const r = trigger.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const below = vh - r.bottom - GAP - EDGE;
      const above = r.top - GAP - EDGE;
      const natural = Math.min(list.scrollHeight, MAX_LIST_HEIGHT);
      const flip = below < natural && above > below;
      const width = Math.min(Math.max(r.width, 256), vw - EDGE * 2);
      const left = Math.min(Math.max(r.left, EDGE), vw - width - EDGE);
      list.style.left = `${left}px`;
      list.style.minWidth = `${width}px`;
      list.style.maxWidth = `${vw - EDGE * 2}px`;
      list.style.maxHeight = `${Math.max(120, Math.min(MAX_LIST_HEIGHT, flip ? above : below))}px`;
      if (flip) {
        list.style.top = "";
        list.style.bottom = `${vh - r.top + GAP}px`;
      } else {
        list.style.bottom = "";
        list.style.top = `${r.bottom + GAP}px`;
      }
      list.style.visibility = "visible";
    };
    place();
    listRef.current?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Click/tap outside closes without stealing focus back.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active option in view while moving through a long list.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function move(step: 1 | -1) {
    setActiveIndex((i) => {
      const next = firstEnabled((i < 0 ? (step === 1 ? -1 : options.length) : i) + step, step);
      return next >= 0 ? next : i;
    });
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(e.altKey || selectedIndex >= 0 ? undefined : e.key === "ArrowUp" ? "last" : "first");
    }
  }

  function handleListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        return;
      case "Home":
        e.preventDefault();
        setActiveIndex(firstEnabled(0, 1));
        return;
      case "End":
        e.preventDefault();
        setActiveIndex(firstEnabled(options.length - 1, -1));
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeIndex >= 0) choose(activeIndex);
        return;
      case "Escape":
        e.preventDefault();
        closeMenu(true);
        return;
      case "Tab":
        // Return focus to the trigger first so the browser's Tab moves on from
        // the field rather than from the end of the document.
        closeMenu(true);
        return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = e.timeStamp;
      const t = typeahead.current;
      t.text = now - t.at > 600 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
      t.at = now;
      const match = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(t.text));
      if (match >= 0) setActiveIndex(match);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "inline-flex min-h-11 max-w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-strong bg-surface-input pl-3 pr-2.5 text-left text-meta text-off-white transition-colors hover:border-accent/50 focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-accent",
          className
        )}
        style={{ transitionDuration: "var(--motion-fast)" }}
      >
        <span className={cn("min-w-0 truncate", !selected && "text-neutral")}>{selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}</span>
        <ChevronDown size={15} aria-hidden="true" className={cn("shrink-0 text-neutral transition-transform", open && "rotate-180 text-accent-fg")} style={{ transitionDuration: "var(--motion-fast)" }} />
      </button>
      {open
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel}
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              onKeyDown={handleListKeyDown}
              className="pc-animate-in fixed z-50 overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-border-strong bg-charcoal p-1 text-meta shadow-[var(--shadow-elevated)] outline-none"
              // The active option carries the focus indication; the global
              // :focus-visible ring/radius would otherwise outline the whole popup.
              style={{ visibility: "hidden", outline: "none", borderRadius: "var(--radius-md)" }}
            >
              {options.map((opt, i) => {
                const isSelected = i === selectedIndex;
                const isActive = i === activeIndex;
                return (
                  <li
                    key={opt.value}
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    onPointerMove={() => !opt.disabled && activeIndex !== i && setActiveIndex(i)}
                    onClick={() => choose(i)}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-xs)] px-3 py-2 transition-colors",
                      isActive ? "bg-accent-soft text-accent-fg" : "text-off-white",
                      isSelected && "font-semibold",
                      opt.disabled && "cursor-not-allowed opacity-45"
                    )}
                    style={{ transitionDuration: "var(--motion-fast)" }}
                  >
                    <span className="min-w-0">
                      <span className="block">{opt.label}</span>
                      {opt.description ? <span className={cn("block font-normal", isActive ? "text-accent-fg/80" : "text-neutral")}>{opt.description}</span> : null}
                    </span>
                    <Check size={15} aria-hidden="true" className={cn("shrink-0 text-accent-fg", !isSelected && "invisible")} />
                  </li>
                );
              })}
            </ul>,
            document.body
          )
        : null}
    </>
  );
}
