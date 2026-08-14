import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlaceList from "../../PlaceList";
import { allNeighborhoods, placesInNeighborhood } from "../../../lib/openings";

export const dynamicParams = false;

export function generateStaticParams() {
  return allNeighborhoods().map((n) => ({ slug: n.slug }));
}

function nameFor(slug: string): string | null {
  const n = allNeighborhoods().find((x) => x.slug === slug);
  return n ? n.name : null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const name = nameFor(slug);
  if (!name) return { title: "Not found — New in SF" };
  const title = `New cafes & retail opening in ${name}, SF | New in SF`;
  const description = `New and upcoming cafes, restaurants, and shops in ${name}, San Francisco — from permit filings, confirmed live.`;
  return { title, description, openGraph: { title, description } };
}

export default async function NeighborhoodPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = nameFor(slug);
  if (!name) notFound();
  const places = placesInNeighborhood(slug);
  const open = places.filter((p) => p.status !== "coming_soon").length;
  return (
    <PlaceList
      title={<>New in <span style={{ color: "var(--open)" }}>{name}</span></>}
      subtitle={`${places.length} new places tracked · ${open} open`}
      places={places}
    />
  );
}
