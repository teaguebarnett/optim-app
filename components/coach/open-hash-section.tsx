"use client";

// A link to something inside a collapsed workspace section (e.g. /coach/clients/<id>#training-limitations) opens
// that section and scrolls to the target — collapsing a section never breaks a deep link.

import { useEffect } from "react";

export function OpenHashSection() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      for (let d = target.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
