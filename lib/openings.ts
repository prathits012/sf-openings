import fs from "fs";
import path from "path";

export type Enrichment = {
  status: string;
  confidence: number;
  facts_confidence?: number;
  display_name?: string | null;
  opening_date: string | null;
  hook: string | null;
  description: string | null;
  tags: string[];
  website: string | null;
  instagram: string | null;
  sources: string[];
  model: string | null;
  generated_at: string | null;
};

export type Place = {
  uniqueid: string;
  dba_name: string;
  address: string;
  naics: string;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  permit_start: string | null;
  permit_end: string | null;
  status: string;
  first_seen: string | null;
  last_checked: string | null;
  flipped_at: string | null;
  enrichment: Enrichment | null;
};

export type OpeningsFile = {
  meta: Record<string, unknown>;
  places: Place[];
};

// Read the pipeline's output at build/server time. This is the whole data layer
// — no database. The file is committed by the pipeline; Vercel rebuilds on push.
export function loadOpenings(): OpeningsFile {
  const p = path.join(process.cwd(), "data", "openings.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return { meta: {}, places: [] };
  }
}

export function livePlaces(): Place[] {
  return loadOpenings().places.filter((p) => p.status !== "cancelled");
}

export function hasStory(p: Place): boolean {
  const e = p.enrichment;
  return !!(e && e.model && e.model !== "stub-no-key" && (e.description || e.hook));
}

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// Stable, unique, human-readable slug: name + the trailing id segment.
export function slugFor(p: Place): string {
  const tail = (p.uniqueid.split("-").pop() || p.uniqueid).slice(-8);
  const base = slugify(p.dba_name) || "place";
  return `${base}-${tail}`;
}

export function placeBySlug(slug: string): Place | undefined {
  return livePlaces().find((p) => slugFor(p) === slug);
}

function withinDays(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

// Places that FLIPPED to open/just_opened within the window — the "it's open,
// go now" feed. Sorted newest flip first.
export function recentlyOpened(days: number): Place[] {
  return livePlaces()
    .filter((p) => (p.status === "open" || p.status === "just_opened") && withinDays(p.flipped_at, days))
    .sort((a, b) => (b.flipped_at || "").localeCompare(a.flipped_at || ""));
}

// Brand-new candidates the pipeline spotted (permit filed) within the window,
// still coming soon — the "advance" feed. Sorted newest discovery first.
export function recentlyDiscovered(days: number): Place[] {
  return livePlaces()
    .filter((p) => p.status === "coming_soon" && withinDays(p.first_seen, days))
    .sort((a, b) => (b.first_seen || "").localeCompare(a.first_seen || ""));
}

export function statusLabel(s: string): string {
  if (s === "coming_soon") return "Coming soon";
  if (s === "just_opened") return "Just opened";
  return "Open";
}
