import type { MetadataRoute } from "next";

// Approved public pages only. URLs use the deployment's configured
// NEXT_PUBLIC_SITE_URL; no canonical marketing domain has been supplied, so
// none is invented. Without a configured URL the sitemap is empty.
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!site) return [];
  return [
    { url: `${site}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${site}/pricing`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
