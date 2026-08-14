// Pure, client-safe helpers (no fs) — importable from client components.

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// Human category derived from the NAICS code (self-reported, both vintages).
export function categoryOf(naics: string): { slug: string; label: string } {
  const n = naics || "";
  if (n.startsWith("722515")) return { slug: "cafes", label: "Cafés & coffee" };
  if (n.startsWith("7224") || n.startsWith("722410")) return { slug: "bars", label: "Bars" };
  if (n.startsWith("722")) return { slug: "restaurants", label: "Restaurants" };
  if (n.startsWith("445")) return { slug: "food-grocery", label: "Food & grocery" };
  if (n.startsWith("448") || n.startsWith("458")) return { slug: "clothing", label: "Clothing & apparel" };
  if (n.startsWith("451") || n.startsWith("459")) return { slug: "gifts", label: "Books, gifts & hobby" };
  if (n.startsWith("446") || n.startsWith("456")) return { slug: "health-beauty", label: "Health & beauty" };
  if (n.startsWith("442") || n.startsWith("449")) return { slug: "home", label: "Home & electronics" };
  if (n.startsWith("452") || n.startsWith("455")) return { slug: "general", label: "General retail" };
  if (n.startsWith("453")) return { slug: "specialty", label: "Specialty retail" };
  return { slug: "shops", label: "Shops" };
}
