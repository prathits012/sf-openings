import type { MetadataRoute } from "next";
import { livePlaces, slugFor, allNeighborhoods, allCategories } from "../lib/openings";
import { siteUrl } from "../lib/site";

// Every page listed here so search engines can find all 460+ of them — the SEO
// engine only works if the pages get crawled.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();

  const routes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/updates`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
  ];
  for (const n of allNeighborhoods())
    routes.push({ url: `${base}/neighborhood/${n.slug}`, lastModified: now, changeFrequency: "daily", priority: 0.6 });
  for (const c of allCategories())
    routes.push({ url: `${base}/category/${c.slug}`, lastModified: now, changeFrequency: "daily", priority: 0.6 });
  for (const p of livePlaces())
    routes.push({ url: `${base}/openings/${slugFor(p)}`, lastModified: now, changeFrequency: "weekly", priority: 0.5 });

  return routes;
}
