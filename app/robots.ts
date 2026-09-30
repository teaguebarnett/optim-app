import type { MetadataRoute } from "next";

// Public marketing pages are indexable; app routes are excluded from crawling.
// This is crawl guidance only — every private route is protected by its own
// server-side layout, not by robots.txt.
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/pricing"],
      disallow: ["/demo-entry", "/coach", "/coach-onboarding", "/admin", "/auth", "/invite", "/onboarding", "/setup-status", "/dev", "/today", "/plan", "/training", "/nutrition", "/progress", "/chat"],
    },
    ...(site ? { sitemap: `${site.replace(/\/$/, "")}/sitemap.xml` } : {}),
  };
}
