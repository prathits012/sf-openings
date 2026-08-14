import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlaceList from "../../PlaceList";
import { allCategories, placesInCategory } from "../../../lib/openings";

export const dynamicParams = false;

export function generateStaticParams() {
  return allCategories().map((c) => ({ slug: c.slug }));
}

function labelFor(slug: string): string | null {
  const c = allCategories().find((x) => x.slug === slug);
  return c ? c.label : null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const label = labelFor(slug);
  if (!label) return { title: "Not found — New in SF" };
  const title = `New ${label} opening in San Francisco | New in SF`;
  const description = `Newly opened and coming-soon ${label.toLowerCase()} across San Francisco — caught from permit filings, confirmed live.`;
  return { title, description, openGraph: { title, description } };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const label = labelFor(slug);
  if (!label) notFound();
  const places = placesInCategory(slug);
  const open = places.filter((p) => p.status !== "coming_soon").length;
  return (
    <PlaceList
      title={<><span style={{ color: "var(--open)" }}>{label}</span> — new in SF</>}
      subtitle={`${places.length} tracked · ${open} open`}
      places={places}
    />
  );
}
